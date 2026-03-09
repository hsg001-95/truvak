import streamlit as st
import requests
import pandas as pd
import json
from datetime import datetime
import random

# ── Config ────────────────────────────────────────────────────────────────────
API_URL     = "http://127.0.0.1:8000"
MERCHANT_ID = "merchant-demo"

st.set_page_config(
    page_title = "Trust Intelligence Platform",
    page_icon  = "🛡️",
    layout     = "wide"
)

# ── Styling ───────────────────────────────────────────────────────────────────
st.markdown("""
<style>
    .main { background-color: #F8FAFC; }
    .metric-card {
        background: white;
        padding: 1.2rem 1.5rem;
        border-radius: 10px;
        border-left: 4px solid #1D4ED8;
        box-shadow: 0 1px 3px rgba(0,0,0,0.08);
    }
    .risk-high   { color: #DC2626; font-weight: 700; font-size: 1.1rem; }
    .risk-medium { color: #D97706; font-weight: 700; font-size: 1.1rem; }
    .risk-low    { color: #16A34A; font-weight: 700; font-size: 1.1rem; }
    .score-badge {
        padding: 4px 12px;
        border-radius: 20px;
        font-weight: 600;
        font-size: 0.9rem;
    }
    .header-title {
        font-size: 1.8rem;
        font-weight: 700;
        color: #0F2D5E;
    }
</style>
""", unsafe_allow_html=True)

# ── Helpers ───────────────────────────────────────────────────────────────────
def get_risk_color(score):
    if score >= 70: return "#16A34A"
    if score >= 40: return "#D97706"
    return "#DC2626"

def get_risk_label(score):
    if score >= 70: return "🟢 LOW"
    if score >= 40: return "🟡 MEDIUM"
    return "🔴 HIGH"

def get_action_badge(action):
    badges = {
        "approve":     "✅ Approve",
        "warn":        "⚠️ Warning",
        "block_cod":   "🚫 Block COD",
        "flag_review": "🔎 Flag Review",
    }
    return badges.get(action, action)

def score_order(payload):
    try:
        r = requests.post(f"{API_URL}/v1/score", json=payload, timeout=5)
        return r.json() if r.status_code == 200 else None
    except:
        return None

def fetch_scores():
    try:
        r = requests.get(f"{API_URL}/v1/scores/{MERCHANT_ID}?limit=100", timeout=5)
        return r.json().get("orders", []) if r.status_code == 200 else []
    except:
        return []

def fetch_rules():
    try:
        r = requests.get(f"{API_URL}/v1/rules/{MERCHANT_ID}", timeout=5)
        return r.json().get("rules", []) if r.status_code == 200 else []
    except:
        return []

def update_threshold(threshold):
    try:
        r = requests.post(
            f"{API_URL}/v1/rules/{MERCHANT_ID}/threshold",
            params={"threshold": threshold},
            timeout=5
        )
        return r.status_code == 200
    except:
        return False

def log_outcome(order_id, buyer_id, result):
    try:
        r = requests.post(f"{API_URL}/v1/outcome", json={
            "order_id":     order_id,
            "merchant_id":  MERCHANT_ID,
            "raw_buyer_id": buyer_id,
            "result":       result
        }, timeout=5)
        return r.status_code == 200
    except:
        return False

# ── Seed demo data ────────────────────────────────────────────────────────────
DEMO_ORDERS = [
    {"id":"ORD-1001","buyer":"9876543210","value":3200,"cod":1,"pin":"828001","items":2,"month":10},
    {"id":"ORD-1002","buyer":"9123456780","value":650, "cod":0,"pin":"110001","items":1,"month":3},
    {"id":"ORD-1003","buyer":"8765432109","value":1800,"cod":1,"pin":"845001","items":3,"month":11},
    {"id":"ORD-1004","buyer":"7654321098","value":450, "cod":0,"pin":"400001","items":1,"month":5},
    {"id":"ORD-1005","buyer":"6543210987","value":2900,"cod":1,"pin":"743501","items":2,"month":10},
    {"id":"ORD-1006","buyer":"5432109876","value":980, "cod":1,"pin":"226001","items":2,"month":7},
    {"id":"ORD-1007","buyer":"4321098765","value":320, "cod":0,"pin":"560001","items":1,"month":2},
    {"id":"ORD-1008","buyer":"3210987654","value":4500,"cod":1,"pin":"494001","items":4,"month":11},
    {"id":"ORD-1009","buyer":"2109876543","value":750, "cod":0,"pin":"700001","items":1,"month":6},
    {"id":"ORD-1010","buyer":"1098765432","value":1200,"cod":1,"pin":"814001","items":2,"month":9},
]

