<div align="center">

  <img src="https://raw.githubusercontent.com/microsoft/fluentui-emoji/main/assets/Shield/3D/shield_3d.png" width="120" alt="Truvak Shield Logo">

  # 🛡️ Truvak — Trust Intelligence Platform

  **AI-powered RTO risk scoring & Review Intelligence system for Indian e-commerce sellers.**

  <p align="center">
    <a href="https://fastapi.tiangolo.com/"><img src="https://img.shields.io/badge/FastAPI-009688?style=for-the-badge&logo=fastapi&logoColor=white" alt="FastAPI"></a>
    <a href="https://react.dev/"><img src="https://img.shields.io/badge/React-61DAFB?style=for-the-badge&logo=react&logoColor=black" alt="React"></a>
    <a href="https://vitejs.dev/"><img src="https://img.shields.io/badge/Vite-646CFF?style=for-the-badge&logo=vite&logoColor=white" alt="Vite"></a>
    <a href="https://www.python.org/"><img src="https://img.shields.io/badge/Python-3776AB?style=for-the-badge&logo=python&logoColor=white" alt="Python"></a>
    <a href="https://lightgbm.readthedocs.io/"><img src="https://img.shields.io/badge/LightGBM-217346?style=for-the-badge&logo=microsoftexcel&logoColor=white" alt="LightGBM"></a>
    <a href="https://xgboost.readthedocs.io/"><img src="https://img.shields.io/badge/XGBoost-FF6600?style=for-the-badge&logo=xgboost&logoColor=white" alt="XGBoost"></a>
    <a href="#"><img src="https://img.shields.io/badge/Ngrok-1F1E37?style=for-the-badge&logo=ngrok&logoColor=white" alt="Ngrok"></a>
  </p>

  <p align="center">
    <img src="https://img.shields.io/badge/License-MIT-green?style=flat-square">
    <img src="https://img.shields.io/badge/Version-1.0.0-blue?style=flat-square">
    <img src="https://img.shields.io/badge/Status-Active-brightgreen?style=flat-square">
  </p>

</div>

<hr/>

## 🎯 What is Truvak?

**Truvak** is an end-to-end Trust Intelligence Platform that protects Indian e-commerce sellers from two critical threats:

1. **Return to Origin (RTO) Fraud** — Flags risky Cash-on-Delivery orders before they ship, using a LightGBM model trained on India-specific Census socioeconomic data and 28,000+ orders.
2. **Fake Review Manipulation** — Detects fraudulent reviews using a 3-stage ML ensemble (TF-IDF + LightGBM + XGBoost) with SHAP explainability.

It integrates natively with **Amazon Seller Central** via a Chrome extension and supports **Shopify** via live webhooks.

---

## ✨ Feature Highlights

### 🔴 RTO Risk Scoring Engine
| Feature | Description |
|---|---|
| 📊 **LightGBM Model v1** | Trained on 28,000+ synthetic + real orders with 16 features including Census socioeconomics. |
| 🇮🇳 **India PIN Intelligence** | Full 6-digit PIN tier coverage (Tier 1 Metro → Tier 3 Rural) from government census data. |
| 📡 **Census Features** | Real per-PIN internet penetration, mobile penetration, electricity access, and COD risk score. |
| ⚡ **Rule Engine** | Configurable override rules (e.g., "Block COD if score < 40 and value > ₹5000"). |
| 🔒 **Privacy-first** | Buyer IDs are SHA-256 hashed before any storage — raw PII never persists. |
| 🛍️ **Shopify Webhooks** | Live Shopify order ingestion via Ngrok-tunneled webhook endpoint. |

### 🟡 Review Intelligence Suite *(New)*
| Feature | Description |
|---|---|
| 🤖 **3-Stage ML Pipeline** | Stage 1: TF-IDF + LightGBM text classifier. Stage 2: Ensemble (LightGBM). Stage 3: XGBoost with SHAP. |
| 🧮 **SHAP Explainability** | Per-review SHAP feature attributions reveal *why* a review is flagged as suspicious. |
| 🕵️ **Manipulation Detectors** | Burst detection (timestamp clustering), template detection (duplicate text), ring detection (reviewer identity clustering). |
| 📈 **Product Authenticity Score** | Aggregated 0–100 score across all reviews for a product — TRUSTWORTHY / MIXED / SUSPICIOUS. |
| 💬 **Merchant Feedback Loop** | Sellers can label reviews as genuine/fake to improve future model accuracy. |
| 📦 **Suspicious Products Page** | Dashboard view listing products flagged with the worst authenticity scores. |
| 🔬 **Product Deep-Dive** | Per-product breakdown: fake %, burst/template/ring flags, and individual review verdicts. |

### 🟢 React Intelligence Dashboard *(New)*
A fully migrated, Vite-powered React 18 SPA replacing the legacy Streamlit UI.

