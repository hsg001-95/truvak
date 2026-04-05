const PRICE_HISTORY_CACHE_PREFIX = 'truvak_price_history_';
const WATCHLIST_KEY = 'truvak_watchlist';
const PRICE_HISTORY_TTL_MS = 6 * 60 * 60 * 1000;

function getApiBaseUrl() {
  return window.TRUVAK_API || window.TruvakConfig?.apiUrl || 'http://127.0.0.1:8000';
}

function sanitizeText(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function normalizeNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function formatCurrency(value) {
  const amount = normalizeNumber(value, 0);
  return `INR ${amount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}

function getPriceHistoryCache(productId, platform) {
  try {
    const key = `${PRICE_HISTORY_CACHE_PREFIX}${platform || 'unknown'}_${productId}`;
    const raw = localStorage.getItem(key);
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    if (!parsed || !parsed.cachedAt) return null;

    const age = Date.now() - new Date(parsed.cachedAt).getTime();
    if (Number.isNaN(age) || age > PRICE_HISTORY_TTL_MS) return null;

    return parsed.data || null;
  } catch {
    return null;
  }
}

function savePriceHistory(productId, data, platform) {
  try {
    const key = `${PRICE_HISTORY_CACHE_PREFIX}${platform || 'unknown'}_${productId}`;
    localStorage.setItem(
      key,
      JSON.stringify({
        cachedAt: new Date().toISOString(),
        data,
      })
    );
  } catch (error) {
    console.warn('Failed to cache price history:', error);
  }
}

function inferDealColor(dealIndicator) {
  const indicator = String(dealIndicator || '').toUpperCase();
  if (indicator === 'GOOD') return 'rgba(63, 185, 80, 0.15)';
  if (indicator === 'OVERPRICED') return 'rgba(248, 81, 73, 0.15)';
  return 'rgba(48, 54, 61, 0.5)';
}

function normalizePoints(dataPoints, low, high) {
  const points = Array.isArray(dataPoints) ? dataPoints : [];
  if (!points.length) return '';

  const values = points
    .map((point) => normalizeNumber(point?.price ?? point?.value, NaN))
    .filter((v) => Number.isFinite(v));

  if (!values.length) return '';

  const min = Number.isFinite(low) ? low : Math.min(...values);
  const max = Number.isFinite(high) ? high : Math.max(...values);
  const range = Math.max(max - min, 1);
  const width = 290;
  const height = 80;

  return values
    .map((value, index) => {
      const x = values.length === 1 ? width / 2 : (index / (values.length - 1)) * width;
      const y = height - ((value - min) / range) * (height - 6) - 3;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
}

function getConfidenceLabel(confidence) {
  const score = normalizeNumber(confidence, 0);
  if (score >= 75) return 'High confidence';
  if (score >= 40) return 'Medium confidence';
  return 'Low confidence';
}

function updateComparisonList(data) {
  const list = document.querySelector('#truvak-section-price-intel .truvak-price-compare-list');
  if (!list) return;

  const entries = Array.isArray(data?.comparisons)
    ? data.comparisons
    : Array.isArray(data)
      ? data
      : [];

  if (!entries.length) {
    list.innerHTML = '<li class="empty">No alternate seller offers yet.</li>';
    return;
  }

  list.innerHTML = entries
    .slice(0, 3)
    .map((entry) => {
      const seller = sanitizeText(entry?.seller || entry?.seller_name || 'Unknown seller');
      const price = formatCurrency(entry?.price ?? entry?.offer_price ?? 0);
      const delta = normalizeNumber(entry?.delta_percent, null);
      const deltaText = Number.isFinite(delta)
        ? `${delta >= 0 ? '+' : ''}${delta.toFixed(1)}%`
        : '';

      return `<li><span class="seller">${seller}</span><span class="price">${price}</span><span class="delta">${deltaText}</span></li>`;
    })
    .join('');
}

function bindExpandablePriceIntel() {
  const root = document.querySelector('#truvak-section-price-intel .truvak-price-intel');
  if (!root) return;

  const header = root.querySelector('.header');
  const expanded = root.querySelector('.expanded-content');
  const chevron = root.querySelector('.chevron-down-icon');
  if (!header || !expanded || !chevron) return;

  let expandedState = false;
  header.onclick = () => {
    expandedState = !expandedState;
    expanded.style.display = expandedState ? 'block' : 'none';
    chevron.classList.toggle('chevron-up-icon', expandedState);
  };
}

function renderPriceIntel(currentPrice, priceHistoryData) {
  const dataPointsCount = normalizeNumber(priceHistoryData?.data_points_count, 0);
  const low = normalizeNumber(priceHistoryData?.low, currentPrice);
  const high = normalizeNumber(priceHistoryData?.high, currentPrice);
  const dealIndicator = String(priceHistoryData?.deal_indicator || 'FAIR').toUpperCase();
  const confidence = normalizeNumber(priceHistoryData?.confidence, 0);
  const linePoints = normalizePoints(priceHistoryData?.data_points, low, high);

  const html = `
    <div class="truvak-price-intel price-intel">
      <style>
        #truvak-section-price-intel .truvak-price-intel { border: 1px solid #30363D; border-radius: 12px; overflow: hidden; background: #10151f; }
        #truvak-section-price-intel .truvak-price-intel .header { display: flex; align-items: center; gap: 8px; padding: 10px 12px; cursor: pointer; }
        #truvak-section-price-intel .truvak-price-intel .title-line { flex: 1; color: #e6edf3; font-weight: 700; font-size: 13px; }
        #truvak-section-price-intel .truvak-price-intel .deal-indicator { font-size: 11px; font-weight: 700; padding: 2px 8px; border-radius: 999px; background: #2d333b; color: #c9d1d9; }
        #truvak-section-price-intel .truvak-price-intel .chevron-down-icon { width: 10px; height: 10px; border-right: 2px solid #8b949e; border-bottom: 2px solid #8b949e; transform: rotate(45deg); transition: transform .2s ease; }
        #truvak-section-price-intel .truvak-price-intel .chevron-up-icon { transform: rotate(-135deg); }
        #truvak-section-price-intel .truvak-price-intel .expanded-content { display: none; padding: 0 12px 12px; }
        #truvak-section-price-intel .truvak-price-intel .section-title { color: #8b949e; font-size: 11px; text-transform: uppercase; margin: 2px 0 8px; letter-spacing: .06em; }
        #truvak-section-price-intel .truvak-price-intel .empty { color: #8b949e; font-size: 12px; margin: 8px 0; }
        #truvak-section-price-intel .truvak-price-intel .price-summary { display: flex; justify-content: space-between; gap: 8px; margin-top: 8px; color: #c9d1d9; font-size: 12px; }
        #truvak-section-price-intel .truvak-price-intel .deal-banner { margin-top: 8px; padding: 8px; border-radius: 8px; color: #e6edf3; font-size: 12px; font-weight: 600; text-align: center; }
        #truvak-section-price-intel .truvak-price-intel .confidence-label { display: inline-block; margin-top: 8px; color: #8b949e; font-size: 11px; }
        #truvak-section-price-intel .truvak-price-intel .compare-title { color: #8b949e; font-size: 11px; text-transform: uppercase; margin: 12px 0 6px; letter-spacing: .06em; }
        #truvak-section-price-intel .truvak-price-intel .truvak-price-compare-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
        #truvak-section-price-intel .truvak-price-intel .truvak-price-compare-list li { display: grid; grid-template-columns: 1fr auto auto; gap: 8px; align-items: center; padding: 6px 8px; background: #0d1117; border: 1px solid #30363d; border-radius: 8px; }
        #truvak-section-price-intel .truvak-price-intel .truvak-price-compare-list .seller { color: #c9d1d9; font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        #truvak-section-price-intel .truvak-price-intel .truvak-price-compare-list .price { color: #e6edf3; font-size: 12px; font-weight: 600; }
        #truvak-section-price-intel .truvak-price-intel .truvak-price-compare-list .delta { color: #8b949e; font-size: 11px; }
      </style>
      <div class="header">
        <span class="title-line">Current Price: ${sanitizeText(formatCurrency(currentPrice))}</span>
        <span class="deal-indicator">${sanitizeText(dealIndicator)}</span>
        <div class="chevron-down-icon"></div>
      </div>
      <div class="expanded-content">
        <h3 class="section-title">15-Day Price History</h3>
        ${dataPointsCount > 0 && linePoints ? `
          <svg width="100%" viewBox="0 0 290 80" preserveAspectRatio="none" height="80" aria-label="Price trend">
            <rect x="0" y="0" width="290" height="80" fill="#0D1117"></rect>
            <polyline points="${linePoints}" stroke="#3FB950" stroke-width="1.6" fill="none"></polyline>
          </svg>
        ` : '<p class="empty">No history yet, be the first to track this.</p>'}
        <div class="price-summary">
          <span>Low: ${sanitizeText(formatCurrency(low))}</span>
          <span>High: ${sanitizeText(formatCurrency(high))}</span>
        </div>
        <div class="deal-banner" style="background-color: ${inferDealColor(dealIndicator)};">
          ${sanitizeText(dealIndicator)}
        </div>
        <span class="confidence-label">${sanitizeText(getConfidenceLabel(confidence))} (${sanitizeText(confidence)} observations)</span>

        <h3 class="compare-title">Cross-Seller Comparison</h3>
        <ul class="truvak-price-compare-list">
          <li class="empty">Loading seller comparisons...</li>
        </ul>
      </div>
    </div>
  `;

  window.TruvakSidebar.renderSection('price-intel', html);
  bindExpandablePriceIntel();
}

async function loadPriceIntel(productId, platform, currentPrice, productData) {
  if (!window.TruvakSidebar?.showSectionLoading || !window.TruvakSidebar?.renderSection) {
    console.error('TruvakSidebar unavailable for price-intel render');
    return;
  }

  window.TruvakSidebar.showSectionLoading('price-intel');

  const safeCurrentPrice = normalizeNumber(currentPrice, 0);
  const safePlatform = String(platform || '').toLowerCase();
  const apiBase = getApiBaseUrl();

  const cachedHistory = getPriceHistoryCache(productId, safePlatform);
  if (cachedHistory) {
    renderPriceIntel(safeCurrentPrice, cachedHistory);

    fetch(`${apiBase}/v1/product/price-compare/${encodeURIComponent(productId)}?platform=${encodeURIComponent(safePlatform)}&source_price=${encodeURIComponent(safeCurrentPrice)}`)
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (data) updateComparisonList(data);
      })
      .catch((error) => {
        console.warn('Price comparison fetch failed:', error);
      });

    return;
  }

  fetch(`${apiBase}/v1/product/price-point`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      product_id: productId,
      platform: safePlatform,
      current_price: safeCurrentPrice,
      title: productData?.title || null,
      url: productData?.productUrl || window.location.href,
    }),
  }).catch((error) => {
    console.warn('Price point contribution failed:', error);
  });

  try {
    const priceHistoryResponse = await fetch(
      `${apiBase}/v1/product/price-history/${encodeURIComponent(productId)}?platform=${encodeURIComponent(safePlatform)}`
    );

    if (!priceHistoryResponse.ok) {
      renderPriceIntel(safeCurrentPrice, {
        data_points_count: 0,
        low: safeCurrentPrice,
        high: safeCurrentPrice,
        deal_indicator: 'FAIR',
        confidence: 0,
        data_points: [],
      });
    } else {
      const priceHistoryData = await priceHistoryResponse.json();
      savePriceHistory(productId, priceHistoryData, safePlatform);
      renderPriceIntel(safeCurrentPrice, priceHistoryData);
    }
  } catch (error) {
    console.error('Error loading price history:', error);
    window.TruvakSidebar.showSectionError('price-intel', 'Error loading price history');
    return;
  }

  fetch(`${apiBase}/v1/product/price-compare/${encodeURIComponent(productId)}?platform=${encodeURIComponent(safePlatform)}&source_price=${encodeURIComponent(safeCurrentPrice)}`)
    .then((response) => (response.ok ? response.json() : null))
    .then((data) => {
      if (data) updateComparisonList(data);
    })
    .catch((error) => {
      console.warn('Price comparison fetch failed:', error);
      updateComparisonList([]);
    });
}

function readWatchlist() {
  try {
    const raw = localStorage.getItem(WATCHLIST_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeWatchlist(items) {
  localStorage.setItem(WATCHLIST_KEY, JSON.stringify(items));
}

async function addToWatchlist(productId, platform, name, url, price) {
  const safePlatform = String(platform || '').toLowerCase();
  const watchlist = readWatchlist();

  const exists = watchlist.some(
    (item) => item.productId === productId && String(item.platform || '').toLowerCase() === safePlatform
  );

  if (exists) {
    window.TruvakSidebar?.showSectionError?.('actions', 'Already in watchlist');
    return { ok: false, reason: 'duplicate' };
  }

  const entry = {
    productId,
    platform: safePlatform,
    name: name || '',
    url: url || window.location.href,
    price: normalizeNumber(price, 0),
    addedAt: new Date().toISOString(),
  };

  watchlist.push(entry);
  writeWatchlist(watchlist);

  const apiBase = getApiBaseUrl();

  try {
    const response = await fetch(`${apiBase}/v1/customer/watchlist`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        product_id: productId,
        platform: safePlatform,
        name: entry.name,
        url: entry.url,
        price: entry.price,
      }),
    });

    if (response.ok) return { ok: true };

    if (response.status === 409) {
      window.TruvakSidebar?.showSectionError?.('actions', 'Already in watchlist');
      return { ok: false, reason: 'duplicate' };
    }

    if (response.status === 401) {
      window.TruvakSidebar?.showSectionError?.('actions', 'Login to save watchlist');
      return { ok: false, reason: 'unauthorized' };
    }

    return { ok: false, reason: `http_${response.status}` };
  } catch (error) {
    console.error('Watchlist sync failed:', error);
    return { ok: false, reason: 'network' };
  }
}

window.TruvakPriceIntel = {
  loadPriceIntel,
  savePriceHistory,
  addToWatchlist,
  updateComparisonList,
};