# ─────────────────────────────────────────────────────────────────────────────
# SIDEBAR
# ─────────────────────────────────────────────────────────────────────────────
with st.sidebar:
    st.markdown("### 🛡️ Trust Intelligence")
    st.markdown(f"**Merchant:** `{MERCHANT_ID}`")
    st.divider()

    page = st.radio(
        "Navigation",
        ["📊 Dashboard", "➕ Score New Order", "⚙️ Rule Configuration", "📈 Model Insights"],
        label_visibility="collapsed"
    )

    st.divider()

    # API health check
    try:
        h = requests.get(f"{API_URL}/health", timeout=2)
        if h.status_code == 200:
            st.success("API Connected ✓")
        else:
            st.error("API Error")
    except:
        st.error("API Offline — start uvicorn")

    st.divider()

    # Quick seed button
    if st.button("🌱 Load Demo Orders", use_container_width=True):
        progress = st.progress(0)
        loaded = 0
        for i, o in enumerate(DEMO_ORDERS):
            payload = {
                "order_id":     o["id"],
                "raw_buyer_id": o["buyer"],
                "merchant_id":  MERCHANT_ID,
                "order_value":  o["value"],
                "is_cod":       o["cod"],
                "pin_code":     o["pin"],
                "item_count":   o["items"],
                "installments": 1,
                "order_month":  o["month"],
            }
            result = score_order(payload)
            if result:
                loaded += 1
            progress.progress((i + 1) / len(DEMO_ORDERS))
        st.success(f"Loaded {loaded} demo orders!")
        st.rerun()

# ─────────────────────────────────────────────────────────────────────────────
# PAGE 1: DASHBOARD
# ─────────────────────────────────────────────────────────────────────────────
if page == "📊 Dashboard":
    st.markdown('<p class="header-title">📊 Order Trust Dashboard</p>',
                unsafe_allow_html=True)
    st.markdown(f"*Last updated: {datetime.now().strftime('%d %b %Y, %I:%M %p')}*")
    st.divider()

    orders = fetch_scores()

    if not orders:
        st.info("No orders scored yet. Click **Load Demo Orders** in the sidebar to get started.")
    else:
        df = pd.DataFrame(orders)

        # ── KPI Row ───────────────────────────────────────────────────────────
        total      = len(df)
        high_risk  = len(df[df["risk_level"] == "HIGH"])
        blocked    = len(df[df["recommended_action"] == "block_cod"])
        avg_score  = df["score"].mean()
        cod_orders = len(df[df["is_cod"] == 1])

        c1, c2, c3, c4, c5 = st.columns(5)
        c1.metric("Total Orders Scored", total)
        c2.metric("High Risk Orders",    high_risk,
                  delta=f"{high_risk/total:.0%} of total",
                  delta_color="inverse")
        c3.metric("COD Blocked",         blocked,
                  delta=f"Saved ~₹{blocked * 800:,} est.",
                  delta_color="normal")
        c4.metric("Avg Trust Score",     f"{avg_score:.1f}/100")
        c5.metric("COD Orders",          cod_orders,
                  delta=f"{cod_orders/total:.0%} of total",
                  delta_color="off")

        st.divider()

        # ── Order Table ───────────────────────────────────────────────────────
        st.markdown("### Recent Orders")

        col_filter1, col_filter2, _ = st.columns([1, 1, 3])
        risk_filter   = col_filter1.selectbox(
            "Filter by Risk", ["All", "HIGH", "MEDIUM", "LOW"])
        action_filter = col_filter2.selectbox(
            "Filter by Action", ["All", "block_cod", "warn", "approve", "flag_review"])

        filtered = df.copy()
        if risk_filter   != "All":
            filtered = filtered[filtered["risk_level"] == risk_filter]
        if action_filter != "All":
            filtered = filtered[filtered["recommended_action"] == action_filter]

        # Display table
        for _, row in filtered.iterrows():
            color  = get_risk_color(row["score"])
            risk   = get_risk_label(row["score"])
            action = get_action_badge(row["recommended_action"])
            cod    = "💵 COD" if row["is_cod"] else "💳 Prepaid"

            with st.expander(
                f"{row['order_id']}  |  Score: **{row['score']}**  "
                f"|  {risk}  |  {action}  |  ₹{row['order_value']:,.0f}  |  {cod}"
            ):
                ec1, ec2, ec3 = st.columns(3)
                ec1.markdown(f"**PIN Code:** `{row['pin_code']}`")
                ec2.markdown(f"**Payment:** {cod}")
                ec3.markdown(f"**Scored at:** {row['created_at'][:16]}")

                # Score bar
                st.markdown(f"**Trust Score: {row['score']}/100**")
                st.progress(int(row["score"]) / 100)

                # Log outcome
                st.markdown("**Log Outcome:**")
                oc1, oc2, oc3 = st.columns(3)
                if oc1.button("✅ Delivered", key=f"d_{row['order_id']}"):
                    if log_outcome(row["order_id"], "demo_buyer", "delivered"):
                        st.success("Outcome logged: Delivered")
                if oc2.button("📦 RTO",       key=f"r_{row['order_id']}"):
                    if log_outcome(row["order_id"], "demo_buyer", "rto"):
                        st.success("Outcome logged: RTO")
                if oc3.button("↩️ Return",    key=f"ret_{row['order_id']}"):
                    if log_outcome(row["order_id"], "demo_buyer", "return"):
                        st.success("Outcome logged: Return")

        # ── Score Distribution Chart ──────────────────────────────────────────
        st.divider()
        st.markdown("### Trust Score Distribution")
        chart_df = df["score"].value_counts().sort_index().reset_index()
        chart_df.columns = ["Score", "Count"]
        st.bar_chart(chart_df.set_index("Score"))

