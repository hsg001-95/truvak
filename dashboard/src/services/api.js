import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000';
const DEFAULT_MERCHANT_ID = 'merchant_amazon';

const normalizeMerchantId = (merchantId) => {
  const raw = String(merchantId || '').trim();
  if (!raw) return DEFAULT_MERCHANT_ID;
  if (raw === 'merchant_local' || raw === 'merchant-local') return DEFAULT_MERCHANT_ID;
  if (raw === 'merchant-amazon') return 'merchant_amazon';
  if (raw === 'merchant-flipkart') return 'merchant_flipkart';
  return raw;
};

const merchantCandidates = (merchantId) => {
  const normalized = normalizeMerchantId(merchantId);
  const variants = [
    normalized,
    normalized.replace(/-/g, '_'),
    normalized.replace(/_/g, '-'),
  ];

  return [...new Set(variants.filter(Boolean))];
};

export const getActiveMerchantId = () => {
  const saved = window.localStorage.getItem('tip_merchant_id');
  return normalizeMerchantId(saved || DEFAULT_MERCHANT_ID);
};

export const setActiveMerchantId = (merchantId) => {
  window.localStorage.setItem('tip_merchant_id', normalizeMerchantId(merchantId));
};

const normalizeOrder = (order) => {
  const rawAction = String(order.recommended_action || 'n/a').toLowerCase();
  const actionLabel = rawAction === 'flag_review'
    ? 'flag review'
    : rawAction === 'block_cod'
      ? 'block cod'
      : rawAction;

  return {
    id: order.id || order.order_id || 'ORD-NA',
    score: typeof order.score === 'number' ? order.score : Number(order.score || 0),
    risk_level: order.risk_level || 'UNKNOWN',
    recommended_action: rawAction,
    recommended_action_label: actionLabel,
    is_cod: Number(order.is_cod || 0),
    order_value: Number(order.order_value || 0),
    pin_code: order.pin_code || '------',
    created_at: order.created_at || null,
    buyer_id: order.buyer_id || order.hashed_buyer_id || order.raw_buyer_id || null,
  };
};

export const apiClient = axios.create({
  baseURL: API_URL,
  timeout: 5000,
});

export const apiGet = async (endpoint) => {
  try {
    const res = await apiClient.get(endpoint);
    return res.data;
  } catch (err) {
    console.error("API GET fallback:", err);
    return null;
  }
};

export const apiPost = async (endpoint, payload) => {
  try {
    const res = await apiClient.post(endpoint, payload);
    return res.data;
  } catch (err) {
    console.error("API POST fallback:", err);
    return null;
  }
};

export const getOrders = async (merchant_id) => {
  const merchantId = normalizeMerchantId(merchant_id || getActiveMerchantId());

  for (const candidate of merchantCandidates(merchantId)) {
    const data = await apiGet(`/v1/scores/${candidate}?limit=200`);
    const rawOrders = Array.isArray(data?.orders) ? data.orders : [];
    if (rawOrders.length > 0) {
      setActiveMerchantId(candidate);
      return rawOrders
        .map(normalizeOrder)
        .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
    }
  }

  return [];
};

export const scoreOrder = async (payload) => {
  return await apiPost("/v1/score", payload);
};

export const getRules = async (merchant_id) => {
  const merchantId = normalizeMerchantId(merchant_id || getActiveMerchantId());
  const data = await apiGet(`/v1/rules/${merchantId}`);
  return Array.isArray(data?.rules) ? data.rules : [];
};

export const updateCodThreshold = async (merchant_id, threshold) => {
  const merchantId = normalizeMerchantId(merchant_id || getActiveMerchantId());
  return await apiPost(`/v1/rules/${merchantId}/threshold?threshold=${Number(threshold)}`, {});
};

export const getOutcomes = async (merchant_id) => {
  const merchantId = normalizeMerchantId(merchant_id || getActiveMerchantId());

  for (const candidate of merchantCandidates(merchantId)) {
    const data = await apiGet(`/v1/outcomes/${candidate}`);
    const outcomes = Array.isArray(data?.outcomes) ? data.outcomes : [];
    if (outcomes.length > 0) {
      setActiveMerchantId(candidate);
      return outcomes;
    }
  }

  return [];
};

export const getAreaIntelligence = async (pinCode) => {
  if (!pinCode) return null;
  return await apiGet(`/v1/area/intelligence/${pinCode}`);
};

export const getBuyerHistory = async (hashedBuyerId, merchant_id) => {
  if (!hashedBuyerId) return null;
  const merchantId = normalizeMerchantId(merchant_id || getActiveMerchantId());
  return await apiGet(`/v1/buyer/history/${hashedBuyerId}/${merchantId}`);
};

export const logOutcome = async (order_id, merchant_id, buyer_id, result) => {
  const merchantId = normalizeMerchantId(merchant_id || getActiveMerchantId());
  return await apiPost("/v1/outcome", {
    order_id,
    merchant_id: merchantId,
    raw_buyer_id: buyer_id,
    result
  });
};

// ── Review Intelligence API ────────────────────────────────────────────────

/**
 * POST /v1/reviews/analyze
 * payload: { reviews: ReviewInput[], merchant_id, product_url? }
 */
export const analyzeReviews = async (payload) => {
  return await apiPost('/v1/reviews/analyze', payload);
};

/**
 * GET /v1/reviews/product/{product_id}
 * Returns the latest ProductIntegrityResult for a product.
 */
export const getProductAnalysis = async (productId) => {
  if (!productId) return null;
  return await apiGet(`/v1/reviews/product/${productId}`);
};

/**
 * POST /v1/reviews/feedback
 * payload: { review_text, merchant_verdict: "genuine"|"fake", merchant_id, product_id }
 */
export const submitReviewFeedback = async (payload) => {
  return await apiPost('/v1/reviews/feedback', payload);
};

/**
 * GET /v1/reviews/health
 * Returns model load status for all 3 review stages.
 */
export const getReviewsHealth = async () => {
  return await apiGet('/v1/reviews/health');
};

