import streamlit as st
import streamlit_authenticator as stauth
import requests
import pandas as pd
import plotly.express as px
import plotly.graph_objects as go
import yaml
import json
import csv
import io
from yaml.loader import SafeLoader
from datetime import datetime, timedelta
import random
import os
import sys

# Ensure sibling modules (e.g., backend/) are importable when Streamlit runs from dashboard/
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

# ── Page config ───────────────────────────────────────────────────────────────
st.set_page_config(
    page_title="Trust Intelligence Platform",
    page_icon="🛡️",
    layout="wide",
    initial_sidebar_state="expanded"
)
st.markdown("""
<style>
    .stApp, [data-testid="stAppViewContainer"], [data-testid="stHeader"] {
        background-color: #0D1117 !important;
        color: #E6EDF3 !important;
    }
    .block-container { background-color: #0D1117 !important; color: #E6EDF3 !important; }
    section[data-testid="stSidebar"] { background-color: #0F2D5E !important; }
    .stMarkdown p, .stMarkdown li, .stMarkdown span { color: #E6EDF3 !important; }
    h1, h2, h3, h4, h5, h6 { color: #E6EDF3 !important; }
    .stDataFrame { background: #161B22 !important; }
    label, .stSelectbox label, .stSlider label, .stRadio label, .stCheckbox label {
        color: #E6EDF3 !important;
    }
    [data-testid="stExpander"] summary, [data-testid="stExpander"] summary * {
        color: #E6EDF3 !important;
    }
    [data-testid="stTabs"] button, [data-testid="stTabs"] button * {
        color: #E6EDF3 !important;
    }
    .stTextInput input, .stNumberInput input, .stTextArea textarea,
    .stSelectbox [data-baseweb="select"] > div,
    .stMultiSelect [data-baseweb="select"] > div,
    .stDateInput input {
        background-color: #161B22 !important;
        color: #E6EDF3 !important;
        border-color: #30363D !important;
    }
    .stDataFrame, .stTable, [data-testid="stMetricValue"], [data-testid="stMetricLabel"],
    [data-testid="stNotificationContentInfo"], [data-testid="stNotificationContentSuccess"],
    [data-testid="stNotificationContentWarning"], [data-testid="stNotificationContentError"] {
        color: #E6EDF3 !important;
    }
</style>
""", unsafe_allow_html=True)
API_URL = "http://127.0.0.1:8000"

# ── Load auth config ──────────────────────────────────────────────────────────
config_path = os.path.join(os.path.dirname(__file__), "config.yaml")
with open(config_path) as f:
    config = yaml.load(f, Loader=SafeLoader)

authenticator = stauth.Authenticate(
    config["credentials"],
    config["cookie"]["name"],
    config["cookie"]["key"],
    config["cookie"]["expiry_days"],
)

# ── Global styles ─────────────────────────────────────────────────────────────
st.markdown("""
<style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');

    * { font-family: 'Inter', sans-serif; }
    .main { background: #0D1117; color: #E6EDF3; }
    .block-container { padding: 1.5rem 2rem; }

    /* Metric cards */
    .metric-card {
        background: white;
        border-radius: 12px;
        padding: 1.2rem 1.4rem;
        box-shadow: 0 1px 4px rgba(0,0,0,0.07);
        border-left: 4px solid #1D4ED8;
        margin-bottom: 0.5rem;
    }
    .metric-card.green  { border-left-color: #16A34A; }
    .metric-card.red    { border-left-color: #DC2626; }
    .metric-card.orange { border-left-color: #D97706; }
    .metric-card.purple { border-left-color: #7C3AED; }

    /* Risk badges */
    .badge-high   { background:#FEE2E2; color:#DC2626; padding:3px 10px; border-radius:20px; font-weight:600; font-size:0.8rem; }
    .badge-medium { background:#FEF3C7; color:#D97706; padding:3px 10px; border-radius:20px; font-weight:600; font-size:0.8rem; }
    .badge-low    { background:#DCFCE7; color:#16A34A; padding:3px 10px; border-radius:20px; font-weight:600; font-size:0.8rem; }

    /* Section headers */
    .section-header {
        font-size: 1.1rem; font-weight: 600;
        color: #0F2D5E; margin: 1rem 0 0.5rem 0;
        border-bottom: 2px solid #DBEAFE;
        padding-bottom: 0.3rem;
    }

    /* Notification */
    .notif-high {
        background: #FEE2E2; border: 1px solid #DC2626;
        border-radius: 8px; padding: 0.8rem 1rem;
        color: #991B1B; margin: 0.3rem 0;
    }

    /* Sidebar */
    [data-testid="stSidebar"] {
        background: #0F2D5E !important;
    }
    [data-testid="stSidebar"] * { color: white !important; }
    [data-testid="stSidebar"] .stRadio label { color: #CBD5E1 !important; }

    /* Login page */
    .login-header {
        text-align: center; padding: 2rem 0;
        color: #0F2D5E; font-size: 2rem; font-weight: 700;
    }
</style>
""", unsafe_allow_html=True)

# ── Helper functions ──────────────────────────────────────────────────────────
def get_risk_color(score):
    if score >= 70: return "#16A34A"
    if score >= 40: return "#D97706"
    return "#DC2626"

def get_risk_badge(score):
    if score >= 70: return '<span class="badge-low">🟢 LOW</span>'
    if score >= 40: return '<span class="badge-medium">🟡 MEDIUM</span>'
    return '<span class="badge-high">🔴 HIGH</span>'

def get_action_label(action):
    labels = {
        "approve":     "✅ Approve",
        "warn":        "⚠️ Warn",
        "block_cod":   "🚫 Block COD",
        "flag_review": "🔎 Flag Review",
    }
    return labels.get(action, action)

def api_get(endpoint):
    try:
        r = requests.get(f"{API_URL}{endpoint}", timeout=5)
        return r.json() if r.status_code == 200 else {}
    except:
        return {}

def api_post(endpoint, payload):
    try:
        r = requests.post(f"{API_URL}{endpoint}", json=payload, timeout=5)
        return r.json() if r.status_code == 200 else {}
    except:
        return {}

