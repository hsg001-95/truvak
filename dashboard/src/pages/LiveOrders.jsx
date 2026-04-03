import { useEffect, useMemo, useState } from 'react';
import { getActiveMerchantId, getOrders, logOutcome } from '../services/api';

export default function LiveOrders() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [riskFilter, setRiskFilter] = useState('ALL');
  const [pinFilter, setPinFilter] = useState('');
  const [statusMessage, setStatusMessage] = useState('');

  const merchantId = getActiveMerchantId();

  useEffect(() => {
    let alive = true;

    async function loadInitial() {
      const rows = await getOrders(merchantId);
      if (!alive) return;
      setOrders(rows);
      setLoading(false);
    }

    loadInitial();

    return () => {
      alive = false;
    };
  }, [merchantId]);

  const reload = async () => {
    setLoading(true);
    const rows = await getOrders(merchantId);
    setOrders(rows);
    setLoading(false);
  };

  const filtered = useMemo(() => {
    return orders.filter((o) => {
      if (riskFilter !== 'ALL' && o.risk_level !== riskFilter) return false;
      if (pinFilter && !String(o.pin_code).includes(pinFilter.trim())) return false;
      return true;
    });
  }, [orders, pinFilter, riskFilter]);

  const onOutcome = async (orderId, result) => {
    const ok = await logOutcome(orderId, merchantId, orderId, result);
    setStatusMessage(ok ? `Outcome logged: ${orderId} -> ${result}` : 'Failed to log outcome');
  };

  if (loading) {
    return <div className="text-on-surface-variant animate-pulse p-8">Loading live orders...</div>;
  }

  return (
    <div className="max-w-7xl mx-auto p-4 md:p-8 pb-20 space-y-4">
      <header>
        <h1 className="text-3xl font-extrabold tracking-tight text-white mb-2">Live Orders</h1>
        <p className="text-on-surface-variant text-sm">Merchant: {merchantId}</p>
      </header>

      <section className="bg-[#161B22] border border-[#30363D] rounded-[12px] p-4 flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-[10px] text-slate-500 font-bold tracking-widest uppercase px-1">Risk Level</label>
          <select
            value={riskFilter}
            onChange={(e) => setRiskFilter(e.target.value)}
            className="bg-[#0D1117] border border-[#30363D] rounded-lg text-[#E6EDF3] text-sm py-2 pl-3 pr-8"
          >
            <option value="ALL">All</option>
            <option value="HIGH">High</option>
            <option value="MEDIUM">Medium</option>
            <option value="LOW">Low</option>
          </select>
        </div>

        <div className="flex flex-col gap-1 min-w-[180px]">
          <label className="text-[10px] text-slate-500 font-bold tracking-widest uppercase px-1">PIN Search</label>
          <input
            value={pinFilter}
            onChange={(e) => setPinFilter(e.target.value)}
            className="bg-[#0D1117] border border-[#30363D] rounded-lg text-[#E6EDF3] text-sm py-2 px-3"
            placeholder="e.g. 560"
          />
        </div>

        <button onClick={reload} className="px-3 py-2 border border-[#58a6ff] text-[#58a6ff] rounded-md text-xs font-semibold">Refresh</button>
      </section>

      {statusMessage ? <div className="text-xs text-primary">{statusMessage}</div> : null}

      <div className="bg-[#161B22] border border-[#30363D] rounded-[12px] overflow-hidden overflow-x-auto">
        <table className="w-full text-left border-collapse whitespace-nowrap min-w-max">
          <thead>
            <tr className="bg-surface-container-low/50">
              <th className="px-4 py-4 text-[11px] font-bold text-slate-500 uppercase tracking-widest border-b border-[#30363D]">Order ID</th>
              <th className="px-4 py-4 text-[11px] font-bold text-slate-500 uppercase tracking-widest border-b border-[#30363D] text-right">Amount</th>
              <th className="px-4 py-4 text-[11px] font-bold text-slate-500 uppercase tracking-widest border-b border-[#30363D]">PIN</th>
              <th className="px-4 py-4 text-[11px] font-bold text-slate-500 uppercase tracking-widest border-b border-[#30363D]">Risk</th>
              <th className="px-4 py-4 text-[11px] font-bold text-slate-500 uppercase tracking-widest border-b border-[#30363D]">Score</th>
              <th className="px-4 py-4 text-[11px] font-bold text-slate-500 uppercase tracking-widest border-b border-[#30363D]">Action</th>
              <th className="px-4 py-4 text-[11px] font-bold text-slate-500 uppercase tracking-widest border-b border-[#30363D]">Log Outcome</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#30363D]/40">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-sm text-on-surface-variant">No orders found for selected filters.</td>
              </tr>
            ) : (
              filtered.map((order) => (
                <tr key={order.id} className="hover:bg-[#262a31] transition-colors duration-150">
                  <td className="px-4 py-3 text-sm font-mono text-primary-fixed">{order.id}</td>
                  <td className="px-4 py-3 text-sm text-right">Rs {order.order_value.toLocaleString('en-IN')}</td>
                  <td className="px-4 py-3 text-sm">{order.pin_code}</td>
                  <td className="px-4 py-3 text-sm">{order.risk_level}</td>
                  <td className="px-4 py-3 text-sm">{order.score}</td>
                  <td className="px-4 py-3 text-sm">{order.recommended_action}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <button onClick={() => onOutcome(order.id, 'delivered')} className="text-[11px] px-2 py-1 border border-emerald-500 text-emerald-400 rounded">Delivered</button>
                      <button onClick={() => onOutcome(order.id, 'rto')} className="text-[11px] px-2 py-1 border border-red-500 text-red-400 rounded">RTO</button>
                      <button onClick={() => onOutcome(order.id, 'return')} className="text-[11px] px-2 py-1 border border-yellow-500 text-yellow-400 rounded">Return</button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
