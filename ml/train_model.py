import os
import pickle
import warnings

import numpy as np
import pandas as pd
import matplotlib

matplotlib.use("Agg")  # set backend BEFORE importing pyplot
import matplotlib.pyplot as plt

from sklearn.ensemble import RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.tree import DecisionTreeClassifier
from sklearn.model_selection import train_test_split
from sklearn.metrics import (
    roc_auc_score,
    classification_report,
    confusion_matrix,
    ConfusionMatrixDisplay,
    roc_curve,
)

# ── Paths (robust to current working directory) ──────────────────────────────
BASE_DIR = os.path.dirname(__file__)                            # ...\trust-intelligence-platform\ml
PROJECT_ROOT = os.path.dirname(BASE_DIR)                        # ...\trust-intelligence-platform
DATA_PATH = os.path.join(PROJECT_ROOT, "data", "synthetic_rto.csv")
ML_OUT_DIR = BASE_DIR

# ── Load data ─────────────────────────────────────────────────────────────────
if not os.path.exists(DATA_PATH):
    raise FileNotFoundError(f"Missing dataset: {DATA_PATH}. Run generate_data.py first.")

df = pd.read_csv(DATA_PATH)

# ── Ensure required features exist (derived defaults for missing columns) ────
# These four are referenced by training but not generated in synthetic_rto.csv.
if "freight_ratio" not in df.columns:
    # Simple proxy: higher freight pressure for lower-value orders
    df["freight_ratio"] = np.clip(80.0 / df["order_value"], 0.01, 0.60)

if "item_count" not in df.columns:
    # Reasonable synthetic count tied loosely to order value bucket
    df["item_count"] = np.clip(df["order_value_bucket"] + np.random.randint(-1, 2, len(df)), 1, 8)

if "low_review" not in df.columns:
    # Proxy dissatisfaction signal
    df["low_review"] = np.random.binomial(1, 0.18, len(df))

if "installments" not in df.columns:
    # 1 means full payment; larger values imply EMI-like stress
    df["installments"] = np.where(df["is_cod"] == 1, 1, np.random.choice([1, 2, 3, 6], len(df), p=[0.55, 0.25, 0.15, 0.05]))

FEATURES = [
    # Original features
    "pin_tier", "is_cod", "order_value", "order_value_bucket",
    "freight_ratio", "item_count", "is_weekend", "is_festive_season",
    "is_first_order", "prev_rto_count", "low_review", "installments",
    # NEW — Census 2011 socioeconomic features
    "internet_penetration",   # Digital payment adoption signal
    "mobile_penetration",     # UPI capability signal
    "cod_risk_score",         # Composite COD risk from Census data
    "electricity_access",     # Infrastructure quality signal
]
TARGET = "rto_label"

missing = [c for c in FEATURES + [TARGET] if c not in df.columns]
if missing:
    raise ValueError(f"Missing required columns: {missing}")

X = df[FEATURES].copy()
y = df[TARGET].astype(int)

# Force numeric dtypes for sklearn safety
for c in X.columns:
    X[c] = pd.to_numeric(X[c], errors="coerce")
if X.isna().any().any():
    X = X.fillna(X.median(numeric_only=True))

X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=0.2, random_state=42, stratify=y
)

print(f"Train size: {len(X_train)} | Test size: {len(X_test)}")
print(f"RTO rate in test: {y_test.mean():.1%}\n")

# ── Train all 3 models ────────────────────────────────────────────────────────
models = {
    "Logistic Regression": LogisticRegression(
        max_iter=1000, random_state=42,
        class_weight="balanced"          # Penalises missing RTO equally
    ),
    "Decision Tree": DecisionTreeClassifier(
        max_depth=6, random_state=42,
        class_weight="balanced"
    ),
    "Random Forest": RandomForestClassifier(
        n_estimators=100, max_depth=8, random_state=42,
        class_weight="balanced",         # Each RTO miss costs more
        min_samples_leaf=20
    ),
}


results = {}
trained_models = {}

print("=" * 55)
print(f"{'Model':<22} {'AUC':>6}  {'F1':>6}  {'Prec':>6}  {'Rec':>6}")
print("=" * 55)

