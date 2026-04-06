const STORAGE_KEY_PREFIX = 'truvak_dp_';
const COUNTDOWN_RECHECK_MS = 3000;

let detectedPatterns = [];
let countdownValues = loadCountdownSnapshot();
let currentProductId = '';

function loadCountdownSnapshot() {
  try {
    const raw = sessionStorage.getItem(`${STORAGE_KEY_PREFIX}countdown_snapshot`);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function persistCountdownSnapshot() {
  try {
    sessionStorage.setItem(
      `${STORAGE_KEY_PREFIX}countdown_snapshot`,
      JSON.stringify(countdownValues)
    );
  } catch {
    // Ignore storage errors in strict browsing contexts.
  }
}

function normalizeText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function detectFakeCountdown() {
  const timerElements = document.querySelectorAll(
    '[class*="countdown"], [class*="timer"], [class*="deal-timer"], [id*="countdown"], [data-timer], .a-box .a-text-bold'
  );

  const now = Date.now();
  timerElements.forEach((element, index) => {
    const value = normalizeText(element.textContent);
    if (!value) return;

    const key = `${element.className || 'no-class'}|${element.id || 'no-id'}|${index}`;
    const previous = countdownValues[key];

    if (previous) {
      const prevNum = Number.parseInt(previous.value.replace(/[^0-9]/g, ''), 10);
      const currNum = Number.parseInt(value.replace(/[^0-9]/g, ''), 10);

      const hasSameValue = value === previous.value;
      const valueIncreased = Number.isFinite(prevNum) && Number.isFinite(currNum) && currNum > prevNum;
      const hasStalledLongEnough = now - previous.timestamp >= COUNTDOWN_RECHECK_MS;

      if (hasStalledLongEnough && (hasSameValue || valueIncreased)) {
        detectedPatterns.push({
          type: 'FAKE_COUNTDOWN',
          message: 'This countdown may be artificial',
          detail: 'Timer appears to reset or not change',
        });
      }
    }

    countdownValues[key] = { value, timestamp: now };
  });

  persistCountdownSnapshot();
}

function detectFalseStock() {
  const availabilityElements = document.querySelectorAll('[class*="availability"], #availability');

  availabilityElements.forEach((element) => {
    const stockText = normalizeText(element.textContent).toLowerCase();
    if (!stockText) return;

    if (stockText.includes('only') || stockText.includes('left in stock') || stockText.includes('remaining')) {
      const countMatch = stockText.match(/(\d+)\s*(?:left|remaining|in stock)/i);
      if (!countMatch) return;

      const currentCount = Number.parseInt(countMatch[1], 10);
      if (!Number.isFinite(currentCount)) return;

      const key = `${STORAGE_KEY_PREFIX}stock_${currentProductId || 'unknown'}_${currentCount}`;
      if (localStorage.getItem(key)) {
        detectedPatterns.push({
          type: 'FALSE_LOW_STOCK',
          message: 'Stock claim unverified by Truvak',
          detail: 'Same stock count seen on multiple visits',
        });
      }

      localStorage.setItem(key, JSON.stringify({ value: currentCount, timestamp: Date.now() }));
    }
  });
}

function detectDripPricing(originalPrice) {
  const basePrice = Number(originalPrice);
  if (!Number.isFinite(basePrice) || basePrice <= 0) return;

  const currentUrl = window.location.href.toLowerCase();
  if (!currentUrl.includes('/cart') && !currentUrl.includes('/checkout')) return;

  const totalElements = document.querySelectorAll('[class*="total"], [id*="total"], [data-testid*="total"]');

  totalElements.forEach((element) => {
    const currentPrice = Number.parseFloat(normalizeText(element.textContent).replace(/[^0-9.]/g, ''));
    if (!Number.isFinite(currentPrice)) return;

    if (currentPrice > basePrice + 50) {
      const difference = currentPrice - basePrice;
      detectedPatterns.push({
        type: 'DRIP_PRICING',
        message: `Price increased by INR ${difference.toFixed(2)} at checkout`,
        detail: 'Additional charges added at checkout stage',
      });
    }
  });
}

function getElementsContainingText(needleList) {
  const allNodes = document.querySelectorAll('div, span, p, li, td, strong, b');
  const loweredNeedles = needleList.map((v) => v.toLowerCase());
  const matches = [];

  allNodes.forEach((node) => {
    const txt = normalizeText(node.textContent).toLowerCase();
    if (!txt) return;
    if (loweredNeedles.some((needle) => txt.includes(needle))) {
      matches.push(node);
    }
  });

  return matches;
}

function detectHiddenCODFee() {
  const codFeeElements = [
    ...document.querySelectorAll('[class*="cod-charges"], [class*="cod-fee"], [id*="cod"]'),
    ...getElementsContainingText(['cash on delivery charges', 'cod fee', 'cod charges']),
  ];

  if (!codFeeElements.length) return;

  const lastProductPageURL = sessionStorage.getItem(`${STORAGE_KEY_PREFIX}product_page_url`) || '';
  const currentUrl = window.location.href;
  const isCheckoutLike = /\/cart|\/checkout/i.test(currentUrl);

  if (!isCheckoutLike || (lastProductPageURL && currentUrl === lastProductPageURL)) {
    return;
  }

  codFeeElements.forEach((element) => {
    const feeText = normalizeText(element.textContent).toLowerCase();
    const amountMatch = feeText.match(/(?:inr|rs\.?|rupee|rupees)?\s*(\d+(?:\.\d+)?)/i);
    const feeAmount = amountMatch ? Number.parseFloat(amountMatch[1]) : NaN;

    detectedPatterns.push({
      type: 'HIDDEN_COD_FEE',
      message: Number.isFinite(feeAmount)
        ? `COD fee INR ${feeAmount.toFixed(2)} not shown on product page`
        : 'COD fee appears to be revealed late in checkout',
      detail: 'This charge was only revealed at checkout',
    });
  });

  sessionStorage.setItem(`${STORAGE_KEY_PREFIX}product_page_url`, currentUrl);
}

function dedupePatterns(patterns) {
  const seen = new Set();
  return patterns.filter((pattern) => {
    const key = `${pattern.type}|${pattern.message}|${pattern.detail}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function runDarkPatternDetection(productId, platform, originalPrice) {
  currentProductId = String(productId || '').trim();
  detectedPatterns = [];

  detectFakeCountdown();
  detectFalseStock();
  detectDripPricing(originalPrice);
  detectHiddenCODFee();

  const patterns = dedupePatterns(detectedPatterns);

  try {
    localStorage.setItem(
      `${STORAGE_KEY_PREFIX}last_scan_${platform || 'unknown'}_${currentProductId || 'unknown'}`,
      JSON.stringify({ at: Date.now(), patterns })
    );
  } catch {
    // Ignore localStorage quota errors.
  }

  return patterns;
}

function buildDarkPatternHTML(patterns) {
  if (!Array.isArray(patterns) || patterns.length === 0) return null;

  const cards = patterns.map((pattern) => `
    <div class="alert-card">
      <div class="card-header" style="border-left: 3px solid #F85149; background-color: rgba(248,81,73,0.08); border-radius: 8px; padding: 10px 12px;">
        <h3 style="margin:0 0 4px;font-size:13px;color:#f85149;">${escapeHtml(pattern.message)}</h3>
        <p style="margin:0;font-size:12px;color:#8B949E;">${escapeHtml(pattern.detail)}</p>
      </div>
    </div>
  `).join('');

  return `
    <div class="dark-pattern-section" style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
      <span class="pulsing-dot" style="width:10px;height:10px;border-radius:50%;background:#F85149;display:inline-block;"></span>
      <h2 style="margin:0;font-size:13px;color:#e6edf3;">Dark Patterns Detected</h2>
      <span class="count-badge" style="margin-left:auto;background:#2d333b;color:#c9d1d9;border-radius:999px;padding:2px 8px;font-size:11px;">${patterns.length} found</span>
    </div>
    ${cards}
  `;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function injectDarkPatternStyles() {
  if (document.getElementById('truvak-dark-pattern-styles')) return;

  const style = document.createElement('style');
  style.id = 'truvak-dark-pattern-styles';
  style.textContent = `
    .pulsing-dot {
      box-shadow: inset 0 0 15px rgba(248, 81, 73, 0.6), inset 0 0 10px rgba(248, 81, 73, 0.4);
      animation: truvakDpPulse 2s infinite;
    }

    @keyframes truvakDpPulse {
      0% {
        box-shadow: inset 0 0 15px rgba(248, 81, 73, 0.6), inset 0 0 10px rgba(248, 81, 73, 0.4);
      }
      50% {
        box-shadow: inset 0 0 20px rgba(248, 81, 73, 0.9), inset 0 0 15px rgba(248, 81, 73, 0.6);
      }
      100% {
        box-shadow: inset 0 0 15px rgba(248, 81, 73, 0.4), inset 0 0 10px rgba(248, 81, 73, 0.6);
      }
    }
  `;

  document.head.appendChild(style);
}

injectDarkPatternStyles();

window.TruvakDarkPatternDetector = {
  runDarkPatternDetection,
  buildDarkPatternHTML,
};
