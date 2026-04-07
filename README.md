<div align="center">

# Trust Intelligence Platform
### AI-Powered Risk Intelligence for E-commerce Operations

<p>
  <img alt="Python" src="https://img.shields.io/badge/Python-3.9%2B-3776AB?style=for-the-badge&logo=python&logoColor=white" />
  <img alt="FastAPI" src="https://img.shields.io/badge/FastAPI-API%20Layer-009688?style=for-the-badge&logo=fastapi&logoColor=white" />
  <img alt="React" src="https://img.shields.io/badge/React-Frontend-61DAFB?style=for-the-badge&logo=react&logoColor=111" />
  <img alt="Vite" src="https://img.shields.io/badge/Vite-Build-646CFF?style=for-the-badge&logo=vite&logoColor=white" />
  <img alt="PostgreSQL" src="https://img.shields.io/badge/PostgreSQL-Supabase-336791?style=for-the-badge&logo=postgresql&logoColor=white" />
  <img alt="SQLite" src="https://img.shields.io/badge/SQLite-Local%20Dev-003B57?style=for-the-badge&logo=sqlite&logoColor=white" />
</p>

<p>
  A production-style platform for fraud-risk scoring, review intelligence, seller trust insights, and customer-side spending/watchlist analytics.
</p>

</div>

---

## Why This Project

Trust Intelligence Platform helps detect risk early and convert raw marketplace activity into actionable trust signals:

- RTO risk scoring for orders before shipment.
- Review integrity analysis with explainability.
- Customer trust features such as spend trends, watchlist, and price intelligence.
- Browser extension integration for marketplace context.
- Database portability: local SQLite and Supabase PostgreSQL.

---

## What Is Included

### Core Backend (FastAPI)

- RTO scoring endpoints and rule engine.
- Merchant auth, outcomes logging, and order history APIs.
- Review intelligence router.
- Customer auth and analytics routers.
- Price intelligence, watchlist, and seller intel routers.
- Selector health telemetry endpoint for extension reliability.

### Frontend Apps

- Merchant dashboard app in `dashboard/` (React + Vite).
- Customer app in `customer/` (React + Vite).
- Customer app now consumes backend APIs (no direct browser-side Supabase table access).

### Browser Extension

- Manifest V3 extension in `extension/`.
- Amazon and Flipkart content scripts.
- Anti-blocking hardening (retry/caching strategy, selector health telemetry, CAPTCHA-aware resume flow).

### Data and ML

- PIN tier and feature maps under `data/`.
- ML training/processing scripts under `ml/`.
- RTO model (`ml/rto_model_v1.pkl`) loaded by backend startup.

---

## New Integrations (Latest)

### Supabase/PostgreSQL Integration

- Environment-driven database connection via `DATABASE_URL`.
- Backend is compatible with:
  - SQLite for local dev fallback.
  - PostgreSQL/Supabase for hosted persistence.
- Added migration and verification scripts:
  - `scripts/export_sqlite.py`
  - `scripts/migrate_to_supabase.py`
  - `scripts/test_supabase_connection.py`
- Migration flow now handles common cross-dialect issues:
  - Column mismatch handling.
  - Boolean type normalization.
  - JSON/JSONB normalization.
  - Source/target alias mapping where required.

### Customer Data Flow Hardening

- Added backend endpoint: `GET /v1/customer/orders/recent`.
- Customer home UI reads from backend APIs instead of direct DB/Supabase client access.
- Frontend env cleaned to only required runtime variable for API base URL.

---

## Repository Layout

```text
trust-intelligence-platform/
├── backend/                 # FastAPI app and routers
├── customer/                # Customer React app (Vite)
├── dashboard/               # Merchant React app (Vite)
├── extension/               # Browser extension (Manifest V3)
├── ml/                      # Model and ML scripts
├── data/                    # PIN maps and datasets
├── scripts/                 # DB migration/testing utilities
├── requirements.txt
├── .env.example
└── start.bat
```

---

## Quick Start (Windows)

### 1. Prerequisites

- Python 3.9+
- Node.js 18+
- npm
- ngrok (optional but needed for webhook/public callback testing)

### 2. Backend Setup

```powershell
cd trust-intelligence-platform
python -m venv venv
.\venv\Scripts\activate
python -m pip install -r requirements.txt
```

### 3. Configure Environment

Create `.env` in `trust-intelligence-platform/` from `.env.example` and set values.

Minimum local setup:

```env
DATABASE_URL=sqlite:///data/trust.db
JWT_SECRET=change-this
CUSTOMER_SALT=change-this
```

Supabase/PostgreSQL setup:

```env
DATABASE_URL=postgresql://postgres:<PASSWORD>@<HOST>:5432/postgres?sslmode=require
SUPABASE_URL=https://<PROJECT>.supabase.co
SUPABASE_ANON_KEY=<ANON_KEY>
SUPABASE_SERVICE_ROLE_KEY=<SERVICE_ROLE_KEY>
```

### 4. Frontend Setup

```powershell
cd customer
npm install
cd ..\dashboard
npm install
```

`customer/.env.example` expects:

```env
VITE_API_URL=http://127.0.0.1:8000
```

### 5. Run Services

Option A (quick):

```powershell
start.bat
```

Option B (manual):

```powershell
# Terminal 1
.\venv\Scripts\python.exe -m uvicorn backend.main:app --reload --port 8000

# Terminal 2
cd customer
npm run dev

# Terminal 3 (optional)
cd dashboard
npm run dev
```

---

## API Snapshot

Main app endpoints from `backend/main.py`:

- `GET /healthz`
- `GET /health`
- `POST /v1/login`
- `POST /v1/score`
- `POST /v1/outcome`
- `GET /v1/scores/{merchant_id}`
- `GET /v1/orders`
- `GET /v1/rules/{merchant_id}`
- `POST /v1/rules/{merchant_id}/threshold`
- `GET /v1/buyer/history/{hashed_buyer_id}/{merchant_id}`
- `GET /v1/area/intelligence/{pin_code}`
- `POST /v1/shopify/webhook`
- `GET /v1/shopify/orders`

Additional routed APIs:

- `/v1/reviews/*`
- `/v1/customer/*`
- `/v1/watchlist/*`
- `/v1/prices/*`
- `/v1/seller/*`
- `/v1/health/*`

Interactive docs when server is running:

- `http://127.0.0.1:8000/docs`

---

## Supabase Validation & Migration Workflow

### Validate connection and required tables

```powershell
.\venv\Scripts\python.exe scripts\test_supabase_connection.py
```

### Migrate from SQLite to Supabase PostgreSQL

```powershell
.\venv\Scripts\python.exe scripts\migrate_to_supabase.py
```

### Export SQLite (if needed)

```powershell
.\venv\Scripts\python.exe scripts\export_sqlite.py
```

---

## Quality and Safety Notes

- Keep `.env` private; never commit real secrets.
- Use `python -m <module>` in venv on Windows to avoid stale launcher path issues if the project folder is moved.
- Prefer backend-mediated access for sensitive data operations.

---

## License

Proprietary project. All rights reserved by the project owner/team unless explicitly stated otherwise.
