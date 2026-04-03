import logging
import math
import re
from dataclasses import dataclass
from typing import Dict, Optional, Tuple

import numpy as np
import pandas as pd
from sentence_transformers import SentenceTransformer
from sklearn.neighbors import NearestNeighbors


logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")


def _minmax(series: pd.Series) -> pd.Series:
    min_v = float(series.min())
    max_v = float(series.max())
    if math.isclose(min_v, max_v):
        return pd.Series(0.0, index=series.index)
    return (series - min_v) / (max_v - min_v)


def build_auto_debug_label(df: pd.DataFrame) -> pd.Series:
    score = pd.Series(0, index=df.index, dtype="int64")

    if "overall" in df.columns:
        score += pd.to_numeric(df["overall"], errors="coerce").isin([1, 5]).astype(int)
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


@dataclass
class IntegrityWeights:
    fake_ratio: float = 0.5
    burst_score: float = 0.25
    template_score: float = 0.25


class AdvancedReviewFeatureBuilder:
    """Scalable advanced feature builder for semantic, temporal, and network signals."""

    REQUIRED_COLUMNS = ["reviewText", "reviewerID", "asin", "unixReviewTime"]

    def __init__(
        self,
        sbert_model_name: str = "sentence-transformers/all-MiniLM-L6-v2",
        template_similarity_threshold: float = 0.92,
        burst_window_hours: int = 24,
        burst_threshold: int = 3,
        similarity_neighbors: int = 10,
        device: Optional[str] = None,
    ) -> None:
        self.sbert_model_name = sbert_model_name
        self.template_similarity_threshold = template_similarity_threshold
        self.burst_window_hours = burst_window_hours
        self.burst_threshold = burst_threshold
        self.similarity_neighbors = similarity_neighbors
        self.device = device
        self._embedder: Optional[SentenceTransformer] = None

    def _validate(self, df: pd.DataFrame) -> None:
        missing = [c for c in self.REQUIRED_COLUMNS if c not in df.columns]
        if missing:
            raise ValueError(f"Missing required columns for advanced features: {missing}")

    def _get_embedder(self) -> SentenceTransformer:
        if self._embedder is None:
            self._embedder = SentenceTransformer(self.sbert_model_name, device=self.device)
        return self._embedder

    @staticmethod
    def _clean_template_text(text: str) -> str:
        text = str(text).lower()
        text = re.sub(r"\d+", " <num> ", text)
        text = re.sub(r"[^a-z\s<>]", " ", text)
        text = re.sub(r"\s+", " ", text).strip()
        tokens = text.split()
        return " ".join(tokens[:30])

    def build_embeddings(self, texts: pd.Series, batch_size: int = 256) -> np.ndarray:
        model = self._get_embedder()
        embeddings = model.encode(
            texts.astype(str).tolist(),
            batch_size=batch_size,
            show_progress_bar=False,
            normalize_embeddings=True,
            convert_to_numpy=True,
        )
        return embeddings

    def _semantic_similarity_features(self, embeddings: np.ndarray) -> Dict[str, np.ndarray]:
        n_samples = embeddings.shape[0]
        if n_samples < 2:
            zeros = np.zeros(n_samples, dtype=float)
            return {
                "max_cosine_sim": zeros,
                "mean_topk_cosine_sim": zeros,
            }

        n_neighbors = min(self.similarity_neighbors + 1, n_samples)
        nn = NearestNeighbors(metric="cosine", n_neighbors=n_neighbors, algorithm="auto")
        nn.fit(embeddings)
        distances, _ = nn.kneighbors(embeddings)

        sims = 1.0 - distances[:, 1:]
        max_sim = sims.max(axis=1)
        mean_topk = sims.mean(axis=1)
        return {
            "max_cosine_sim": max_sim,
            "mean_topk_cosine_sim": mean_topk,
        }

    def _template_features(self, work: pd.DataFrame) -> pd.DataFrame:
        work["template_signature"] = work["reviewText"].astype(str).apply(self._clean_template_text)
        signature_count = work.groupby("template_signature", observed=True)["template_signature"].transform("size")
        work["template_group_size"] = signature_count.astype(int)
        work["template_density"] = (work["template_group_size"] - 1).clip(lower=0) / 10.0
        work["template_density"] = work["template_density"].clip(upper=1.0)
        return work

    def _burst_features(self, work: pd.DataFrame) -> pd.DataFrame:
        ts = pd.to_datetime(work["unixReviewTime"], unit="s", errors="coerce")
        helper = work[["reviewerID"]].copy()
        helper["ts"] = ts
        helper["event"] = 1
        helper = helper.dropna(subset=["ts"]).sort_values(["reviewerID", "ts"])

        burst_count = pd.Series(1.0, index=helper.index)
        for _, grp in helper.groupby("reviewerID", sort=False):
            rolling_count = (
                grp.set_index("ts")["event"]
                .rolling(f"{self.burst_window_hours}h")
                .sum()
                .astype(float)
            )
            burst_count.loc[grp.index] = rolling_count.values

        work["reviews_in_burst_window"] = burst_count.reindex(work.index).fillna(1.0)
        denom = max(self.burst_threshold - 1, 1)
        work["burst_score"] = ((work["reviews_in_burst_window"] - 1) / denom).clip(lower=0.0, upper=1.0)
        work["burst_flag_time"] = (work["reviews_in_burst_window"] >= self.burst_threshold).astype(int)
        return work

    @staticmethod
    def _reviewer_network_features(work: pd.DataFrame) -> pd.DataFrame:
        product_reviewer_count = work.groupby("asin", observed=True)["reviewerID"].transform("nunique")
        reviewer_product_degree = work.groupby("reviewerID", observed=True)["asin"].transform("nunique")
        reviewer_review_count = work.groupby("reviewerID", observed=True)["reviewerID"].transform("size")

        work["product_reviewer_count"] = product_reviewer_count.astype(float)
        work["reviewer_product_degree"] = reviewer_product_degree.astype(float)
        work["reviewer_review_count_net"] = reviewer_review_count.astype(float)

        work["reviewer_overlap_score"] = (
            (work["product_reviewer_count"] - 1.0)
            / work["reviewer_product_degree"].replace(0, np.nan)
        ).fillna(0.0)

        work["reviewer_network_score"] = _minmax(
            np.log1p(work["product_reviewer_count"]) * np.log1p(work["reviewer_product_degree"])
        )
        return work

    @staticmethod
    def _resolve_label_for_integrity(work: pd.DataFrame, label_col: Optional[str]) -> pd.Series:
        if label_col and label_col in work.columns:
            label = pd.to_numeric(work[label_col], errors="coerce").fillna(0).astype(int)
            if label.nunique(dropna=True) > 1:
                return label
        if "fake_label" in work.columns:
            label = pd.to_numeric(work["fake_label"], errors="coerce").fillna(0).astype(int)
            if label.nunique(dropna=True) > 1:
                return label
        if "label" in work.columns:
            label = pd.to_numeric(work["label"], errors="coerce").fillna(0).astype(int)
            if label.nunique(dropna=True) > 1:
                return label
        return build_auto_debug_label(work)

    def _product_integrity(self, work: pd.DataFrame, label_col: Optional[str], weights: IntegrityWeights) -> pd.DataFrame:
        used_label = self._resolve_label_for_integrity(work, label_col=label_col)
        work["_integrity_label"] = used_label

        product_stats = work.groupby("asin", observed=True).agg(
            fake_ratio=("_integrity_label", "mean"),
            burst_score_product=("burst_score", "mean"),
            template_score_product=("template_score", "mean"),
        )

        risk_score = (
            (weights.fake_ratio * product_stats["fake_ratio"])
            + (weights.burst_score * product_stats["burst_score_product"])
            + (weights.template_score * product_stats["template_score_product"])
        ).clip(0.0, 1.0)

        product_stats["product_risk_score"] = risk_score
        product_stats["product_integrity_score"] = (1.0 - risk_score).clip(0.0, 1.0)

        work = work.merge(product_stats, left_on="asin", right_index=True, how="left")
        work = work.drop(columns=["_integrity_label"])
        return work

    def build(
        self,
        df: pd.DataFrame,
        label_col: Optional[str] = None,
        batch_size: int = 256,
        return_embeddings: bool = False,
        integrity_weights: Optional[IntegrityWeights] = None,
    ) -> Tuple[pd.DataFrame, Optional[np.ndarray]]:
        """Build scalable advanced features for downstream model training."""
        self._validate(df)
        weights = integrity_weights or IntegrityWeights()
        work = df.copy()

        logging.info("Computing SBERT embeddings...")
        embeddings = self.build_embeddings(work["reviewText"], batch_size=batch_size)

        logging.info("Computing cosine similarity features...")
        sim = self._semantic_similarity_features(embeddings)
        work["max_cosine_sim"] = sim["max_cosine_sim"]
        work["mean_topk_cosine_sim"] = sim["mean_topk_cosine_sim"]

        logging.info("Computing template detection features...")
        work = self._template_features(work)
        semantic_template = (work["max_cosine_sim"] >= self.template_similarity_threshold).astype(float)
        work["template_flag"] = ((work["template_group_size"] >= 2) | (semantic_template == 1.0)).astype(int)
        work["template_score"] = np.maximum(work["template_density"], semantic_template * 0.8)

        logging.info("Computing burst features...")
        work = self._burst_features(work)

        logging.info("Computing reviewer network features...")
        work = self._reviewer_network_features(work)

        logging.info("Computing product integrity score...")
        work = self._product_integrity(work, label_col=label_col, weights=weights)

        if return_embeddings:
            return work, embeddings
        return work, None