| Page | Route | Description |
|---|---|---|
| 🏠 Overview | `/` | Live KPIs: total orders, revenue secured, COD exposure, high-risk alerts. |
| 📋 Live Orders | `/live-orders` | Real-time order table with risk badges and outcome logging (Delivered / RTO). |
| ⚡ Score Order | `/score-order` | Manual order scoring form with instant trust score, risk level, and factor breakdown. |
| 👤 Buyer Management | `/buyer-management` | Buyer lookup by ID — full order history, RTO count, risk profile (Serial RTO / Trusted etc.). |
| 📊 Analytics | `/analytics` | Geographic choropleth map, risk distribution pie chart, PIN-level heatmap, and performance metrics bento grid. |
| 🛡️ Rule Config | `/rule-config` | UI to view and update COD block thresholds and custom scoring rules. |
| 🧠 Model Insights | `/model-insights` | Feature importance chart, AUC-ROC curve, confusion matrix — all rendered from the trained model. |
| 🔍 Review Analysis | `/review-analysis` | Submit product review batches for fake-review detection with SHAP explanations. |
| 📈 Review Dashboard | `/review-dashboard` | Aggregate stats across all analysed products — fake %, burst/template/ring flags. |
| 🔬 Review Intelligence | `/review-intelligence` | Detailed per-review scoring with suspicion labels and top reasons per review. |
| ⚠️ Suspicious Products | `/suspicious-products` | Products with the lowest authenticity scores, sorted for immediate action. |
| 🔎 Product Insights | `/product-insights` | Deep-dive into a single product's full review integrity report. |
| ⚙️ Config | `/config` | Merchant settings: Shopify token, Ngrok URL, active marketplace, theme. |

### 🔵 Browser Extension
| Feature | Description |
|---|---|
| 🛒 **Amazon Content Script** | Injects trust score panel directly into Amazon Seller Central order pages. |
| 🔔 **Popup Panel** | One-click scoring from the extension popup with login and order scoring form. |
| 🔗 **Live API Connectivity** | Connects to your local FastAPI backend via your configured Ngrok public URL. |

### 🟣 Mock Seller Interfaces
High-fidelity interactive mocks used for integration testing and demos:

| Mock | Location | Description |
|---|---|---|
| 🛒 **Amazon Seller Hub** | `mock-amazon-seller/` | Full Amazon Seller Central SPA with login, multi-seller dashboard, order management, and performance view. |
| 🛍️ **Flipkart Seller Hub** | `mock-flipkart-seller/` | Flipkart Seller Hub SPA with login, order tabs (Pending / Shipped / Delivered), trust scoring panel, detailed order pages, and payments overview. 120 generated mock orders. |

---

## 🏗️ Architecture

```
MiniProject2026/
├── trust-intelligence-platform/
│   ├── backend/              # FastAPI — REST API server
│   │   ├── main.py           # Core RTO scoring endpoints (/v1/*)
│   │   ├── reviews_router.py # Review Intelligence endpoints (/v1/reviews/*)
│   │   ├── rule_engine.py    # Configurable rule override system
│   │   ├── shopify_integration.py  # Shopify order fetching & webhook processing
│   │   ├── privacy.py        # SHA-256 buyer ID hashing
│   │   └── db.py             # SQLite DB — trust_scores, outcomes, reviews tables
│   │
│   ├── dashboard/            # React 18 + Vite SPA
│   │   └── src/
│   │       ├── pages/        # 13 dashboard pages (See route table above)
│   │       ├── components/   # Layout, Sidebar, SplashScreen, UI components
│   │       └── services/     # API client (axios → FastAPI)
│   │
│   ├── ml/
│   │   ├── rto_model_v1.pkl  # Trained LightGBM RTO model
│   │   ├── train_model.py    # Model training pipeline
│   │   ├── generate_data.py  # Synthetic order data generator
│   │   ├── build_census_features.py  # Census PIN feature builder
│   │   └── reviews/models/   # Stage 1/2/3 review models + TF-IDF + SHAP alignment
│   │
│   ├── extension/            # Chrome Extension (Manifest V3)
│   │   ├── manifest.json
│   │   ├── content_amazon.js # Amazon Seller Central content script
│   │   ├── popup.html/js     # Extension popup UI
│   │   └── panel.css
│   │
│   ├── data/
│   │   ├── pin_tier_map.json     # 6-digit PIN → Tier mapping (Census)
│   │   └── pin_feature_map.json  # 6-digit PIN → socioeconomic features
│   │
│   └── start.bat             # One-click Windows launcher (Backend + Dashboard + Ngrok)
│
├── mock-amazon-seller/       # Vanilla JS Amazon Seller Hub mock
└── mock-flipkart-seller/     # Vanilla JS Flipkart Seller Hub mock
```

### Data Flow

```
Browser Extension / Dashboard
        │
        ▼ HTTP (REST)
  FastAPI Backend (:8000)
        │
        ├── LightGBM Model → RTO Probability → Trust Score (0-100)
        ├── Rule Engine → Override Actions (block_cod / flag_review / allow)
        ├── Review ML Pipeline → Suspicion Score + SHAP Explanations
        ├── Shopify API → Live Order Ingestion
        └── SQLite DB → Persist scores, outcomes, review analyses
```

---

## 🚀 Setup & Run Instructions

