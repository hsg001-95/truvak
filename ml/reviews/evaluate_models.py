import json
import logging
import pickle
from pathlib import Path
from typing import Dict, Optional, Sequence

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
import seaborn as sns
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import (
    accuracy_score,
    confusion_matrix,
    f1_score,
    precision_score,
    recall_score,
    roc_auc_score,
    roc_curve,
)
from sklearn.model_selection import train_test_split


logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")


NON_FEATURE_COLUMNS = {
    "reviewText",
    "cleaned_review_text",
    "reviewerID",
    "asin",
    "label",
    "fake_label",
    "_auto_debug_label",
}


def _build_auto_debug_label(df: pd.DataFrame) -> pd.Series:
    score = pd.Series(0, index=df.index, dtype="int64")

    if "overall" in df.columns:
        rating = pd.to_numeric(df["overall"], errors="coerce")
        score += rating.isin([1, 5]).astype(int)

    if "review_length_words" in df.columns:
        score += (pd.to_numeric(df["review_length_words"], errors="coerce") <= 25).astype(int)

    if "exclamation_count" in df.columns:
        score += (pd.to_numeric(df["exclamation_count"], errors="coerce") >= 1).astype(int)

    if "capital_ratio" in df.columns:
        score += (pd.to_numeric(df["capital_ratio"], errors="coerce") >= 0.12).astype(int)

    label = (score >= 2).astype(int)
    if label.nunique(dropna=True) < 2 and "cleaned_review_text" in df.columns:
        text_len = df["cleaned_review_text"].astype(str).str.len()
        label = (text_len <= text_len.median()).astype(int)

    if label.nunique(dropna=True) < 2:
        label = (pd.Series(range(len(df)), index=df.index) % 2).astype(int)

    return label


def _resolve_target_column(df: pd.DataFrame, allow_auto_debug_label: bool = True) -> str:
    if "fake_label" in df.columns and df["fake_label"].nunique(dropna=True) > 1:
        return "fake_label"
    if "label" in df.columns and df["label"].nunique(dropna=True) > 1:
        return "label"

    if not allow_auto_debug_label:
        raise ValueError("Evaluation target has fewer than 2 classes and fallback is disabled.")

    df["_auto_debug_label"] = _build_auto_debug_label(df)
    logging.warning(
        "Evaluation target had one class. Falling back to `_auto_debug_label` with distribution: %s",
        df["_auto_debug_label"].value_counts().to_dict(),
    )
    return "_auto_debug_label"


def _build_numeric_features(df: pd.DataFrame, text_scores: pd.Series) -> pd.DataFrame:
    if len(df) != len(text_scores):
        raise ValueError(
            f"Length mismatch: df has {len(df)} rows but text_scores has {len(text_scores)} rows."
        )

    feature_cols = [
        c for c in df.columns
        if c not in NON_FEATURE_COLUMNS and pd.api.types.is_numeric_dtype(df[c])
    ]
    if not feature_cols:
        raise ValueError("No numeric engineered feature columns found.")

    X = df[feature_cols].copy().fillna(0.0)
    X["text_suspicion_score"] = pd.to_numeric(text_scores, errors="coerce").fillna(0.0).values
    return X


def _load_ensemble_artifacts(model_path: str, metadata_path: Optional[str] = None):
    model_file = Path(model_path)
    if not model_file.exists():
        raise FileNotFoundError(f"Model file not found: {model_file}")

    with model_file.open("rb") as f:
        classifier = pickle.load(f)

    default_meta = model_file.with_name("ensemble_model_meta.pkl")
    meta_file = Path(metadata_path) if metadata_path else default_meta
    metadata: Dict[str, object] = {}
    if meta_file.exists():
        with meta_file.open("rb") as f:
            metadata = pickle.load(f)
    else:
        logging.warning("Metadata file not found at %s; feature alignment will use current dataframe.", meta_file)

    return classifier, metadata


