<div align="center">
  <img src="https://raw.githubusercontent.com/microsoft/fluentui-emoji/main/assets/Shield/3D/shield_3d.png" width="120" alt="Shield Logo">
  
  # ✨ Trust Intelligence Platform ✨
  
  **AI-powered RTO (Return to Origin) risk scoring system for e-commerce marketplace sellers.**

  <p align="center">
    <a href="https://fastapi.tiangolo.com/"><img src="https://img.shields.io/badge/FastAPI-009688?style=for-the-badge&logo=fastapi&logoColor=white" alt="FastAPI"></a>
    <a href="https://streamlit.io/"><img src="https://img.shields.io/badge/Streamlit-FF4B4B?style=for-the-badge&logo=streamlit&logoColor=white" alt="Streamlit"></a>
    <a href="https://www.python.org/"><img src="https://img.shields.io/badge/Python-3776AB?style=for-the-badge&logo=python&logoColor=white" alt="Python"></a>
    <a href="https://www.shopify.com/"><img src="https://img.shields.io/badge/Shopify-95BF47?style=for-the-badge&logo=shopify&logoColor=white" alt="Shopify"></a>
    <a href="#"><img src="https://img.shields.io/badge/Ngrok-1F1E37?style=for-the-badge&logo=ngrok&logoColor=white" alt="Ngrok"></a>
  </p>
</div>

<hr/>

## 🎯 What is it? 
The **Trust Intelligence Platform** evaluates incoming e-commerce orders (Amazon, Flipkart, Shopify) and assigns a **Trust Score** (0-100) and a **Risk Level** (`High` 🔴, `Medium` 🟡, `Low` 🟢). It helps sellers prevent revenue leaks by preemptively flagging risky **Cash on Delivery (COD)** orders.

## 🌟 Core Features

| Feature | Description |
|---|---|
| 📈 **Live Dashboard** | Real-time overview of total orders, revenue secured, COD to collect, and High-Risk Alerts. |
| ⚡ **Order Risk Scoring** | Instantly score new orders manually or via APIs based on history, pincode, and payment method. |
| 🛍️ **Live Orders Management** | Expand high-risk orders to view specific risk factors and easily log outcomes (Delivered, RTO). |
| 🔬 **Model Insights** | In-depth explanations of the underlying ML logic, including feature importance and AUC-ROC curve. |
| 🔗 **Shopify Integration** | Sync live orders directly from your Shopify store and generate risk assessments seamlessly. |

## 🧭 Active Integration Scope

- ✅ Active: FastAPI backend (`/v1/*`) + Streamlit dashboard + Amazon content script flow.
- ⚠️ Placeholder only: Flipkart content script (`extension/content_flipkart.js`) is intentionally Phase 2 and not part of the active runtime path.

<br/>

## 🏗️ Architecture Stack

- **Backend**: 🚀 FastAPI serving blazing-fast predictions.
- **Frontend**: 🎨 Streamlit providing an interactive, rich UI.
- **Connectivity**: 📡 Ngrok tunneling for secure, temporary public API webhooks.
- **ML Runtime**: 🧠 LightGBM for efficient RTO predictions.

## 🚀 Setup & Run Instructions

### 🛠️ Prerequisites
- Python 3.9+ installed on your system.
- Git (optional, for cloning).

### 1️⃣ Installation
1. Clone the repository and navigate to the project root:
   ```bash
   git clone https://github.com/yourusername/trust-intelligence-platform.git
   cd trust-intelligence-platform
   ```
2. Create and activate a virtual environment:
   ```bash
   python -m venv venv
   
   # On Windows:
   venv\Scripts\activate
   
   # On macOS/Linux:
   source venv/bin/activate
   ```
3. Install the dependencies:
   ```bash
   pip install -r requirements.txt
   ```

### 2️⃣ Running the Application

🔥 **Option A: The Easy Way (Windows)**
Simply double-click or run `start.bat` from the root directory. This will boot up the Backend, Frontend, and Ngrok tunnel automatically!
```cmd
start.bat
```

⚙️ **Option B: Manual Startup**
1. **Start the Backend API:**
   ```bash
   uvicorn backend.main:app --reload --port 8000
   ```
   *Available at http://127.0.0.1:8000*

2. **Start the Frontend Dashboard:**
   ```bash
   streamlit run dashboard/app.py
   ```
   *Available at http://localhost:8501*

### 3️⃣ Login Demo Accounts
Access the dashboard at `http://localhost:8501`. If prompted, use any of these demo accounts:

| Merchant Type | Username | Password |
|---|---|---|
| 🛒 Shopify | `merchant_shopify` | `Trust@2024` |
| 📦 Amazon | `merchant_amazon` | `Trust@2024` |
| 🛍️ Flipkart | `merchant_flipkart` | `Trust@2024` |

---

<div align="center">
  <i>Built with ❤️ for E-Commerce Sellers to Fight RTOs</i>
</div>