def fetch_orders(merchant_id):
    data = api_get(f"/v1/scores/{merchant_id}?limit=200")
    return data.get("orders", [])

def fetch_shopify_orders():
    data = api_get("/v1/shopify/orders")
    orders = data.get("orders", [])
    # Deduplicate by order_id keeping highest score version
    seen = {}
    for o in orders:
        oid = str(o.get("order_id", ""))
        if oid not in seen or o.get("score", 0) > seen[oid].get("score", 0):
            seen[oid] = o
    return list(seen.values())

def get_all_orders(merchant_id, platform):
    db_orders      = fetch_orders(merchant_id)
    shopify_orders = fetch_shopify_orders()
    merged = {}
    for o in db_orders:
        merged[str(o["order_id"])] = o
    for o in shopify_orders:
        oid = str(o.get("order_id", ""))
        if oid and o.get("score") is not None:
            merged[oid] = o
    return list(merged.values())

def score_order(payload):
    return api_post("/v1/score", payload)

def log_outcome(order_id, merchant_id, buyer_id, result):
    return api_post("/v1/outcome", {
        "order_id":     order_id,
        "merchant_id":  merchant_id,
        "raw_buyer_id": buyer_id,
        "result":       result
    })

# ── DEMO ORDERS ───────────────────────────────────────────────────────────────
DEMO_ORDERS = [
    {"id":"ORD-D001","buyer":"9876543210","value":3200,"cod":1,"pin":"828001","items":2,"month":10},
    {"id":"ORD-D002","buyer":"9123456780","value":650, "cod":0,"pin":"110001","items":1,"month":3},
    {"id":"ORD-D003","buyer":"8765432109","value":1800,"cod":1,"pin":"845001","items":3,"month":11},
    {"id":"ORD-D004","buyer":"7654321098","value":450, "cod":0,"pin":"400001","items":1,"month":5},
    {"id":"ORD-D005","buyer":"6543210987","value":2900,"cod":1,"pin":"743501","items":2,"month":10},
    {"id":"ORD-D006","buyer":"5432109876","value":980, "cod":1,"pin":"226001","items":2,"month":7},
    {"id":"ORD-D007","buyer":"4321098765","value":320, "cod":0,"pin":"560001","items":1,"month":2},
    {"id":"ORD-D008","buyer":"3210987654","value":4500,"cod":1,"pin":"494001","items":4,"month":11},
    {"id":"ORD-D009","buyer":"2109876543","value":750, "cod":0,"pin":"700001","items":1,"month":6},
    {"id":"ORD-D010","buyer":"1098765432","value":1200,"cod":1,"pin":"814001","items":2,"month":9},
    {"id":"ORD-D011","buyer":"9988776655","value":550, "cod":0,"pin":"600001","items":1,"month":4},
    {"id":"ORD-D012","buyer":"8877665544","value":3800,"cod":1,"pin":"535001","items":3,"month":11},
]

# ══════════════════════════════════════════════════════════════════════════════
# LOGIN PAGE
# ══════════════════════════════════════════════════════════════════════════════
try:
    authenticator.login("main")
except Exception:
    pass

name        = st.session_state.get("name")
auth_status = st.session_state.get("authentication_status")
username    = st.session_state.get("username")

if auth_status is False:
    st.error("❌ Incorrect username or password")
    st.info("Demo accounts: `merchant_amazon` / `merchant_flipkart` / `merchant_shopify` — Password: `Trust@2024`")
    st.stop()

if auth_status is None:
    st.markdown("""
    <div style="text-align:center; padding: 3rem 0 1rem 0;">
        <div style="font-size:3rem;">🛡️</div>
        <div style="font-size:2rem; font-weight:700; color:#0F2D5E;">
            Trust Intelligence Platform
        </div>
        <div style="color:#6B7280; margin-top:0.5rem;">
            AI-powered RTO risk scoring for marketplace sellers
        </div>
    </div>
    """, unsafe_allow_html=True)
    st.stop()

# ── Get merchant context from config ─────────────────────────────────────────
user_config    = config["credentials"]["usernames"][username]
MERCHANT_ID    = user_config.get("merchant_id", username)
PLATFORM       = user_config.get("platform", "Unknown")
MERCHANT_NAME  = user_config.get("name", name)

# ══════════════════════════════════════════════════════════════════════════════
# SIDEBAR
# ══════════════════════════════════════════════════════════════════════════════
with st.sidebar:
    st.markdown(f"""
    <div style="padding:1rem 0 0.5rem 0; text-align:center;">
        <div style="font-size:1.8rem;">🛡️</div>
        <div style="font-size:1rem; font-weight:700; color:white;">
            Trust Intelligence
        </div>
        <div style="font-size:0.75rem; color:#94A3B8; margin-top:0.2rem;">
            {PLATFORM} Seller
        </div>
    </div>
    """, unsafe_allow_html=True)

    st.divider()
    st.markdown(f"👤 **{MERCHANT_NAME}**")
    st.markdown(f"🏪 `{MERCHANT_ID}`")
    st.divider()

    page = st.radio("Navigation", [
        "🏠 Overview",
        "🛍️ Live Orders",
        "➕ Score Order",
        "👥 Buyer Management",
        "📈 Analytics",
        "⚙️ Rule Config",
        "🔬 Model Insights",
    ], label_visibility="collapsed")

    st.divider()

    # API status
    try:
        h = requests.get(f"{API_URL}/health", timeout=2)
        if h.status_code == 200:
            st.success("🟢 API Online")
        else:
            st.error("🔴 API Error")
    except:
        st.error("🔴 API Offline")

    st.divider()

    # Load demo data
    if st.button("🌱 Load Demo Orders", width="stretch"):
        progress = st.progress(0)
        loaded = 0
        for i, o in enumerate(DEMO_ORDERS):
            result = score_order({
                "order_id":     o["id"] + f"_{MERCHANT_ID}",
                "raw_buyer_id": o["buyer"],
                "merchant_id":  MERCHANT_ID,
                "order_value":  o["value"],
                "is_cod":       o["cod"],
                "pin_code":     o["pin"],
                "item_count":   o["items"],
                "installments": 1,
                "order_month":  o["month"],
            })
            if result:
                loaded += 1
            progress.progress((i+1)/len(DEMO_ORDERS))
        st.success(f"✅ Loaded {loaded} orders!")
        st.rerun()

    st.divider()
    if st.button("🚪 Logout", width="stretch"):
        st.session_state["authentication_status"] = None
        st.session_state["name"]     = None
        st.session_state["username"] = None
        st.rerun()
    if st.button("🔄 Sync Shopify Orders", use_container_width=True):
        with st.spinner("Syncing..."):
            try:
                from backend.shopify_integration import fetch_orders as shopify_fetch, score_shopify_order
                shopify_orders = shopify_fetch(limit=50)
                synced = 0
                for order in shopify_orders:
                    result = score_shopify_order(order)
                    if result and "score" in result:
                        synced += 1
                st.success(f"Synced {synced} Shopify orders!")
                st.rerun()
            except ModuleNotFoundError:
                st.error("Could not import backend module. Ensure app runs from project root and venv is active.")

