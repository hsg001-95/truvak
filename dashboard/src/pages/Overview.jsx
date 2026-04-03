import { useEffect, useMemo, useState } from 'react';
import { getActiveMerchantId, getOrders } from '../services/api';

function getRiskColor(risk) {
  if (risk === 'HIGH') return 'text-error';
  if (risk === 'MEDIUM') return 'text-tertiary';
  return 'text-emerald-400';
}

export default function Overview() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;

    async function load() {
      const data = await getOrders(getActiveMerchantId());
      if (!alive) return;
      setOrders(data);
      setLoading(false);
    }

    load();
    return () => {
      alive = false;
    };
  }, []);

  const metrics = useMemo(() => {
    const total = orders.length;
    const totalRevenue = orders.reduce((sum, o) => sum + o.order_value, 0);
    const highRisk = orders.filter((o) => o.risk_level === 'HIGH').length;
    const lowRisk = orders.filter((o) => o.risk_level === 'LOW').length;
    const avgScore = total
      ? Math.round(orders.reduce((sum, o) => sum + o.score, 0) / total)
      : 0;

    return {
      total,
      totalRevenue,
      highRisk,
      lowRisk,
      avgScore,
    };
  }, [orders]);

  const alerts = useMemo(() => {
    return orders
      .filter((o) => o.risk_level === 'HIGH' || o.risk_level === 'MEDIUM')
      .slice(0, 8);
  }, [orders]);

  if (loading) {
    return <div className="text-on-surface-variant animate-pulse p-8">Loading overview...</div>;
  }

  return (
    <div className="space-y-8 pb-20">
      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-surface-container-low p-5 rounded-xl border border-outline-variant/10">
          <h3 className="text-on-surface-variant text-xs font-medium tracking-wide uppercase">Total Revenue</h3>
          <p className="text-2xl font-bold text-white mt-1">Rs {metrics.totalRevenue.toLocaleString('en-IN')}</p>
        </div>
        <div className="bg-surface-container-low p-5 rounded-xl border border-outline-variant/10">
          <h3 className="text-on-surface-variant text-xs font-medium tracking-wide uppercase">Orders Scored</h3>
          <p className="text-2xl font-bold text-white mt-1">{metrics.total}</p>
        </div>
        <div className="bg-surface-container-low p-5 rounded-xl border border-outline-variant/10">
          <h3 className="text-on-surface-variant text-xs font-medium tracking-wide uppercase">High Risk Alerts</h3>
          <p className="text-2xl font-bold text-white mt-1">{metrics.highRisk}</p>
        </div>
        <div className="bg-surface-container-low p-5 rounded-xl border border-outline-variant/10">
          <h3 className="text-on-surface-variant text-xs font-medium tracking-wide uppercase">Average Trust Score</h3>
          <p className="text-2xl font-bold text-white mt-1">{metrics.avgScore}</p>
        </div>
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-[#161b22] rounded-xl border border-outline-variant/10 overflow-hidden">
          <div className="p-6 border-b border-outline-variant/10">
            <h2 className="text-lg font-bold text-white tracking-tight">Recent Risk Alerts</h2>
          </div>
          <div className="divide-y divide-outline-variant/5">
            {alerts.length === 0 ? (
              <div className="p-4 text-sm text-on-surface-variant">No medium/high risk alerts for current data.</div>
            ) : (
              alerts.map((order) => (
                <div key={order.id} className="p-4 flex items-center gap-4 hover:bg-surface-container-high transition-colors">
                  <div className={`w-2 h-2 rounded-full shrink-0 ${order.risk_level === 'HIGH' ? 'bg-error' : 'bg-tertiary'}`}></div>
                  <div className="flex-1">
                    <h4 className="text-sm font-semibold text-white">Order {order.id}</h4>
                    <p className="text-xs text-on-surface-variant mt-1">Action: {order.recommended_action} | PIN: {order.pin_code}</p>
                  </div>
                  <div className={`text-xs font-bold ${getRiskColor(order.risk_level)}`}>{order.risk_level}</div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="bg-[#161b22] rounded-xl border border-outline-variant/10 p-6">
          <h2 className="text-sm font-bold text-white tracking-tight mb-6">Risk Distribution</h2>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between"><span>Low Risk</span><span>{metrics.lowRisk}</span></div>
            <div className="flex justify-between"><span>Medium Risk</span><span>{alerts.filter((o) => o.risk_level === 'MEDIUM').length}</span></div>
            <div className="flex justify-between"><span>High Risk</span><span>{metrics.highRisk}</span></div>
          </div>
        </div>
      </section>
    </div>
  );
}
