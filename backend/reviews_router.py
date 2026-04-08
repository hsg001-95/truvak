import hashlib
import json
import logging
import pickle
import re
import time
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import numpy as np
import pandas as pd
import shap
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from backend.db import get_connection
from backend.db_adapter import adapt_query, is_postgres
from backend.privacy import hash_buyer_id


logger = logging.getLogger("trust.reviews")

PROJECT_ROOT = Path(__file__).resolve().parent.parent
REVIEWS_MODELS_DIR = PROJECT_ROOT / "ml" / "reviews" / "models"


def _load_pickle_with_fallback(candidates: List[str], label: str, required: bool = True):
    for name in candidates:
        path = REVIEWS_MODELS_DIR / name
        if path.exists():
            with path.open("rb") as f:
                logger.info("Loaded %s artifact: %s", label, path)
                return pickle.load(f)
    if required:
        logger.warning("No %s artifact found among: %s", label, candidates)
    else:
        logger.info("Optional %s artifact not found among: %s", label, candidates)
    return None


def _load_json_if_exists(name: str, required: bool = False):
    path = REVIEWS_MODELS_DIR / name
    if not path.exists():
        if required:
            logger.warning("%s not found, continuing without it", name)
        else:
            logger.info("Optional %s not found, continuing without it", name)
        return None
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


STAGE1_MODEL = _load_pickle_with_fallback(
    ["review_model_v1.pkl", "review_model_debug_label.pkl"],
    label="stage1 model",
    required=True,
)
STAGE2_MODEL = _load_pickle_with_fallback(
    ["ensemble_model_v1.pkl", "ensemble_model_debug_label.pkl", "ensemble_model_auto_fallback_test.pkl"],
    label="stage2 model",
    required=True,
)
STAGE3_MODEL = _load_pickle_with_fallback(
    ["xgb_review_model.pkl", "xgb_review_model_v2.pkl"],
    label="stage3 model",
    required=False,
)
TFIDF_VECTORIZER = _load_pickle_with_fallback(["tfidf_vectorizer.pkl"], label="tfidf vectorizer", required=True)
FEATURE_ALIGNMENT = _load_json_if_exists("feature_alignment.json", required=False)

router = APIRouter(prefix="/v1/reviews", tags=["reviews"])


class ReviewInput(BaseModel):
    review_text: str = Field(..., min_length=1)
    rating: float = Field(..., ge=1.0, le=5.0)
    verified_purchase: bool = False
    reviewer_id: str = Field(..., min_length=1)
    product_id: str = Field(..., min_length=1)
    review_timestamp: Optional[str] = None
    helpful_votes: Optional[int] = Field(default=0, ge=0)


class ReviewAnalysisRequest(BaseModel):
    reviews: List[ReviewInput] = Field(..., min_length=1, max_length=100)
    merchant_id: str = Field(..., min_length=1)
    product_url: Optional[str] = None


class SingleReviewResult(BaseModel):
    review_index: int
    suspicion_score: float = Field(..., ge=0.0, le=1.0)
    suspicion_label: str
    confidence: str
    top_reasons: List[str] = Field(default_factory=list, max_length=3)
    shap_explanations: Optional[List[Dict[str, object]]] = None


class ProductIntegrityResult(BaseModel):
    product_id: str
    authenticity_score: float = Field(..., ge=0.0, le=100.0)
    fake_review_percentage: float
    total_reviews_analyzed: int
    burst_detected: bool
    template_detected: bool
    ring_detected: bool
    overall_verdict: str


class ReviewAnalysisResponse(BaseModel):
    product_integrity: ProductIntegrityResult
    reviews: List[SingleReviewResult]
    model_version: str
    analysis_timestamp: str
    merchant_id: str


class FeedbackRequest(BaseModel):
    review_text: str = Field(..., min_length=1)
    merchant_verdict: str = Field(..., pattern="^(genuine|fake)$")
    merchant_id: str = Field(..., min_length=1)
    product_id: str = Field(..., min_length=1)


class FeedbackResponse(BaseModel):
    status: str
    message: str
    total_feedback_count: int


