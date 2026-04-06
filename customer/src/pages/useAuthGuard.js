import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

export default function useAuthGuard() {
  const navigate = useNavigate();

  useEffect(() => {
    const token = localStorage.getItem("truvak_customer_token");
    if (!token) {
      navigate("/login", { replace: true });
    }
  }, [navigate]);
}
