import { useEffect, useMemo, useState } from 'react';
import {
  getActiveMerchantId,
  getOutcomes,
  getRules,
  updateCodThreshold,
} from '../services/api';

export default function RuleConfig() {
  const merchantId = getActiveMerchantId();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [rules, setRules] = useState([]);
  const [outcomes, setOutcomes] = useState([]);
  const [threshold, setThreshold] = useState(35);

  useEffect(() => {
    let alive = true;

    async function load() {
      setLoading(true);
      const [ruleList, outcomeRows] = await Promise.all([
        getRules(merchantId),
        getOutcomes(merchantId),
      ]);
      if (!alive) return;

      setRules(ruleList);
      setOutcomes(outcomeRows);

      const blockRule = ruleList.find((r) => r.rule_name === 'Block COD - High Risk');
      if (blockRule?.condition_value !== undefined) {
        setThreshold(Number(blockRule.condition_value));
      }

      setLoading(false);
    }

    load();
    return () => {
      alive = false;
    };
  }, [merchantId]);

  const outcomeStats = useMemo(() => {
    const total = outcomes.length;
    const rto = outcomes.filter((o) => o.result === 'rto').length;
    const delivered = outcomes.filter((o) => o.result === 'delivered').length;
    const returned = outcomes.filter((o) => o.result === 'return').length;
    return { total, rto, delivered, returned };
  }, [outcomes]);

  const onSaveThreshold = async () => {
    setSaving(true);
    setError('');
    setStatus('');
    const res = await updateCodThreshold(merchantId, threshold);
    if (!res) {
      setError('Failed to update threshold');
    } else {
      setStatus(`Threshold updated to ${res.new_threshold}`);
    }
    setSaving(false);
  };

  if (loading) {
    return <div className="text-on-surface-variant animate-pulse p-8">Loading rule config...</div>;
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-20">
      <h1 className="text-2xl font-bold border-b border-outline-variant/10 pb-4 text-on-surface">Rule Configuration</h1>
      <p className="text-sm text-on-surface-variant">Merchant: {merchantId}</p>

      <div className="bg-surface-container-low border border-outline-variant/10 rounded-xl p-6">
        <h2 className="text-lg font-bold mb-3">COD Block Threshold</h2>
        <p className="text-sm text-on-surface-variant mb-4">Orders below this trust score can be blocked for COD based on rule engine configuration.</p>
        <div className="flex items-center gap-4">
          <input
            type="range"
            min="0"
            max="100"
            value={threshold}
            onChange={(e) => setThreshold(Number(e.target.value))}
            className="w-full"
          />
          <span className="font-mono text-xl text-primary min-w-[48px] text-right">{threshold}</span>
          <button onClick={onSaveThreshold} disabled={saving} className="px-4 py-2 rounded-md bg-primary text-black text-sm font-bold disabled:opacity-60">
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
        {status ? <p className="text-xs text-emerald-400 mt-3">{status}</p> : null}
        {error ? <p className="text-xs text-error mt-3">{error}</p> : null}
      </div>

      <div className="bg-surface-container-low border border-outline-variant/10 rounded-xl p-6">
        <h2 className="text-lg font-bold mb-4">Active Rules</h2>
        {rules.length === 0 ? (
          <p className="text-sm text-on-surface-variant">No rules returned by backend.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="text-on-surface-variant uppercase text-[11px] border-b border-outline-variant/20">
                  <th className="py-2">Rule</th>
                  <th className="py-2">Condition</th>
                  <th className="py-2">Action</th>
                  <th className="py-2">COD Only</th>
                  <th className="py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {rules.map((rule) => (
                  <tr key={rule.rule_name} className="border-b border-outline-variant/10">
                    <td className="py-3">{rule.rule_name}</td>
                    <td className="py-3 font-mono text-xs">{rule.condition_field} {rule.condition_operator} {rule.condition_value}</td>
                    <td className="py-3 uppercase text-xs">{rule.action}</td>
                    <td className="py-3">{rule.cod_only === null ? 'Any' : rule.cod_only ? 'Yes' : 'No'}</td>
                    <td className="py-3">{rule.is_active ? 'Active' : 'Inactive'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-surface-container p-4 rounded-lg border border-outline-variant/10"><p className="text-xs text-outline uppercase">Outcomes Logged</p><p className="text-xl font-bold">{outcomeStats.total}</p></div>
        <div className="bg-surface-container p-4 rounded-lg border border-outline-variant/10"><p className="text-xs text-outline uppercase">Delivered</p><p className="text-xl font-bold text-emerald-400">{outcomeStats.delivered}</p></div>
        <div className="bg-surface-container p-4 rounded-lg border border-outline-variant/10"><p className="text-xs text-outline uppercase">RTO</p><p className="text-xl font-bold text-error">{outcomeStats.rto}</p></div>
        <div className="bg-surface-container p-4 rounded-lg border border-outline-variant/10"><p className="text-xs text-outline uppercase">Return</p><p className="text-xl font-bold text-tertiary">{outcomeStats.returned}</p></div>
      </div>
    </div>
  );
}
