import logging
import pickle
from pathlib import Path
from typing import Dict, Optional, Tuple

import pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, f1_score, precision_score, recall_score
from sklearn.model_selection import train_test_split

if __package__:
	from .engineer_features import FeatureEngineer
	from .label_reviews import ReviewLabeler
	from .load_reviews import DataPreprocessor
else:  # pragma: no cover
	from engineer_features import FeatureEngineer
	from label_reviews import ReviewLabeler
	from load_reviews import DataPreprocessor


logging.basicConfig(
	level=logging.INFO,
	format="%(asctime)s - %(levelname)s - %(message)s",
)


class TextModelTrainer:
	"""Train and persist a TF-IDF + Logistic Regression text classifier."""

	def __init__(self) -> None:
		self.vectorizer: Optional[TfidfVectorizer] = None
		self.classifier: Optional[LogisticRegression] = None
		self.metrics: Dict[str, float] = {}
		self.target_column_used: Optional[str] = None

	@staticmethod
	def _resolve_target_column(df: pd.DataFrame) -> str:
		if "fake_label" in df.columns:
			return "fake_label"
		if "label" in df.columns:
			return "label"
		raise ValueError("Target label column not found. Expected `fake_label` or `label`.")

	@staticmethod
	def _validate_inputs(df: pd.DataFrame, text_col: str, target_col: str) -> None:
		required = [text_col, target_col]
		missing = [col for col in required if col not in df.columns]
		if missing:
			raise ValueError(f"DataFrame is missing required columns: {missing}")

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

	def train_text_model(
		self,
		df: pd.DataFrame,
		text_col: str = "cleaned_review_text",
		target_col: Optional[str] = None,
		allow_auto_debug_label: bool = True,
		test_size: float = 0.2,
		random_state: int = 42,
	) -> Tuple[TfidfVectorizer, LogisticRegression, Dict[str, float]]:
		"""Train model and return fitted vectorizer, classifier, and evaluation metrics."""
		work = df.copy()
		resolved_target = target_col or self._resolve_target_column(work)
		self._validate_inputs(work, text_col=text_col, target_col=resolved_target)

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

		X = work[text_col].astype(str)
		y = work[resolved_target]

		self.vectorizer = TfidfVectorizer(ngram_range=(1, 2), max_features=5000)
		X_tfidf = self.vectorizer.fit_transform(X)

		stratify = y if y.nunique(dropna=True) > 1 else None
		X_train, X_test, y_train, y_test = train_test_split(
			X_tfidf,
			y,
			test_size=test_size,
			random_state=random_state,
			stratify=stratify,
		)

		self.classifier = LogisticRegression(class_weight="balanced", max_iter=1000)
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

		return self.vectorizer, self.classifier, self.metrics

	def save_model(
		self,
		output_dir: Optional[str] = None,
		vectorizer_name: str = "tfidf_vectorizer.pkl",
		model_name: str = "review_model_v1.pkl",
	) -> Tuple[Path, Path]:
		"""Save trained vectorizer and classifier to disk under ml/reviews/models by default."""
		if self.vectorizer is None or self.classifier is None:
			raise ValueError("Model not trained yet. Call train_text_model before save_model.")

		base_dir = Path(output_dir) if output_dir else Path(__file__).resolve().parent / "models"
		base_dir.mkdir(parents=True, exist_ok=True)

		vectorizer_path = base_dir / vectorizer_name
		model_path = base_dir / model_name

		with vectorizer_path.open("wb") as f:
			pickle.dump(self.vectorizer, f)

		with model_path.open("wb") as f:
			pickle.dump(self.classifier, f)

		logging.info("Saved vectorizer to %s", vectorizer_path)
		logging.info("Saved model to %s", model_path)
		return vectorizer_path, model_path


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

	trainer = TextModelTrainer()
	trainer.train_text_model(features_df)
	trainer.save_model()

	print("Model saved successfully.")