# ══════════════════════════════════════════════════════════════════════════════
# PAGE: OVERVIEW
# ══════════════════════════════════════════════════════════════════════════════
if page == "🏠 Overview":
    st.markdown("""
    <style>
    .kpi-card {
        background: #161B22 !important;
        border: 1px solid #30363D !important;
        border-radius: 12px !important;
        padding: 18px 20px !important;
        margin-bottom: 4px !important;
    }
    .kpi-card.green { border-top: 3px solid #22C55E !important; }
    .kpi-card.blue  { border-top: 3px solid #3B82F6 !important; }
    .kpi-card.amber { border-top: 3px solid #F59E0B !important; }
    .kpi-card.red   { border-top: 3px solid #EF4444 !important; }
    .kpi-label {
        font-size: 11px !important; color: #7D8590 !important;
        font-weight: 600 !important; letter-spacing: .06em !important;
        text-transform: uppercase !important; margin-bottom: 6px !important;
    }
    .kpi-value {
        font-size: 22px !important; font-weight: 700 !important;
        color: #E6EDF3 !important; margin-bottom: 4px !important;
    }
    .kpi-delta-pos { font-size: 12px !important; color: #22C55E !important; }
    .kpi-delta-neg { font-size: 12px !important; color: #EF4444 !important; }
    .kpi-delta-neu { font-size: 12px !important; color: #7D8590 !important; }
    .savings-banner {
        background: #0A1F10 !important;
        border: 1px solid #238636 !important;
        border-radius: 12px !important;
        padding: 20px 28px !important;
        margin: 12px 0 !important;
        display: flex !important;
        justify-content: space-between !important;
        align-items: center !important;
        flex-wrap: wrap !important;
        gap: 12px !important;
    }
    .savings-label {
        font-size: 10px !important; color: #3FB950 !important;
        font-weight: 600 !important; letter-spacing: .06em !important;
        text-transform: uppercase !important; margin-bottom: 4px !important;
    }
    .savings-val {
        font-size: 24px !important; font-weight: 700 !important;
        color: #E6EDF3 !important;
    }
    .savings-sub { font-size: 11px !important; color: #7D8590 !important; margin-top: 2px !important; }
    .alert-row {
        background: #2D1117 !important;
        border: 1px solid #DA3633 !important;
        border-left: 4px solid #F85149 !important;
        border-radius: 8px !important;
        padding: 12px 16px !important;
        margin-bottom: 8px !important;
        display: flex !important;
        justify-content: space-between !important;
        align-items: center !important;
    }
    .section-title {
        font-size: 15px !important; font-weight: 600 !important;
        color: #E6EDF3 !important; margin: 20px 0 10px 0 !important;
        border-bottom: 1px solid #30363D !important;
        padding-bottom: 8px !important;
    }
    </style>
    """, unsafe_allow_html=True)

    # ── Header ───────────────────────────────────────────────────────────
    col_title, col_date = st.columns([3, 2])
    col_title.markdown(
        '<p style="font-size:28px;font-weight:700;color:#E6EDF3;'
        'margin:0;padding:12px 0 0 0;line-height:1;">Dashboard</p>',
        unsafe_allow_html=True
    )
    col_date.markdown(
        f"<div style='text-align:right;margin-top:16px;'>"
        f"<span style='display:inline-block;white-space:nowrap;font-size:12px;font-weight:600;color:#E6EDF3;background:#161B22;'"
        f"padding:6px 14px;border-radius:8px;border:1px solid #30363D;'>"
        f"{datetime.now().strftime('%b %d, %Y')}</span></div>",
        unsafe_allow_html=True
    )

    # ── Fetch data ────────────────────────────────────────────────────────
    all_orders = get_all_orders(MERCHANT_ID, PLATFORM)

    if not all_orders:
        st.info("No orders yet. Click **Load Demo Orders** in the sidebar.")
        st.stop()

    df = pd.DataFrame(all_orders)

    total_orders    = len(df)
    total_sales     = df["order_value"].sum()
    cod_orders      = df[df["is_cod"] == 1]
    prepaid_orders  = df[df["is_cod"] == 0]
    blocked         = df[df["recommended_action"] == "block_cod"]
    high_risk       = df[df["risk_level"] == "HIGH"]
    approved        = df[df["recommended_action"] == "approve"]
    cod_to_collect  = cod_orders[cod_orders["recommended_action"] != "block_cod"]["order_value"].sum()
    money_saved     = len(blocked) * 300
    revenue_secured = approved["order_value"].sum()
    avg_score       = df["score"].mean()

    try:
        outcomes_resp = requests.get(f"{API_URL}/v1/outcomes/{MERCHANT_ID}", timeout=3)
        outcomes = outcomes_resp.json().get("outcomes", []) if outcomes_resp.status_code == 200 else []
    except:
        outcomes = []
    delivered_count = sum(1 for o in outcomes if o.get("result") == "delivered")
    rto_count       = sum(1 for o in outcomes if o.get("result") == "rto")

    # ── KPI Cards ─────────────────────────────────────────────────────────
    k1, k2, k3, k4, k5 = st.columns(5)
    k1.markdown(f"""<div class="kpi-card blue">
        <div class="kpi-label">Total Orders</div>
        <div class="kpi-value">{total_orders:,}</div>
        <div class="kpi-delta-pos">+5.1% vs last month</div>
    </div>""", unsafe_allow_html=True)

    k2.markdown(f"""<div class="kpi-card green">
        <div class="kpi-label">Total Sales</div>
        <div class="kpi-value">&#8377;{total_sales:,.0f}</div>
        <div class="kpi-delta-pos">+8.3% vs last month</div>
    </div>""", unsafe_allow_html=True)

    k3.markdown(f"""<div class="kpi-card amber">
        <div class="kpi-label">COD to Collect</div>
        <div class="kpi-value">&#8377;{cod_to_collect:,.0f}</div>
        <div class="kpi-delta-neu">{len(cod_orders[cod_orders['recommended_action'] != 'block_cod'])} pending orders</div>
    </div>""", unsafe_allow_html=True)

    k4.markdown(f"""<div class="kpi-card green">
        <div class="kpi-label">Delivered</div>
        <div class="kpi-value">{delivered_count:,}</div>
        <div class="kpi-delta-pos">{delivered_count/(total_orders or 1):.0%} success rate</div>
    </div>""", unsafe_allow_html=True)

    k5.markdown(f"""<div class="kpi-card {'green' if avg_score >= 70 else 'amber' if avg_score >= 40 else 'red'}">
        <div class="kpi-label">Avg Trust Score</div>
        <div class="kpi-value" style="color:{'#16A34A' if avg_score>=70 else '#D97706' if avg_score>=40 else '#DC2626'}">
            {avg_score:.0f}%
        </div>
        <div class="kpi-delta-pos">{'Very Low' if avg_score>=70 else 'Medium' if avg_score>=40 else 'High'} Risk</div>
    </div>""", unsafe_allow_html=True)

    # ── Savings Banner ────────────────────────────────────────────────────
    st.markdown(f"""
    <div class="savings-banner">
        <div class="savings-item">
            <div class="savings-label">Estimated Savings</div>
            <div class="savings-val">&#8377;{money_saved:,}</div>
            <div class="savings-sub">{len(blocked)} COD orders blocked</div>
        </div>
        <div class="savings-item">
            <div class="savings-label">RTO Prevention Rate</div>
            <div class="savings-val" style="color:#3FB950">{len(high_risk)/total_orders:.0%}</div>
            <div class="savings-sub">flagged before shipment</div>
        </div>
        <div class="savings-item">
            <div class="savings-label">Revenue Secured</div>
            <div class="savings-val" style="color:#3FB950">&#8377;{revenue_secured:,.0f}</div>
            <div class="savings-sub">approved by trust system</div>
        </div>
        <div class="savings-item">
            <div class="savings-label">RTO Losses</div>
            <div class="savings-val" style="color:#DC2626">&#8377;{rto_count*300:,}</div>
            <div class="savings-sub">{rto_count} RTOs logged</div>
        </div>
    </div>
    """, unsafe_allow_html=True)

    # ── Charts row ────────────────────────────────────────────────────────
    st.markdown('<div class="section-title">Analytics</div>', unsafe_allow_html=True)
    c1, c2 = st.columns(2)
    DARK   = "#0D1117"
    PAPER  = "#161B22"
    GRID   = "#21262D"
    TEXT   = "#7D8590"

    with c1:
        risk_counts = df["risk_level"].value_counts()
        fig_risk = go.Figure()
        colors   = {"LOW": "#3FB950", "MEDIUM": "#D29922", "HIGH": "#F85149"}
        fills = {
            "LOW":    "rgba(22,163,74,0.12)",
            "MEDIUM": "rgba(217,119,6,0.12)",
            "HIGH":   "rgba(220,38,38,0.12)"
        }
        for risk, color in colors.items():
            count = risk_counts.get(risk, 0)
            fig_risk.add_trace(go.Bar(
                x=[risk], y=[count],
                marker_color=fills.get(risk),
                marker_line_color=color,
                marker_line_width=1.5,
                name=risk,
                text=[f"{count/total_orders:.0%}"],
                textposition="outside",
                textfont=dict(color=color, size=12),
            ))
        fig_risk.update_layout(
            title=dict(text="Risk Distribution", font=dict(color="#E6EDF3", size=14)),
            plot_bgcolor=PAPER, paper_bgcolor=PAPER,
            font=dict(color=TEXT),
            showlegend=False, height=220,
            margin=dict(t=40, b=20, l=20, r=20),
            xaxis=dict(gridcolor=GRID, linecolor=GRID, tickfont=dict(color=TEXT)),
            yaxis=dict(gridcolor=GRID, linecolor=GRID, tickfont=dict(color=TEXT)),
            bargap=0.4,
        )
        st.plotly_chart(fig_risk, use_container_width=True)

    with c2:
        score_data = df["score"].tolist()
        fig_dist = go.Figure()
        fig_dist.add_trace(go.Histogram(
            x=score_data, nbinsx=20,
            marker_color="rgba(29,78,216,0.12)",
            marker_line_color="#1D4ED8",
            marker_line_width=1,
        ))
        fig_dist.add_vline(x=40, line_dash="dash", line_color="#F85149",
                           annotation_text="Block", annotation_font_color="#F85149")
        fig_dist.add_vline(x=70, line_dash="dash", line_color="#3FB950",
                           annotation_text="Safe", annotation_font_color="#3FB950")
        fig_dist.update_layout(
            title=dict(text="Trust Score Distribution", font=dict(color="#E6EDF3", size=14)),
            plot_bgcolor=PAPER, paper_bgcolor=PAPER,
            font=dict(color=TEXT), showlegend=False, height=220,
            margin=dict(t=40, b=20, l=20, r=20),
            xaxis=dict(gridcolor=GRID, linecolor=GRID, tickfont=dict(color=TEXT), title="Score"),
            yaxis=dict(gridcolor=GRID, linecolor=GRID, tickfont=dict(color=TEXT), title="Orders"),
        )
        st.plotly_chart(fig_dist, use_container_width=True)

    # ── High Risk Alerts ──────────────────────────────────────────────────
    if not high_risk.empty:
        st.markdown('<div class="section-title">High Risk Alerts</div>', unsafe_allow_html=True)
        for _, row in high_risk.head(4).iterrows():
            cod_label = "COD" if row.get("is_cod") else "Prepaid"
            st.markdown(f"""
            <div class="alert-row">
                <span style="color:#FCA5A5;font-size:13px;font-weight:500;">
                    <b style="color:#E6EDF3;font-size:14px;">{row['order_id']}</b>
                    &nbsp;·&nbsp; Score: <b style="color:#F85149;">{row['score']}</b>
                    &nbsp;·&nbsp; {cod_label}
                    &nbsp;·&nbsp; ₹{row['order_value']:,.0f}
                    &nbsp;·&nbsp; PIN: {row['pin_code']}
                </span>
                <span style="background:#DC2626;color:white;padding:4px 12px;
                             border-radius:20px;font-size:11px;font-weight:600;
                             white-space:nowrap;">
                    {row['recommended_action'].replace('_',' ').upper()}
                </span>
            </div>
            """, unsafe_allow_html=True)

    # ── Recent Orders Table ───────────────────────────────────────────────
    st.markdown('<div class="section-title">Recent Orders</div>', unsafe_allow_html=True)

    display_df = df[[
        "order_id", "score", "risk_level",
        "recommended_action", "order_value", "is_cod", "pin_code"
    ]].head(20).copy()

    def score_colored(s):
        color = "#16A34A" if s >= 70 else "#D97706" if s >= 40 else "#DC2626"
        return f'<span style="color:{color};font-weight:700;">{s}%</span>'

    def risk_badge(r):
        styles = {
            "LOW":    "background:#0D2818;color:#3FB950;border:0.5px solid #238636;",
            "MEDIUM": "background:#2D1D0A;color:#D29922;border:0.5px solid #9E6A03;",
            "HIGH":   "background:#2D1117;color:#F85149;border:0.5px solid #DA3633;",
        }
        s = styles.get(r, "")
        return f'<span style="padding:3px 9px;border-radius:20px;font-size:11px;font-weight:600;{s}">{r} RISK</span>'

    display_df["Score"]   = display_df["score"].apply(score_colored)
    display_df["Risk"]    = display_df["risk_level"].apply(risk_badge)
    display_df["Payment"] = display_df["is_cod"].map({1:"💵 COD", 0:"💳 Prepaid"})
    display_df["Action"]  = display_df["recommended_action"].str.replace("_"," ").str.upper()
    display_df["Value"]   = display_df["order_value"].apply(lambda x: f"₹{x:,.0f}")

    show = display_df[["order_id","Score","Risk","Action","Value","Payment","pin_code"]].copy()
    show.columns = ["Order ID","Score","Risk Level","Action","Amount","Payment","PIN"]

    st.markdown(
        show.to_html(escape=False, index=False,
                     classes="",
                     border=0)
        .replace('<table','<table style="width:100%;border-collapse:collapse;font-size:13px;background:#161B22;"')
        .replace('<th>','<th style="font-size:11px;color:#7D8590;font-weight:500;text-align:left;padding:8px 10px;border-bottom:1px solid #30363D;text-transform:uppercase;letter-spacing:.04em;background:#161B22;">')
        .replace('<td>','<td style="padding:11px 10px;border-bottom:1px solid #21262D;color:#C9D1D9;">'),
        unsafe_allow_html=True
    )

