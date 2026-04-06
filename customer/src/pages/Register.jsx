import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import ActionButton from "../components/ui/ActionButton";
import FormInput from "../components/ui/FormInput";
import { API } from "./shared";

function RegisterForm({
  email,
  password,
  pinCode,
  onEmailChange,
  onPasswordChange,
  onPinChange,
  onSubmit,
  loading,
}) {
  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <FormInput label="Email" id="email" type="email" value={email} onChange={onEmailChange} placeholder="name@email.com" />
      <FormInput label="Password" id="password" type="password" value={password} onChange={onPasswordChange} placeholder="********" />
      <FormInput label="PIN Code" id="pin" type="text" value={pinCode} onChange={onPinChange} placeholder="110001" />
      <ActionButton type="submit" disabled={loading} className="w-full">
        {loading ? "Creating..." : "Create Account"}
      </ActionButton>
    </form>
  );
}

export default function Register() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pinCode, setPinCode] = useState("");

  const handleSubmit = async (event) => {
    event.preventDefault();

    try {
      setLoading(true);
      setError(null);

      // API endpoint: POST /v1/customer/auth/register
      const res = await fetch(`${API}/v1/customer/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, pin_code: pinCode || null }),
      });
      if (!res.ok) {
        throw new Error("Registration failed");
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

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#0D1117] px-4 text-[#E6EDF3]">
      <section className="w-full max-w-md rounded-xl border border-[#30363D] bg-[#161B22] p-6">
        <h1 className="text-2xl font-bold">Register</h1>
        <p className="mt-1 text-sm text-[#8B949E]">Create your Truvak customer account.</p>
        <div className="mt-5">
          <RegisterForm
            email={email}
            password={password}
            pinCode={pinCode}
            onEmailChange={(event) => setEmail(event.target.value)}
            onPasswordChange={(event) => setPassword(event.target.value)}
            onPinChange={(event) => setPinCode(event.target.value)}
            onSubmit={handleSubmit}
            loading={loading}
          />
        </div>
        {error ? <p className="mt-4 rounded-lg border border-[#F85149]/40 bg-[#F85149]/10 p-3 text-sm text-[#F85149]">{error}</p> : null}
        {!data && !error ? (
          <div className="mt-4 flex flex-col items-center justify-center py-2 text-[#8B949E]">
            <p className="text-sm">No data available yet</p>
          </div>
        ) : null}
        <p className="mt-4 text-sm text-[#8B949E]">
          Already registered? <Link to="/login" className="text-[#2F81F7] hover:underline">Login</Link>
        </p>
      </section>
    </main>
  );
}
