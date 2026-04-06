import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import CustomerLayout from "../components/layout/CustomerLayout";
import ActionButton from "../components/ui/ActionButton";
import SkeletonLoader from "../components/ui/SkeletonLoader";
import useAuthGuard from "./useAuthGuard";
import { API, clearAuth, getAuthContext } from "./shared";

const PREFS_KEY = "truvak_customer_preferences";

function getStoredPreferences() {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) {
      return {
        darkMode: false,
        priceAlerts: true,
        reviewShield: true,
      };
    }

    const parsed = JSON.parse(raw);
    return {
      darkMode: Boolean(parsed.darkMode),
      priceAlerts: parsed.priceAlerts !== false,
      reviewShield: parsed.reviewShield !== false,
    };
  } catch (_error) {
    return {
      darkMode: false,
      priceAlerts: true,
      reviewShield: true,
    };
  }
}

function saveStoredPreferences(prefs) {
  localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
}

function AccountSection({ loading, me }) {
  if (loading) {
    return <SkeletonLoader rows={1} />;
  }

  if (!me) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-[#8B949E]">
        <span className="mb-4 text-4xl">📭</span>
        <p className="text-sm">No data available yet</p>
      </div>
    );
  }

  return (
    <section className="rounded-xl border border-[#30363D] bg-[#161B22] p-6">
      <h3 className="text-lg font-semibold text-[#E6EDF3]">Account</h3>
      <div className="mt-4 space-y-2 text-sm text-[#8B949E]">
        <p>Customer ID: {me.customer_id_hash}</p>
        <p>Created: {me.created_at}</p>
      </div>
    </section>
  );
}

function PreferencesSection({ loading, prefs, onToggle }) {
  if (loading) {
    return <SkeletonLoader rows={1} />;
  }

  return (
    <section className="rounded-xl border border-[#30363D] bg-[#161B22] p-6">
      <h3 className="text-lg font-semibold text-[#E6EDF3]">Preferences</h3>
      <div className="mt-4 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm text-[#8B949E]">Dark mode</p>
          <ActionButton onClick={() => onToggle("darkMode")} variant="secondary">
            {prefs.darkMode ? "Disable" : "Enable"}
          </ActionButton>
        </div>
        <div className="flex items-center justify-between">
          <p className="text-sm text-[#8B949E]">Price drop alerts</p>
          <ActionButton onClick={() => onToggle("priceAlerts")} variant="secondary">
            {prefs.priceAlerts ? "Disable" : "Enable"}
          </ActionButton>
        </div>
        <div className="flex items-center justify-between">
          <p className="text-sm text-[#8B949E]">Review shield</p>
          <ActionButton onClick={() => onToggle("reviewShield")} variant="secondary">
            {prefs.reviewShield ? "Disable" : "Enable"}
          </ActionButton>
        </div>
      </div>
    </section>
  );
}

export default function Settings() {
  useAuthGuard();

  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);
  const [prefs, setPrefs] = useState(getStoredPreferences());

  const fetchData = async () => {
    const { authHeaders } = getAuthContext();

    try {
      setLoading(true);

      // API endpoint: GET /v1/customer/auth/me
      const res = await fetch(`${API}/v1/customer/auth/me`, { headers: authHeaders });
      if (res.status === 401) {
        clearAuth();
        navigate("/login", { replace: true });
        return;
      }
      if (!res.ok) {
        throw new Error(res.statusText);
      }
      const json = await res.json();
      setData(json);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    setPrefs(getStoredPreferences());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleTogglePreference = (key) => {
    const next = {
      ...prefs,
      [key]: !prefs[key],
    };
    setPrefs(next);
    saveStoredPreferences(next);
  };

  return (
    <CustomerLayout>
      <div className="space-y-6">
        <h2 className="text-2xl font-bold text-[#E6EDF3]">Settings</h2>
        {error ? <p className="rounded-lg border border-[#F85149]/40 bg-[#F85149]/10 p-3 text-sm text-[#F85149]">{error}</p> : null}
        <AccountSection loading={loading} me={data} />
        <PreferencesSection loading={loading} prefs={prefs} onToggle={handleTogglePreference} />
      </div>
    </CustomerLayout>
  );
}