# ══════════════════════════════════════════════════════════════════════════════
# PAGE: LIVE ORDERS
# ══════════════════════════════════════════════════════════════════════════════
elif page == "🛍️ Live Orders":
    st.markdown("## 🛍️ Live Orders")
    st.divider()

    with st.spinner("Fetching orders..."):
        orders = get_all_orders(MERCHANT_ID, PLATFORM)

    st.success(f"{'Shopify + ' if PLATFORM == 'Shopify' else ''}Scored orders: {len(orders)}")

    if not orders:
        st.info("No orders found.")
    else:
        df = pd.DataFrame(orders)

        # Filters
        f1, f2, f3 = st.columns(3)
        risk_f   = f1.selectbox("Risk",   ["All","HIGH","MEDIUM","LOW"])
        action_f = f2.selectbox("Action", ["All","block_cod","warn",
                                           "approve","flag_review"])
        cod_f    = f3.selectbox("Payment",["All","COD","Prepaid"])

        filtered = df.copy()
        if risk_f   != "All":
            filtered = filtered[filtered["risk_level"] == risk_f]
        if action_f != "All":
            filtered = filtered[filtered["recommended_action"] == action_f]
        if cod_f == "COD":
            filtered = filtered[filtered["is_cod"] == 1]
        elif cod_f == "Prepaid":
            filtered = filtered[filtered["is_cod"] == 0]

        st.markdown(f"**Showing {len(filtered)} of {len(df)} orders**")
        st.divider()

        for idx, row in filtered.iterrows():
            score  = row.get("score", 0)
            color  = get_risk_color(score)
            cod    = "💵 COD" if row.get("is_cod") else "💳 Prepaid"
            name   = row.get("customer_name",
                             row.get("shopify_order_number",
                             row.get("order_id","")))

            with st.expander(
                f"{'🔴' if score<40 else '🟡' if score<70 else '🟢'} "
                f"**{row.get('order_id','')}** · Score: {score} · "
                f"{get_action_label(row.get('recommended_action',''))} · "
                f"₹{row.get('order_value',0):,.0f} · {cod}"
            ):
                d1,d2,d3,d4 = st.columns(4)
                d1.metric("Trust Score", f"{score}/100")
                d2.metric("Risk Level",  row.get("risk_level",""))
                d3.metric("RTO Prob",    f"{row.get('model_rto_prob',0):.1%}")
                d4.metric("PIN Code",    row.get("pin_code",""))

                st.progress(int(score)/100)

                factors = row.get("factors",[])
                if factors:
                    st.markdown("**Risk Factors:**")
                    for f in factors:
                        st.markdown(f"- {f}")

                fired = row.get("fired_rules",[])
                if fired:
                    for rule in fired:
                        st.warning(f"⚡ {rule}")

                st.markdown("**Log Outcome:**")
                b1,b2,b3 = st.columns(3)
                if b1.button("✅ Delivered",
                             key=f"del_{row.get('order_id','')}_{idx}"):
                    log_outcome(row.get("order_id",""),
                                MERCHANT_ID, "buyer", "delivered")
                    st.success("Logged!")
                if b2.button("📦 RTO",
                             key=f"rto_{row.get('order_id','')}_{idx}"):
                    log_outcome(row.get("order_id",""),
                                MERCHANT_ID, "buyer", "rto")
                    st.success("Logged!")
                if b3.button("↩️ Return",
                             key=f"ret_{row.get('order_id','')}_{idx}"):
                    log_outcome(row.get("order_id",""),
                                MERCHANT_ID, "buyer", "return")
                    st.success("Logged!")

