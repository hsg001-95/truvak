import { useEffect, useMemo, useState } from 'react';
import {
  analyzeReviews,
  getActiveMerchantId,
  getReviewsHealth,
  submitReviewFeedback,
} from '../services/api';
import { extractProductId, parseReviewsFromRaw } from '../utils/reviewProduct';

export default function ReviewDashboard() {
  const [productUrl, setProductUrl] = useState('');
  const [merchantId, setMerchantId] = useState(getActiveMerchantId());
  const [rawInput, setRawInput] = useState('');
  const [health, setHealth] = useState(null);
  const [analysis, setAnalysis] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [feedbackStatus, setFeedbackStatus] = useState('');

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

  const chart = useMemo(() => {
    if (!analysis?.reviews?.length) return { genuine: 0, suspicious: 0, likelyFake: 0 };
    return analysis.reviews.reduce(
      (acc, row) => {
        if (row.suspicion_label === 'GENUINE') acc.genuine += 1;
        else if (row.suspicion_label === 'SUSPICIOUS') acc.suspicious += 1;
        else acc.likelyFake += 1;
        return acc;
      },
      { genuine: 0, suspicious: 0, likelyFake: 0 }
    );
  }, [analysis]);

  const run = async () => {
    setError('');
    setFeedbackStatus('');
    const productId = extractProductId(productUrl);
    if (!productId) {
      setError('Enter product URL/id.');
      return;
    }
    const reviews = parseReviewsFromRaw(rawInput, productId);
    if (!reviews.length) {
      setError('Enter reviews first.');
      return;
    }

    setLoading(true);
    const result = await analyzeReviews({
      merchant_id: merchantId || getActiveMerchantId(),
      product_url: productUrl || undefined,
      reviews,
    });
    setLoading(false);

    if (!result) {
      setError('Backend analyze failed.');
      return;
    }
    setAnalysis(result);
  };

  const submitRowFeedback = async (row, verdict) => {
    if (!analysis?.product_integrity?.product_id) return;
    const saved = await submitReviewFeedback({
      review_text: row.top_reasons?.join(' | ') || 'review',
      merchant_verdict: verdict,
      merchant_id: analysis.merchant_id,
      product_id: analysis.product_integrity.product_id,
    });
    setFeedbackStatus(saved ? `Feedback count: ${saved.total_feedback_count}` : 'Feedback failed');
  };

  return (
    <div className="max-w-7xl mx-auto p-4 md:p-8 pb-20 space-y-6">
      <section className="bg-surface-container-low rounded-xl border border-outline-variant/10 p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-on-surface">Review Dashboard</h1>
          <span className="text-xs text-on-surface-variant">API: {health?.status || 'unknown'}</span>
        </div>

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
          className="w-full min-h-[140px] bg-surface-container-highest rounded-lg px-4 py-3 text-sm text-on-surface"
          placeholder="Reviews JSON array or one review per line"
          value={rawInput}
          onChange={(e) => setRawInput(e.target.value)}
        />

        <div className="flex items-center gap-3">
          <button onClick={run} disabled={loading} className="px-5 py-2.5 rounded-lg bg-primary text-on-primary font-semibold disabled:opacity-60">
            {loading ? 'Running...' : 'Refresh Dashboard'}
          </button>
          {error ? <span className="text-xs text-error">{error}</span> : null}
          {feedbackStatus ? <span className="text-xs text-primary">{feedbackStatus}</span> : null}
        </div>
      </section>

      {analysis ? (
        <section className="bg-surface-container-low rounded-xl border border-outline-variant/10 p-6 space-y-5">
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div className="bg-surface-container-highest rounded-lg p-4">Genuine: {chart.genuine}</div>
            <div className="bg-surface-container-highest rounded-lg p-4">Suspicious: {chart.suspicious}</div>
            <div className="bg-surface-container-highest rounded-lg p-4">Likely Fake: {chart.likelyFake}</div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-on-surface-variant border-b border-outline-variant/20">
                  <th className="py-2 text-left">Review #</th>
                  <th className="py-2 text-left">Score</th>
                  <th className="py-2 text-left">Label</th>
                  <th className="py-2 text-left">Feedback</th>
                </tr>
              </thead>
              <tbody>
                {analysis.reviews.map((row) => (
                  <tr key={row.review_index} className="border-b border-outline-variant/10">
                    <td className="py-2">{row.review_index + 1}</td>
                    <td className="py-2">{row.suspicion_score}</td>
                    <td className="py-2">{row.suspicion_label}</td>
                    <td className="py-2">
                      <div className="flex gap-2">
                        <button onClick={() => submitRowFeedback(row, 'genuine')} className="px-2 py-1 text-xs border border-emerald-500 text-emerald-400 rounded">Genuine</button>
                        <button onClick={() => submitRowFeedback(row, 'fake')} className="px-2 py-1 text-xs border border-red-500 text-red-400 rounded">Fake</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  );
}
