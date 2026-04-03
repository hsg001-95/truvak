import { useState, useEffect } from 'react';
import { getOrders, logOutcome } from '../services/api';

export default function LiveOrders() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState({ risk: "All", action: "All", payment: "All" });

  useEffect(() => {
    async function load() {
      const data = await getOrders("merchant_shopify");
      setOrders(data);
      setLoading(false);
    }
    load();
  }, []);

  const handleLog = async (orderId, result) => {
    await logOutcome(orderId, "merchant_shopify", "buyer-placeholder", result);
    alert(`Logged ${result} for ${orderId}`);
  };

  if (loading) return <div className="animate-pulse text-brand-muted">Loading live orders...</div>;

  const filteredOrders = orders.filter(o => {
    if (filter.risk !== "All" && o.risk_level !== filter.risk) return false;
    if (filter.action !== "All" && o.recommended_action !== filter.action) return false;
    if (filter.payment === "COD" && o.is_cod !== 1) return false;
    if (filter.payment === "Prepaid" && o.is_cod !== 0) return false;
    return true;
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold border-b border-dark-border pb-4">🛍️ Live Orders</h1>
      
      {/* Filters */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div>
          <label className="block text-xs uppercase text-brand-muted mb-1 font-semibold">Risk</label>
          <select 
            className="input-field" 
            value={filter.risk}
            onChange={(e) => setFilter({...filter, risk: e.target.value})}
          >
            <option>All</option>
            <option>HIGH</option>
            <option>MEDIUM</option>
            <option>LOW</option>
          </select>
        </div>
        <div>
          <label className="block text-xs uppercase text-brand-muted mb-1 font-semibold">Action</label>
          <select 
            className="input-field" 
            value={filter.action}
            onChange={(e) => setFilter({...filter, action: e.target.value})}
          >
            <option>All</option>
            <option value="block_cod">block_cod</option>
            <option value="warn">warn</option>
            <option value="approve">approve</option>
          </select>
        </div>
        <div>
          <label className="block text-xs uppercase text-brand-muted mb-1 font-semibold">Payment</label>
          <select 
            className="input-field" 
            value={filter.payment}
            onChange={(e) => setFilter({...filter, payment: e.target.value})}
          >
            <option>All</option>
            <option>COD</option>
            <option>Prepaid</option>
          </select>
        </div>
      </div>

      <div className="text-sm font-semibold mb-2">Showing {filteredOrders.length} of {orders.length} orders</div>

      <div className="space-y-3">
        {filteredOrders.map(row => (
          <div key={row.id} className="bg-dark-paper border border-dark-border rounded-xl p-4">
            <div className="flex justify-between items-center mb-4">
              <div className="font-bold text-lg flex items-center space-x-2">
                <span>{row.score < 40 ? '🔴' : row.score < 70 ? '🟡' : '🟢'}</span>
                <span>{row.id}</span>
              </div>
              <div className="text-sm">
                Score: <span className="font-bold text-brand-text">{row.score}</span> · ₹{row.order_value?.toLocaleString()}
              </div>
            </div>
            
            <div className="grid grid-cols-4 gap-4 mb-4 bg-dark-bg p-3 rounded-lg border border-dark-grid">
               <div>
                  <div className="text-xs text-brand-muted">Trust Score</div>
                  <div className="font-semibold">{row.score}/100</div>
               </div>
               <div>
                  <div className="text-xs text-brand-muted">Risk Level</div>
                  <div className="font-semibold">{row.risk_level}</div>
               </div>
               <div>
                  <div className="text-xs text-brand-muted">Action</div>
                  <div className="font-semibold text-xs tracking-wider uppercase">{row.recommended_action?.replace('_', ' ')}</div>
               </div>
               <div>
                  <div className="text-xs text-brand-muted">Payment</div>
                  <div className="font-semibold">{row.is_cod ? 'COD' : 'Prepaid'}</div>
               </div>
            </div>

            <div className="flex justify-end space-x-3 mt-4 pt-4 border-t border-dark-grid">
               <button onClick={() => handleLog(row.id, 'delivered')} className="px-4 py-1.5 text-sm font-medium rounded bg-transparent border border-brand-green text-brand-green hover:bg-brand-green hover:text-white transition-colors">✅ Delivered</button>
               <button onClick={() => handleLog(row.id, 'rto')} className="px-4 py-1.5 text-sm font-medium rounded bg-transparent border border-brand-red text-brand-red hover:bg-brand-red hover:text-white transition-colors">📦 RTO</button>
               <button onClick={() => handleLog(row.id, 'return')} className="px-4 py-1.5 text-sm font-medium rounded bg-transparent border border-brand-amber text-brand-amber hover:bg-brand-amber hover:text-white transition-colors">↩️ Return</button>
            </div>
          </div>
        ))}
        {filteredOrders.length === 0 && <div className="text-brand-muted py-8 text-center bg-dark-paper rounded-xl">No orders match the filters.</div>}
      </div>
    </div>
  );
}