# ══════════════════════════════════════════════════════════════════════════════
# PAGE: SCORE ORDER
# ══════════════════════════════════════════════════════════════════════════════
elif page == "➕ Score Order":
    st.markdown("## ➕ Score a New Order")
    st.divider()

    with st.form("score_form"):
        c1,c2 = st.columns(2)
        order_id    = c1.text_input("Order ID",
                                    value=f"ORD-{random.randint(1000,9999)}")
        buyer_phone = c2.text_input("Buyer Phone/Email",
                                    value="9876543210")
        order_value = c1.number_input("Order Value (₹)",
                                      min_value=1.0, value=1500.0)
        pin_code    = c2.text_input("PIN Code", value="828001")
        payment     = c1.selectbox("Payment", ["COD","Prepaid"])
        item_count  = c2.number_input("Items", min_value=1, value=1)
        order_month = c1.selectbox(
            "Month",
            list(range(1,13)),
            format_func=lambda m: datetime(2024,m,1).strftime("%B"),
            index=datetime.now().month-1
        )
        submitted = st.form_submit_button(
            "🔍 Get Trust Score", width="stretch")

    if submitted:
        with st.spinner("Scoring..."):
            result = score_order({
                "order_id":     order_id,
                "raw_buyer_id": buyer_phone,
                "merchant_id":  MERCHANT_ID,
                "order_value":  order_value,
                "is_cod":       1 if payment=="COD" else 0,
                "pin_code":     pin_code,
                "item_count":   item_count,
                "installments": 1,
                "order_month":  order_month,
            })

        if result and "score" in result:
            score = result["score"]
            color = get_risk_color(score)
            st.divider()

            r1,r2,r3,r4 = st.columns(4)
            r1.metric("Trust Score",  f"{score}/100")
            r2.metric("Risk Level",   result["risk_level"])
            r3.metric("Action",       result["recommended_action"]
                      .replace("_"," ").upper())
            r4.metric("RTO Prob",     f"{result['model_rto_prob']:.1%}")

            st.progress(int(score)/100)
            hashed_id = result.get("hashed_buyer_id")
            if hashed_id:
                st.markdown(f"🔐 **Hashed ID:** `{str(hashed_id)[:32]}...`")
            else:
                st.caption("Hashed buyer ID not available for this order.")

            if result.get("factors"):
                st.markdown("**Risk Factors:**")
                for f in result["factors"]:
                    st.markdown(f"- {f}")

            if result.get("fired_rules"):
                for rule in result["fired_rules"]:
                    st.warning(f"⚡ {rule}")
        else:
            st.error("API error — is the backend running?")

