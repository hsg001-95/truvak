import logging
from pathlib import Path
from typing import Optional

import pandas as pd

from .advanced_features import AdvancedReviewFeatureBuilder
from .engineer_features import FeatureEngineer
from .label_reviews import ReviewLabeler
from .load_reviews import DataPreprocessor
from .train_xgb_model import XGBoostReviewTrainer


logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")


def run_pipeline_v2(
    input_path: str,
    sample_size: Optional[int] = None,
    output_dir: Optional[str] = None,
    shap_rows: int = 2000,
) -> None:
    """Run scalable v2 pipeline: preprocess -> labels -> base + advanced features -> XGBoost + SHAP."""
    preprocessor = DataPreprocessor()
    raw_df = preprocessor.load_reviews(input_path, sample_size=sample_size)

    labeled_df = ReviewLabeler.generate_labels(raw_df)

    base_features = FeatureEngineer().build_features(labeled_df)

    advanced_builder = AdvancedReviewFeatureBuilder()
    advanced_features, _ = advanced_builder.build(base_features, label_col="fake_label", return_embeddings=False)

    trainer = XGBoostReviewTrainer()
    trainer.train(advanced_features, target_col="fake_label", allow_auto_debug_label=True)
    model_path, meta_path = trainer.save(output_dir=output_dir)

    shap_df = trainer.explain_reviews(advanced_features, top_k=5, max_rows=shap_rows)

    out_dir = Path(output_dir) if output_dir else Path(__file__).resolve().parent / "models"
    out_dir.mkdir(parents=True, exist_ok=True)

    features_path = out_dir / "advanced_features_v2.csv"
    shap_path = out_dir / "shap_review_explanations_v2.csv"
    advanced_features.to_csv(features_path, index=False)
    shap_df.to_csv(shap_path, index=False)

    logging.info("V2 pipeline finished.")
    logging.info("Model: %s", model_path)
    logging.info("Meta: %s", meta_path)
    logging.info("Features: %s", features_path)
    logging.info("SHAP explanations: %s", shap_path)


if __name__ == "__main__":
    run_pipeline_v2(
        input_path="ml/reviews/data/amazon_raw/Electronics_5.json.gz",
        sample_size=5000,
    )