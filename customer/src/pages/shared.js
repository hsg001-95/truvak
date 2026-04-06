export const API = import.meta.env.VITE_API_URL ?? "http://127.0.0.1:8000";

export function getAuthContext() {
  const token = localStorage.getItem("truvak_customer_token");
  const customerId = localStorage.getItem("truvak_customer_id");

  return {
    token,
    customerId,
    authHeaders: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
  };
}

export function clearAuth() {
  localStorage.removeItem("truvak_customer_token");
  localStorage.removeItem("truvak_customer_id");
}

export function formatInr(value) {
  const amount = Number(value || 0);
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount);
}