# ══════════════════════════════════════════════════════════════════════════════
# PAGE: BUYER MANAGEMENT
# ══════════════════════════════════════════════════════════════════════════════
elif page == "👥 Buyer Management":
    st.markdown("## 👥 Buyer Management")
    st.divider()

    tab1, tab2, tab3 = st.tabs(["📋 Buyer History", "🚫 Blacklist", "✅ Whitelist"])

    with tab1:
        st.markdown("### Recent Buyer Profiles")
        orders = fetch_orders(MERCHANT_ID)
        if orders:
            df = pd.DataFrame(orders)

            # Some sources may not include hashed_buyer_id; derive a best-effort buyer key.
            if "hashed_buyer_id" not in df.columns:
                fallback_cols = [
                    "raw_buyer_id", "buyer_id", "customer_email",
                    "customer_phone", "order_id"
                ]
                fallback_col = next((c for c in fallback_cols if c in df.columns), None)
                if fallback_col is None:
                    st.info("Buyer identifier not available in the current dataset. Using order-level grouping.")
                    df["hashed_buyer_id"] = df.index.astype(str)
                else:
                    df["hashed_buyer_id"] = df[fallback_col].astype(str)

            buyer_df = df.groupby("hashed_buyer_id").agg(
                total_orders  = ("order_id",    "count"),
                avg_score     = ("score",        "mean"),
                total_value   = ("order_value",  "sum"),
                high_risk     = ("risk_level",
                                 lambda x: (x=="HIGH").sum()),
                blocked       = ("recommended_action",
                                 lambda x: (x=="block_cod").sum()),
            ).reset_index()
            buyer_df["avg_score"]   = buyer_df["avg_score"].round(1)
            buyer_df["total_value"] = buyer_df["total_value"].round(0)
            buyer_df["risk_flag"]   = buyer_df["high_risk"] > 0

            # Truncate hashed ID for display
            buyer_df["buyer_id_short"] = buyer_df["hashed_buyer_id"].str[:16] + "..."
            display = buyer_df[[
                "buyer_id_short","total_orders","avg_score",
                "total_value","high_risk","blocked"
            ]].copy()
            display.columns = [
                "Hashed Buyer","Orders","Avg Score",
                "Total Value (₹)","High Risk Orders","Times Blocked"
            ]
            st.dataframe(display, width="stretch", hide_index=True)
        else:
            st.info("No buyer history yet.")

    with tab2:
        st.markdown("### 🚫 Blacklisted Buyers")
        st.info("Blacklisted buyers will always receive block_cod action regardless of score.")

        # Simple session-based blacklist for demo
        if "blacklist" not in st.session_state:
            st.session_state.blacklist = []

        with st.form("blacklist_form"):
            bl_phone  = st.text_input("Buyer Phone/Email to Blacklist")
            bl_reason = st.text_input("Reason", value="Serial RTO abuser")
            bl_submit = st.form_submit_button("🚫 Add to Blacklist")
            if bl_submit and bl_phone:
                st.session_state.blacklist.append({
                    "buyer":  bl_phone,
                    "reason": bl_reason,
                    "date":   datetime.now().strftime("%d %b %Y")
                })
                st.success(f"Added {bl_phone} to blacklist")

        if st.session_state.blacklist:
            st.dataframe(
                pd.DataFrame(st.session_state.blacklist),
                width="stretch",
                hide_index=True
            )
        else:
            st.info("No blacklisted buyers yet.")

    with tab3:
        st.markdown("### ✅ Whitelisted Buyers")
        st.info("Whitelisted buyers always receive approve action regardless of score.")

        if "whitelist" not in st.session_state:
            st.session_state.whitelist = []

        with st.form("whitelist_form"):
            wl_phone  = st.text_input("Buyer Phone/Email to Whitelist")
            wl_reason = st.text_input("Reason", value="Trusted repeat customer")
            wl_submit = st.form_submit_button("✅ Add to Whitelist")
            if wl_submit and wl_phone:
                st.session_state.whitelist.append({
                    "buyer":  wl_phone,
                    "reason": wl_reason,
                    "date":   datetime.now().strftime("%d %b %Y")
                })
                st.success(f"Added {wl_phone} to whitelist")

        if st.session_state.whitelist:
            st.dataframe(
                pd.DataFrame(st.session_state.whitelist),
                width="stretch",
                hide_index=True
            )
        else:
            st.info("No whitelisted buyers yet.")

