import { useState } from 'react';
import { getProductAnalysis } from '../services/api';
import { extractProductId } from '../utils/reviewProduct';

export default function SuspiciousProducts() {
  const [productListRaw, setProductListRaw] = useState('');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const run = async () => {
    setError('');
    const productInputs = productListRaw
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(0, 30);

    if (!productInputs.length) {
      setError('Enter product URLs or ids, one per line.');
      return;
    }

    setLoading(true);
    const resolved = [];
    for (const input of productInputs) {
      const productId = extractProductId(input);
      if (!productId) continue;
      const analysis = await getProductAnalysis(productId);
      if (analysis) {
        resolved.push({
          product_id: analysis.product_id,
          authenticity_score: Number(analysis.authenticity_score || 0),
          fake_review_percentage: Number(analysis.fake_review_percentage || 0),
          verdict: analysis.overall_verdict,
        });
      }
    }

    resolved.sort((a, b) => a.authenticity_score - b.authenticity_score);
    setRows(resolved);
    setLoading(false);
  };

  return (
    <div className="max-w-7xl mx-auto p-4 md:p-8 pb-20 space-y-6">
      <section className="bg-surface-container-low border border-outline-variant/10 rounded-xl p-6 space-y-4">
        <h1 className="text-xl font-bold text-on-surface">Suspicious Products</h1>
        <textarea
          className="w-full min-h-[160px] bg-surface-container-highest rounded-lg px-4 py-3 text-sm text-on-surface"
          placeholder="One product URL/id per line"
          value={productListRaw}
          onChange={(e) => setProductListRaw(e.target.value)}
        />
        <div className="flex items-center gap-3">
          <button onClick={run} disabled={loading} className="px-5 py-2.5 rounded-lg bg-primary text-on-primary font-semibold disabled:opacity-60">
            {loading ? 'Scanning...' : 'Scan Products'}
          </button>
          {error ? <span className="text-xs text-error">{error}</span> : null}
        </div>
      </section>

      <section className="bg-surface-container-low border border-outline-variant/10 rounded-xl p-6">
        {rows.length === 0 ? (
          <p className="text-sm text-on-surface-variant">No analyzed products found yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-on-surface-variant border-b border-outline-variant/20">
                  <th className="py-2 text-left">Product</th>
                  <th className="py-2 text-left">Authenticity</th>
                  <th className="py-2 text-left">Fake %</th>
                  <th className="py-2 text-left">Verdict</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.product_id} className="border-b border-outline-variant/10">
                    <td className="py-2">{row.product_id}</td>
                    <td className="py-2">{row.authenticity_score}%</td>
                    <td className="py-2">{row.fake_review_percentage}%</td>
                    <td className="py-2">{row.verdict}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
