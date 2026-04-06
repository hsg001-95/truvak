import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import CustomerLayout from "../components/layout/CustomerLayout";
import AlertItem from "../components/ui/AlertItem";
import SkeletonLoader from "../components/ui/SkeletonLoader";
import StatsCard from "../components/ui/StatsCard";
import ActionButton from "../components/ui/ActionButton";
import RiskBadge from "../components/ui/RiskBadge";
import useAuthGuard from "./useAuthGuard";
import { API, clearAuth, formatInr, getAuthContext } from "./shared";

function HomeHero({ loading, profile, onRefresh }) {
  if (loading) {
    return <SkeletonLoader rows={1} />;
  }

  if (!profile) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-[#8B949E]">
        <span className="mb-4 text-4xl">📭</span>
        <p className="text-sm">No data available yet</p>
      </div>
    );
  }

  return (
    <section className="rounded-xl border border-[#30363D] bg-[#161B22] p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-[#E6EDF3]">Welcome back</h2>
          <p className="text-sm text-[#8B949E]">Buyer trust dashboard</p>
        </div>
        <div className="flex items-center gap-3">
          <RiskBadge label={profile.trust_level} />
          <ActionButton onClick={onRefresh}>Refresh</ActionButton>
        </div>
      </div>
    </section>
  );
}

function KpiSection({ loading, spendData }) {
  if (loading) {
    return <SkeletonLoader rows={2} />;
  }

  if (!spendData) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-[#8B949E]">
        <span className="mb-4 text-4xl">📭</span>
        <p className="text-sm">No data available yet</p>
      </div>
    );
  }

  return (
    <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
      <StatsCard title="Total Spend" value={formatInr(spendData.total_spend)} hint="Last selected period" tone="success" />
      <StatsCard title="Orders" value={spendData.order_count} hint="Placed orders" />
      <StatsCard title="Returns" value={spendData.return_count} hint="Returned orders" tone="danger" />
      <StatsCard title="Savings" value={formatInr(spendData.truvak_savings_estimate)} hint="Estimated savings" tone="warning" />
    </section>
  );
}

function AlertsSection({ loading, watchlist, onOpen }) {
  if (loading) {
    return <SkeletonLoader rows={1} />;
  }

  if (!watchlist || watchlist.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-[#8B949E]">
        <span className="mb-4 text-4xl">📭</span>
        <p className="text-sm">No data available yet</p>
      </div>
    );
  }

  const alertItems = watchlist.filter((item) => item.alert_triggered).slice(0, 3);

  if (alertItems.length === 0) {
    return (
      <section className="rounded-xl border border-[#30363D] bg-[#161B22] p-6 text-sm text-[#8B949E]">
        No active price-drop alerts.
      </section>
    );
  }

  return (
    <section className="space-y-3">
      {alertItems.map((item) => (
        <AlertItem
          key={item.id}
          title={item.product_name}
          subtitle={`${item.platform} • ${formatInr(item.current_price || item.price_at_save)}`}
          onClick={() => onOpen(item.product_url)}
        />
      ))}
    </section>
  );
}

export default function Home() {
  useAuthGuard();

  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);

  const fetchHomeData = async () => {
    const { customerId, authHeaders } = getAuthContext();

    if (!customerId) {
      navigate("/login", { replace: true });
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // API endpoint: GET /v1/customer/spend/{customer_id_hash}
      const spendRes = await fetch(`${API}/v1/customer/spend/${customerId}?days=15`, {
        headers: authHeaders,
      });

      // API endpoint: GET /v1/customer/profile/{customer_id_hash}
      const profileRes = await fetch(`${API}/v1/customer/profile/${customerId}`, {
        headers: authHeaders,
      });

      // API endpoint: GET /v1/customer/watchlist
      const watchlistRes = await fetch(`${API}/v1/customer/watchlist`, {
        headers: authHeaders,
      });

      if ([spendRes, profileRes, watchlistRes].some((res) => res.status === 401)) {
        clearAuth();
        navigate("/login", { replace: true });
        return;
      }

      if (!spendRes.ok || !profileRes.ok || !watchlistRes.ok) {
        throw new Error("Unable to load dashboard data");
      }

      const spend = await spendRes.json();
      const profile = await profileRes.json();
      const watchlist = await watchlistRes.json();

      setData({ spend, profile, watchlist });
    } catch (err) {
      setError(err.message);
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHomeData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleOpenAlert = (url) => {
    if (url) {
      window.open(url, "_blank", "noopener,noreferrer");
    }
  };

  return (
    <CustomerLayout>
      <div className="space-y-6">
        {error ? <p className="rounded-lg border border-[#F85149]/40 bg-[#F85149]/10 p-3 text-sm text-[#F85149]">{error}</p> : null}
        <HomeHero loading={loading} profile={data?.profile || null} onRefresh={fetchHomeData} />
        <KpiSection loading={loading} spendData={data?.spend || null} />
        <AlertsSection loading={loading} watchlist={data?.watchlist || null} onOpen={handleOpenAlert} />
      </div>
    </CustomerLayout>
  );
}
