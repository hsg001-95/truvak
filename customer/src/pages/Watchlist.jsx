import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import CustomerLayout from "../components/layout/CustomerLayout";
import ActionButton from "../components/ui/ActionButton";
import SkeletonLoader from "../components/ui/SkeletonLoader";
import useAuthGuard from "./useAuthGuard";
import { API, clearAuth, formatInr, getAuthContext } from "./shared";

function WatchlistTable({ loading, items, onDelete, onThresholdChange, onOpen }) {
  if (loading) {
    return <SkeletonLoader rows={2} />;
  }

  if (!items || items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-[#8B949E]">
        <span className="mb-4 text-4xl">📭</span>
        <p className="text-sm">No data available yet</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-[#30363D] bg-[#161B22]">
      <table className="min-w-full text-left text-sm">
        <thead className="border-b border-[#30363D] text-xs uppercase tracking-wide text-[#8B949E]">
          <tr>
            <th className="px-4 py-3">Product</th>
            <th className="px-4 py-3">Saved</th>
            <th className="px-4 py-3">Current</th>
            <th className="px-4 py-3">Change</th>
            <th className="px-4 py-3">Alert</th>
            <th className="px-4 py-3">Actions</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id} className="border-b border-[#30363D]/60">
              <td className="px-4 py-3">
                <button onClick={() => onOpen(item.product_url)} className="text-left text-[#E6EDF3] hover:text-[#2F81F7]">
                  {item.product_name}
                </button>
              </td>
              <td className="px-4 py-3 text-[#8B949E]">{formatInr(item.price_at_save)}</td>
              <td className="px-4 py-3 text-[#E6EDF3]">{formatInr(item.current_price || item.price_at_save)}</td>
              <td className={`px-4 py-3 ${item.change_direction === "down" ? "text-[#3FB950]" : item.change_direction === "up" ? "text-[#F85149]" : "text-[#8B949E]"}`}>
                {item.change_pct ?? 0}%
              </td>
              <td className="px-4 py-3">
                <input
                  type="number"
                  min="0"
                  value={item.alert_threshold_pct}
                  onChange={(event) => onThresholdChange(item.id, Number(event.target.value))}
                  className="w-20 rounded-md border border-[#30363D] bg-[#0D1117] px-2 py-1 text-[#E6EDF3]"
                />
              </td>
              <td className="px-4 py-3">
                <button onClick={() => onDelete(item.id)} className="text-[#F85149] hover:text-[#ff7b72]">
                  Remove
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function Watchlist() {
  useAuthGuard();

  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);

  const fetchData = async () => {
    const { authHeaders } = getAuthContext();

    try {
      setLoading(true);

      // API endpoint: GET /v1/customer/watchlist
      const res = await fetch(`${API}/v1/customer/watchlist`, { headers: authHeaders });
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleDelete = async (id) => {
    const { authHeaders } = getAuthContext();

    try {
      // API endpoint: DELETE /v1/customer/watchlist/{watchlist_id}
      const res = await fetch(`${API}/v1/customer/watchlist/${id}`, {
        method: "DELETE",
        headers: authHeaders,
      });
      if (res.status === 401) {
        clearAuth();
        navigate("/login", { replace: true });
        return;
      }
      if (!res.ok) {
        throw new Error("Failed to remove item");
      }
      fetchData();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleThresholdChange = async (id, threshold) => {
    const { authHeaders } = getAuthContext();

    try {
      // API endpoint: PATCH /v1/customer/watchlist/{watchlist_id}
      const res = await fetch(`${API}/v1/customer/watchlist/${id}`, {
        method: "PATCH",
        headers: authHeaders,
        body: JSON.stringify({ alert_threshold_pct: threshold }),
      });
      if (res.status === 401) {
        clearAuth();
        navigate("/login", { replace: true });
        return;
      }
      if (!res.ok) {
        throw new Error("Failed to update threshold");
      }
      fetchData();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleOpen = (url) => {
    if (url) {
      window.open(url, "_blank", "noopener,noreferrer");
    }
  };

  return (
    <CustomerLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold text-[#E6EDF3]">Watchlist</h2>
          <ActionButton onClick={fetchData}>Refresh</ActionButton>
        </div>

        {error ? <p className="rounded-lg border border-[#F85149]/40 bg-[#F85149]/10 p-3 text-sm text-[#F85149]">{error}</p> : null}

        <WatchlistTable
          loading={loading}
          items={data}
          onDelete={handleDelete}
          onThresholdChange={handleThresholdChange}
          onOpen={handleOpen}
        />
      </div>
    </CustomerLayout>
  );
}
