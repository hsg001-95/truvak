import { useMemo, useState } from 'react';
import {
  getActiveMerchantId,
  getAreaIntelligence,
  getBuyerHistory,
  scoreOrder,
} from '../services/api';

function nextOrderId() {
  return `ORD-${Date.now()}`;
}

export default function ScoreOrder() {
  const merchantId = getActiveMerchantId();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [scoreResult, setScoreResult] = useState(null);
  const [areaResult, setAreaResult] = useState(null);
  const [buyerResult, setBuyerResult] = useState(null);
  const [form, setForm] = useState({
    order_id: nextOrderId(),
    raw_buyer_id: '9999988888',
    order_value: 1500,
    is_cod: 1,
    pin_code: '560001',
    item_count: 1,
    installments: 1,
    order_month: new Date().getMonth() + 1,
  });

  const scoreColor = useMemo(() => {
    if (!scoreResult) return 'text-on-surface';
    if (scoreResult.risk_level === 'HIGH') return 'text-error';
    if (scoreResult.risk_level === 'MEDIUM') return 'text-tertiary';
    return 'text-emerald-400';
  }, [scoreResult]);

  const onChange = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    const payload = {
      ...form,
      merchant_id: merchantId,
      order_value: Number(form.order_value),
      is_cod: Number(form.is_cod),
      item_count: Number(form.item_count),
      installments: Number(form.installments),
      order_month: Number(form.order_month),
    };

    try {
      const score = await scoreOrder(payload);
      if (!score) throw new Error('Scoring request failed');
      setScoreResult(score);

      const [area, buyer] = await Promise.all([
        getAreaIntelligence(form.pin_code),
        getBuyerHistory(score.hashed_buyer_id, merchantId),
      ]);
      setAreaResult(area);
      setBuyerResult(buyer);
      setForm((prev) => ({ ...prev, order_id: nextOrderId() }));
    } catch (err) {
      setError(err.message || 'Failed to score order');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-20">
      <h1 className="text-2xl font-bold border-b border-outline-variant/10 pb-4 text-on-surface">Score Order</h1>

      <div className="bg-surface-container-low border border-outline-variant/10 rounded-xl p-6">
        <p className="text-xs text-on-surface-variant uppercase tracking-widest mb-4">Merchant: {merchantId}</p>
        <form onSubmit={onSubmit} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <input className="bg-[#0D1117] border border-[#30363D] rounded-lg px-3 py-2" value={form.order_id} onChange={(e) => onChange('order_id', e.target.value)} placeholder="Order ID" required />
          <input className="bg-[#0D1117] border border-[#30363D] rounded-lg px-3 py-2" value={form.raw_buyer_id} onChange={(e) => onChange('raw_buyer_id', e.target.value)} placeholder="Buyer phone/email" required />
          <input className="bg-[#0D1117] border border-[#30363D] rounded-lg px-3 py-2" type="number" value={form.order_value} onChange={(e) => onChange('order_value', e.target.value)} placeholder="Order value" min="1" required />
          <input className="bg-[#0D1117] border border-[#30363D] rounded-lg px-3 py-2" value={form.pin_code} onChange={(e) => onChange('pin_code', e.target.value)} placeholder="PIN code" required />
          <select className="bg-[#0D1117] border border-[#30363D] rounded-lg px-3 py-2" value={form.is_cod} onChange={(e) => onChange('is_cod', Number(e.target.value))}>
            <option value={1}>COD</option>
            <option value={0}>Prepaid</option>
          </select>
          <input className="bg-[#0D1117] border border-[#30363D] rounded-lg px-3 py-2" type="number" value={form.item_count} onChange={(e) => onChange('item_count', e.target.value)} min="1" placeholder="Item count" />
          <input className="bg-[#0D1117] border border-[#30363D] rounded-lg px-3 py-2" type="number" value={form.installments} onChange={(e) => onChange('installments', e.target.value)} min="1" placeholder="Installments" />
          <input className="bg-[#0D1117] border border-[#30363D] rounded-lg px-3 py-2" type="number" value={form.order_month} onChange={(e) => onChange('order_month', e.target.value)} min="1" max="12" placeholder="Order month" />

          <div className="md:col-span-2 lg:col-span-4 flex gap-3">
            <button type="submit" disabled={loading} className="px-4 py-2 bg-primary text-black rounded-md text-sm font-bold disabled:opacity-60">
              {loading ? 'Scoring...' : 'Run Score'}
            </button>
          </div>
        </form>
        {error ? <p className="text-error text-sm mt-3">{error}</p> : null}
      </div>

      {scoreResult ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-surface-container-low border border-outline-variant/10 rounded-xl p-6">
            <h2 className="text-lg font-bold text-on-surface mb-4">Scoring Result</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div><p className="text-xs text-on-surface-variant">Order</p><p className="font-mono text-sm">{scoreResult.order_id}</p></div>
              <div><p className="text-xs text-on-surface-variant">Score</p><p className={`text-2xl font-bold ${scoreColor}`}>{scoreResult.score}</p></div>
              <div><p className="text-xs text-on-surface-variant">Risk</p><p className={`font-bold ${scoreColor}`}>{scoreResult.risk_level}</p></div>
              <div><p className="text-xs text-on-surface-variant">Action</p><p className="font-semibold uppercase text-sm">{scoreResult.recommended_action}</p></div>
            </div>
            <div className="mt-4">
              <p className="text-xs text-on-surface-variant mb-2">Factors</p>
              <ul className="text-sm list-disc pl-5 space-y-1">
                {(scoreResult.factors || []).map((f) => <li key={f}>{f}</li>)}
              </ul>
            </div>
          </div>

          <div className="bg-surface-container-low border border-outline-variant/10 rounded-xl p-6">
            <h3 className="text-sm font-bold uppercase tracking-widest text-on-surface-variant mb-3">Buyer History</h3>
            {buyerResult ? (
              <div className="space-y-2 text-sm">
                <div className="flex justify-between"><span>Total Orders</span><span>{buyerResult.total_orders}</span></div>
                <div className="flex justify-between"><span>RTO Count</span><span>{buyerResult.rto_count}</span></div>
                <div className="flex justify-between"><span>Avg Score</span><span>{buyerResult.avg_score}</span></div>
                <div className="flex justify-between"><span>Profile</span><span className="text-right">{buyerResult.risk_profile}</span></div>
              </div>
            ) : <p className="text-sm text-on-surface-variant">No buyer history available.</p>}
          </div>

          <div className="lg:col-span-3 bg-surface-container-low border border-outline-variant/10 rounded-xl p-6">
            <h3 className="text-sm font-bold uppercase tracking-widest text-on-surface-variant mb-3">Area Intelligence</h3>
            {areaResult ? (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                <div><p className="text-xs text-on-surface-variant">PIN</p><p>{areaResult.pin_code}</p></div>
                <div><p className="text-xs text-on-surface-variant">Tier</p><p>{areaResult.tier_label}</p></div>
                <div><p className="text-xs text-on-surface-variant">Area RTO</p><p>{areaResult.area_rto_rate}%</p></div>
                <div><p className="text-xs text-on-surface-variant">COD Pref</p><p>{areaResult.cod_preference}%</p></div>
              </div>
            ) : <p className="text-sm text-on-surface-variant">Area intelligence unavailable.</p>}
          </div>
        </div>
      ) : null}
    </div>
  );
}