# ─────────────────────────────────────────────────────────────────────────────
# PAGE 2: SCORE NEW ORDER
# ─────────────────────────────────────────────────────────────────────────────
elif page == "➕ Score New Order":
    st.markdown('<p class="header-title">➕ Score a New Order</p>',
                unsafe_allow_html=True)
    st.divider()

    with st.form("score_form"):
        fc1, fc2 = st.columns(2)
        order_id    = fc1.text_input("Order ID",     value=f"ORD-{random.randint(2000,9999)}")
        buyer_phone = fc2.text_input("Buyer Phone",  value="9876543210")
        order_value = fc1.number_input("Order Value (₹)", min_value=1.0, value=1500.0)
        pin_code    = fc2.text_input("PIN Code",     value="828001")
        is_cod      = fc1.selectbox("Payment Type",  [("COD", 1), ("Prepaid", 0)],
                                    format_func=lambda x: x[0])
        item_count  = fc2.number_input("Item Count", min_value=1, value=1)
        order_month = fc1.selectbox("Order Month",
                                    list(range(1, 13)),
                                    format_func=lambda m: datetime(2024, m, 1).strftime("%B"),
                                    index=datetime.now().month - 1)
        submitted = st.form_submit_button("🔍 Get Trust Score", use_container_width=True)

    if submitted:
        payload = {
            "order_id":     order_id,
            "raw_buyer_id": buyer_phone,
            "merchant_id":  MERCHANT_ID,
            "order_value":  order_value,
            "is_cod":       is_cod[1],
            "pin_code":     pin_code,
            "item_count":   item_count,
            "installments": 1,
            "order_month":  order_month,
        }
        with st.spinner("Scoring order..."):
            result = score_order(payload)

        if result:
            st.divider()
            color = get_risk_color(result["score"])

            rc1, rc2, rc3 = st.columns(3)
            rc1.metric("Trust Score",        f"{result['score']}/100")
            rc2.metric("Risk Level",         result["risk_level"])
            rc3.metric("Recommended Action", result["recommended_action"].replace("_"," ").upper())

            st.markdown(f"**Hashed Buyer ID:** `{result['hashed_buyer_id'][:32]}...`")
            st.markdown(f"**RTO Probability:** `{result['model_rto_prob']:.1%}`")

            st.divider()
            st.markdown("**Risk Factors:**")
            for f in result["factors"]:
                st.markdown(f"- {f}")

            if result["fired_rules"]:
                st.markdown("**Rules Fired:**")
                for r in result["fired_rules"]:
                    st.warning(f"⚡ {r}")
        else:
            st.error("API call failed. Is the backend running?")

