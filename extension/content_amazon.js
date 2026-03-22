// Trust Intelligence Platform — Amazon Seller Central Content Script

const TIP_API = 'http://127.0.0.1:8000';
const MERCHANT_ID = 'merchant-amazon';

// ── Selector config — remotely updatable ──────────────────────────────────────
// These selectors target Amazon Seller Central order detail page DOM elements
const SELECTORS = {
  orderIdPatterns: [
    /\d{3}-\d{7}-\d{7}/,          // Standard Amazon order format
    /Order ID[:\s]+([0-9-]+)/i,
  ],
  orderValue: [
    '[data-testid="order-total"]',
    '.order-total-amount',
    'span[class*="OrderTotal"]',
    'td:contains("Order Total") + td',
  ],
  buyerAddress: [
    '[data-testid="shipping-address"]',
    '.shipping-address',
    'div[class*="ShippingAddress"]',
    '.recipient-address',
  ],
  paymentMethod: [
    '[data-testid="payment-method"]',
    '.payment-method',
    'div[class*="PaymentMethod"]',
  ],
  itemCount: [
    '.item-count',
    '[data-testid="item-count"]',
  ]
};

// ── State ─────────────────────────────────────────────────────────────────────
let panelInjected  = false;
let currentOrderId = null;
let isCollapsed    = false;

// ── Main init ─────────────────────────────────────────────────────────────────
function init() {
  console.log('[TIP] Amazon content script loaded');
  observePageChanges();
  tryExtractAndScore();
}

// ── MutationObserver — handles Amazon SPA navigation ─────────────────────────
function observePageChanges() {
  let debounceTimer;
  const observer = new MutationObserver(() => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      tryExtractAndScore();
    }, 1200);
  });
  observer.observe(document.body, {
    childList: true,
    subtree:   true,
  });
}

// ── Extract order data from page ──────────────────────────────────────────────
function extractOrderData() {
  const pageText = document.body.innerText || '';
  const pageUrl  = window.location.href;

  // Only run on order detail pages
  const isOrderPage = (
    pageUrl.includes('/orders/') ||
    pageUrl.includes('order-details') ||
    pageUrl.includes('orderID') ||
    /\d{3}-\d{7}-\d{7}/.test(pageText)
  );

  if (!isOrderPage) return null;

  // Extract order ID
  let orderId = null;
  const orderMatch = pageText.match(/\d{3}-\d{7}-\d{7}/);
  if (orderMatch) orderId = orderMatch[0];
  if (!orderId) return null;

  // Extract order value
  let orderValue = 1000; // fallback
  const valuePatterns = [
    /(?:Order Total|Grand Total|Total)[:\s₹$]*([0-9,]+\.?[0-9]*)/i,
    /₹\s*([0-9,]+\.?[0-9]*)/,
    /Rs\.?\s*([0-9,]+\.?[0-9]*)/i,
  ];
  for (const pattern of valuePatterns) {
    const match = pageText.match(pattern);
    if (match) {
      orderValue = parseFloat(match[1].replace(/,/g, ''));
      break;
    }
  }

  // Extract PIN code from shipping address
  let pinCode = '110001'; // fallback Delhi Tier-1
  const pinMatch = pageText.match(/\b([1-9][0-9]{5})\b/);
  if (pinMatch) pinCode = pinMatch[1];

  // Detect COD payment
  const codKeywords = ['cash on delivery', 'cod', 'pay on delivery', 'cash'];
  const isCod = codKeywords.some(kw =>
    pageText.toLowerCase().includes(kw)
  ) ? 1 : 0;

  // Extract buyer email/phone for hashing
  let buyerId = orderId; // use order ID as fallback buyer identifier
  const emailMatch = pageText.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  if (emailMatch) buyerId = emailMatch[0];

  // Item count
  let itemCount = 1;
  const itemMatch = pageText.match(/(\d+)\s+(?:item|product)/i);
  if (itemMatch) itemCount = parseInt(itemMatch[1]);

  // Order month
  const orderMonth = new Date().getMonth() + 1;

  return {
    order_id:     orderId,
    raw_buyer_id: buyerId,
    merchant_id:  MERCHANT_ID,
    order_value:  orderValue,
    is_cod:       isCod,
    pin_code:     pinCode,
    item_count:   itemCount,
    installments: 1,
    order_month:  orderMonth,
  };
}

// ── Score order via API ───────────────────────────────────────────────────────
async function scoreOrder(orderData) {
  const response = await fetch(`${TIP_API}/v1/score`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(orderData),
  });
  if (!response.ok) throw new Error(`API ${response.status}`);
  return response.json();
}

// ── Main flow ─────────────────────────────────────────────────────────────────
async function tryExtractAndScore() {
  const orderData = extractOrderData();
  if (!orderData) return;

  // Skip if same order already scored
  if (orderData.order_id === currentOrderId && panelInjected) return;
  currentOrderId = orderData.order_id;

  // Show loading panel
  injectPanel();
  showLoading(orderData.order_id);

  try {
    const result = await scoreOrder(orderData);
    showResult(result, orderData);
  } catch (err) {
    showError(err.message);
  }
}

