from datetime import datetime, timedelta
from typing import Dict, List, Literal
import json

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.orm import Session

from backend.customer_models import SelectorHealthReport, get_db

router = APIRouter()

SUPPORTED_PLATFORMS = {"amazon", "flipkart", "croma", "tatacliq", "meesho", "myntra"}


class SelectorReportRequest(BaseModel):
    platform: str
    checked_fields: List[str] = Field(default_factory=list)
    failed_fields: List[str] = Field(default_factory=list)
    url_pattern: str = Field(default="", max_length=255)

    @field_validator("platform")
    @classmethod
    def validate_platform(cls, value: str) -> str:
        normalized = value.strip().lower()
        if normalized not in SUPPORTED_PLATFORMS:
            raise ValueError(f"Unsupported platform: {value}")
        return normalized


class SelectorFieldStatus(BaseModel):
    success_rate_24h: float
    last_failure: str | None
    status: Literal["healthy", "degraded"]


class SelectorStatusResponse(BaseModel):
    window_hours: int
    generated_at: str
    selectors: Dict[str, SelectorFieldStatus]


@router.post("/v1/health/selector-report")
async def create_selector_report(
    payload: SelectorReportRequest,
    db: Session = Depends(get_db),
):
    checked = sorted({field.strip() for field in payload.checked_fields if field and field.strip()})
    failed = sorted({field.strip() for field in payload.failed_fields if field and field.strip()})

    if checked:
        failed = [field for field in failed if field in checked]

    row = SelectorHealthReport(
        platform=payload.platform,
        checked_fields_json=json.dumps(checked, ensure_ascii=True),
        failed_fields_json=json.dumps(failed, ensure_ascii=True),
        url_pattern=(payload.url_pattern or "")[:255],
        reported_at=datetime.utcnow(),
    )
    db.add(row)
    db.commit()

    return {"ok": True}


@router.get("/v1/health/selector-status", response_model=SelectorStatusResponse)
async def get_selector_status(
    platform: str | None = Query(default=None),
    hours: int = Query(default=24, ge=1, le=168),
    db: Session = Depends(get_db),
):
    normalized_platform = (platform or "").strip().lower()
    cutoff = datetime.utcnow() - timedelta(hours=hours)

    query = db.query(SelectorHealthReport).filter(SelectorHealthReport.reported_at >= cutoff)
    if normalized_platform:
        query = query.filter(SelectorHealthReport.platform == normalized_platform)

    rows = query.all()

    totals: Dict[str, int] = {}
    failures: Dict[str, int] = {}
    last_failure: Dict[str, datetime] = {}

    for row in rows:
        row_platform = (row.platform or "unknown").strip().lower()
        key_prefix = row_platform

        try:
            checked_fields = json.loads(row.checked_fields_json or "[]")
        except Exception:
            checked_fields = []

        try:
            failed_fields = json.loads(row.failed_fields_json or "[]")
        except Exception:
            failed_fields = []

        checked_set = {field for field in checked_fields if isinstance(field, str) and field.strip()}
        failed_set = {field for field in failed_fields if isinstance(field, str) and field.strip()}

        for field in checked_set:
            selector_key = f"{key_prefix}_{field}_selector"
            totals[selector_key] = totals.get(selector_key, 0) + 1

        for field in failed_set:
            selector_key = f"{key_prefix}_{field}_selector"
            failures[selector_key] = failures.get(selector_key, 0) + 1
            previous = last_failure.get(selector_key)
            if previous is None or row.reported_at > previous:
                last_failure[selector_key] = row.reported_at

    selectors: Dict[str, SelectorFieldStatus] = {}

    for key, total in totals.items():
        fail_count = failures.get(key, 0)
        success_rate = max(0.0, min(1.0, (total - fail_count) / max(total, 1)))
        status = "healthy" if success_rate >= 0.7 else "degraded"
        last_failure_at = last_failure.get(key)
        selectors[key] = SelectorFieldStatus(
            success_rate_24h=round(success_rate, 4),
            last_failure=(last_failure_at.isoformat() + "Z") if last_failure_at else None,
            status=status,
        )

    return SelectorStatusResponse(
        window_hours=hours,
        generated_at=datetime.utcnow().isoformat() + "Z",
        selectors=selectors,
    )
