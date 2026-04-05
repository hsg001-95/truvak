function cleanText(value) {
  if (!value) return '';
  return String(value).replace(/\s+/g, ' ').trim();
}

function parsePrice(value) {
  if (!value) return null;
  const normalized = String(value).replace(/[^0-9.]/g, '');
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function firstText(selectors) {
  for (const selector of selectors) {
    const node = document.querySelector(selector);
    const text = cleanText(node?.textContent || node?.innerText || '');
    if (text) return text;
  }
  return '';
}

function firstAttr(selectors, attr) {
  for (const selector of selectors) {
    const node = document.querySelector(selector);
    const value = cleanText(node?.getAttribute?.(attr) || node?.[attr] || '');
    if (value) return value;
  }
  return '';
}

async function hashReviewerId(rawId) {
  const source = cleanText(rawId) || 'unknown-reviewer';

  if (window.crypto?.subtle) {
    const encoder = new TextEncoder();
    const data = encoder.encode(source);
    const hashBuffer = await window.crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  // Fallback non-cryptographic hash if SubtleCrypto is unavailable.
  let hash = 0;
  for (let i = 0; i < source.length; i += 1) {
    hash = (hash << 5) - hash + source.charCodeAt(i);
    hash |= 0;
  }
  return `fallback-${Math.abs(hash)}`;
}

function extractAmazonCategory() {
  const crumbLinks = Array.from(document.querySelectorAll('#wayfinding-breadcrumbs_feature_div a'));
  const crumbTexts = crumbLinks
    .map((node) => cleanText(node.textContent || node.innerText))
    .filter(Boolean);

  if (crumbTexts.length) {
    return crumbTexts[crumbTexts.length - 1];
  }

  const spans = Array.from(document.querySelectorAll('#wayfinding-breadcrumbs_feature_div span'))
    .map((node) => cleanText(node.textContent || node.innerText).replace(/›/g, '').trim())
    .filter(Boolean);

  return spans.length ? spans[spans.length - 1] : '';
}

function extractAmazonDetailsMap() {
  const rows = Array.from(document.querySelectorAll('#productDetailsTable tr, #productDetails_detailBullets_sections1 tr'));
  const detailMap = {};

  for (const row of rows) {
    const key = cleanText(
      row.querySelector('th')?.textContent ||
      row.querySelector('td:first-child')?.textContent ||
      ''
    ).toLowerCase();

    const value = cleanText(
      row.querySelector('td')?.textContent ||
      row.querySelector('td:nth-child(2)')?.textContent ||
      ''
    );

    if (key && value) {
      detailMap[key] = value;
    }
  }

  return detailMap;
}

function findAmazonSellerName() {
  const merchantInfo = firstText([
    '#merchant-info',
    '#sellerProfileTriggerId',
    '#tabular-buybox-truncate-1',
  ]);

  return merchantInfo
    .replace(/^Sold by\s*/i, '')
    .replace(/^Visit the\s*/i, '')
    .replace(/\s*Store$/i, '')
    .trim();
}

function findAmazonSellerId() {
  const hrefCandidates = [
    window.location.href,
    firstAttr(['#merchant-info a', '#sellerProfileTriggerId'], 'href'),
  ].filter(Boolean);

  for (const value of hrefCandidates) {
    const match = value.match(/[?&]seller=([A-Z0-9]+)/i) || value.match(/\/seller\/([A-Z0-9]+)/i);
    if (match?.[1]) return match[1].toUpperCase();
  }

  return '';
}

async function extractAmazonReviews() {
  const reviewNodes = Array.from(document.querySelectorAll('[data-hook="review"]')).slice(0, 50);
  const reviews = [];

  for (const review of reviewNodes) {
    const text = cleanText(
      review.querySelector('[data-hook="review-body"] span')?.textContent ||
      review.querySelector('[data-hook="review-body"]')?.textContent ||
      ''
    );

    const ratingText = cleanText(
      review.querySelector('[data-hook="review-star-rating"] span')?.textContent ||
      review.querySelector('[data-hook="cmps-review-star-rating"] span')?.textContent ||
      ''
    );

    const rating = parsePrice(ratingText);
    const verified = Boolean(review.querySelector('[data-hook="avp-badge"]'));

    const reviewerLink = review.querySelector('[data-hook="review-author"] a, [data-hook="reviewerName"]');
    const reviewerRawId =
      cleanText(reviewerLink?.getAttribute?.('href')) ||
      cleanText(reviewerLink?.textContent || reviewerLink?.innerText) ||
      'unknown-reviewer';

    const reviewerId = await hashReviewerId(reviewerRawId);
    const date = cleanText(review.querySelector('[data-hook="review-date"]')?.textContent || '');

    if (!text && !rating && !date) continue;

    reviews.push({
      text,
      rating,
      verified,
      reviewerId,
      date,
    });
  }

  return reviews;
}

async function extractAmazonProduct() {
  try {
    const asinFromUrl = window.location.href.match(/\/dp\/([A-Z0-9]{10})/i)?.[1] || '';
    const asinFromPage = cleanText(document.querySelector('#ASIN')?.value || '');
    const asin = (asinFromUrl || asinFromPage || '').toUpperCase();
    if (!asin) return null;

    const title = firstText(['#productTitle', '#title']);
    if (!title) return null;

    const brandRaw = firstText(['#bylineInfo', '#brand']);
    const brand = brandRaw
      .replace(/^Visit the\s*/i, '')
      .replace(/\s*Store$/i, '')
      .trim();
    if (!brand) return null;

    const priceText = firstText([
      '.a-price .a-offscreen',
      '#priceblock_ourprice',
      '#corePriceDisplay_desktop_feature_div .a-offscreen',
      '#corePrice_feature_div .a-offscreen',
    ]);
    const currentPrice = parsePrice(priceText);
    if (!currentPrice) return null;

    const category = extractAmazonCategory();
    if (!category) return null;

    const details = extractAmazonDetailsMap();
    const ean =
      details['ean'] ||
      details['ean:'] ||
      details['barcode'] ||
      details['upc'] ||
      null;
    const modelNumber =
      details['item model number'] ||
      details['model number'] ||
      null;

    const sellerName = findAmazonSellerName();
    if (!sellerName) return null;

    const sellerId = findAmazonSellerId();
    if (!sellerId) return null;

    const reviews = await extractAmazonReviews();

    const imageUrl = firstAttr([
      '#landingImage',
      '#imgBlkFront',
      '#main-image-container img',
    ], 'src');
    if (!imageUrl) return null;

    const productUrl = window.location.href;

    return {
      asin,
      title,
      brand,
      currentPrice,
      category,
      ean,
      modelNumber,
      sellerName,
      sellerId,
      reviews,
      imageUrl,
      productUrl,
    };
  } catch (error) {
    console.error('Failed to extract Amazon product data:', error);
    return null;
  }
}

async function extractFlipkartReviews() {
  const reviewNodes = Array.from(document.querySelectorAll('div.col.EPCmJX, ._27M-vq, .RcXBOT')).slice(0, 50);
  const reviews = [];

  for (const review of reviewNodes) {
    const text = cleanText(
      review.querySelector('div.ZmyHeo, div._6K-7Co, p')?.textContent ||
      review.querySelector('p._2-N8zT')?.textContent ||
      ''
    );

    const ratingText = cleanText(
      review.querySelector('div.XQDdHH, ._3LWZlK')?.textContent ||
      ''
    );
    const rating = parsePrice(ratingText);

    const reviewerRaw = cleanText(
      review.querySelector('p._2sc7ZR, ._2aI9Q_')?.textContent ||
      review.querySelector('span')?.textContent ||
      'unknown-reviewer'
    );

    const reviewerId = await hashReviewerId(reviewerRaw);
    const date = cleanText(
      review.querySelector('p._2NsDsF, .qXwO1x')?.textContent ||
      ''
    );

    if (!text && !rating && !date) continue;

    reviews.push({
      text,
      rating,
      verified: true,
      reviewerId,
      date,
    });
  }

  return reviews;
}

async function extractFlipkartProduct() {
  try {
    const productIdFromPath = window.location.href.match(/\/p\/(itm[a-zA-Z0-9]+)/)?.[1] || '';
    const productIdFromQuery = new URLSearchParams(window.location.search).get('pid') || '';
    const productId = cleanText(productIdFromPath || productIdFromQuery);
    if (!productId) return null;

    const title = firstText(['.B_NuCI', 'h1.yhB1nd', 'h1._6EBuvT']);
    if (!title) return null;

    const priceText = firstText(['._30jeq3._16Jk6d', '._30jeq3', '._25b18']);
    const currentPrice = parsePrice(priceText);
    if (!currentPrice) return null;

    const breadcrumbs = Array.from(document.querySelectorAll('#breadCrumbs a, .r2CdBx a'))
      .map((link) => cleanText(link.textContent || link.innerText))
      .filter(Boolean);

    const brand = breadcrumbs[0] || cleanText(title.split(' ')[0]);
    if (!brand) return null;

    const category = breadcrumbs[1] || breadcrumbs[breadcrumbs.length - 1] || '';
    if (!category) return null;

    const reviews = await extractFlipkartReviews();

    const imageUrl = firstAttr([
      'img._396CS4._2amPTT',
      'img._53J4C-',
      'img.DByuf4',
    ], 'src');
    if (!imageUrl) return null;

    const productUrl = window.location.href;

    return {
      productId,
      title,
      brand,
      currentPrice,
      category,
      reviews,
      imageUrl,
      productUrl,
    };
  } catch (error) {
    console.error('Failed to extract Flipkart product data:', error);
    return null;
  }
}

async function extractPageData(platform) {
  const normalized = String(platform || '').toLowerCase();

  if (normalized === 'amazon') {
    return extractAmazonProduct();
  }

  if (normalized === 'flipkart') {
    return extractFlipkartProduct();
  }

  console.error('Unsupported platform:', platform);
  return null;
}

window.TruvakExtractor = {
  extractPageData,
};