def _ensure_review_tables() -> None:
    if is_postgres():
        # PostgreSQL schema should be managed via migrations / Supabase SQL.
        return

    conn = get_connection()
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS review_analyses (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            merchant_id TEXT NOT NULL,
            product_id TEXT NOT NULL,
            analysis_timestamp TEXT NOT NULL,
            total_reviews INTEGER NOT NULL,
            fake_count INTEGER NOT NULL,
            authenticity_score REAL NOT NULL,
            fake_review_percentage REAL NOT NULL,
            burst_detected INTEGER NOT NULL,
            template_detected INTEGER NOT NULL,
            ring_detected INTEGER NOT NULL,
            overall_verdict TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS review_feedback (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            merchant_id TEXT NOT NULL,
            product_id TEXT NOT NULL,
            review_text_hash TEXT NOT NULL,
            merchant_verdict TEXT NOT NULL,
            submitted_at TEXT NOT NULL
        );
        """
    )
    conn.commit()
    conn.close()


def _clean_text(text: str) -> str:
    return re.sub(r"\s+", " ", text.strip().lower())


def _top_reasons_from_text(text: str, rating: float, verified: bool) -> List[str]:
    reasons: List[str] = []
    words = text.split()
    if len(words) <= 6:
        reasons.append("Very short review")
    if text.count("!") >= 3:
        reasons.append("Excessive punctuation")
    caps = sum(1 for c in text if c.isupper())
    letters = sum(1 for c in text if c.isalpha())
    if letters > 0 and (caps / letters) > 0.25:
        reasons.append("High capitalization pattern")
    if not verified:
        reasons.append("Not a verified purchase")
    if rating in (1.0, 5.0):
        reasons.append("Extreme rating signal")
    if not reasons:
        reasons.append("Balanced linguistic pattern")
    return reasons[:3]


def engineer_features(reviews: List[ReviewInput], hashed_reviewers: List[str]) -> Tuple[pd.DataFrame, List[List[str]]]:
    rows: List[Dict[str, float]] = []
    all_reasons: List[List[str]] = []

    for review, hashed_reviewer in zip(reviews, hashed_reviewers):
        text = review.review_text or ""
        cleaned = _clean_text(text)
        words = [w for w in cleaned.split(" ") if w]
        letters = [c for c in text if c.isalpha()]
        digits = [c for c in text if c.isdigit()]
        repeated_spans = re.findall(r"(.)\1{2,}", text)

        all_reasons.append(_top_reasons_from_text(text, review.rating, review.verified_purchase))

        rows.append(
            {
                "review_length_chars": float(len(text)),
                "review_length_words": float(len(words)),
                "exclamation_count": float(text.count("!")),
                "question_count": float(text.count("?")),
                "capital_ratio": float(sum(1 for c in text if c.isupper()) / max(len(letters), 1)),
                "digit_ratio": float(len(digits) / max(len(text), 1)),
                "repeated_char_runs": float(len(repeated_spans)),
                "unique_word_ratio": float(len(set(words)) / max(len(words), 1)),
                "avg_word_len": float(sum(len(w) for w in words) / max(len(words), 1)),
                "verified_purchase": float(int(review.verified_purchase)),
                "helpful_votes": float(review.helpful_votes or 0),
                "rating": float(review.rating),
                "reviewer_hash_mod": float(int(hashlib.sha256(hashed_reviewer.encode("utf-8")).hexdigest()[:8], 16) % 1000),
            }
        )

    return pd.DataFrame(rows).fillna(0.0), all_reasons


def _predict_proba_safe(model, X: pd.DataFrame, default: float = 0.5) -> np.ndarray:
    if model is None:
        return np.full(len(X), default, dtype=float)

    try:
        if hasattr(model, "predict_proba"):
            probs = model.predict_proba(X)
            if probs.ndim == 2 and probs.shape[1] > 1:
                return np.asarray(probs[:, 1], dtype=float)
            return np.asarray(probs.reshape(-1), dtype=float)

        preds = model.predict(X)
        return np.asarray(preds, dtype=float).reshape(-1)
    except Exception as exc:
        logger.warning("Model scoring failed, using default %.2f: %s", default, exc)
        return np.full(len(X), default, dtype=float)


def _align_features_for_model(X: pd.DataFrame) -> pd.DataFrame:
    if isinstance(FEATURE_ALIGNMENT, dict):
        cols = FEATURE_ALIGNMENT.get("feature_columns") or FEATURE_ALIGNMENT.get("columns")
        if isinstance(cols, list) and cols:
            return X.reindex(columns=cols, fill_value=0.0)
    return X


def _stage1_text_scores(reviews: List[ReviewInput], fallback_len: int) -> np.ndarray:
    if STAGE1_MODEL is None:
        return np.full(fallback_len, 0.5, dtype=float)

    try:
        if TFIDF_VECTORIZER is not None and hasattr(STAGE1_MODEL, "predict_proba"):
            matrix = TFIDF_VECTORIZER.transform([r.review_text for r in reviews])
            return np.asarray(STAGE1_MODEL.predict_proba(matrix)[:, 1], dtype=float)

        features, _ = engineer_features(reviews, ["na"] * len(reviews))
        return _predict_proba_safe(STAGE1_MODEL, features, default=0.5)
    except Exception as exc:
        logger.warning("Stage1 inference failed, using defaults: %s", exc)
        return np.full(fallback_len, 0.5, dtype=float)


def _compute_product_integrity(
    product_id: str,
    reviews: List[ReviewInput],
    hashed_reviewers: List[str],
    suspicion_scores: np.ndarray,
) -> ProductIntegrityResult:
    total_reviews = len(reviews)
    fake_review_percentage = float((suspicion_scores >= 0.65).mean() * 100.0) if total_reviews else 0.0
    authenticity_score = float(np.clip((1.0 - float(np.mean(suspicion_scores))) * 100.0, 0.0, 100.0))

    cleaned_texts = [_clean_text(r.review_text) for r in reviews]
    duplicate_text_ratio = 1.0 - (len(set(cleaned_texts)) / max(len(cleaned_texts), 1))
    template_detected = duplicate_text_ratio >= 0.3

    unique_reviewers = len(set(hashed_reviewers))
    ring_detected = unique_reviewers <= max(2, int(total_reviews * 0.5))

    hour_counts: Dict[str, int] = {}
    for review in reviews:
        if review.review_timestamp:
            hour_key = review.review_timestamp[:13]
            hour_counts[hour_key] = hour_counts.get(hour_key, 0) + 1
    burst_detected = bool(hour_counts and max(hour_counts.values()) >= max(3, int(total_reviews * 0.5)))

    if authenticity_score >= 70:
        verdict = "TRUSTWORTHY"
    elif authenticity_score >= 45:
        verdict = "MIXED"
    else:
        verdict = "SUSPICIOUS"

    return ProductIntegrityResult(
        product_id=product_id,
        authenticity_score=round(authenticity_score, 2),
        fake_review_percentage=round(fake_review_percentage, 2),
        total_reviews_analyzed=total_reviews,
        burst_detected=burst_detected,
        template_detected=template_detected,
        ring_detected=ring_detected,
        overall_verdict=verdict,
    )


def _resolve_shap_feature_names(feature_matrix: pd.DataFrame) -> List[str]:
    if isinstance(FEATURE_ALIGNMENT, dict):
        cols = FEATURE_ALIGNMENT.get("feature_columns") or FEATURE_ALIGNMENT.get("columns")
        if isinstance(cols, list) and cols:
            return [str(c).strip() for c in cols]

    if isinstance(FEATURE_ALIGNMENT, list) and FEATURE_ALIGNMENT:
        return [str(c).strip() for c in FEATURE_ALIGNMENT]

    feature_alignment_path = REVIEWS_MODELS_DIR / "feature_alignment.json"
    if feature_alignment_path.exists():
        try:
            # Backward compatibility for line-based feature files.
            with feature_alignment_path.open("r", encoding="utf-8") as f:
                lines = [line.strip() for line in f.readlines() if line.strip()]
            if lines:
                return lines
        except Exception:
            logger.warning("Failed to parse feature_alignment.json as line-based list")

    return [str(c) for c in feature_matrix.columns.tolist()]


def generate_shap_explanations(
    feature_matrix: pd.DataFrame,
    xgb_model,
    feature_names: List[str],
    top_n: int = 5,
) -> List[Optional[List[Dict[str, object]]]]:
    try:
        if xgb_model is None:
            return [None] * len(feature_matrix)

        aligned = feature_matrix.reindex(columns=feature_names, fill_value=0.0)
        explainer = shap.TreeExplainer(xgb_model)
        shap_values = explainer.shap_values(aligned)

        if isinstance(shap_values, list):
            shap_values = shap_values[-1]

        shap_values = np.asarray(shap_values)
        feature_importance_dicts: List[Optional[List[Dict[str, object]]]] = []

        for row_idx in range(len(shap_values)):
            row_explanations: List[Dict[str, object]] = []
            for feature_idx, feature_value in enumerate(shap_values[row_idx]):
                row_explanations.append(
                    {
                        "feature": feature_names[feature_idx],
                        "shap_value": round(float(abs(feature_value)), 4),
                    }
                )

            row_explanations.sort(key=lambda x: float(x["shap_value"]), reverse=True)
            feature_importance_dicts.append(row_explanations[:top_n])

        return feature_importance_dicts
    except Exception as exc:
        logger.warning("SHAP generation failed, returning null explanations. Error: %s", exc)
        return [None] * len(feature_matrix)


@router.post("/analyze", response_model=ReviewAnalysisResponse)
async def analyze_reviews(request: Request, analysis_request: ReviewAnalysisRequest):
    _ensure_review_tables()

    merchant_id = analysis_request.merchant_id
    reviews = analysis_request.reviews
    if not reviews:
        raise HTTPException(status_code=400, detail="At least one review is required")

    product_id = reviews[0].product_id
    start_time = time.time()

    hashed_reviewers = [hash_buyer_id(rev.reviewer_id, merchant_id) for rev in reviews]
    feature_data, top_reasons = engineer_features(reviews, hashed_reviewers)

    stage1_scores = _stage1_text_scores(reviews, fallback_len=len(reviews))
    aligned_features = _align_features_for_model(feature_data)
    stage2_scores = _predict_proba_safe(STAGE2_MODEL, aligned_features, default=0.5)
    stage3_scores = _predict_proba_safe(STAGE3_MODEL, aligned_features, default=0.5)

    feature_names = _resolve_shap_feature_names(aligned_features)
    shap_explanations_batch = generate_shap_explanations(
        feature_matrix=aligned_features,
        xgb_model=STAGE3_MODEL,
        feature_names=feature_names,
    )

    suspicion_scores = np.clip((stage1_scores * 0.3) + (stage2_scores * 0.6) + (stage3_scores * 0.1), 0.0, 1.0)

    results: List[SingleReviewResult] = []
    for i, score in enumerate(suspicion_scores):
        label = "GENUINE"
        confidence = "MEDIUM"
        if score < 0.35:
            label = "GENUINE"
            confidence = "HIGH" if score < 0.2 else "MEDIUM"
        elif score < 0.65:
            label = "SUSPICIOUS"
            confidence = "MEDIUM"
        else:
            label = "LIKELY_FAKE"
            confidence = "HIGH" if score > 0.8 else "MEDIUM"

        results.append(
            SingleReviewResult(
                review_index=i,
                suspicion_score=round(float(score), 4),
                suspicion_label=label,
                confidence=confidence,
                top_reasons=top_reasons[i],
                shap_explanations=shap_explanations_batch[i],
            )
        )

    product_integrity = _compute_product_integrity(
        product_id=product_id,
        reviews=reviews,
        hashed_reviewers=hashed_reviewers,
        suspicion_scores=suspicion_scores,
    )

    conn = get_connection()
    cursor = conn.cursor()
    analysis_timestamp = time.strftime("%Y-%m-%d %H:%M:%S", time.localtime())
    total_reviews = len(reviews)
    fake_count = sum(1 for r in results if r.suspicion_label == "LIKELY_FAKE")

    cursor.execute(
        adapt_query("""
        INSERT INTO review_analyses
        (merchant_id, product_id, analysis_timestamp, total_reviews, fake_count,
         authenticity_score, fake_review_percentage, burst_detected,
         template_detected, ring_detected, overall_verdict)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """),
        (
            merchant_id,
            product_id,
            analysis_timestamp,
            total_reviews,
            fake_count,
            float(product_integrity.authenticity_score),
            float(product_integrity.fake_review_percentage),
            int(product_integrity.burst_detected),
            int(product_integrity.template_detected),
            int(product_integrity.ring_detected),
            product_integrity.overall_verdict,
        ),
    )
    conn.commit()

    elapsed_ms = int((time.time() - start_time) * 1000)
    logger.info(
        "reviews.analyze merchant=%s product=%s reviews=%d elapsed_ms=%d",
        merchant_id,
        product_id,
        len(reviews),
        elapsed_ms,
    )

    cursor.close()
    conn.close()

    return ReviewAnalysisResponse(
        product_integrity=product_integrity,
        reviews=results,
        model_version="reviews_v1",
        analysis_timestamp=analysis_timestamp,
        merchant_id=merchant_id,
    )


@router.get("/product/{product_id}", response_model=ProductIntegrityResult)
async def get_product_analysis(product_id: str):
    _ensure_review_tables()

    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        adapt_query("""
        SELECT product_id, authenticity_score, fake_review_percentage,
               total_reviews, burst_detected, template_detected,
               ring_detected, overall_verdict
        FROM review_analyses
        WHERE product_id = ?
        ORDER BY analysis_timestamp DESC
        LIMIT 1
        """),
        (product_id,),
    )
    result = cursor.fetchone()
    cursor.close()
    conn.close()

    if not result:
        raise HTTPException(
            status_code=404,
            detail="No analysis found for this product. POST to /v1/reviews/analyze first.",
        )

    row = dict(result)

    return ProductIntegrityResult(
        product_id=row["product_id"],
        authenticity_score=float(row["authenticity_score"]),
        fake_review_percentage=float(row["fake_review_percentage"]),
        total_reviews_analyzed=int(row["total_reviews"]),
        burst_detected=bool(row["burst_detected"]),
        template_detected=bool(row["template_detected"]),
        ring_detected=bool(row["ring_detected"]),
        overall_verdict=row["overall_verdict"],
    )


@router.post("/feedback", response_model=FeedbackResponse)
async def submit_feedback(feedback_request: FeedbackRequest):
    _ensure_review_tables()

    review_text_hash = hashlib.sha256(feedback_request.review_text.encode("utf-8")).hexdigest()
    submitted_at = time.strftime("%Y-%m-%d %H:%M:%S", time.localtime())

    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        adapt_query("""
        INSERT INTO review_feedback
        (merchant_id, product_id, review_text_hash, merchant_verdict, submitted_at)
        VALUES (?, ?, ?, ?, ?)
        """),
        (
            feedback_request.merchant_id,
            feedback_request.product_id,
            review_text_hash,
            feedback_request.merchant_verdict,
            submitted_at,
        ),
    )
    conn.commit()

    cursor.execute(
        adapt_query("""
        SELECT COUNT(*)
        FROM review_feedback
        WHERE merchant_id = ? AND product_id = ?
        """),
        (feedback_request.merchant_id, feedback_request.product_id),
    )
    count_row = cursor.fetchone()
    if isinstance(count_row, dict):
        total_feedback_count = int(next(iter(count_row.values())))
    else:
        total_feedback_count = int(count_row[0])

    cursor.close()
    conn.close()

    return FeedbackResponse(
        status="success",
        message="Feedback submitted successfully.",
        total_feedback_count=total_feedback_count,
    )


@router.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "stage1_loaded": bool(STAGE1_MODEL is not None),
        "stage2_loaded": bool(STAGE2_MODEL is not None),
        "stage3_loaded": bool(STAGE3_MODEL is not None),
        "tfidf_loaded": bool(TFIDF_VECTORIZER is not None),
    }
