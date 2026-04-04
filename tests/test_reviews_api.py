import time

import pytest
from fastapi.testclient import TestClient


@pytest.fixture()
def client(tmp_path, monkeypatch):
    import backend.db as db_module
    from backend.main import app, startup

    test_db = tmp_path / "trust_test.db"
    monkeypatch.setattr(db_module, "DB_PATH", str(test_db))

    startup()
    return TestClient(app)


def test_reviews_health(client):
    response = client.get("/v1/reviews/health")
    assert response.status_code == 200

    payload = response.json()
    assert payload["status"] == "healthy"


def test_reviews_analyze_happy_path(client):
    now_str = time.strftime("%Y-%m-%d %H:%M:%S", time.localtime())
    payload = {
        "merchant_id": "merchant_amazon",
        "reviews": [
            {
                "review_text": "Excellent quality and quick delivery",
                "rating": 5.0,
                "verified_purchase": True,
                "reviewer_id": "buyer_001",
                "product_id": "SKU-1001",
                "review_timestamp": now_str,
                "helpful_votes": 3,
            },
            {
                "review_text": "bad bad bad!!! not good",
                "rating": 1.0,
                "verified_purchase": False,
                "reviewer_id": "buyer_002",
                "product_id": "SKU-1001",
                "review_timestamp": now_str,
                "helpful_votes": 0,
            },
        ],
    }

    response = client.post("/v1/reviews/analyze", json=payload)
    assert response.status_code == 200

    body = response.json()
    assert body["merchant_id"] == "merchant_amazon"
    assert body["model_version"] == "reviews_v1"
    assert len(body["reviews"]) == 2

    integrity = body["product_integrity"]
    assert integrity["product_id"] == "SKU-1001"
    assert 0.0 <= integrity["authenticity_score"] <= 100.0


def test_reviews_product_not_found(client):
    response = client.get("/v1/reviews/product/DOES-NOT-EXIST")
    assert response.status_code == 404


def test_reviews_feedback(client):
    payload = {
        "review_text": "Looks fine",
        "merchant_verdict": "genuine",
        "merchant_id": "merchant_amazon",
        "product_id": "SKU-1001",
    }

    response = client.post("/v1/reviews/feedback", json=payload)
    assert response.status_code == 200

    body = response.json()
    assert body["status"] == "success"
    assert body["total_feedback_count"] >= 1
