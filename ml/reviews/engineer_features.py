import logging
import string
from typing import Dict, List

import pandas as pd
from textblob import TextBlob
from vaderSentiment.vaderSentiment import SentimentIntensityAnalyzer

if __package__:
	from .label_reviews import ReviewLabeler
	from .load_reviews import DataPreprocessor
else:  # pragma: no cover
	from label_reviews import ReviewLabeler
	from load_reviews import DataPreprocessor


logging.basicConfig(
	level=logging.INFO,
	format="%(asctime)s - %(levelname)s - %(message)s",
)


class FeatureEngineer:
	"""Build text, behavioral, and temporal features for review-level modeling."""

	REQUIRED_COLUMNS: List[str] = [
		"reviewText",
		"overall",
		"verified",
		"reviewerID",
		"asin",
		"unixReviewTime",
	]

	def __init__(self) -> None:
		self.data = pd.DataFrame()
		self._vader = SentimentIntensityAnalyzer()

	@staticmethod
	def _validate_columns(df: pd.DataFrame) -> None:
		missing = [col for col in FeatureEngineer.REQUIRED_COLUMNS if col not in df.columns]
		if missing:
			raise ValueError(
				f"DataFrame is missing required columns: {missing}. "
				f"Found columns: {list(df.columns)}"
			)

	@staticmethod
	def _text_cleaning(text: str) -> str:
		return " ".join(str(text).split())

	@staticmethod
	def _compute_capital_ratio(text: str) -> float:
		if not text:
			return 0.0
		upper_case_count = sum(1 for char in text if char.isupper())
		return upper_case_count / len(text)

	@staticmethod
	def _compute_punctuation_density(text: str) -> float:
		if not text:
			return 0.0
		punctuation_count = sum(1 for char in text if char in string.punctuation)
		return punctuation_count / len(text)

	@staticmethod
	def _safe_to_datetime(series: pd.Series) -> pd.Series:
		return pd.to_datetime(series, unit="s", errors="coerce").dt.normalize()

	def _textblob_sentiment(self, text: str) -> Dict[str, float]:
		blob = TextBlob(text)
		return {
			"polarity": float(blob.sentiment.polarity),
			"subjectivity": float(blob.sentiment.subjectivity),
		}

	def _vader_sentiment(self, text: str) -> Dict[str, float]:
		return self._vader.polarity_scores(text)

	def build_features(self, df: pd.DataFrame) -> pd.DataFrame:
		"""Return DataFrame with engineered review-level features added."""
		self._validate_columns(df)
		logging.info("Building features...")

		work = df.copy()
		work["cleaned_review_text"] = work["reviewText"].astype(str).apply(self._text_cleaning)

		work["review_length_chars"] = work["cleaned_review_text"].str.len()
		work["review_length_words"] = work["cleaned_review_text"].str.split().str.len()
		work["exclamation_count"] = work["cleaned_review_text"].str.count("!")
		work["capital_ratio"] = work["cleaned_review_text"].apply(self._compute_capital_ratio)
		work["punctuation_density"] = work["cleaned_review_text"].apply(self._compute_punctuation_density)

		textblob_scores = work["cleaned_review_text"].apply(self._textblob_sentiment)
		work["textblob_sentiment_polarity"] = textblob_scores.apply(lambda x: x["polarity"])
		work["textblob_sentiment_subjectivity"] = textblob_scores.apply(lambda x: x["subjectivity"])

		vader_scores = work["cleaned_review_text"].apply(self._vader_sentiment)
		work["vader_sentiment_neg"] = vader_scores.apply(lambda x: x["neg"])
		work["vader_sentiment_neu"] = vader_scores.apply(lambda x: x["neu"])
		work["vader_sentiment_pos"] = vader_scores.apply(lambda x: x["pos"])
		work["vader_sentiment_compound"] = vader_scores.apply(lambda x: x["compound"])

		work["review_date"] = self._safe_to_datetime(work["unixReviewTime"])
		work["day_of_week"] = work["review_date"].dt.dayofweek.fillna(-1).astype(int)

		work["reviewer_review_count"] = work.groupby("reviewerID", observed=True)["reviewerID"].transform("size")

		same_day_counts = (
			work.groupby(["reviewerID", "review_date"], observed=True)["reviewerID"]
			.transform("size")
			.fillna(0)
			.astype(int)
		)
		work["reviews_same_day"] = same_day_counts

		work["avg_rating_by_user"] = (
			pd.to_numeric(work["overall"], errors="coerce")
			.groupby(work["reviewerID"], observed=True)
			.transform("mean")
		)

		product_avg_rating = (
			pd.to_numeric(work["overall"], errors="coerce")
			.groupby(work["asin"], observed=True)
			.transform("mean")
		)
		work["rating_deviation_from_product"] = pd.to_numeric(work["overall"], errors="coerce") - product_avg_rating

		global_mean_rating = pd.to_numeric(work["overall"], errors="coerce").mean()
		work["rating_deviation"] = pd.to_numeric(work["overall"], errors="coerce") - global_mean_rating

		rating_centered = (pd.to_numeric(work["overall"], errors="coerce") - 3.0) / 2.0
		work["sentiment_vs_rating_mismatch"] = (
			(work["textblob_sentiment_polarity"] * rating_centered < 0)
			.fillna(False)
			.astype(int)
		)

		first_review_time = (
			work.groupby("reviewerID", observed=True)["unixReviewTime"]
			.transform("min")
		)
		work["days_since_first_review"] = (
			(pd.to_numeric(work["unixReviewTime"], errors="coerce") - pd.to_numeric(first_review_time, errors="coerce"))
			/ 86400.0
		).fillna(0.0)

		work["burst_flag"] = (work["reviews_same_day"] >= 3).astype(int)

		work = work.drop(columns=["review_date"])
		logging.info("Features built successfully.")
		return work


if __name__ == "__main__":
	preprocessor = DataPreprocessor()
	data = preprocessor.load_reviews(
		"path_to_your_amazon_reviews.json",
		sample_size=10_000,
	)

	labeler = ReviewLabeler()
	labeled_data = labeler.generate_labels(data)

	engineer = FeatureEngineer()
	features_df = engineer.build_features(labeled_data)
	print(features_df.head())