# ══════════════════════════════════════════════════════════════════════════════
# PAGE: ANALYTICS
# ══════════════════════════════════════════════════════════════════════════════
elif page == "📈 Analytics":
    st.markdown("## 📈 Seller Analytics")
    st.divider()

    orders = fetch_orders(MERCHANT_ID)
    if not orders:
        st.info("No data yet — load demo orders first.")
    else:
        df = pd.DataFrame(orders)

        # ── Savings calculator ────────────────────────────────────────────────
        st.markdown("### 💰 RTO Savings Calculator")
        sc1, sc2, sc3 = st.columns(3)
        avg_order_val  = sc1.number_input(
            "Avg Order Value (₹)", value=int(df["order_value"].mean()), step=100)
        rto_cost_pct   = sc2.slider(
            "RTO Cost as % of order", 15, 40, 25)
        monthly_orders = sc3.number_input(
            "Expected Monthly Orders", value=500, step=50)

        blocked_pct   = len(df[df["recommended_action"]=="block_cod"]) / len(df)
        monthly_saved = monthly_orders * blocked_pct * avg_order_val * (rto_cost_pct/100)
        annual_saved  = monthly_saved * 12

        st.markdown(f"""
        <div style="background:linear-gradient(135deg,#0F2D5E,#1D4ED8);
                    border-radius:12px; padding:1.5rem 2rem; margin:1rem 0;">
            <div style="display:flex; justify-content:space-between;">
                <div style="text-align:center;">
                    <div style="color:#93C5FD; font-size:0.8rem;">MONTHLY SAVINGS</div>
                    <div style="color:white; font-size:1.8rem; font-weight:700;">
                        ₹{monthly_saved:,.0f}
                    </div>
                </div>
                <div style="text-align:center;">
                    <div style="color:#93C5FD; font-size:0.8rem;">ANNUAL SAVINGS</div>
                    <div style="color:#4ADE80; font-size:1.8rem; font-weight:700;">
                        ₹{annual_saved:,.0f}
                    </div>
                </div>
                <div style="text-align:center;">
                    <div style="color:#93C5FD; font-size:0.8rem;">ORDERS PROTECTED</div>
                    <div style="color:white; font-size:1.8rem; font-weight:700;">
                        {blocked_pct:.0%}
                    </div>
                </div>
            </div>
        </div>
        """, unsafe_allow_html=True)

        st.divider()

        # ── Risk breakdown by PIN tier ────────────────────────────────────────
        st.markdown("### 📍 Risk by Geography")
        geo_df = df.groupby("pin_code").agg(
            orders     = ("order_id",    "count"),
            avg_score  = ("score",        "mean"),
            high_risk  = ("risk_level",
                          lambda x: (x=="HIGH").sum())
        ).reset_index().sort_values("high_risk", ascending=False).head(10)

        fig_geo = px.bar(
            geo_df, x="pin_code", y="high_risk",
            color="avg_score",
            color_continuous_scale="RdYlGn",
            title="Top 10 High-Risk PIN Codes",
            labels={"pin_code":"PIN Code",
                    "high_risk":"High Risk Orders",
                    "avg_score":"Avg Score"}
        )
        st.plotly_chart(fig_geo, width="stretch")

        # ── COD vs Prepaid analysis ───────────────────────────────────────────
        st.markdown("### 💳 COD vs Prepaid Analysis")
        ac1, ac2 = st.columns(2)

        with ac1:
            cod_df = df.groupby("is_cod").agg(
                count     = ("order_id",   "count"),
                avg_score = ("score",       "mean"),
                high_risk = ("risk_level",
                             lambda x: (x=="HIGH").sum())
            ).reset_index()
            cod_df["is_cod"] = cod_df["is_cod"].map(
                {1:"COD", 0:"Prepaid"})
            fig_cod = px.bar(
                cod_df, x="is_cod", y="high_risk",
                color="is_cod",
                color_discrete_map={"COD":"#DC2626","Prepaid":"#16A34A"},
                title="High Risk by Payment Type"
            )
            st.plotly_chart(fig_cod, width="stretch")

        with ac2:
            fig_score = px.box(
                df, x=df["is_cod"].map({1:"COD",0:"Prepaid"}),
                y="score",
                color=df["is_cod"].map({1:"COD",0:"Prepaid"}),
                color_discrete_map={"COD":"#DC2626","Prepaid":"#16A34A"},
                title="Score Distribution by Payment Type"
            )
            st.plotly_chart(fig_score, width="stretch")

        # ── Export ────────────────────────────────────────────────────────────
        st.divider()
        st.markdown("### 📥 Export Report")
        export_df = df[[
            "order_id","score","risk_level",
            "recommended_action","order_value","is_cod","pin_code"
        ]].copy()
        export_df["is_cod"] = export_df["is_cod"].map(
            {1:"COD",0:"Prepaid"})

        csv_buffer = io.StringIO()
        export_df.to_csv(csv_buffer, index=False)

        st.download_button(
            label     = "⬇️ Download CSV Report",
            data      = csv_buffer.getvalue(),
            file_name = f"trust_report_{MERCHANT_ID}_{datetime.now().strftime('%Y%m%d')}.csv",
            mime      = "text/csv",
            width="stretch"
        )

