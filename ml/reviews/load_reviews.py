import logging
from pathlib import Path
from typing import Optional

import pandas as pd


logging.basicConfig(
	level=logging.INFO,
	format="%(asctime)s - %(levelname)s - %(message)s",
)


class DataPreprocessor:
	"""Preprocess Amazon-style reviews datasets from JSON Lines or CSV."""

	REQUIRED_COLUMNS = [
		"reviewText",
		"overall",
		"verified",
		"reviewerID",
		"asin",
		"unixReviewTime",
	]

	def __init__(self) -> None:
		self.data = pd.DataFrame()

	@staticmethod
	def _validate_columns(chunk: pd.DataFrame) -> None:
		missing = [c for c in DataPreprocessor.REQUIRED_COLUMNS if c not in chunk.columns]
		if missing:
			raise ValueError(
				f"Input data is missing required columns: {missing}. "
				f"Found columns: {list(chunk.columns)}"
			)

	@staticmethod
	def _process_chunk(chunk: pd.DataFrame) -> pd.DataFrame:
		chunk.columns = chunk.columns.str.strip()
		if "verified" not in chunk.columns:
			chunk["verified"] = False
		DataPreprocessor._validate_columns(chunk)
		processed_chunk = chunk[DataPreprocessor.REQUIRED_COLUMNS].copy()
		processed_chunk = processed_chunk.dropna(
			subset=["reviewText", "overall", "reviewerID", "asin", "unixReviewTime"]
		)
		return processed_chunk

	@staticmethod
	def _get_reader(file_path: str, chunk_size: int):
		file_name = Path(file_path).name.lower()
		if file_name.endswith((".json", ".jsonl")):
			return pd.read_json(file_path, lines=True, chunksize=chunk_size)
		if file_name.endswith((".json.gz", ".jsonl.gz")):
			return pd.read_json(file_path, lines=True, chunksize=chunk_size, compression="gzip")
		if file_name.endswith(".csv"):
			return pd.read_csv(file_path, chunksize=chunk_size)
		if file_name.endswith(".csv.gz"):
			return pd.read_csv(file_path, chunksize=chunk_size, compression="gzip")
		raise ValueError(
			"Unsupported file type. Use .json/.jsonl/.csv or gzipped variants (.json.gz/.csv.gz)."
		)

	@staticmethod
	def load_reviews(
		file_path: str,
		sample_size: Optional[int] = None,
		chunk_size: int = 10**6,
	) -> pd.DataFrame:
		"""Load reviews in chunks, clean required fields, and optionally sample rows."""
		logging.info("Loading reviews from %s in chunks of size %s", file_path, chunk_size)

		chunks = DataPreprocessor._get_reader(file_path=file_path, chunk_size=chunk_size)

		logging.info("Processing chunks...")
		processed_data = []
		for chunk in chunks:
			processed_data.append(DataPreprocessor._process_chunk(chunk))

		if not processed_data:
			raise ValueError("No data found in input file.")

		data = pd.concat(processed_data, ignore_index=True)

		if sample_size is not None:
			if sample_size <= 0:
				raise ValueError("sample_size must be a positive integer.")
			if sample_size > len(data):
				raise ValueError(
					f"sample_size ({sample_size}) cannot be greater than rows available ({len(data)})."
				)
			data = data.sample(n=sample_size, random_state=42).reset_index(drop=True)

		logging.info("EDA on preprocessed data:")
		DataPreprocessor.eda(data)

		return data

	@staticmethod
	def eda(df: pd.DataFrame) -> None:
		"""Perform basic EDA logging for ratings and review lengths."""
		logging.info("Class distribution of overall ratings:")
		print(df["overall"].value_counts())

		review_lengths = df["reviewText"].astype(str).str.len()
		logging.info("Basic statistics for review lengths:")
		print(review_lengths.describe())


if __name__ == "__main__":
	preprocessor = DataPreprocessor()
	# Replace with your actual dataset path.
	preprocessor.data = preprocessor.load_reviews(
		"path_to_your_amazon_reviews.json",
		sample_size=10_000,
	)
