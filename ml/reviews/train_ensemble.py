import logging
import pickle
from pathlib import Path
from typing import Dict, Optional, Sequence, Tuple

import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import accuracy_score, f1_score, precision_score, recall_score
from sklearn.model_selection import train_test_split

if __package__:
	from .engineer_features import FeatureEngineer
	from .label_reviews import ReviewLabeler
	from .load_reviews import DataPreprocessor
	from .train_text_model import TextModelTrainer
else:  # pragma: no cover
	from engineer_features import FeatureEngineer
	from label_reviews import ReviewLabeler
	from load_reviews import DataPreprocessor
	from train_text_model import TextModelTrainer


logging.basicConfig(
	level=logging.INFO,
	format="%(asctime)s - %(levelname)s - %(message)s",
)


class EnsembleModelTrainer:
	"""Train a Stage-2 RandomForest model on engineered features + text suspicion score."""

	NON_FEATURE_COLUMNS = {
		"reviewText",
		"cleaned_review_text",
		"reviewerID",
		"asin",
		"label",
		"fake_label",
		"_auto_debug_label",
	}

	def __init__(self) -> None:
		self.classifier: Optional[RandomForestClassifier] = None
		self.feature_columns: Sequence[str] = []
		self.metrics: Dict[str, float] = {}
		self.target_column_used: Optional[str] = None

	@staticmethod
	def _resolve_target_column(df: pd.DataFrame) -> str:
		if "fake_label" in df.columns:
			return "fake_label"
		if "label" in df.columns:
			return "label"
		raise ValueError("Target label column not found. Expected `fake_label` or `label`.")

	def _prepare_feature_matrix(self, df: pd.DataFrame, text_scores: pd.Series) -> pd.DataFrame:
		if len(df) != len(text_scores):
			raise ValueError(
				f"Length mismatch: df has {len(df)} rows but text_scores has {len(text_scores)} rows."
			)

		candidate_cols = [
			col for col in df.columns
			if col not in self.NON_FEATURE_COLUMNS and pd.api.types.is_numeric_dtype(df[col])
		]
		if not candidate_cols:
			raise ValueError("No numeric engineered feature columns found for Stage-2 training.")

		numeric_features = df[candidate_cols].copy().fillna(0.0)
		numeric_features["text_suspicion_score"] = pd.to_numeric(text_scores, errors="coerce").fillna(0.0).values

		self.feature_columns = list(numeric_features.columns)
		return numeric_features

	@staticmethod
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

	def train_ensemble(
		self,
		df: pd.DataFrame,
		text_scores: pd.Series,
		target_col: Optional[str] = None,
		allow_auto_debug_label: bool = True,
		test_size: float = 0.2,
		random_state: int = 42,
	) -> Tuple[RandomForestClassifier, Dict[str, float]]:
		"""Train RandomForest and return classifier with evaluation metrics."""
		work = df.copy()
		resolved_target = target_col or self._resolve_target_column(work)
		if work[resolved_target].nunique(dropna=True) < 2:
			if not allow_auto_debug_label:
				raise ValueError("Training requires at least two classes in target labels.")
			work["_auto_debug_label"] = self._build_auto_debug_label(work)
			resolved_target = "_auto_debug_label"
			logging.warning(
				"Primary target had one class. Falling back to `_auto_debug_label` with distribution: %s",
				work[resolved_target].value_counts().to_dict(),
			)

		self.target_column_used = resolved_target

		X = self._prepare_feature_matrix(df=work, text_scores=text_scores)
		y = work[resolved_target]

		stratify = y if y.nunique(dropna=True) > 1 else None
		X_train, X_test, y_train, y_test = train_test_split(
			X,
			y,
			test_size=test_size,
			random_state=random_state,
			stratify=stratify,
		)

		self.classifier = RandomForestClassifier(
			class_weight="balanced",
			n_estimators=150,
			max_depth=10,
			random_state=random_state,
			n_jobs=-1,
		)
		self.classifier.fit(X_train, y_train)

		y_pred = self.classifier.predict(X_test)
		self.metrics = {
			"accuracy": accuracy_score(y_test, y_pred),
			"precision_weighted": precision_score(y_test, y_pred, average="weighted", zero_division=0),
			"recall_weighted": recall_score(y_test, y_pred, average="weighted", zero_division=0),
			"f1_weighted": f1_score(y_test, y_pred, average="weighted", zero_division=0),
		}

		logging.info("Accuracy: %.4f", self.metrics["accuracy"])
		logging.info("Precision (weighted): %.4f", self.metrics["precision_weighted"])
		logging.info("Recall (weighted): %.4f", self.metrics["recall_weighted"])
		logging.info("F1 (weighted): %.4f", self.metrics["f1_weighted"])

		return self.classifier, self.metrics

	def predict_scores(self, df: pd.DataFrame, text_scores: pd.Series) -> pd.Series:
		"""Predict final suspicion score probability for each review."""
		if self.classifier is None:
			raise ValueError("Model not trained. Call train_ensemble before predict_scores.")

		X = self._prepare_feature_matrix(df=df, text_scores=text_scores)
		X = X.reindex(columns=self.feature_columns, fill_value=0.0)
		final_suspicion_scores = self.classifier.predict_proba(X)[:, 1]
		return pd.Series(final_suspicion_scores, name="final_suspicion_score")

	def save_model(
		self,
		output_dir: Optional[str] = None,
		model_name: str = "ensemble_model_v1.pkl",
		metadata_name: str = "ensemble_model_meta.pkl",
	) -> Tuple[Path, Path]:
		"""Persist model and feature metadata under ml/reviews/models by default."""
		if self.classifier is None:
			raise ValueError("Model not trained yet. Call train_ensemble before save_model.")

		base_dir = Path(output_dir) if output_dir else Path(__file__).resolve().parent / "models"
		base_dir.mkdir(parents=True, exist_ok=True)

		model_path = base_dir / model_name
		meta_path = base_dir / metadata_name

		with model_path.open("wb") as f:
			pickle.dump(self.classifier, f)

		with meta_path.open("wb") as f:
			pickle.dump({"feature_columns": list(self.feature_columns), "metrics": self.metrics}, f)

		logging.info("Saved ensemble model to %s", model_path)
		logging.info("Saved ensemble metadata to %s", meta_path)
		return model_path, meta_path


if __name__ == "__main__":
	preprocessor = DataPreprocessor()
	raw_df = preprocessor.load_reviews(
		"path_to_your_amazon_reviews.json",
		sample_size=10_000,
	)

	labeler = ReviewLabeler()
	labeled_df = labeler.generate_labels(raw_df)

	engineer = FeatureEngineer()
	features_df = engineer.build_features(labeled_df)

	# Stage-1 text model probabilities.
	text_trainer = TextModelTrainer()
	vectorizer, text_model, _ = text_trainer.train_text_model(features_df)
	text_scores = pd.Series(
		text_model.predict_proba(vectorizer.transform(features_df["cleaned_review_text"].astype(str)))[:, 1],
		name="text_suspicion_score",
	)

	trainer = EnsembleModelTrainer()
	trainer.train_ensemble(features_df, text_scores=text_scores)
	trainer.save_model()

	predicted_scores = trainer.predict_scores(features_df, text_scores=text_scores)
	print(predicted_scores.head())
