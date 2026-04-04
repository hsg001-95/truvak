import { useEffect, useMemo, useState } from 'react';
import {
  analyzeReviews,
  getActiveMerchantId,
  getReviewsHealth,
  submitReviewFeedback,
} from '../services/api';
import { extractProductId, parseReviewsFromRaw } from '../utils/reviewProduct';

export default function ReviewIntelligence() {
  const [productUrl, setProductUrl] = useState('');
  const [merchantId, setMerchantId] = useState(getActiveMerchantId());
  const [rawReviews, setRawReviews] = useState('');
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

  const summary = useMemo(() => {
    if (!analysis?.reviews?.length) return null;
    const total = analysis.reviews.length;
    const fake = analysis.reviews.filter((r) => r.suspicion_label === 'LIKELY_FAKE').length;
    const suspicious = analysis.reviews.filter((r) => r.suspicion_label === 'SUSPICIOUS').length;
    return { total, fake, suspicious };
  }, [analysis]);

  const runAnalysis = async () => {
    setError('');
    setFeedbackStatus('');

    const productId = extractProductId(productUrl);
    if (!productId) {
      setError('Enter a valid product URL or product id.');
      return;
    }

    const reviews = parseReviewsFromRaw(rawReviews, productId);
    if (!reviews.length) {
      setError('Provide at least one review line or JSON array item.');
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
      setError('Review analysis request failed. Check backend and retry.');
      return;
    }
    setAnalysis(result);
  };

  const sendFeedback = async (review, verdict) => {
    if (!analysis?.product_integrity?.product_id) return;
    const payload = {
      review_text: review.preview_text || review.top_reasons?.join(' | ') || 'review',
      merchant_verdict: verdict,
      merchant_id: analysis.merchant_id,
      product_id: analysis.product_integrity.product_id,
    };
    const res = await submitReviewFeedback(payload);
    setFeedbackStatus(res ? `Feedback saved (${res.total_feedback_count})` : 'Feedback failed');
  };

  return (
    <div className="max-w-7xl mx-auto p-4 md:p-8 pb-20 space-y-6">
      <section className="bg-surface-container-low border border-outline-variant/10 rounded-xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-on-surface">Review Intelligence</h1>
          <div className="text-xs text-on-surface-variant">API: {health?.status || 'unknown'}</div>
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
          className="w-full min-h-[160px] bg-surface-container-highest rounded-lg px-4 py-3 text-sm text-on-surface"
          placeholder="Paste reviews JSON array or one review per line"
          value={rawReviews}
          onChange={(e) => setRawReviews(e.target.value)}
        />

        <div className="flex items-center gap-3">
          <button
            onClick={runAnalysis}
            disabled={loading}
            className="px-5 py-2.5 rounded-lg bg-primary text-on-primary font-semibold disabled:opacity-60"
          >
            {loading ? 'Analyzing...' : 'Analyze Reviews'}
          </button>
          {error ? <span className="text-xs text-error">{error}</span> : null}
          {feedbackStatus ? <span className="text-xs text-primary">{feedbackStatus}</span> : null}
        </div>
      </section>

      {analysis ? (
        <section className="bg-surface-container-low border border-outline-variant/10 rounded-xl p-6 space-y-4">
          <div className="flex flex-wrap gap-4 text-sm">
            <span>Total: {summary?.total || 0}</span>
            <span>Likely Fake: {summary?.fake || 0}</span>
            <span>Suspicious: {summary?.suspicious || 0}</span>
            <span>Authenticity: {analysis.product_integrity?.authenticity_score}%</span>
            <span>Verdict: {analysis.product_integrity?.overall_verdict}</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-on-surface-variant border-b border-outline-variant/20">
                  <th className="py-2 text-left">#</th>
                  <th className="py-2 text-left">Label</th>
                  <th className="py-2 text-left">Score</th>
                  <th className="py-2 text-left">Reasons</th>
                  <th className="py-2 text-left">Top SHAP</th>
                  <th className="py-2 text-left">Feedback</th>
                </tr>
              </thead>
              <tbody>
                {analysis.reviews.map((review) => (
                  <tr key={review.review_index} className="border-b border-outline-variant/10">
                    <td className="py-2">{review.review_index + 1}</td>
                    <td className="py-2">{review.suspicion_label}</td>
                    <td className="py-2">{review.suspicion_score}</td>
                    <td className="py-2">{(review.top_reasons || []).join(', ')}</td>
                    <td className="py-2">
                      {Array.isArray(review.shap_explanations) && review.shap_explanations.length
                        ? `${review.shap_explanations[0].feature}: ${review.shap_explanations[0].shap_value}`
                        : 'N/A'}
                    </td>
                    <td className="py-2">
                      <div className="flex gap-2">
                        <button
                          onClick={() => sendFeedback(review, 'genuine')}
                          className="px-2 py-1 text-xs border border-emerald-500 text-emerald-400 rounded"
                        >
                          Genuine
                        </button>
                        <button
                          onClick={() => sendFeedback(review, 'fake')}
                          className="px-2 py-1 text-xs border border-red-500 text-red-400 rounded"
                        >
                          Fake
                        </button>
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