### 🛠️ Prerequisites
- Python 3.9+ and `pip`
- Node.js 18+ and `npm`
- Git (optional)

### 1️⃣ Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/trust-intelligence-platform.git
cd trust-intelligence-platform

# Create and activate a virtual environment
python -m venv venv
venv\Scripts\activate          # Windows
# source venv/bin/activate     # macOS / Linux

# Install Python dependencies
pip install -r requirements.txt

# Install React dashboard dependencies
cd dashboard
npm install
cd ..
```

### 2️⃣ Running the Application

#### 🔥 Option A — One-Click (Windows)
Double-click or run from the project root:
```cmd
start.bat
```
This starts the **FastAPI backend**, **React dashboard dev server**, and **Ngrok tunnel** automatically.

#### ⚙️ Option B — Manual Startup

**Terminal 1 — Backend API:**
```bash
uvicorn backend.main:app --reload --port 8000
```
*Available at: http://127.0.0.1:8000 · Docs at: http://127.0.0.1:8000/docs*

**Terminal 2 — React Dashboard:**
```bash
cd dashboard
npm run dev
```
*Available at: http://localhost:5173*

**Terminal 3 — Ngrok (for Shopify webhooks):**
```bash
ngrok http 8000
```

### 3️⃣ Loading the Chrome Extension

1. Open Chrome → `chrome://extensions`
2. Enable **Developer Mode**
3. Click **Load unpacked** → select the `extension/` folder
4. Configure your Ngrok URL in the extension popup settings

### 4️⃣ Demo Login Accounts

| Marketplace | Username | Password |
|---|---|---|
| 📦 Amazon | `merchant_amazon` | `Trust@2024` |
| 🛍️ Flipkart | `merchant_flipkart` | `Trust@2024` |
| 🛒 Shopify | `merchant_shopify` | `Trust@2024` |

---

## 📡 API Reference

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/health` | API health check + model info |
| `POST` | `/v1/login` | Merchant authentication |
| `POST` | `/v1/score` | Score a new order |
| `GET` | `/v1/scores/{merchant_id}` | Fetch scored orders for a merchant |
| `POST` | `/v1/outcome` | Log an order outcome (delivered/rto/return) |
| `GET` | `/v1/orders` | Get orders (Bearer auth) |
| `GET` | `/v1/buyer/history/{hashed_id}/{merchant_id}` | Full buyer risk profile |
| `GET` | `/v1/area/intelligence/{pin_code}` | Area-level RTO and COD analytics |
| `GET` | `/v1/rules/{merchant_id}` | Get active scoring rules |
| `POST` | `/v1/rules/{merchant_id}/threshold` | Update COD block threshold |
| `GET` | `/v1/shopify/orders` | Fetch and score live Shopify orders |
| `POST` | `/v1/shopify/webhook` | Receive Shopify order webhooks |
| `POST` | `/v1/reviews/analyze` | Analyze a batch of reviews for fraud |
| `GET` | `/v1/reviews/product/{product_id}` | Get last analysis for a product |
| `POST` | `/v1/reviews/feedback` | Submit merchant review label feedback |
| `GET` | `/v1/reviews/health` | Review ML pipeline health check |

> Full interactive docs available at **http://127.0.0.1:8000/docs** when the backend is running.

---

## 🧠 ML Models

### RTO Model (`rto_model_v1`)
- **Algorithm**: LightGBM (Gradient Boosted Trees)
- **Training Data**: 28,000+ orders with India-specific features
- **Features (16)**: `pin_tier`, `is_cod`, `order_value`, `order_value_bucket`, `freight_ratio`, `item_count`, `is_weekend`, `is_festive_season`, `is_first_order`, `prev_rto_count`, `low_review`, `installments`, `internet_penetration`, `mobile_penetration`, `cod_risk_score`, `electricity_access`
- **Output**: RTO probability → calibrated Trust Score (0–100)
- **Risk Levels**: HIGH (< 42) · MEDIUM (42–64) · LOW (≥ 65)

### Review Models (`/ml/reviews/models/`)
- **Stage 1** (`review_model_v1.pkl`): TF-IDF vectorizer + LightGBM text classifier
- **Stage 2** (`ensemble_model_v1.pkl`): LightGBM on engineered linguistic features
- **Stage 3** (`xgb_review_model.pkl`): XGBoost with SHAP tree explainer
- **Ensemble**: `(Stage1 × 0.3) + (Stage2 × 0.6) + (Stage3 × 0.1)`
- **Labels**: GENUINE · SUSPICIOUS · LIKELY_FAKE

---

## 🗓️ Roadmap

- [ ] Flipkart API integration (live order ingestion)
- [ ] Real-time seller notification alerts
- [ ] Review model retraining from merchant feedback loop
- [ ] Multi-language review analysis (Hindi, Tamil, Telugu)
- [ ] Mobile-responsive dashboard redesign
- [ ] Export reports as PDF / CSV

---

<div align="center">

  **© 2026 Truvak — Trust Intelligence Platform. All rights reserved.**

  *Built for Indian E-Commerce Sellers — Fighting RTOs & Fake Reviews with AI.*

</div>