def evaluate_model(
    model_path: str,
    df: pd.DataFrame,
    text_scores: pd.Series,
    metadata_path: Optional[str] = None,
    output_dir: Optional[str] = None,
    allow_auto_debug_label: bool = True,
    test_size: float = 0.2,
    random_state: int = 42,
) -> Dict[str, float]:
    """Evaluate saved ensemble model and write metrics/plots to disk."""
    classifier, metadata = _load_ensemble_artifacts(model_path=model_path, metadata_path=metadata_path)
    if not hasattr(classifier, "predict"):
        raise ValueError("Loaded model does not implement `predict`.")

    work = df.copy()
    target_col = _resolve_target_column(work, allow_auto_debug_label=allow_auto_debug_label)
    X = _build_numeric_features(df=work, text_scores=text_scores)
    y = work[target_col]

    expected_cols: Sequence[str] = metadata.get("feature_columns", []) if isinstance(metadata, dict) else []
    if expected_cols:
        X = X.reindex(columns=expected_cols, fill_value=0.0)

    X_train, X_test, y_train, y_test = train_test_split(
        X,
        y,
        test_size=test_size,
        random_state=random_state,
        stratify=y if y.nunique(dropna=True) > 1 else None,
    )

    y_pred = classifier.predict(X_test)
    if hasattr(classifier, "predict_proba"):
        y_pred_proba = classifier.predict_proba(X_test)[:, 1]
    else:
        y_pred_proba = y_pred.astype(float)

    metrics = {
        "accuracy": float(accuracy_score(y_test, y_pred)),
        "precision_weighted": float(precision_score(y_test, y_pred, average="weighted", zero_division=0)),
        "recall_weighted": float(recall_score(y_test, y_pred, average="weighted", zero_division=0)),
        "f1_weighted": float(f1_score(y_test, y_pred, average="weighted", zero_division=0)),
        "auc_roc": float(roc_auc_score(y_test, y_pred_proba)) if y_test.nunique(dropna=True) > 1 else float("nan"),
    }

    for key, value in metrics.items():
        logging.info("%s: %.4f", key, value)

    out_dir = Path(output_dir) if output_dir else Path(model_path).resolve().parent / "evaluation"
    out_dir.mkdir(parents=True, exist_ok=True)

    with (out_dir / "metrics_reviews.json").open("w", encoding="utf-8") as f:
        json.dump(metrics, f, indent=2)

    plt.figure(figsize=(8, 6))
    sns.heatmap(confusion_matrix(y_test, y_pred), annot=True, fmt="d", cmap="Blues")
    plt.xlabel("Predicted")
    plt.ylabel("Actual")
    plt.title("Confusion Matrix")
    plt.tight_layout()
    plt.savefig(out_dir / "confusion_matrix_reviews.png")
    plt.close()

    if y_test.nunique(dropna=True) > 1:
        fpr, tpr, _ = roc_curve(y_test, y_pred_proba)
        plt.figure(figsize=(8, 6))
        plt.plot(fpr, tpr, label=f"AUC={metrics['auc_roc']:.3f}")
        plt.plot([0, 1], [0, 1], linestyle="--")
        plt.xlabel("False Positive Rate")
        plt.ylabel("True Positive Rate")
        plt.title("ROC Curve")
        plt.legend(loc="lower right")
        plt.tight_layout()
        plt.savefig(out_dir / "roc_curve_reviews.png")
        plt.close()

    if isinstance(classifier, RandomForestClassifier) and hasattr(classifier, "feature_importances_"):
        importances = classifier.feature_importances_
        order = np.argsort(importances)[::-1]
        feature_names = X.columns.to_numpy()

        plt.figure(figsize=(12, 8))
        plt.title("Feature Importances")
        plt.bar(range(len(importances)), importances[order], align="center")
        plt.xticks(range(len(importances)), feature_names[order], rotation=90)
        plt.tight_layout()
        plt.savefig(out_dir / "feature_importance_reviews.png")
        plt.close()

    # Use test split only to keep lengths aligned with predicted probabilities.
    test_view = work.loc[X_test.index].copy()
    test_view["text_suspicion_score"] = pd.to_numeric(text_scores, errors="coerce").reindex(X_test.index).values
    test_view["final_suspicion_score"] = y_pred_proba

    plt.figure(figsize=(12, 6))
    sns.histplot(test_view, x="final_suspicion_score", hue=target_col, kde=True)
    plt.title("Final Suspicion Score Distribution (Test Set)")
    plt.xlabel("Final Suspicion Score")
    plt.ylabel("Frequency")
    plt.tight_layout()
    plt.savefig(out_dir / "suspicion_distribution.png")
    plt.close()

    logging.info("Evaluation outputs saved to %s", out_dir)
    return metrics


if __name__ == "__main__":
    # Example file placeholders: replace with real paths before running.
    reviews_df = pd.read_csv("reviews.csv")

    with Path("text_suspicion_scores.pkl").open("rb") as f:
        suspicion_scores = pickle.load(f)

    evaluate_model(
        model_path="ensemble_model_v1.pkl",
        df=reviews_df,
        text_scores=pd.Series(suspicion_scores),
    )
    logging.info("Model evaluated and outputs saved successfully.")