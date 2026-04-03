import { useState, useEffect } from 'react';
import { getOrders } from '../services/api';

export default function BuyerManagement() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('history');

  useEffect(() => {
    async function load() {
      const data = await getOrders("merchant_shopify");
      setOrders(data);
      setLoading(false);
    }
    load();
  }, []);

  if (loading) return <div className="text-brand-muted animate-pulse">Loading buyer data...</div>;

  // Derive Buyer Profiles
  const buyersMap = {};
  orders.forEach(o => {
    const id = o.buyer_id || o.raw_buyer_id || o.customer_phone || `user_${o.id}`;
    if (!buyersMap[id]) {
      buyersMap[id] = { id, orders: 0, scoreSum: 0, valueSum: 0, highRisk: 0, blocked: 0 };
    }
    buyersMap[id].orders += 1;
    buyersMap[id].scoreSum += (o.score || 0);
    buyersMap[id].valueSum += (o.order_value || 0);
    if (o.risk_level === "HIGH") buyersMap[id].highRisk += 1;
    if (o.recommended_action === "block_cod") buyersMap[id].blocked += 1;
  });

  const profiles = Object.values(buyersMap).map(b => ({
    ...b,
    avgScore: b.orders ? Math.round(b.scoreSum / b.orders) : 0
  })).sort((a,b) => b.orders - a.orders);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold border-b border-dark-border pb-4">👥 Buyer Management</h1>
      
      <div className="flex border-b border-dark-border mb-6">
        <button 
          className={`py-3 px-6 font-semibold border-b-2 transition-colors ${activeTab === 'history' ? 'border-brand-blue text-brand-blue' : 'border-transparent text-brand-muted hover:text-white'}`}
          onClick={() => setActiveTab('history')}
        >📋 Buyer History</button>
        <button 
          className={`py-3 px-6 font-semibold border-b-2 transition-colors ${activeTab === 'blacklist' ? 'border-brand-blue text-brand-blue' : 'border-transparent text-brand-muted hover:text-white'}`}
          onClick={() => setActiveTab('blacklist')}
        >🚫 Blacklist</button>
        <button 
          className={`py-3 px-6 font-semibold border-b-2 transition-colors ${activeTab === 'whitelist' ? 'border-brand-blue text-brand-blue' : 'border-transparent text-brand-muted hover:text-white'}`}
          onClick={() => setActiveTab('whitelist')}
        >✅ Whitelist</button>
      </div>

      {activeTab === 'history' && (
        <div>
          <h2 className="text-lg font-bold mb-4">Recent Buyer Profiles</h2>
          <div className="overflow-x-auto rounded-xl border border-dark-border">
            <table className="table-container">
              <thead>
                <tr>
                  <th className="table-header">Hashed Buyer</th>
                  <th className="table-header text-right">Orders</th>
                  <th className="table-header text-right">Avg Score</th>
                  <th className="table-header text-right">Total Value</th>
                  <th className="table-header text-right">High Risk</th>
                  <th className="table-header text-right">Blocked</th>
                </tr>
              </thead>
              <tbody>
                {profiles.slice(0, 15).map(b => (
                  <tr key={b.id} className="hover:bg-dark-grid transition-colors">
                    <td className="table-cell font-mono text-xs">{b.id.substring(0, 16)}...</td>
                    <td className="table-cell text-right font-semibold">{b.orders}</td>
                    <td className="table-cell text-right text-brand-blue font-bold">{b.avgScore}%</td>
                    <td className="table-cell text-right">₹{b.valueSum.toLocaleString()}</td>
                    <td className="table-cell text-right text-brand-red">{b.highRisk}</td>
                    <td className="table-cell text-right">{b.blocked}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'blacklist' && (
        <div className="bg-dark-paper border border-dark-border rounded-xl p-6">
           <h2 className="text-lg font-bold mb-2">🚫 Blacklisted Buyers</h2>
           <p className="text-sm text-brand-muted mb-6">Blacklisted buyers will always receive block_cod action regardless of score.</p>
           {/* Mock list */}
           <div className="text-sm border border-dark-grid rounded p-4 text-center">No blacklisted buyers yet.</div>
        </div>
      )}

      {activeTab === 'whitelist' && (
        <div className="bg-dark-paper border border-dark-border rounded-xl p-6">
           <h2 className="text-lg font-bold mb-2">✅ Whitelisted Buyers</h2>
           <p className="text-sm text-brand-muted mb-6">Whitelisted buyers always receive approve action regardless of score.</p>
           {/* Mock list */}
           <div className="text-sm border border-dark-grid rounded p-4 text-center">No whitelisted buyers yet.</div>
        </div>
      )}

    </div>
  );
}
