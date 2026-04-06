import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import CustomerLayout from "../components/layout/CustomerLayout";
import ChartContainer from "../components/ui/ChartContainer";
import SkeletonLoader from "../components/ui/SkeletonLoader";
import StatsCard from "../components/ui/StatsCard";
import useAuthGuard from "./useAuthGuard";
import { API, clearAuth, formatInr, getAuthContext } from "./shared";

function DailySpendSection({ loading, dailySeries }) {
  if (loading) {
    return <SkeletonLoader rows={1} />;
  }

  if (!dailySeries || dailySeries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-[#8B949E]">
        <span className="mb-4 text-4xl">📭</span>
        <p className="text-sm">No data available yet</p>
      </div>
    );
  }

  const max = Math.max(...dailySeries.map((d) => Number(d.total_spend || 0)), 1);
  const barHeights = ["h-2", "h-4", "h-8", "h-12", "h-16", "h-20", "h-24", "h-28", "h-32", "h-36", "h-40", "h-44"];

  return (
    <ChartContainer title="Daily Spend">
      <div className="flex h-48 items-end gap-2 overflow-x-auto">
        {dailySeries.map((item) => {
          const ratio = Number(item.total_spend || 0) / max;
          const index = Math.min(barHeights.length - 1, Math.max(0, Math.round(ratio * (barHeights.length - 1))));
          const heightClass = barHeights[index];
          return (
            <div key={item.date} className="min-w-12 text-center">
              <div className={`mx-auto w-8 rounded-t bg-[#2F81F7] ${heightClass}`} />
              <p className="mt-1 text-[10px] text-[#8B949E]">{item.date.slice(5)}</p>
            </div>
          );
        })}
      </div>
    </ChartContainer>
  );
}

function CategoryBreakdownSection({ loading, categories }) {
  if (loading) {
    return <SkeletonLoader rows={1} />;
  }

  if (!categories || categories.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-[#8B949E]">
        <span className="mb-4 text-4xl">📭</span>
        <p className="text-sm">No data available yet</p>
      </div>
    );
  }

  return (
    <ChartContainer title="Category Breakdown">
      <div className="space-y-3">
        {categories.map((item) => (
          <div key={item.category} className="rounded-lg border border-[#30363D] bg-[#0D1117] p-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-[#E6EDF3]">{item.category}</p>
              <p className="text-xs text-[#8B949E]">{item.percentage}%</p>
            </div>
            <p className="mt-1 text-xs text-[#8B949E]">{formatInr(item.total_spend)} • {item.order_count} orders</p>
          </div>
        ))}
      </div>
    </ChartContainer>
  );
}

export default function SpendAnalysis() {
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

        // API endpoint: GET /v1/customer/spend/{customer_id_hash}
        const res = await fetch(`${API}/v1/customer/spend/${customerId}?days=15`, { headers: authHeaders });
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
        <h2 className="text-2xl font-bold text-[#E6EDF3]">Spend Analysis</h2>
        {error ? <p className="rounded-lg border border-[#F85149]/40 bg-[#F85149]/10 p-3 text-sm text-[#F85149]">{error}</p> : null}

        {loading ? (
          <SkeletonLoader rows={2} />
        ) : !data ? (
          <div className="flex flex-col items-center justify-center py-16 text-[#8B949E]">
            <span className="mb-4 text-4xl">📭</span>
            <p className="text-sm">No data available yet</p>
          </div>
        ) : (
          <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
            <StatsCard title="Total Spend" value={formatInr(data.total_spend)} hint="Last 15 days" tone="success" />
            <StatsCard title="Orders" value={data.order_count} hint="Total orders" />
            <StatsCard title="Returns" value={data.return_count} hint="Returned orders" tone="danger" />
            <StatsCard title="AOV" value={formatInr(data.avg_order_value)} hint="Average order value" />
            <StatsCard title="Impulse Buys" value={data.impulse_buy_count} hint={`${data.impulse_buy_percentage}% of orders`} tone="warning" />
          </section>
        )}

        <DailySpendSection loading={loading} dailySeries={data?.daily_series || null} />
        <CategoryBreakdownSection loading={loading} categories={data?.category_breakdown || null} />
      </div>
    </CustomerLayout>
  );
}