for name, model in models.items():
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        model.fit(X_train, y_train)

    y_pred = model.predict(X_test)
    y_proba = model.predict_proba(X_test)[:, 1]

    auc = roc_auc_score(y_test, y_proba)
    rep = classification_report(y_test, y_pred, output_dict=True, zero_division=0)
    f1 = rep["1"]["f1-score"]
    prec = rep["1"]["precision"]
    rec = rep["1"]["recall"]

    results[name] = {"AUC": auc, "F1": f1, "Precision": prec, "Recall": rec}
    trained_models[name] = model
    print(f"{name:<22} {auc:>6.3f}  {f1:>6.3f}  {prec:>6.3f}  {rec:>6.3f}")

print("=" * 55)

# ── Save best model (Random Forest) ──────────────────────────────────────────
os.makedirs(ML_OUT_DIR, exist_ok=True)
best_model = trained_models["Random Forest"]
model_path = os.path.join(ML_OUT_DIR, "rto_model_v1.pkl")
with open(model_path, "wb") as f:
    pickle.dump({"model": best_model, "features": FEATURES}, f)
print(f"\nModel saved → {model_path}")

# ── Plot 1: AUC-ROC Curve ─────────────────────────────────────────────────────
plt.figure(figsize=(8, 6))
for name, model in trained_models.items():
    y_proba = model.predict_proba(X_test)[:, 1]
    fpr, tpr, _ = roc_curve(y_test, y_proba)
    auc = results[name]["AUC"]
    plt.plot(fpr, tpr, label=f"{name} (AUC={auc:.3f})", linewidth=2)

plt.plot([0, 1], [0, 1], "k--", label="Random baseline")
plt.xlabel("False Positive Rate", fontsize=12)
plt.ylabel("True Positive Rate", fontsize=12)
plt.title("AUC-ROC Curve — RTO Prediction Models", fontsize=14)
plt.legend(fontsize=11)
plt.tight_layout()
plt.savefig(os.path.join(ML_OUT_DIR, "auc_roc_curve.png"), dpi=150)
plt.close()
print("Saved → ml/auc_roc_curve.png")

# ── Plot 2: Confusion Matrix ──────────────────────────────────────────────────
rf_pred = best_model.predict(X_test)
cm = confusion_matrix(y_test, rf_pred)
disp = ConfusionMatrixDisplay(confusion_matrix=cm, display_labels=["No RTO", "RTO"])
fig, ax = plt.subplots(figsize=(6, 5))
disp.plot(ax=ax, colorbar=False, cmap="Blues")
ax.set_title("Confusion Matrix — Random Forest", fontsize=13)
plt.tight_layout()
plt.savefig(os.path.join(ML_OUT_DIR, "confusion_matrix.png"), dpi=150)
plt.close()
print("Saved → ml/confusion_matrix.png")

# ── Plot 3: Feature Importance ────────────────────────────────────────────────
importances = best_model.feature_importances_
feat_df = pd.DataFrame({"Feature": FEATURES, "Importance": importances}).sort_values("Importance", ascending=True)

plt.figure(figsize=(8, 5))
plt.barh(feat_df["Feature"], feat_df["Importance"], color="#1D4ED8")
plt.xlabel("Importance Score", fontsize=12)
plt.title("Feature Importance — Random Forest", fontsize=14)
plt.tight_layout()
plt.savefig(os.path.join(ML_OUT_DIR, "feature_importance.png"), dpi=150)
plt.close()
print("Saved → ml/feature_importance.png")

# ── Plot 4: Trust Score Distribution ──────────────────────────────────────────
rf_probas = best_model.predict_proba(X)[:, 1]
trust_scores = ((1 - rf_probas) * 100).round(1)

plt.figure(figsize=(8, 5))
plt.hist(trust_scores, bins=40, color="#1D4ED8", edgecolor="white", alpha=0.85)
plt.axvline(40, color="#DC2626", linestyle="--", linewidth=1.5, label="Block threshold (40)")
plt.axvline(70, color="#15803D", linestyle="--", linewidth=1.5, label="Safe threshold (70)")
plt.xlabel("Trust Score (0-100)", fontsize=12)
plt.ylabel("Number of Orders", fontsize=12)
plt.title("Trust Score Distribution — All Orders", fontsize=14)
plt.legend(fontsize=11)
plt.tight_layout()
plt.savefig(os.path.join(ML_OUT_DIR, "trust_score_distribution.png"), dpi=150)
plt.close()
print("Saved → ml/trust_score_distribution.png")

print("\n=== All charts saved to ml/ folder ===")
print("\nFinal Results Table:")
print("-" * 55)
for name, r in results.items():
    marker = " ← selected" if name == "Random Forest" else ""
    print(f"{name:<22} AUC={r['AUC']:.3f}  F1={r['F1']:.3f}{marker}")
print("-" * 55)
