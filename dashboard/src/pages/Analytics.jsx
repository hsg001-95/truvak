import { useEffect, useMemo, useState } from 'react';
import { getActiveMerchantId, getOrders, getOutcomes } from '../services/api';

function formatPct(value) {
  return `${(value * 100).toFixed(1)}%`;
}

export default function Analytics() {
  const merchantId = getActiveMerchantId();
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState([]);
  const [outcomes, setOutcomes] = useState([]);

  useEffect(() => {
    let alive = true;

    async function load() {
      setLoading(true);
      const [orderRows, outcomeRows] = await Promise.all([
        getOrders(merchantId),
        getOutcomes(merchantId),
      ]);
      if (!alive) return;
      setOrders(orderRows || []);
      setOutcomes(outcomeRows || []);
      setLoading(false);
    }

    load();
    return () => {
      alive = false;
    };
  }, [merchantId]);

  const metrics = useMemo(() => {
    const totalOrders = orders.length;
    const highRisk = orders.filter((o) => Number(o.score) < 35).length;
    const midRisk = orders.filter((o) => Number(o.score) >= 35 && Number(o.score) < 60).length;
    const avgScore = totalOrders
      ? orders.reduce((sum, o) => sum + Number(o.score || 0), 0) / totalOrders
      : 0;

    const delivered = outcomes.filter((o) => o.result === 'delivered').length;
    const rto = outcomes.filter((o) => o.result === 'rto').length;
    const returned = outcomes.filter((o) => o.result === 'return').length;
    const known = delivered + rto + returned;
    const rtoRate = known ? rto / known : 0;

    return {
      totalOrders,
      highRisk,
      midRisk,
      avgScore,
      delivered,
      rto,
      returned,
      rtoRate,
      known,
    };
  }, [orders, outcomes]);

  const recentOrders = useMemo(() => {
    return [...orders]
      .sort((a, b) => new Date(b.scored_at || 0) - new Date(a.scored_at || 0))
      .slice(0, 10);
  }, [orders]);

  if (loading) {
    return <div className="text-on-surface-variant animate-pulse p-8">Loading analytics...</div>;
  }

  return (
    <div className="space-y-8 max-w-7xl mx-auto pb-20">
      <div className="border-b border-outline-variant/10 pb-6">
        <h1 className="text-3xl font-bold text-on-surface mb-2">Analytics</h1>
        <p className="text-on-surface-variant">
          Live insights from scored orders and recorded outcomes for {merchantId}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-surface-container-low rounded-xl border border-outline-variant/10 p-6">
          <p className="text-sm text-on-surface-variant">Total Scored Orders</p>
          <p className="text-2xl font-bold text-on-surface mt-1">{metrics.totalOrders}</p>
        </div>
        <div className="bg-surface-container-low rounded-xl border border-outline-variant/10 p-6">
          <p className="text-sm text-on-surface-variant">High Risk Orders</p>
          <p className="text-2xl font-bold text-error mt-1">{metrics.highRisk}</p>
          <p className="text-xs text-on-surface-variant mt-1">Score &lt; 35</p>
        </div>
        <div className="bg-surface-container-low rounded-xl border border-outline-variant/10 p-6">
          <p className="text-sm text-on-surface-variant">Average Trust Score</p>
          <p className="text-2xl font-bold text-primary mt-1">{metrics.avgScore.toFixed(1)}</p>
        </div>
        <div className="bg-surface-container-low rounded-xl border border-outline-variant/10 p-6">
          <p className="text-sm text-on-surface-variant">Observed RTO Rate</p>
          <p className="text-2xl font-bold text-tertiary mt-1">{formatPct(metrics.rtoRate)}</p>
          <p className="text-xs text-on-surface-variant mt-1">From {metrics.known} outcomes</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-surface-container-low rounded-xl border border-outline-variant/10 p-6">
          <h3 className="text-lg font-semibold text-on-surface mb-4">Outcome Breakdown</h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span>Delivered</span>
              <span className="font-semibold text-emerald-400">{metrics.delivered}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span>RTO</span>
              <span className="font-semibold text-error">{metrics.rto}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span>Return</span>
              <span className="font-semibold text-tertiary">{metrics.returned}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span>Mid Risk (35-59)</span>
              <span className="font-semibold text-amber-400">{metrics.midRisk}</span>
            </div>
          </div>
        </div>

        <div className="bg-surface-container-low rounded-xl border border-outline-variant/10 p-6">
          <h3 className="text-lg font-semibold text-on-surface mb-4">Quick Ratios</h3>
          <div className="space-y-3 text-sm text-on-surface-variant">
            <p>
              High-Risk Share:{' '}
              <span className="text-on-surface font-semibold">
                {metrics.totalOrders ? formatPct(metrics.highRisk / metrics.totalOrders) : '0.0%'}
              </span>
            </p>
            <p>
              Outcome Coverage:{' '}
              <span className="text-on-surface font-semibold">
                {metrics.totalOrders ? formatPct(metrics.known / metrics.totalOrders) : '0.0%'}
              </span>
            </p>
            <p>
              RTO among outcomes:{' '}
              <span className="text-on-surface font-semibold">{formatPct(metrics.rtoRate)}</span>
            </p>
          </div>
        </div>
      </div>

      <div className="bg-surface-container-low rounded-xl border border-outline-variant/10 p-6">
        <h3 className="text-lg font-semibold text-on-surface mb-4">Recent Scored Orders</h3>
        {recentOrders.length === 0 ? (
          <p className="text-sm text-on-surface-variant">No scored orders available yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-outline-variant/20">
                  <th className="text-left py-3 text-xs font-medium text-on-surface-variant uppercase tracking-wider">Order ID</th>
                  <th className="text-left py-3 text-xs font-medium text-on-surface-variant uppercase tracking-wider">Score</th>
                  <th className="text-left py-3 text-xs font-medium text-on-surface-variant uppercase tracking-wider">P(RTO)</th>
                  <th className="text-left py-3 text-xs font-medium text-on-surface-variant uppercase tracking-wider">COD</th>
                  <th className="text-left py-3 text-xs font-medium text-on-surface-variant uppercase tracking-wider">Scored At</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/10">
                {recentOrders.map((row) => (
                  <tr key={row.order_id} className="hover:bg-surface-container-high/30 transition-colors">
                    <td className="py-4 text-sm font-mono text-on-surface">{row.order_id}</td>
                    <td className="py-4 text-sm text-on-surface">{Number(row.score || 0).toFixed(1)}</td>
                    <td className="py-4 text-sm text-on-surface">{Number(row.p_rto || 0).toFixed(3)}</td>
                    <td className="py-4 text-sm text-on-surface-variant">{row.is_cod ? 'Yes' : 'No'}</td>
                    <td className="py-4 text-sm text-on-surface-variant">
                      {row.scored_at ? new Date(row.scored_at).toLocaleString() : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
