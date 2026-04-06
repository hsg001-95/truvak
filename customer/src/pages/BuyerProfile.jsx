import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import CustomerLayout from "../components/layout/CustomerLayout";
import RiskBadge from "../components/ui/RiskBadge";
import SkeletonLoader from "../components/ui/SkeletonLoader";
import StatsCard from "../components/ui/StatsCard";
import useAuthGuard from "./useAuthGuard";
import { API, clearAuth, getAuthContext } from "./shared";

function TrustSection({ loading, data }) {
  if (loading) {
    return <SkeletonLoader rows={1} />;
  }

  if (!data) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-[#8B949E]">
        <span className="mb-4 text-4xl">📭</span>
        <p className="text-sm">No data available yet</p>
      </div>
    );
  }

  return (
    <section className="rounded-xl border border-[#30363D] bg-[#161B22] p-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-[#E6EDF3]">Trust Summary</h3>
        <RiskBadge label={data.trust_level} />
      </div>
      <p className="mt-3 text-4xl font-bold text-[#E6EDF3]">{data.buyer_trust_score}</p>
      <p className="text-sm text-[#8B949E]">Buyer trust score</p>
    </section>
  );
}

function TipsSection({ loading, tips }) {
  if (loading) {
    return <SkeletonLoader rows={1} />;
  }

  if (!tips || tips.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-[#8B949E]">
        <span className="mb-4 text-4xl">📭</span>
        <p className="text-sm">No data available yet</p>
      </div>
    );
  }

  return (
    <section className="rounded-xl border border-[#30363D] bg-[#161B22] p-6">
      <h3 className="text-lg font-semibold text-[#E6EDF3]">Improvement Tips</h3>
      <ul className="mt-3 space-y-2 text-sm text-[#8B949E]">
        {tips.map((tip) => (
          <li key={tip} className="rounded-md border border-[#30363D] bg-[#0D1117] p-3">
            {tip}
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function BuyerProfile() {
  useAuthGuard();

  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      const { customerId, authHeaders } = getAuthContext();

      if (!customerId) {
        navigate("/login", { replace: true });
        return;
      }

      try {
        setLoading(true);

        // API endpoint: GET /v1/customer/profile/{customer_id_hash}
        const res = await fetch(`${API}/v1/customer/profile/${customerId}`, { headers: authHeaders });
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

    fetchData();
  }, [navigate]);

  return (
    <CustomerLayout>
      <div className="space-y-6">
        <h2 className="text-2xl font-bold text-[#E6EDF3]">Buyer Profile</h2>
        {error ? <p className="rounded-lg border border-[#F85149]/40 bg-[#F85149]/10 p-3 text-sm text-[#F85149]">{error}</p> : null}

        <TrustSection loading={loading} data={data} />

        {loading ? (
          <SkeletonLoader rows={1} />
        ) : !data ? null : (
          <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <StatsCard title="Orders" value={data.total_orders_analyzed} hint="Orders analyzed" />
            <StatsCard title="Completion" value={`${data.order_completion_rate}%`} hint="Delivery completion" tone="success" />
            <StatsCard title="Return Rate" value={`${data.return_rate}%`} hint="Returned orders" tone="danger" />
          </section>
        )}

        <TipsSection loading={loading} tips={data?.improvement_tips || null} />
      </div>
    </CustomerLayout>
  );
}
