import { useState } from 'react';
import { getProductAnalysis } from '../services/api';
import { extractProductId } from '../utils/reviewProduct';

export default function ProductInsights() {
  const [productUrl, setProductUrl] = useState('');
  const [result, setResult] = useState(null);
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState('');

  const run = async () => {
    setError('');
    const productId = extractProductId(productUrl);
    if (!productId) {
      setError('Enter a valid product URL/id.');
      return;
    }

    setStatus('loading');
    const analysis = await getProductAnalysis(productId);
    if (!analysis) {
      setStatus('no-data');
      setResult(null);
      return;
    }

    setResult(analysis);
    setStatus('ok');
  };

  return (
    <div className="max-w-7xl mx-auto p-4 md:p-8 pb-20 space-y-6">
      <section className="bg-surface-container-low border border-outline-variant/10 rounded-xl p-6 space-y-4">
        <h1 className="text-xl font-bold text-on-surface">Product Insights</h1>
        <div className="flex flex-col md:flex-row gap-3">
          <input
            className="flex-1 bg-surface-container-highest rounded-lg px-4 py-3 text-sm text-on-surface"
            placeholder="Product URL or id"
            value={productUrl}
            onChange={(e) => setProductUrl(e.target.value)}
          />
          <button onClick={run} className="px-5 py-3 rounded-lg bg-primary text-on-primary font-semibold">
            Fetch Insights
          </button>
        </div>
        {error ? <p className="text-xs text-error">{error}</p> : null}
      </section>

      <section className="bg-surface-container-low border border-outline-variant/10 rounded-xl p-6">
        {status === 'loading' ? <p className="text-sm text-on-surface-variant">Loading analysis...</p> : null}
        {status === 'no-data' ? <p className="text-sm text-on-surface-variant">No analysis found for this product.</p> : null}

        {result ? (
          <div className="space-y-3 text-sm">
            <p><span className="text-on-surface-variant">Product:</span> {result.product_id}</p>
            <p><span className="text-on-surface-variant">Authenticity:</span> {result.authenticity_score}%</p>
            <p><span className="text-on-surface-variant">Fake Review Percentage:</span> {result.fake_review_percentage}%</p>
            <p><span className="text-on-surface-variant">Burst Detected:</span> {String(result.burst_detected)}</p>
            <p><span className="text-on-surface-variant">Template Detected:</span> {String(result.template_detected)}</p>
            <p><span className="text-on-surface-variant">Ring Detected:</span> {String(result.ring_detected)}</p>
            <p><span className="text-on-surface-variant">Verdict:</span> {result.overall_verdict}</p>
          </div>
        ) : null}
      </section>
    </div>
  );
}
