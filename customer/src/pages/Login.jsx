import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { GoogleLogin } from "@react-oauth/google";
import ActionButton from "../components/ui/ActionButton";
import FormInput from "../components/ui/FormInput";
import { API } from "./shared";

function LoginForm({ email, password, onEmailChange, onPasswordChange, onSubmit, loading }) {
  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <FormInput label="Email" id="email" type="email" value={email} onChange={onEmailChange} placeholder="name@email.com" />
      <FormInput label="Password" id="password" type="password" value={password} onChange={onPasswordChange} placeholder="********" />
      <ActionButton type="submit" disabled={loading} className="w-full">
        {loading ? "Signing in..." : "Sign In"}
      </ActionButton>
    </form>
  );
}

export default function Login() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const handleSubmit = async (event) => {
    event.preventDefault();

    try {
      setLoading(true);
      setError(null);

      // API endpoint: POST /v1/customer/auth/login
      const res = await fetch(`${API}/v1/customer/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) {
        throw new Error("Invalid credentials");
      }
      const json = await res.json();
      setData(json);
      localStorage.setItem("truvak_customer_token", json.token);
      localStorage.setItem("truvak_customer_id", json.customer_id_hash);
      navigate("/", { replace: true });
    } catch (err) {
      setError(err.message);
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async (credentialResponse) => {
    try {
      setLoading(true);
      setError(null);

      const idToken = credentialResponse?.credential;
      if (!idToken) {
        throw new Error("Google sign-in did not return a token");
      }

      const res = await fetch(`${API}/v1/customer/auth/google`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id_token: idToken }),
      });

      if (!res.ok) {
        throw new Error("Google login failed");
      }

      const json = await res.json();
      setData(json);
      localStorage.setItem("truvak_customer_token", json.token);
      localStorage.setItem("truvak_customer_id", json.customer_id_hash);
      navigate("/", { replace: true });
    } catch (err) {
      setError(err.message || "Google login failed");
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#0D1117] px-4 text-[#E6EDF3]">
      <section className="w-full max-w-md rounded-xl border border-[#30363D] bg-[#161B22] p-6">
        <h1 className="text-2xl font-bold">Login</h1>
        <p className="mt-1 text-sm text-[#8B949E]">Access your customer dashboard.</p>
        <div className="mt-5">
          <LoginForm
            email={email}
            password={password}
            onEmailChange={(event) => setEmail(event.target.value)}
            onPasswordChange={(event) => setPassword(event.target.value)}
            onSubmit={handleSubmit}
            loading={loading}
          />
          <div className="my-4 flex items-center gap-3">
            <span className="h-px flex-1 bg-[#30363D]" />
            <span className="text-xs uppercase tracking-wide text-[#8B949E]">or</span>
            <span className="h-px flex-1 bg-[#30363D]" />
          </div>
          <div className="flex justify-center">
            <GoogleLogin
              onSuccess={handleGoogleLogin}
              onError={() => setError("Google popup failed. Please try again.")}
              text="signin_with"
              shape="rectangular"
              theme="outline"
              width="320"
            />
          </div>
        </div>
        {error ? <p className="mt-4 rounded-lg border border-[#F85149]/40 bg-[#F85149]/10 p-3 text-sm text-[#F85149]">{error}</p> : null}
        {!data && !error ? (
          <div className="mt-4 flex flex-col items-center justify-center py-2 text-[#8B949E]">
            <p className="text-sm">No data available yet</p>
          </div>
        ) : null}
        <p className="mt-4 text-sm text-[#8B949E]">
          No account? <Link to="/register" className="text-[#2F81F7] hover:underline">Register</Link>
        </p>
      </section>
    </main>
  );
}
