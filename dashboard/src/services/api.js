import axios from 'axios';

const API_URL = "http://127.0.0.1:8000";

// Fallback demo data if API is down
const DEMO_ORDERS = [
  {"id":"ORD-D001","buyer":"9876543210","order_value":3200,"is_cod":1,"pin_code":"828001","item_count":2,"order_month":10, "score": 85, "risk_level": "LOW", "recommended_action": "approve"},
  {"id":"ORD-D002","buyer":"9123456780","order_value":650, "is_cod":0,"pin_code":"110001","item_count":1,"order_month":3, "score": 92, "risk_level": "LOW", "recommended_action": "approve"},
  {"id":"ORD-D003","buyer":"8765432109","order_value":1800,"is_cod":1,"pin_code":"845001","item_count":3,"order_month":11, "score": 35, "risk_level": "HIGH", "recommended_action": "block_cod"},
  {"id":"ORD-D004","buyer":"7654321098","order_value":450, "is_cod":0,"pin_code":"400001","item_count":1,"order_month":5, "score": 60, "risk_level": "MEDIUM", "recommended_action": "warn"},
];

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
  const data = await apiGet(`/v1/scores/${merchant_id}?limit=200`);
  return data?.orders || DEMO_ORDERS; // Mock fallback
};

export const scoreOrder = async (payload) => {
  return await apiPost("/v1/score", payload);
};

export const logOutcome = async (order_id, merchant_id, buyer_id, result) => {
  return await apiPost("/v1/outcome", {
    order_id,
    merchant_id,
    raw_buyer_id: buyer_id,
    result
  });
};
