import { useEffect, useMemo, useState } from 'react';
import { analyzeReviews, getActiveMerchantId, getReviewsHealth } from '../services/api';
import { extractProductId, parseReviewsFromRaw } from '../utils/reviewProduct';

export default function ReviewAnalysis() {
  const [productUrl, setProductUrl] = useState('');
  const [merchantId, setMerchantId] = useState(getActiveMerchantId());
  const [reviewData, setReviewData] = useState('');
  const [health, setHealth] = useState(null);
  const [analysis, setAnalysis] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    (async () => {
      const h = await getReviewsHealth();
      if (alive) setHealth(h);
    })();
    return () => {
      alive = false;
    };
  }, []);

  const metrics = useMemo(() => {
    if (!analysis?.reviews?.length) return null;
    const total = analysis.reviews.length;
    const suspicious = analysis.reviews.filter((r) => r.suspicion_label !== 'GENUINE').length;
    const avg = analysis.reviews.reduce((acc, row) => acc + Number(row.suspicion_score || 0), 0) / total;
    return { total, suspicious, avg: Number(avg.toFixed(4)) };
  }, [analysis]);

  const handleAnalyze = async (e) => {
    e.preventDefault();
    setError('');
    const productId = extractProductId(productUrl);
    if (!productId) {
      setError('Enter product URL or product id.');
      return;
    }
    const reviews = parseReviewsFromRaw(reviewData, productId);
    if (!reviews.length) {
      setError('Enter review JSON or review lines.');
      return;
    }

    setLoading(true);
    const result = await analyzeReviews({
      reviews,
      merchant_id: merchantId || getActiveMerchantId(),
      product_url: productUrl || undefined,
    });
    setLoading(false);

    if (!result) {
      setError('Failed to analyze reviews from backend.');
      return;
    }
    setAnalysis(result);
  };

  return (
    <div className="max-w-7xl mx-auto p-4 md:p-8 pb-20 space-y-6">
      <section className="bg-surface-container-low p-6 rounded-xl border border-outline-variant/10 space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-on-surface">Review Analysis</h1>
          <span className="text-xs text-on-surface-variant">API: {health?.status || 'unknown'}</span>
        </div>

        <form onSubmit={handleAnalyze} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <input
              className="bg-surface-container-highest rounded-lg px-4 py-3 text-sm text-on-surface"
              placeholder="Product URL or id"
              value={productUrl}
              onChange={(e) => setProductUrl(e.target.value)}
            />
            <input
              className="bg-surface-container-highest rounded-lg px-4 py-3 text-sm text-on-surface"
              placeholder="Merchant ID"
              value={merchantId}
              onChange={(e) => setMerchantId(e.target.value)}
            />
          </div>
          <textarea
            className="w-full min-h-[160px] bg-surface-container-highest rounded-lg px-4 py-3 text-sm text-on-surface"
            placeholder="Reviews JSON array or one review per line"
            value={reviewData}
            onChange={(e) => setReviewData(e.target.value)}
          />
          <div className="flex items-center gap-3">
            <button disabled={loading} className="px-5 py-2.5 rounded-lg bg-primary text-on-primary font-semibold disabled:opacity-60">
              {loading ? 'Running...' : 'Run Analysis'}
            </button>
            {error ? <span className="text-xs text-error">{error}</span> : null}
          </div>
        </form>
      </section>

      {analysis ? (
        <section className="bg-surface-container-low p-6 rounded-xl border border-outline-variant/10 space-y-4">
          <div className="flex flex-wrap gap-4 text-sm text-on-surface">
            <span>Total Reviews: {metrics?.total || 0}</span>
            <span>Flagged: {metrics?.suspicious || 0}</span>
            <span>Avg Suspicion: {metrics?.avg ?? 0}</span>
            <span>Product Authenticity: {analysis.product_integrity?.authenticity_score}%</span>
          </div>

          <div className="h-4 rounded bg-surface-container-highest overflow-hidden">
            <div
              className="h-full bg-primary"
              style={{ width: `${Math.max(0, Math.min(100, Number(analysis.product_integrity?.authenticity_score || 0)))}%` }}
            />
          </div>

          <p className="text-sm text-on-surface-variant">
            Verdict: {analysis.product_integrity?.overall_verdict} | Fake %: {analysis.product_integrity?.fake_review_percentage}
          </p>
        </section>
      ) : null}
    </div>
  );
}
