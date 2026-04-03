import json
import logging
import pickle
from pathlib import Path
from typing import Dict, List, Optional, Sequence, Tuple

import numpy as np
import pandas as pd
import shap
from sklearn.metrics import accuracy_score, f1_score, precision_score, recall_score, roc_auc_score
from sklearn.model_selection import train_test_split
from xgboost import XGBClassifier

from .advanced_features import build_auto_debug_label


logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")


NON_FEATURE_COLUMNS = {
    "reviewText",
    "cleaned_review_text",
    "reviewerID",
    "asin",
    "template_signature",
    "label",
    "fake_label",
    "_auto_debug_label",
}


class XGBoostReviewTrainer:
    """Final scalable model trainer with SHAP explanations per review."""

    def __init__(self) -> None:
        self.model: Optional[XGBClassifier] = None
        self.feature_columns: Sequence[str] = []
        self.target_column_used: Optional[str] = None
        self.metrics: Dict[str, float] = {}

    @staticmethod
    def _resolve_target(df: pd.DataFrame, target_col: Optional[str], allow_auto_debug_label: bool) -> Tuple[pd.DataFrame, str]:
        work = df.copy()

        candidate = target_col
        if candidate is None:
            if "fake_label" in work.columns:
                candidate = "fake_label"
            elif "label" in work.columns:
                candidate = "label"
            else:
                candidate = "_auto_debug_label"

        if candidate not in work.columns:
            work[candidate] = build_auto_debug_label(work)

        if work[candidate].nunique(dropna=True) < 2:
            if not allow_auto_debug_label:
                raise ValueError("Target has fewer than 2 classes and fallback is disabled.")
            work["_auto_debug_label"] = build_auto_debug_label(work)
            candidate = "_auto_debug_label"
            logging.warning(
                "Target had one class. Falling back to `_auto_debug_label` with distribution: %s",
                work[candidate].value_counts().to_dict(),
            )

        return work, candidate

    def _feature_matrix(self, df: pd.DataFrame) -> pd.DataFrame:
        cols: List[str] = [
            c for c in df.columns
            if c not in NON_FEATURE_COLUMNS and pd.api.types.is_numeric_dtype(df[c])
        ]
        if not cols:
            raise ValueError("No numeric feature columns found for XGBoost training.")

        X = df[cols].copy().replace([np.inf, -np.inf], np.nan).fillna(0.0)
        self.feature_columns = list(X.columns)
        return X

    def train(
        self,
        df: pd.DataFrame,
        target_col: Optional[str] = None,
        allow_auto_debug_label: bool = True,
        test_size: float = 0.2,
        random_state: int = 42,
    ) -> Tuple[XGBClassifier, Dict[str, float]]:
        work, target = self._resolve_target(df, target_col=target_col, allow_auto_debug_label=allow_auto_debug_label)
        self.target_column_used = target

        X = self._feature_matrix(work)
        y = pd.to_numeric(work[target], errors="coerce").fillna(0).astype(int)

        pos = int((y == 1).sum())
        neg = int((y == 0).sum())
        scale_pos_weight = (neg / max(pos, 1)) if pos > 0 else 1.0

        X_train, X_test, y_train, y_test = train_test_split(
            X,
            y,
            test_size=test_size,
            random_state=random_state,
            stratify=y if y.nunique(dropna=True) > 1 else None,
        )

        self.model = XGBClassifier(
            n_estimators=500,
            max_depth=8,
            learning_rate=0.05,
            subsample=0.85,
            colsample_bytree=0.85,
            objective="binary:logistic",
            eval_metric="logloss",
            tree_method="hist",
            reg_lambda=1.0,
            reg_alpha=0.0,
            random_state=random_state,
            n_jobs=-1,
            scale_pos_weight=scale_pos_weight,
        )
        self.model.fit(X_train, y_train)

        y_pred = self.model.predict(X_test)
        y_prob = self.model.predict_proba(X_test)[:, 1]
        self.metrics = {
            "accuracy": float(accuracy_score(y_test, y_pred)),
            "precision_weighted": float(precision_score(y_test, y_pred, average="weighted", zero_division=0)),
            "recall_weighted": float(recall_score(y_test, y_pred, average="weighted", zero_division=0)),
            "f1_weighted": float(f1_score(y_test, y_pred, average="weighted", zero_division=0)),
            "auc_roc": float(roc_auc_score(y_test, y_prob)) if y_test.nunique(dropna=True) > 1 else float("nan"),
        }

        for k, v in self.metrics.items():
            logging.info("%s: %.4f", k, v)

        return self.model, self.metrics

    def predict_scores(self, df: pd.DataFrame) -> pd.Series:
        if self.model is None:
            raise ValueError("Model is not trained. Call train first.")
        X = df.reindex(columns=self.feature_columns, fill_value=0.0)
        X = X.replace([np.inf, -np.inf], np.nan).fillna(0.0)
        return pd.Series(self.model.predict_proba(X)[:, 1], index=df.index, name="final_suspicion_score")

    def explain_reviews(
        self,
        df: pd.DataFrame,
        top_k: int = 5,
        max_rows: Optional[int] = None,
    ) -> pd.DataFrame:
        if self.model is None:
            raise ValueError("Model is not trained. Call train first.")

        source = df.copy()
        if max_rows is not None and len(source) > max_rows:
            source = source.sample(n=max_rows, random_state=42)

        X = source.reindex(columns=self.feature_columns, fill_value=0.0)
        X = X.replace([np.inf, -np.inf], np.nan).fillna(0.0)

        explainer = shap.TreeExplainer(self.model)
        shap_values = explainer.shap_values(X)
        if isinstance(shap_values, list):
            shap_values = shap_values[-1]
        shap_values = np.asarray(shap_values)

        base_value = explainer.expected_value
        if isinstance(base_value, (list, np.ndarray)):
            base_value = float(np.asarray(base_value).reshape(-1)[-1])
        else:
            base_value = float(base_value)

        preds = self.model.predict_proba(X)[:, 1]
        abs_vals = np.abs(shap_values)
        top_idx = np.argsort(-abs_vals, axis=1)[:, :top_k]

        rows = []
        feature_names = np.array(self.feature_columns)
        for i, idxs in enumerate(top_idx):
            row = {
                "review_index": int(X.index[i]),
                "base_value": base_value,
                "prediction": float(preds[i]),
                "shap_abs_sum": float(abs_vals[i].sum()),
            }
            for rank, feat_idx in enumerate(idxs, start=1):
                row[f"top_feature_{rank}"] = str(feature_names[feat_idx])
                row[f"top_feature_{rank}_shap"] = float(shap_values[i, feat_idx])
            rows.append(row)

        return pd.DataFrame(rows)

    def save(
        self,
        output_dir: Optional[str] = None,
        model_name: str = "xgb_review_model_v2.pkl",
        meta_name: str = "xgb_review_model_v2_meta.json",
    ) -> Tuple[Path, Path]:
        if self.model is None:
            raise ValueError("Model is not trained. Call train first.")

        out_dir = Path(output_dir) if output_dir else Path(__file__).resolve().parent / "models"
        out_dir.mkdir(parents=True, exist_ok=True)

        model_path = out_dir / model_name
        meta_path = out_dir / meta_name

        with model_path.open("wb") as f:
            pickle.dump(self.model, f)

        metadata = {
            "feature_columns": list(self.feature_columns),
            "target_column_used": self.target_column_used,
            "metrics": self.metrics,
        }
        with meta_path.open("w", encoding="utf-8") as f:
            json.dump(metadata, f, indent=2)

        logging.info("Saved XGBoost model to %s", model_path)
        logging.info("Saved XGBoost metadata to %s", meta_path)
        return model_path, meta_path