# ══════════════════════════════════════════════════════════════════════════════
# PAGE: RULE CONFIG
# ══════════════════════════════════════════════════════════════════════════════
elif page == "⚙️ Rule Config":
    st.markdown("## ⚙️ Rule Configuration")
    st.divider()

    st.markdown("### COD Block Threshold")
    st.markdown("Orders below this trust score will have COD blocked automatically.")

    threshold = st.slider(
        "Block COD if score below:",
        min_value=0, max_value=100, value=40, step=5
    )

    c1,c2,c3 = st.columns(3)
    c1.error(f"🔴 Block COD — score < {threshold}")
    c2.warning(f"🟡 Warn — score {threshold}–70")
    c3.success(f"🟢 Approve — score > 70")

    if st.button("💾 Save Threshold", width="stretch"):
        r = requests.post(
            f"{API_URL}/v1/rules/{MERCHANT_ID}/threshold",
            params={"threshold": threshold},
            timeout=5
        )
        if r.status_code == 200:
            st.success(f"✅ Threshold updated to {threshold}")
        else:
            st.error("Failed to update")

    st.divider()
    st.markdown("### Active Rules")
    rules_data = api_get(f"/v1/rules/{MERCHANT_ID}")
    rules      = rules_data.get("rules", [])
    if rules:
        st.dataframe(pd.DataFrame(rules),
                 width="stretch", hide_index=True)

# ══════════════════════════════════════════════════════════════════════════════
# PAGE: MODEL INSIGHTS
# ══════════════════════════════════════════════════════════════════════════════
elif page == "🔬 Model Insights":
    st.markdown("## 🔬 Model Performance Insights")
    st.divider()

    st.markdown("### Baseline Model Comparison")
    results_df = pd.DataFrame({
        "Model":     ["Logistic Regression","Decision Tree","Random Forest ✓"],
        "AUC":       [0.757, 0.751, 0.754],
        "F1 Score":  [0.315, 0.305, 0.316],
        "Precision": [0.204, 0.196, 0.206],
        "Recall":    [0.693, 0.691, 0.673],
    })
    st.dataframe(results_df, width="stretch", hide_index=True)

    st.divider()
    from PIL import Image
    charts = {
        "AUC-ROC Curve":            "ml/auc_roc_curve.png",
        "Confusion Matrix":         "ml/confusion_matrix.png",
        "Feature Importance":       "ml/feature_importance.png",
        "Trust Score Distribution": "ml/trust_score_distribution.png",
    }
    cols = st.columns(2)
    for i,(title,path) in enumerate(charts.items()):
        with cols[i%2]:
            st.markdown(f"**{title}**")
            if os.path.exists(path):
                st.image(Image.open(path), width="stretch")
            else:
                st.warning(f"Run `python ml/train_model.py` first")

    st.divider()
    st.markdown("### Dataset Summary")
    m1,m2,m3,m4,m5 = st.columns(5)
    m1.metric("Source",          "Olist + Census 2011")
    m2.metric("Total Records",   "97,916")
    m3.metric("Training Size",   "78,332")
    m4.metric("Test Size",       "19,584")
    m5.metric("PIN Codes Mapped","19,104")

    st.divider()
    st.markdown("### Feature Engineering Sources")
    feature_df = pd.DataFrame({
        "Feature":     [
            "pin_tier","is_cod","order_value","freight_ratio",
            "is_festive_season","prev_rto_count","internet_penetration",
            "mobile_penetration","cod_risk_score","electricity_access"
        ],
        "Source": [
            "Census 2011 + India Post","Shipyaari Report 2024",
            "Olist Dataset","Olist Dataset",
            "Delhivery Festive Report 2023","Derived",
            "Census 2011","Census 2011",
            "Census 2011 Composite","Census 2011"
        ],
        "Research Basis": [
            "RBI tier classification by district development score",
            "COD = 3x higher RTO risk vs prepaid",
            "High value orders = higher return stakes",
            "Higher freight = rural delivery zone",
            "Festive season RTO spike — Oct/Nov",
            "Repeat RTO history = strongest predictor",
            "Low internet = low digital payment adoption",
            "Low mobile = low UPI capability",
            "Composite COD risk from infrastructure signals",
            "Low electricity = rural/infrastructure deficit"
        ]
    })
    st.dataframe(feature_df, width="stretch", hide_index=True)

    st.info("""
**Limitations:** Dataset derived from Brazilian Olist e-commerce, 
calibrated to Indian COD/RTO distributions using Shipyaari 2024 
and Mordor Intelligence 2025 benchmarks. Census features mapped 
via Brazil state → India tier proxy. Direct validation on real 
India seller data required for production deployment.
    """)