// ── Panel injection ───────────────────────────────────────────────────────────
function injectPanel() {
  if (document.getElementById('tip-panel')) return;

  const panel = document.createElement('div');
  panel.id    = 'tip-panel';
  panel.innerHTML = `
    <div id="tip-header">
      <div id="tip-header-left">
        <span>🛡️</span>
        <span>Trust Intelligence</span>
      </div>
      <button id="tip-toggle-btn">−</button>
    </div>
    <div id="tip-body">
      <div id="tip-loading">
        <div class="tip-spinner"></div>
        <div>Scoring order...</div>
      </div>
    </div>
  `;

  document.body.appendChild(panel);
  panelInjected = true;

  // Toggle collapse
  document.getElementById('tip-header').addEventListener('click', togglePanel);
  document.getElementById('tip-toggle-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    togglePanel();
  });
}

function togglePanel() {
  const panel  = document.getElementById('tip-panel');
  const btn    = document.getElementById('tip-toggle-btn');
  isCollapsed  = !isCollapsed;
  panel.classList.toggle('tip-collapsed', isCollapsed);
  btn.textContent = isCollapsed ? '+' : '−';
}

// ── Loading state ─────────────────────────────────────────────────────────────
function showLoading(orderId) {
  const body = document.getElementById('tip-body');
  if (!body) return;
  body.innerHTML = `
    <div id="tip-loading">
      <div class="tip-spinner"></div>
      <div>Scoring order ${orderId}...</div>
    </div>
  `;
}

// ── Error state ───────────────────────────────────────────────────────────────
function showError(message) {
  const body = document.getElementById('tip-body');
  if (!body) return;
  body.innerHTML = `
    <div id="tip-error">
      <div style="font-size:20px;margin-bottom:8px;">⚠️</div>
      <div>Could not score order</div>
      <div style="color:#64748B;margin-top:4px;font-size:11px;">${message}</div>
      <div style="color:#64748B;margin-top:8px;font-size:11px;">
        Is the API running on port 8000?
      </div>
    </div>
  `;
}

// ── Result display ────────────────────────────────────────────────────────────
function showResult(result, orderData) {
  const body = document.getElementById('tip-body');
  if (!body) return;

  const score      = result.score || 0;
  const riskLevel  = result.risk_level || 'UNKNOWN';
  const action     = result.recommended_action || 'approve';
  const factors    = result.factors || [];
  const firedRules = result.fired_rules || [];
  const rtoProb    = result.model_rto_prob || 0;
  const hashedId   = result.hashed_buyer_id || '';

  // Risk class
  const riskClass  = score >= 70 ? 'tip-low' : score >= 40 ? 'tip-medium' : 'tip-high';

  // Action config
  const actionConfig = {
    approve:     { cls: 'tip-approve',   label: '✅ Safe to Approve',       },
    warn:        { cls: 'tip-warn',      label: '⚠️ Proceed with Caution',  },
    block_cod:   { cls: 'tip-block-cod', label: '🚫 Block COD Payment',     },
    flag_review: { cls: 'tip-flag',      label: '🔎 Flag for Manual Review', },
  };
  const ac = actionConfig[action] || actionConfig.approve;

  // Factor dots
  const factorDotColor = (f) => {
    if (f.toLowerCase().includes('high') || f.toLowerCase().includes('rto'))
      return 'red';
    if (f.toLowerCase().includes('cod') || f.toLowerCase().includes('value'))
      return 'amber';
    return 'green';
  };

  const factorsHtml = factors.map(f => `
    <div class="tip-factor">
      <div class="tip-factor-dot ${factorDotColor(f)}"></div>
      <span>${f}</span>
    </div>
  `).join('');

  const rulesHtml = firedRules.length > 0
    ? `<div id="tip-rules">⚡ ${firedRules.join(' · ')}</div>`
    : '';

  body.innerHTML = `
    <div id="tip-score-section">
      <div id="tip-score-circle" class="${riskClass}">
        <div id="tip-score-number">${score}</div>
        <div id="tip-score-label">/ 100</div>
      </div>
      <div id="tip-score-info">
        <div id="tip-risk-level" class="${riskClass}">${riskLevel} RISK</div>
        <div id="tip-rto-prob">RTO Probability: ${(rtoProb * 100).toFixed(1)}%</div>
        <div style="font-size:11px;color:#64748B;margin-top:2px;">
          ${orderData.is_cod ? '💵 COD' : '💳 Prepaid'} ·
          PIN: ${orderData.pin_code} ·
          ₹${orderData.order_value.toLocaleString('en-IN')}
        </div>
      </div>
    </div>

    <button id="tip-action" class="${ac.cls}">${ac.label}</button>

    <div id="tip-factors-title">Risk Factors</div>
    ${factorsHtml || '<div class="tip-factor"><div class="tip-factor-dot green"></div><span>No risk factors detected</span></div>'}

    ${rulesHtml}

    <button id="tip-override">Override — Mark as Safe</button>

    <div id="tip-privacy">🔐 ${hashedId.substring(0, 20)}...</div>
  `;

  // Override button
  document.getElementById('tip-override').addEventListener('click', () => {
    document.getElementById('tip-action').textContent = '✅ Manually Approved';
    document.getElementById('tip-action').className   = 'tip-action tip-approve';
  });
}

// ── Start ─────────────────────────────────────────────────────────────────────
init();