import { useState, useEffect } from 'react';
import { getActiveMerchantId, getOrders } from '../services/api';

export default function BuyerManagement() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('history');

  useEffect(() => {
    async function load() {
      const data = await getOrders(getActiveMerchantId());
      setOrders(data);
      setLoading(false);
    }
    load();
  }, []);

  if (loading) return <div className="text-on-surface-variant animate-pulse p-8">Loading buyer data...</div>;

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
    <div className="space-y-6 max-w-7xl mx-auto pb-20">
      <h1 className="text-2xl font-bold border-b border-outline-variant/10 pb-4 text-on-surface">👥 Buyer Management</h1>
      
      <div className="flex border-b border-outline-variant/10 mb-6 font-['Inter']">
        <button 
          className={`py-3 px-6 font-semibold border-b-2 transition-colors ${activeTab === 'history' ? 'border-primary text-primary' : 'border-transparent text-on-surface-variant hover:text-white'}`}
          onClick={() => setActiveTab('history')}
        >📋 Buyer History</button>
        <button 
          className={`py-3 px-6 font-semibold border-b-2 transition-colors ${activeTab === 'blacklist' ? 'border-primary text-primary' : 'border-transparent text-on-surface-variant hover:text-white'}`}
          onClick={() => setActiveTab('blacklist')}
        >🚫 Blacklist</button>
        <button 
          className={`py-3 px-6 font-semibold border-b-2 transition-colors ${activeTab === 'whitelist' ? 'border-primary text-primary' : 'border-transparent text-on-surface-variant hover:text-white'}`}
          onClick={() => setActiveTab('whitelist')}
        >✅ Whitelist</button>
      </div>

      {activeTab === 'history' && (
        <div className="bg-surface-container-low border border-outline-variant/10 rounded-xl p-6">
          <h2 className="text-lg font-bold mb-4 text-on-surface">Recent Buyer Profiles</h2>
          {profiles.length === 0 ? (
            <div className="text-sm border border-outline-variant/10 bg-surface-container-lowest rounded p-4 text-center text-on-surface-variant italic">
              No buyer history found for the selected merchant yet.
            </div>
          ) : (
          <div className="overflow-x-auto rounded-lg border border-outline-variant/10">
            <table className="w-full border-collapse text-sm bg-surface-container-lowest">
              <thead>
                <tr>
                  <th className="text-[11px] text-on-surface-variant font-medium text-left px-4 py-3 border-b border-outline-variant/10 uppercase tracking-widest bg-surface-container-highest">Hashed Buyer</th>
                  <th className="text-[11px] text-on-surface-variant font-medium text-right px-4 py-3 border-b border-outline-variant/10 uppercase tracking-widest bg-surface-container-highest">Orders</th>
                  <th className="text-[11px] text-on-surface-variant font-medium text-right px-4 py-3 border-b border-outline-variant/10 uppercase tracking-widest bg-surface-container-highest">Avg Score</th>
                  <th className="text-[11px] text-on-surface-variant font-medium text-right px-4 py-3 border-b border-outline-variant/10 uppercase tracking-widest bg-surface-container-highest">Total Value</th>
                  <th className="text-[11px] text-on-surface-variant font-medium text-right px-4 py-3 border-b border-outline-variant/10 uppercase tracking-widest bg-surface-container-highest">High Risk</th>
                  <th className="text-[11px] text-on-surface-variant font-medium text-right px-4 py-3 border-b border-outline-variant/10 uppercase tracking-widest bg-surface-container-highest">Blocked</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/10">
                {profiles.slice(0, 15).map(b => (
                  <tr key={b.id} className="hover:bg-surface-bright/20 transition-colors">
                    <td className="px-4 py-4 font-mono text-xs text-on-surface-variant">{b.id.substring(0, 16)}...</td>
                    <td className="px-4 py-4 text-right font-semibold text-on-surface">{b.orders}</td>
                    <td className="px-4 py-4 text-right text-primary font-bold">{b.avgScore}%</td>
                    <td className="px-4 py-4 text-right text-on-surface">₹{b.valueSum.toLocaleString()}</td>
                    <td className="px-4 py-4 text-right text-error font-medium">{b.highRisk}</td>
                    <td className="px-4 py-4 text-right text-on-surface">{b.blocked}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          )}
        </div>
      )}

      {activeTab === 'blacklist' && (
        <div className="bg-surface-container-low border border-outline-variant/10 rounded-xl p-6">
           <h2 className="text-lg font-bold mb-2 text-on-surface">🚫 Blacklisted Buyers</h2>
           <p className="text-sm text-on-surface-variant mb-6">Blacklisted buyers will always receive block_cod action regardless of score.</p>
           {/* Mock list */}
           <div className="text-sm border border-outline-variant/10 bg-surface-container-lowest rounded p-4 text-center text-on-surface-variant italic">No blacklisted buyers yet.</div>
        </div>
      )}

      {activeTab === 'whitelist' && (
        <div className="bg-surface-container-low border border-outline-variant/10 rounded-xl p-6">
           <h2 className="text-lg font-bold mb-2 text-on-surface">✅ Whitelisted Buyers</h2>
           <p className="text-sm text-on-surface-variant mb-6">Whitelisted buyers always receive approve action regardless of score.</p>
           {/* Mock list */}
           <div className="text-sm border border-outline-variant/10 bg-surface-container-lowest rounded p-4 text-center text-on-surface-variant italic">No whitelisted buyers yet.</div>
        </div>
      )}

    </div>
  );
}
