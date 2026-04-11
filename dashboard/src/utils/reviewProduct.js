export function extractProductId(input) {
  const value = String(input || "").trim();
  if (!value) return "";

  const direct = value.match(/^[A-Za-z0-9][A-Za-z0-9_-]{3,63}$/);
  if (direct) return direct[0].toUpperCase();

  const dpMatch = value.match(/\/dp\/([A-Za-z0-9_-]{4,64})/i);
  if (dpMatch?.[1]) return dpMatch[1].toUpperCase();

  const productMatch = value.match(/\/product[s]?\/([A-Za-z0-9_-]{4,64})/i);
  if (productMatch?.[1]) return productMatch[1].toUpperCase();

  const slugTail = value.replace(/^https?:\/\//i, "").split(/[?#]/)[0].split("/").filter(Boolean).pop();
  return (slugTail || value).slice(0, 64).toUpperCase();
}

export function parseReviewsFromRaw(rawText, productId) {
  const text = String(rawText || "").trim();
  if (!text) return [];

  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) {
      return parsed
        .map((item, index) => ({
          review_text: String(item.review_text || item.review || item.text || "").trim(),
          rating: Number(item.rating || 4),
          verified_purchase: Boolean(item.verified_purchase ?? item.verified ?? false),
          reviewer_id: String(item.reviewer_id || item.author || `review_${index}`),
          product_id: String(item.product_id || productId),
          helpful_votes: Number(item.helpful_votes || 0),
        }))
        .filter((item) => item.review_text.length > 0)
        .slice(0, 100);
    }
  } catch {
    // Fall through to line parser.
  }

  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 100)
    .map((line, index) => ({
      review_text: line,
      rating: 4,
      verified_purchase: false,
      reviewer_id: `line_${index}`,
      product_id: productId,
      helpful_votes: 0,
    }));
}
