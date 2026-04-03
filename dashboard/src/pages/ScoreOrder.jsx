import { useState } from 'react';
import { scoreOrder } from '../services/api';

export default function ScoreOrder() {
  const [formData, setFormData] = useState({
    order_id: `ORD-${Math.floor(Math.random() * 9000) + 1000}`,
    buyer_phone: '9876543210',
    order_value: 1500,
    pin_code: '828001',
    payment: 'COD',
    item_count: 1,
    order_month: new Date().getMonth() + 1
  });
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    const payload = {
      order_id: formData.order_id,
      raw_buyer_id: formData.buyer_phone,
      merchant_id: "merchant_shopify",
      order_value: Number(formData.order_value),
      is_cod: formData.payment === "COD" ? 1 : 0,
      pin_code: formData.pin_code,
      item_count: Number(formData.item_count),
      installments: 1,
      order_month: Number(formData.order_month),
    };
    const res = await scoreOrder(payload);
    setResult(res);
    setLoading(false);
  };

  return (
    <div className="max-w-3xl space-y-6">
      <h1 className="text-2xl font-bold border-b border-dark-border pb-4">➕ Score a New Order</h1>
      
      <div className="bg-dark-paper border border-dark-border rounded-xl p-6">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs uppercase text-brand-muted mb-1 font-semibold">Order ID</label>
              <input required type="text" className="input-field" value={formData.order_id} onChange={e => setFormData({...formData, order_id: e.target.value})} />
            </div>
            <div>
              <label className="block text-xs uppercase text-brand-muted mb-1 font-semibold">Buyer Phone/Email</label>
              <input required type="text" className="input-field" value={formData.buyer_phone} onChange={e => setFormData({...formData, buyer_phone: e.target.value})} />
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs uppercase text-brand-muted mb-1 font-semibold">Order Value (₹)</label>
              <input required type="number" className="input-field" value={formData.order_value} onChange={e => setFormData({...formData, order_value: e.target.value})} />
            </div>
            <div>
              <label className="block text-xs uppercase text-brand-muted mb-1 font-semibold">PIN Code</label>
              <input required type="text" className="input-field" value={formData.pin_code} onChange={e => setFormData({...formData, pin_code: e.target.value})} />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-xs uppercase text-brand-muted mb-1 font-semibold">Payment</label>
              <select className="input-field" value={formData.payment} onChange={e => setFormData({...formData, payment: e.target.value})}>
                <option>COD</option>
                <option>Prepaid</option>
              </select>
            </div>
            <div>
              <label className="block text-xs uppercase text-brand-muted mb-1 font-semibold">Items</label>
              <input required type="number" min="1" className="input-field" value={formData.item_count} onChange={e => setFormData({...formData, item_count: e.target.value})} />
            </div>
            <div>
              <label className="block text-xs uppercase text-brand-muted mb-1 font-semibold">Month</label>
              <input required type="number" min="1" max="12" className="input-field" value={formData.order_month} onChange={e => setFormData({...formData, order_month: e.target.value})} />
            </div>
          </div>

          <button type="submit" disabled={loading} className="w-full btn-primary py-3 text-base flex justify-center items-center">
             {loading ? <span className="animate-pulse">Scoring...</span> : <span>🔍 Get Trust Score</span>}
          </button>
        </form>
      </div>

      {result && result.score && (
        <div className="bg-[#1a386b]/10 border border-brand-blue rounded-xl p-6 mt-6">
          <h2 className="text-lg font-bold mb-4 flex items-center space-x-2">
             <span>Result for</span> <span className="bg-brand-blue text-white px-2 rounded text-sm">{formData.order_id}</span>
          </h2>
          <div className="grid grid-cols-4 gap-4 bg-dark-bg p-4 rounded-lg border border-dark-border mb-4">
             <div>
               <div className="text-xs text-brand-muted">Trust Score</div>
               <div className="text-xl font-bold">{result.score}/100</div>
             </div>
             <div>
               <div className="text-xs text-brand-muted">Risk Level</div>
               <div className="text-xl font-bold">{result.risk_level}</div>
             </div>
             <div>
               <div className="text-xs text-brand-muted">Action</div>
               <div className="text-xl font-bold uppercase text-sm tracking-wider mt-1">{result.recommended_action?.replace('_', ' ')}</div>
             </div>
             <div>
               <div className="text-xs text-brand-muted">RTO Prob</div>
               <div className="text-xl font-bold">{(result.model_rto_prob * 100).toFixed(1)}%</div>
             </div>
          </div>
          
          <div className="w-full bg-dark-grid rounded-full h-2.5 mb-6">
             <div className={`h-2.5 rounded-full ${result.score >= 70 ? 'bg-brand-green' : result.score >= 40 ? 'bg-brand-amber' : 'bg-brand-red'}`} style={{width: `${result.score}%`}}></div>
          </div>

          {result.factors && result.factors.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold mb-2">Risk Factors</h3>
              <ul className="list-disc pl-5 text-sm space-y-1 text-brand-muted">
                {result.factors.map((f, i) => <li key={i}>{f}</li>)}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
