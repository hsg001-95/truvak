const PRICE_HISTORY_CACHE_PREFIX = 'truvak_price_history_';
const WATCHLIST_KEY = 'truvak_watchlist';
const PLATFORM_DISPLAY = {
  meesho: {
    unavailableMessage: 'Price unavailable',
    unavailableReason: null,
    showRetry: false,
  },
};

function getApiBaseUrl() {
  return window.TRUVAK_API || window.TruvakConfig?.apiUrl || 'http://127.0.0.1:8000';
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function num(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function inr(value) {
  return `INR ${num(value, 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}

function ensureSectionStyles() {
  if (document.getElementById('truvak-price-intel-styles')) return;

  const style = document.createElement('style');
  style.id = 'truvak-price-intel-styles';
  style.textContent = `
    #truvak-section-price-intel .price-intel-section {
      border: 1px solid #30363d;
      border-radius: 10px;
      background: #0f1722;
      margin-bottom: 10px;
      overflow: hidden;
    }

    #truvak-section-price-intel .price-intel-section header {
      min-height: 40px;
      padding: 8px 10px;
      display: flex;
      align-items: center;
      gap: 8px;
      color: #e6edf3;
    }

    #truvak-section-price-intel .price-intel-section .current-price {
      font-weight: 700;
      font-size: 13px;
      flex: 1;
    }

    #truvak-section-price-intel .price-intel-section .deal-indicator {
      font-size: 11px;
      font-weight: 700;
      border-radius: 999px;
      padding: 2px 8px;
      background: #2d333b;
      color: #c9d1d9;
    }

    #truvak-section-price-intel .price-intel-section .chevron-toggle {
      border: 0;
      width: 22px;
      height: 22px;
      border-radius: 6px;
      color: #8b949e;
      background: transparent;
      cursor: pointer;
    }

    #truvak-section-price-intel .price-intel-section .content {
      display: none;
      padding: 0 10px 10px;
      color: #c9d1d9;
    }

    #truvak-section-price-intel .price-intel-section h2 {
      font-size: 12px;
      color: #8b949e;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin: 4px 0 8px;
    }

    #truvak-section-price-intel .price-intel-section .stats {
      margin-top: 8px;
      display: flex;
      justify-content: space-between;
      font-size: 12px;
    }

    #truvak-section-price-intel .price-intel-section .deal-banner {
      margin-top: 8px;
      border-radius: 8px;
      font-size: 12px;
      font-weight: 600;
      padding: 8px;
      text-align: center;
      color: #e6edf3;
    }

    #truvak-section-price-intel .price-intel-section .confidence-label {
      margin-top: 6px;
      display: inline-block;
      color: #8b949e;
      font-size: 11px;
    }

    #truvak-section-price-intel .comparison-row {
      border: 1px solid #30363d;
      border-radius: 8px;
      background: #0d1117;
      padding: 7px 8px;
      display: grid;
      grid-template-columns: 1fr auto auto;
      gap: 8px;
      margin-bottom: 6px;
      font-size: 12px;
      align-items: center;
    }

    #truvak-section-price-intel .savings-badge {
      font-size: 10px;
      color: #3fb950;
      font-weight: 600;
    }

    #truvak-section-price-intel .watchlist-button {
      margin: 0 10px 10px;
      width: calc(100% - 20px);
      border: 1px solid #30363d;
      border-radius: 8px;
      background: #132238;
      color: #e6edf3;
      padding: 8px 10px;
      cursor: pointer;
      font-size: 12px;
      font-weight: 600;
    }

    #truvak-section-price-intel .watchlist-button.saved {
      background: #173923;
      border-color: #2ea043;
    }

    #truvak-section-price-intel .watchlist-button.saving {
      opacity: 0.8;
      cursor: progress;
    }
  `;
  document.head.appendChild(style);
}

function getDealIndicatorLabel(raw) {
  const indicator = String(raw || 'FAIR').toUpperCase();
  return indicator;
}

function getDealBannerColor(indicator) {
  if (indicator === 'GOOD') return 'rgba(63,185,80,0.15)';
  if (indicator === 'OVERPRICED') return 'rgba(248,81,73,0.15)';
  return 'rgba(48,54,61,0.5)';
}

function getPriceIntelSectionRoot() {
  return document.getElementById('truvak-section-price-intel') || document.getElementById('price-intel-section');
}

function displayMinimalSection(currentPrice) {
  const priceIntelSection = getPriceIntelSectionRoot();
  if (!priceIntelSection) return;

  const minimalSection = `
    <div class="price-intel-minimal">
      <span class="current-price">${escapeHtml(inr(currentPrice))}</span>
    </div>
  `;
  priceIntelSection.innerHTML = minimalSection;
}

function safeJsonParse(raw, fallback) {
  try {
    const parsed = JSON.parse(raw);
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

function savePriceHistory(productId, data) {
  localStorage.setItem(`${PRICE_HISTORY_CACHE_PREFIX}${productId}`, JSON.stringify(data));
}

function updateComparisonList(comparisonData) {
  const comparisonContainer = document.getElementById('comparison-list');
  if (!comparisonContainer) return;

  const rows = Array.isArray(comparisonData?.comparisons)
    ? comparisonData.comparisons
    : Array.isArray(comparisonData)
      ? comparisonData
      : [];

  comparisonContainer.innerHTML = '';

  if (!rows.length) {
    comparisonContainer.innerHTML = '<div class="comparison-row">No comparison data yet.</div>';
    return;
  }

  rows.slice(0, 5).forEach((result) => {
    const platformKey = String(result.platform || result.source || 'unknown').toLowerCase();
    const platform = escapeHtml(platformKey || 'unknown');
    const rawPrice = num(result.price ?? result.offer_price, NaN);
    const hasPrice = Number.isFinite(rawPrice) && rawPrice > 0;
    const isUnavailable = !hasPrice || String(result.status || '').toUpperCase() === 'UNAVAILABLE';
    const displayCfg = PLATFORM_DISPLAY[platformKey] || null;

    const price = isUnavailable
      ? escapeHtml(displayCfg?.unavailableMessage || 'Unavailable')
      : escapeHtml(inr(rawPrice));
    const confidence = escapeHtml(String(result.confidence || 'low').toLowerCase());
    const isCheaper = Boolean(result.isCheaper ?? result.is_cheaper);
    const savings = escapeHtml(inr(result.savings ?? result.saving_amount ?? 0));

    const row = document.createElement('div');
    row.className = 'comparison-row';
    row.innerHTML = `
      <span>${platform}</span>
      <span>${price}</span>
      <span class="confidence-indicator ${confidence}" style="${isUnavailable ? 'opacity:0.7' : ''}">${isUnavailable ? 'n/a' : confidence}</span>
      <span class="savings-badge" style="${isCheaper ? '' : 'display:none'}">Save ${savings}</span>
    `;
    comparisonContainer.appendChild(row);
  });
}

function createSparkline(container, dataPoints) {
  const points = Array.isArray(dataPoints) ? dataPoints : [];
  const width = Math.max(container.clientWidth || 280, 220);
  const height = 80;

  container.innerHTML = '';

  if (window.d3 && points.length >= 3) {
    const xValues = points.map((d) => new Date(d.date));
    const yValues = points.map((d) => num(d.price));

    const xMin = Math.min(...xValues.map((d) => d.getTime()));
    const xMax = Math.max(...xValues.map((d) => d.getTime()));
    const yMin = Math.min(...yValues);
    const yMax = Math.max(...yValues);
    const yRange = Math.max(yMax - yMin, 1);
    const xRange = Math.max(xMax - xMin, 1);

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', String(width));
    svg.setAttribute('height', String(height));
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);

    const polyline = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
    const linePoints = points.map((d) => {
      const x = ((new Date(d.date).getTime() - xMin) / xRange) * (width - 10) + 5;
      const y = height - ((num(d.price) - yMin) / yRange) * (height - 12) - 6;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');

    polyline.setAttribute('points', linePoints);
    polyline.setAttribute('fill', 'none');
    polyline.setAttribute('stroke', '#3FB950');
    polyline.setAttribute('stroke-width', '1.5');

    svg.appendChild(polyline);
    container.appendChild(svg);
    return;
  }

  if (points.length < 3) {
    container.innerHTML = '<div style="font-size:12px;color:#8B949E">No history yet, be the first to track this.</div>';
    return;
  }

  // Fallback sparkline without D3.
  const prices = points.map((d) => num(d.price));
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const range = Math.max(max - min, 1);
  const polyPoints = prices.map((p, i) => {
    const x = (i / (prices.length - 1)) * (width - 8) + 4;
    const y = height - ((p - min) / range) * (height - 12) - 6;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');

  container.innerHTML = `
    <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" aria-label="Price sparkline">
      <polyline points="${polyPoints}" fill="none" stroke="#3FB950" stroke-width="1.5"></polyline>
    </svg>
  `;
}

function buildPriceHistoryHTML(priceIntelSection, productId, currentPrice, productData, priceHistory) {
  const dealIndicator = getDealIndicatorLabel(priceHistory?.deal_indicator || priceHistory?.dealIndicator);
  const low = num(priceHistory?.low, currentPrice);
  const high = num(priceHistory?.high, currentPrice);
  const confidence = num(priceHistory?.confidence, 0);

  const section = `
    <div class="price-intel-section" id="price-history-card">
      <header>
        <span class="current-price">${escapeHtml(inr(currentPrice))}</span>
        <span class="deal-indicator">${escapeHtml(dealIndicator)}</span>
        <button class="chevron-toggle" type="button">▼</button>
      </header>
      <div class="content" style="display:none;">
        <h2>15-Day Price History</h2>
        <div class="sparkline-container"></div>
        <div class="stats">
          <span>Low ${escapeHtml(inr(low))}</span>
          <span>High ${escapeHtml(inr(high))}</span>
        </div>
        <div class="deal-banner" style="background-color: ${getDealBannerColor(dealIndicator)};">${escapeHtml(dealIndicator)}</div>
        <span class="confidence-label">Confidence (${escapeHtml(String(confidence))} observations)</span>
      </div>
    </div>

    <div class="price-intel-section" id="price-compare-card">
      <header>
        <h2 style="margin:0;flex:1">Compare Prices</h2>
        <button class="chevron-toggle" type="button">▼</button>
      </header>
      <div class="content" style="display:none;">
        <div id="comparison-list"></div>
        <span class="footnote" style="display:none;">* Approximate match, verify before buying</span>
        <div class="truvak-check"></div>
      </div>
    </div>

    <div class="price-intel-section" id="watchlist-card">
      <header>
        <h2 style="margin:0">Watchlist</h2>
      </header>
      <button class="watchlist-button" type="button">Save to Watchlist</button>
    </div>
  `;

  priceIntelSection.innerHTML = section;

  const sparklineContainer = priceIntelSection.querySelector('.sparkline-container');
  if (sparklineContainer) {
    const points = Array.isArray(priceHistory?.prices)
      ? priceHistory.prices
      : Array.isArray(priceHistory?.data_points)
        ? priceHistory.data_points
        : [];
    createSparkline(sparklineContainer, points);
  }

  const chevronToggles = priceIntelSection.querySelectorAll('.chevron-toggle');
  chevronToggles.forEach((toggle) => {
    toggle.addEventListener('click', () => {
      const card = toggle.closest('.price-intel-section');
      const content = card?.querySelector('.content');
      if (!content) return;

      const opening = content.style.display === 'none';
      content.style.display = opening ? 'block' : 'none';
      toggle.textContent = opening ? '▲' : '▼';
    });
  });

  const watchlistButton = priceIntelSection.querySelector('.watchlist-button');
  if (watchlistButton) {
    watchlistButton.addEventListener('click', async () => {
      const result = await addToWatchlist(
        productId,
        productData?.platform || productData?.source || '',
        productData?.title || productData?.name || 'Unknown Product',
        productData?.productUrl || productData?.url || window.location.href,
        currentPrice
      );

      if (result?.ok) {
        watchlistButton.textContent = 'Saved \\u2713';
        watchlistButton.classList.remove('saving');
        watchlistButton.classList.add('saved');
      }
    });
  }
}

async function loadPriceIntel(productId, platform, currentPrice, productData) {
  const priceIntelSection = getPriceIntelSectionRoot();
  if (!priceIntelSection || !window.TruvakSidebar?.renderSection) {
    console.error('Price intel section not available');
    return;
  }

  ensureSectionStyles();
  window.TruvakSidebar.showSectionLoading('price-intel');

  const apiBase = getApiBaseUrl();
  const safePrice = num(currentPrice, 0);
  const safePlatform = String(platform || '').toLowerCase();

  fetch(`${apiBase}/v1/product/price-point`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      product_id: productId,
      platform: safePlatform,
      current_price: safePrice,
    }),
  }).catch((error) => {
    console.error('Error contributing price:', error);
  });

  let priceHistory = null;
  try {
    const response = await fetch(`${apiBase}/v1/product/price-history/${encodeURIComponent(productId)}?platform=${encodeURIComponent(safePlatform)}`);
    if (!response.ok) throw new Error(`Network response was not ok (${response.status})`);
    priceHistory = await response.json();
    savePriceHistory(productId, priceHistory);
  } catch (error) {
    console.error('Error fetching price history:', error);
    displayMinimalSection(safePrice);
    return;
  }

  buildPriceHistoryHTML(priceIntelSection, productId, safePrice, { ...(productData || {}), platform: safePlatform }, priceHistory);

  fetch(`${apiBase}/v1/product/price-compare/${encodeURIComponent(productId)}?platform=${encodeURIComponent(safePlatform)}&source_price=${encodeURIComponent(safePrice)}`)
    .then(async (response) => {
      if (!response.ok) throw new Error(`Price compare ${response.status}`);
      const bodyText = await response.text();
      return safeJsonParse(bodyText, []);
    })
    .then((comparisonData) => {
      updateComparisonList(comparisonData);
    })
    .catch((error) => {
      console.error('Error fetching price comparison:', error);
      updateComparisonList([]);
    });
}

async function addToWatchlist(productId, platform, name, url, price) {
  const watchlistButton = document.querySelector('#truvak-section-price-intel .watchlist-button');
  if (watchlistButton) {
    watchlistButton.classList.add('saving');
  }

  const existingWatchlist = safeJsonParse(localStorage.getItem(WATCHLIST_KEY), []);
  const dedupKey = `${productId}::${String(platform || '').toLowerCase()}`;

  const alreadyExists = existingWatchlist.some(
    (item) => `${item.productId}::${String(item.platform || '').toLowerCase()}` === dedupKey
  );

  if (alreadyExists) {
    if (watchlistButton) {
      watchlistButton.textContent = 'Already in watchlist';
      watchlistButton.classList.remove('saving', 'saved');
    }
    return { ok: false, reason: 'duplicate' };
  }

  existingWatchlist.push({ productId, platform, name, url, price });
  localStorage.setItem(WATCHLIST_KEY, JSON.stringify(existingWatchlist));

  try {
    const response = await fetch(`${getApiBaseUrl()}/v1/customer/watchlist`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        product_id: productId,
        platform,
        name,
        url,
        price,
      }),
    });

    if (!response.ok) {
      if (watchlistButton) {
        if (response.status === 409) {
          watchlistButton.textContent = 'Already in watchlist';
        } else if (response.status === 401) {
          watchlistButton.textContent = 'Login to save watchlist';
        } else {
          watchlistButton.textContent = 'Save failed';
        }
        watchlistButton.classList.remove('saving', 'saved');
      }
      return { ok: false, reason: `http_${response.status}` };
    }

    if (watchlistButton) {
      watchlistButton.textContent = 'Saved \\u2713';
      watchlistButton.classList.remove('saving');
      watchlistButton.classList.add('saved');
    }
    return { ok: true };
  } catch (error) {
    console.error('Error adding to watchlist:', error);
    if (watchlistButton) {
      watchlistButton.classList.remove('saving');
      watchlistButton.textContent = 'Save failed';
    }
    return { ok: false, reason: 'network' };
  }
}

window.TruvakPriceIntel = {
  loadPriceIntel,
  savePriceHistory,
  addToWatchlist,
  updateComparisonList,
};
