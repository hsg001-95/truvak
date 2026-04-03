import logging
from collections import Counter
from typing import Dict

import pandas as pd

if __package__:
	from .load_reviews import DataPreprocessor
else:  # pragma: no cover
	from load_reviews import DataPreprocessor


logging.basicConfig(
	level=logging.INFO,
	format="%(asctime)s - %(levelname)s - %(message)s",
)


class ReviewLabeler:
	"""Generate proxy fake-review labels from heuristic rules."""

	REQUIRED_COLUMNS = [
		"reviewText",
		"overall",
		"verified",
		"reviewerID",
		"unixReviewTime",
	]

	def __init__(self) -> None:
		self.data = pd.DataFrame()

	@staticmethod
	def _validate_columns(df: pd.DataFrame) -> None:
		missing = [col for col in ReviewLabeler.REQUIRED_COLUMNS if col not in df.columns]
		if missing:
			raise ValueError(
				f"DataFrame is missing required columns: {missing}. "
				f"Found columns: {list(df.columns)}"
			)

	@staticmethod
	def compute_reviews_per_day_per_user(review_data: pd.DataFrame) -> Dict[str, Dict[pd.Timestamp, int]]:
		"""Return nested mapping: reviewerID -> {date -> review_count}."""
		work = review_data[["reviewerID", "unixReviewTime"]].copy()
		work["date"] = pd.to_datetime(work["unixReviewTime"], unit="s", errors="coerce").dt.normalize()
		work = work.dropna(subset=["date", "reviewerID"])

		grouped = (
			work.groupby(["reviewerID", "date"], observed=True)
			.size()
			.rename("count")
			.reset_index()
		)

		mapping: Dict[str, Dict[pd.Timestamp, int]] = {}
		for row in grouped.itertuples(index=False):
			mapping.setdefault(row.reviewerID, {})[row.date] = int(row.count)
		return mapping

	@staticmethod
	def generate_labels(df: pd.DataFrame) -> pd.DataFrame:
		"""Append `fake_label` where 1 indicates likely fake review by heuristic."""
		ReviewLabeler._validate_columns(df)
		logging.info("Generating fake labels...")

		work = df.copy()
		work["date"] = pd.to_datetime(work["unixReviewTime"], unit="s", errors="coerce").dt.normalize()

		# Daily activity count per reviewer.
		daily_counts = (
			work.groupby(["reviewerID", "date"], observed=True)
			.size()
			.rename("reviews_same_day")
			.reset_index()
		)
		work = work.merge(daily_counts, on=["reviewerID", "date"], how="left")

		verified = work["verified"]
		if verified.dtype == object:
			verified = verified.astype(str).str.lower().map({"true": True, "false": False})
		verified = verified.fillna(False).astype(bool)

		review_length = work["reviewText"].astype(str).str.len()
		rating = pd.to_numeric(work["overall"], errors="coerce")

		fake_mask = (
			(~verified)
			& (work["reviews_same_day"].fillna(0) >= 3)
			& (rating.isin([1, 5]))
			& (review_length < 50)
		)

		work["fake_label"] = fake_mask.astype(int)
		work = work.drop(columns=["date", "reviews_same_day"])

		logging.info("Class imbalance report:")
		ReviewLabeler.class_imbalance_report(work)

		return work

	@staticmethod
	def class_imbalance_report(df: pd.DataFrame) -> None:
		"""Print class counts and percentages for generated labels."""
		label_counts = Counter(df["fake_label"])
		logging.info("Class counts:")
		print(label_counts)

		total_samples = sum(label_counts.values())
		if total_samples == 0:
			logging.info("No samples available for class ratio calculation.")
			return

		class_0_ratio = round((label_counts.get(0, 0) / total_samples) * 100, 2)
		class_1_ratio = round((label_counts.get(1, 0) / total_samples) * 100, 2)
		logging.info("Class 0 (Real Reviews): %s%%", class_0_ratio)
		logging.info("Class 1 (Fake Reviews): %s%%", class_1_ratio)


if __name__ == "__main__":
	preprocessor = DataPreprocessor()
	data = preprocessor.load_reviews(
		"path_to_your_amazon_reviews.json",
		sample_size=10_000,
	)

	labeler = ReviewLabeler()
	labeled_data = labeler.generate_labels(data)
	print(labeled_data.head())
