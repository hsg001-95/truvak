import { Navigate } from "react-router-dom";

export default function ProtectedRoute({ children }) {
  const token = localStorage.getItem("truvak_customer_token");

  if (!token) {
    return <Navigate to="/login" replace />;
  }

  return children;
}