# ─────────────────────────────────────────────────────────────────────────────
# PAGE 3: RULE CONFIGURATION
# ─────────────────────────────────────────────────────────────────────────────
elif page == "⚙️ Rule Configuration":
    st.markdown('<p class="header-title">⚙️ Merchant Rule Configuration</p>',
                unsafe_allow_html=True)
    st.divider()

    st.markdown("### COD Block Threshold")
    st.markdown("Orders with a trust score **below this threshold** will have COD automatically blocked.")

    threshold = st.slider(
        "Block COD if trust score is below:",
        min_value=0, max_value=100, value=40, step=5
    )

    col_preview1, col_preview2, col_preview3 = st.columns(3)
    col_preview1.markdown(f"🔴 **Block COD** — score < {threshold}")
    col_preview2.markdown(f"🟡 **Warn** — score {threshold}–70")
    col_preview3.markdown(f"🟢 **Approve** — score > 70")

    if st.button("💾 Save Threshold", use_container_width=True):
        if update_threshold(threshold):
            st.success(f"Threshold updated to {threshold}. New orders will use this rule.")
        else:
            st.error("Failed to update. Is the API running?")

    st.divider()
    st.markdown("### Active Rules")
    rules = fetch_rules()
    if rules:
        rules_df = pd.DataFrame(rules)
        st.dataframe(rules_df, use_container_width=True)
    else:
        st.info("No rules loaded.")

    st.divider()
    st.markdown("### What Each Rule Does")
    st.markdown("""
| Action | Meaning | When it fires |
|---|---|---|
| `block_cod` | Prevents COD payment option | Score below block threshold |
| `warn` | Shows warning to seller | Score between warn and block threshold |
| `flag_review` | Flags order for manual review | High value COD order |
| `approve` | No action needed | Score above all thresholds |
    """)

# ─────────────────────────────────────────────────────────────────────────────
# PAGE 4: MODEL INSIGHTS
# ─────────────────────────────────────────────────────────────────────────────
elif page == "📈 Model Insights":
    st.markdown('<p class="header-title">📈 Model Performance Insights</p>',
                unsafe_allow_html=True)
    st.divider()

    import os
    from PIL import Image

    st.markdown("### Baseline Model Comparison")
    st.markdown("Three models trained on the same Olist-calibrated dataset. "
                "Random Forest selected based on highest F1 score.")

    results_data = {
        "Model":     ["Logistic Regression", "Decision Tree", "Random Forest ✓"],
        "AUC":       [0.757, 0.751, 0.756],
        "F1 Score":  [0.315, 0.306, 0.318],
        "Precision": [0.204, 0.196, 0.208],
        "Recall":    [0.690, 0.693, 0.671],
    }
    results_df = pd.DataFrame(results_data)
    st.dataframe(results_df, use_container_width=True, hide_index=True)

    st.divider()

    # Charts
    chart_files = {
        "AUC-ROC Curve":             "ml/auc_roc_curve.png",
        "Confusion Matrix":          "ml/confusion_matrix.png",
        "Feature Importance":        "ml/feature_importance.png",
        "Trust Score Distribution":  "ml/trust_score_distribution.png",
    }

    cols = st.columns(2)
    for i, (title, path) in enumerate(chart_files.items()):
        with cols[i % 2]:
            st.markdown(f"**{title}**")
            if os.path.exists(path):
                img = Image.open(path)
                st.image(img, use_column_width=True)
            else:
                st.warning(f"Chart not found: `{path}` — run `python ml/train_model.py` first")

    st.divider()
    st.markdown("### Dataset Summary")
    mc1, mc2, mc3, mc4 = st.columns(4)
    mc1.metric("Total Records",  "97,916")
    mc2.metric("Training Size",  "78,332")
    mc3.metric("Test Size",      "19,584")
    mc4.metric("Overall RTO Rate", "10.0%")

    st.markdown("### Limitations & Threats to Validity")
    st.info("""
**Synthetic calibration:** The dataset is derived from Brazilian Olist e-commerce data, 
calibrated to Indian COD/RTO distributions using published benchmarks 
(Shipyaari 2024, Mordor Intelligence 2025). Direct validation on real India 
seller transaction data is required to confirm model performance in production.

**Festive season signal:** The festive month feature shows minimal lift in the 
current dataset due to imperfect calendar mapping between Brazilian and Indian 
festive periods. This feature is retained as it will carry stronger signal on real India data.

**Geographic proxy:** PIN tier classification is based on India Post's postal 
classification system and published RTO benchmarks. Granular sub-district variation 
is not captured in the current model.
    """)
