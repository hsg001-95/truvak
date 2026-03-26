// Trust Intelligence Platform
// Amazon Seller Central — Content Script with Sidebar

const TIP_CONFIG = {
  apiUrl:     'http://127.0.0.1:8000',
  merchantId: 'merchant-amazon',
  dashboardUrl: 'http://localhost:8501',
};

// ── State ─────────────────────────────────────────────────────────────────────
let sidebarInjected  = false;
let currentOrderId   = null;
let currentHashedId  = null;
let isCollapsed      = false;

// ── Site config — universal pattern matching ──────────────────────────────────
const SITE_CONFIGS = {
  'sellercentral.amazon': { role: 'merchant', platform: 'Amazon Seller Central' },
  'seller.flipkart':      { role: 'merchant', platform: 'Flipkart Seller Hub'   },
  'amazon.in':            { role: 'customer', platform: 'Amazon'                },
  'flipkart.com':         { role: 'customer', platform: 'Flipkart'              },
  'localhost':            { role: 'merchant', platform: 'Mock Seller Hub'       },
  '127.0.0.1':            { role: 'merchant', platform: 'Mock Seller Hub'       },
};

function getSiteConfig() {
  const host = window.location.hostname;
  for (const [pattern, config] of Object.entries(SITE_CONFIGS)) {
    if (host.includes(pattern)) return config;
  }
  return null;
}

// ── Init ──────────────────────────────────────────────────────────────────────
function init() {
  const config = getSiteConfig();
  if (!config || config.role !== 'merchant') return;

  console.log(`[TIP] Activated on ${config.platform}`);
  injectSidebarStyles();
  injectSidebar(config.platform);
  observePageChanges();

  setTimeout(tryExtractAndScore, 1500);
}

// ── Inject sidebar CSS into page ──────────────────────────────────────────────
function injectSidebarStyles() {
  if (document.getElementById('tip-styles')) return;
  const style = document.createElement('style');
  style.id = 'tip-styles';
  style.textContent = `
    #tip-sidebar {
      position: fixed;
      top: 0; right: 0;
      width: 300px;
      height: 100vh;
      background: #0F172A;
      border-left: 1px solid #1E293B;
      box-shadow: -4px 0 20px rgba(0,0,0,0.3);
      z-index: 999999;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      font-size: 13px;
      color: #E2E8F0;
      display: flex;
      flex-direction: column;
      transition: width 0.25s ease;
      overflow: hidden;
    }

    #tip-sidebar.tip-collapsed {
      width: 42px;
    }

    body.tip-active {
      margin-right: 300px !important;
      transition: margin-right 0.25s ease;
    }

    body.tip-active.tip-collapsed {
      margin-right: 42px !important;
    }

    /* Header */
    #tip-sb-header {
      background: #1E293B;
      padding: 12px 14px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 1px solid #334155;
      flex-shrink: 0;
      cursor: pointer;
      user-select: none;
    }

    #tip-sb-header-left {
      display: flex;
      align-items: center;
      gap: 8px;
      font-weight: 700;
      font-size: 13px;
      color: #E2E8F0;
      white-space: nowrap;
      overflow: hidden;
    }

    #tip-sb-header-icon { font-size: 18px; flex-shrink: 0; }

    #tip-sb-toggle {
      background: #334155;
      border: none;
      color: #94A3B8;
      width: 24px; height: 24px;
      border-radius: 6px;
      cursor: pointer;
      font-size: 14px;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }

    #tip-sb-toggle:hover { background: #475569; color: #E2E8F0; }

    /* Scrollable content */
    #tip-sb-content {
      flex: 1;
      overflow-y: auto;
      overflow-x: hidden;
      padding: 12px;
    }

    #tip-sb-content::-webkit-scrollbar { width: 4px; }
    #tip-sb-content::-webkit-scrollbar-track { background: #0F172A; }
    #tip-sb-content::-webkit-scrollbar-thumb { background: #334155; border-radius: 2px; }

    /* Section cards */
    .tip-section {
      background: #1E293B;
      border-radius: 10px;
      padding: 12px;
      margin-bottom: 10px;
    }

    .tip-section-title {
      font-size: 10px;
      font-weight: 700;
      color: #64748B;
      text-transform: uppercase;
      letter-spacing: .08em;
      margin-bottom: 10px;
    }

    /* Score display */
    .tip-score-row {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 10px;
    }

    .tip-score-circle {
      width: 60px; height: 60px;
      border-radius: 50%;
      border: 3px solid;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }

    .tip-score-circle.low    { border-color:#22C55E; color:#22C55E; background:#052e16; }
    .tip-score-circle.medium { border-color:#F59E0B; color:#F59E0B; background:#1c1003; }
    .tip-score-circle.high   { border-color:#EF4444; color:#EF4444; background:#1f0707; }

    .tip-score-num  { font-size: 20px; font-weight: 700; line-height: 1; }
    .tip-score-sub  { font-size: 9px; opacity: 0.7; margin-top: 1px; }

    .tip-risk-label { font-size: 15px; font-weight: 700; }
    .tip-risk-label.low    { color: #22C55E; }
    .tip-risk-label.medium { color: #F59E0B; }
    .tip-risk-label.high   { color: #EF4444; }

    .tip-rto-prob { font-size: 11px; color: #94A3B8; margin-top: 3px; }
    .tip-order-meta { font-size: 11px; color: #64748B; margin-top: 3px; }

    /* Action button */
    .tip-action-btn {
      width: 100%;
      padding: 9px;
      border: none;
      border-radius: 8px;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      margin-bottom: 8px;
      transition: opacity 0.2s;
    }
    .tip-action-btn:hover { opacity: 0.85; }
    .tip-action-btn.approve    { background:#166534; color:#4ADE80; }
    .tip-action-btn.warn       { background:#1c1003; color:#F59E0B; border:1px solid #F59E0B; }
    .tip-action-btn.block-cod  { background:#DC2626; color:white; }
    .tip-action-btn.flag       { background:#1E3A5F; color:#60A5FA; }

    /* Factors */
    .tip-factor {
      display: flex;
      align-items: flex-start;
      gap: 7px;
      padding: 5px 0;
      border-bottom: 1px solid #0F172A;
      font-size: 11px;
      color: #CBD5E1;
      line-height: 1.4;
    }
    .tip-factor:last-child { border-bottom: none; }
    .tip-dot {
      width: 6px; height: 6px;
      border-radius: 50%;
      margin-top: 4px;
      flex-shrink: 0;
    }
    .tip-dot.red   { background: #EF4444; }
    .tip-dot.amber { background: #F59E0B; }
    .tip-dot.green { background: #22C55E; }

    /* Buyer history */
    .tip-stat-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
      margin-bottom: 8px;
    }

    .tip-stat-box {
      background: #0F172A;
      border-radius: 8px;
      padding: 8px 10px;
      text-align: center;
    }

    .tip-stat-val {
      font-size: 18px;
      font-weight: 700;
      color: #E2E8F0;
    }

    .tip-stat-val.danger { color: #EF4444; }
    .tip-stat-val.good   { color: #22C55E; }

    .tip-stat-lbl {
      font-size: 10px;
      color: #64748B;
      margin-top: 2px;
    }

    .tip-profile-badge {
      font-size: 12px;
      font-weight: 600;
      padding: 6px 10px;
      background: #0F172A;
      border-radius: 8px;
      color: #CBD5E1;
      text-align: center;
      margin-bottom: 8px;
    }

    /* Area intelligence */
    .tip-area-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 5px 0;
      border-bottom: 1px solid #0F172A;
      font-size: 11px;
    }
    .tip-area-row:last-child { border-bottom: none; }
    .tip-area-label { color: #64748B; }
    .tip-area-val   { color: #E2E8F0; font-weight: 600; }
    .tip-area-val.danger { color: #EF4444; }
    .tip-area-val.warn   { color: #F59E0B; }
    .tip-area-val.good   { color: #22C55E; }

    /* Fired rules */
    .tip-rule-tag {
      display: inline-block;
      background: #1c1003;
      color: #F59E0B;
      border: 1px solid #F59E0B33;
      padding: 3px 8px;
      border-radius: 20px;
      font-size: 10px;
      margin: 2px 2px 2px 0;
    }

    /* Override button */
    .tip-override-btn {
      width: 100%;
      padding: 7px;
      background: transparent;
      border: 1px solid #334155;
      border-radius: 8px;
      color: #64748B;
      font-size: 11px;
      cursor: pointer;
      margin-top: 4px;
      transition: all 0.2s;
    }
    .tip-override-btn:hover { border-color:#64748B; color:#94A3B8; }

    /* Dashboard button */
    #tip-dash-btn {
      margin: 8px 12px 12px;
      padding: 10px;
      background: #1D4ED8;
      color: white;
      border: none;
      border-radius: 8px;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      width: calc(100% - 24px);
      transition: background 0.2s;
      flex-shrink: 0;
    }
    #tip-dash-btn:hover { background: #2563EB; }

    /* Privacy footer */
    .tip-privacy {
      font-size: 9px;
      color: #1E293B;
      text-align: center;
      padding: 4px 0;
      word-break: break-all;
    }

    /* Loading */
    .tip-loading {
      text-align: center;
      padding: 24px 0;
      color: #64748B;
    }
    .tip-spinner {
      width: 20px; height: 20px;
      border: 2px solid #1E293B;
      border-top-color: #3B82F6;
      border-radius: 50%;
      animation: tip-spin 0.8s linear infinite;
      margin: 0 auto 8px;
    }
    @keyframes tip-spin { to { transform: rotate(360deg); } }

    /* Error */
    .tip-error {
      text-align: center;
      padding: 16px 0;
      color: #EF4444;
      font-size: 12px;
    }

    /* Collapsed state — show only icon */
    #tip-sidebar.tip-collapsed #tip-sb-content,
    #tip-sidebar.tip-collapsed #tip-dash-btn {
      display: none;
    }

    #tip-sidebar.tip-collapsed #tip-sb-header-left span:not(#tip-sb-header-icon) {
      display: none;
    }

    #tip-sidebar.tip-collapsed #tip-sb-header {
      justify-content: center;
      padding: 12px 0;
    }

    #tip-sidebar.tip-collapsed #tip-sb-toggle {
      display: none;
    }
  `;
  document.head.appendChild(style);
}

// ── Inject sidebar HTML ───────────────────────────────────────────────────────
function injectSidebar(platformName) {
  if (document.getElementById('tip-sidebar')) return;

  document.body.classList.add('tip-active');

  const sidebar = document.createElement('div');
  sidebar.id    = 'tip-sidebar';
  sidebar.innerHTML = `
    <div id="tip-sb-header">
      <div id="tip-sb-header-left">
        <span id="tip-sb-header-icon">🛡️</span>
        <span>Trust Intelligence</span>
      </div>
      <button id="tip-sb-toggle">◀</button>
    </div>
    <div id="tip-sb-content">
      <div class="tip-loading">
        <div class="tip-spinner"></div>
        <div>Waiting for order...</div>
      </div>
    </div>
    <button id="tip-dash-btn">📊 Open Dashboard</button>
  `;

  document.body.appendChild(sidebar);
  sidebarInjected = true;

  // Toggle collapse
  document.getElementById('tip-sb-header').addEventListener('click', toggleSidebar);
  document.getElementById('tip-sb-toggle').addEventListener('click', (e) => {
    e.stopPropagation();
    toggleSidebar();
  });

  // Dashboard button
  document.getElementById('tip-dash-btn').addEventListener('click', () => {
    window.open(TIP_CONFIG.dashboardUrl, '_blank');
  });
}

function toggleSidebar() {
  const sidebar = document.getElementById('tip-sidebar');
  const toggle  = document.getElementById('tip-sb-toggle');
  const body    = document.body;

  isCollapsed = !isCollapsed;
  sidebar.classList.toggle('tip-collapsed', isCollapsed);
  body.classList.toggle('tip-collapsed', isCollapsed);
  if (toggle) toggle.textContent = isCollapsed ? '▶' : '◀';
}

// ── MutationObserver ──────────────────────────────────────────────────────────
function observePageChanges() {
  let timer;
  new MutationObserver(() => {
    clearTimeout(timer);
    timer = setTimeout(tryExtractAndScore, 1200);
  }).observe(document.body, { childList: true, subtree: true });
}

// ── Extract order data ────────────────────────────────────────────────────────
function extractOrderData() {
  const text = document.body.innerText || '';
  const url  = window.location.href;

  // Detect order page
  const isOrderPage = (
    url.includes('/order') ||
    url.includes('order-detail') ||
    url.includes('orderID') ||
    /\d{3}-\d{7}-\d{7}/.test(text) ||
    /OD-\d{10,}/.test(text)
  );
  if (!isOrderPage) return null;

  // Order ID — Amazon or Flipkart format
  let orderId = null;
  const amzMatch  = text.match(/\d{3}-\d{7}-\d{7}/);
  const fkMatch   = text.match(/OD-\d{10,}/);
  if (amzMatch) orderId = amzMatch[0];
  else if (fkMatch) orderId = fkMatch[0];
  if (!orderId) return null;

  // Order value
  let orderValue = 1000;
  const valuePatterns = [
    /(?:Order Total|Grand Total|Total Amount|Total)[:\s]*₹?\s*([0-9,]+\.?[0-9]*)/i,
    /₹\s*([0-9,]+\.?[0-9]*)/,
  ];
  for (const p of valuePatterns) {
    const m = text.match(p);
    if (m) { orderValue = parseFloat(m[1].replace(/,/g, '')); break; }
  }

  // PIN code
  let pinCode = '110001';
  const pins  = text.match(/\b([1-9][0-9]{5})\b/g);
  if (pins && pins.length > 0) pinCode = pins[0];

  // COD detection
  const isCod = /cash on delivery|COD|pay on delivery/i.test(text) ? 1 : 0;

  // Buyer identifier
  let buyerId = orderId;
  const emailMatch = text.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/);
  if (emailMatch) buyerId = emailMatch[0];

  // Item count
  let itemCount = 1;
  const itemMatch = text.match(/(\d+)\s+(?:item|product)/i);
  if (itemMatch) itemCount = parseInt(itemMatch[1]);

  return {
    order_id:     orderId,
    raw_buyer_id: buyerId,
    merchant_id:  TIP_CONFIG.merchantId,
    order_value:  orderValue,
    is_cod:       isCod,
    pin_code:     pinCode,
    item_count:   itemCount,
    installments: 1,
    order_month:  new Date().getMonth() + 1,
  };
}

// ── API calls ─────────────────────────────────────────────────────────────────
async function scoreOrder(payload) {
  const r = await fetch(`${TIP_CONFIG.apiUrl}/v1/score`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(payload),
  });
  if (!r.ok) throw new Error(`Score API ${r.status}`);
  return r.json();
}

async function getBuyerHistory(hashedId) {
  const r = await fetch(
    `${TIP_CONFIG.apiUrl}/v1/buyer/history/${hashedId}/${TIP_CONFIG.merchantId}`
  );
  if (!r.ok) return null;
  return r.json();
}

async function getAreaIntelligence(pinCode) {
  const r = await fetch(
    `${TIP_CONFIG.apiUrl}/v1/area/intelligence/${pinCode}`
  );
  if (!r.ok) return null;
  return r.json();
}

// ── Main flow ─────────────────────────────────────────────────────────────────
async function tryExtractAndScore() {
  const orderData = extractOrderData();
  if (!orderData) return;
  if (orderData.order_id === currentOrderId) return;

  currentOrderId = orderData.order_id;
  showLoading(orderData.order_id);

  try {
    // Score + buyer history + area intel in parallel
    const [scoreResult, areaResult] = await Promise.all([
      scoreOrder(orderData),
      getAreaIntelligence(orderData.pin_code),
    ]);

    currentHashedId = scoreResult.hashed_buyer_id;

    // Fetch buyer history after we have the hashed ID
    const historyResult = await getBuyerHistory(currentHashedId);

    renderSidebar(scoreResult, historyResult, areaResult, orderData);
  } catch (err) {
    showError(err.message);
  }
}

// ── Loading state ─────────────────────────────────────────────────────────────
function showLoading(orderId) {
  const content = document.getElementById('tip-sb-content');
  if (!content) return;
  content.innerHTML = `
    <div class="tip-loading">
      <div class="tip-spinner"></div>
      <div>Scoring ${orderId}...</div>
    </div>
  `;
}

// ── Error state ───────────────────────────────────────────────────────────────
function showError(msg) {
  const content = document.getElementById('tip-sb-content');
  if (!content) return;
  content.innerHTML = `
    <div class="tip-error">
      <div style="font-size:20px;margin-bottom:8px;">⚠️</div>
      <div>Could not score order</div>
      <div style="color:#64748B;margin-top:4px;font-size:10px;">${msg}</div>
      <div style="color:#475569;margin-top:8px;font-size:10px;">
        Is the API running on :8000?
      </div>
    </div>
  `;
}

// ── Render full sidebar ───────────────────────────────────────────────────────
function renderSidebar(score, history, area, orderData) {
  const content = document.getElementById('tip-sb-content');
  if (!content) return;

  const s         = score.score || 0;
  const risk      = score.risk_level || 'UNKNOWN';
  const action    = score.recommended_action || 'approve';
  const factors   = score.factors || [];
  const rules     = score.fired_rules || [];
  const rtoProb   = score.model_rto_prob || 0;
  const hashedId  = score.hashed_buyer_id || '';
  const riskClass = s >= 70 ? 'low' : s >= 40 ? 'medium' : 'high';

  // Action config
  const actions = {
    approve:     { cls:'approve',   label:'✅ Safe to Approve'        },
    warn:        { cls:'warn',      label:'⚠️ Proceed with Caution'   },
    block_cod:   { cls:'block-cod', label:'🚫 Block COD Payment'      },
    flag_review: { cls:'flag',      label:'🔎 Flag for Manual Review'  },
  };
  const ac = actions[action] || actions.approve;

  // Factor dot colors
  const dotColor = f => {
    const fl = f.toLowerCase();
    if (fl.includes('high') || fl.includes('rto') || fl.includes('block'))
      return 'red';
    if (fl.includes('cod') || fl.includes('value') || fl.includes('festive'))
      return 'amber';
    return 'green';
  };

  // ── Section 1: Current Order ──────────────────────────────────────────────
  const section1 = `
    <div class="tip-section">
      <div class="tip-section-title">Current Order</div>
      <div class="tip-score-row">
        <div class="tip-score-circle ${riskClass}">
          <div class="tip-score-num">${s}</div>
          <div class="tip-score-sub">/100</div>
        </div>
        <div>
          <div class="tip-risk-label ${riskClass}">${risk} RISK</div>
          <div class="tip-rto-prob">RTO Prob: ${(rtoProb*100).toFixed(1)}%</div>
          <div class="tip-order-meta">
            ${orderData.is_cod ? '💵 COD' : '💳 Prepaid'} ·
            ₹${orderData.order_value.toLocaleString('en-IN')}
          </div>
          <div class="tip-order-meta">PIN: ${orderData.pin_code}</div>
        </div>
      </div>

      <button class="tip-action-btn ${ac.cls}">${ac.label}</button>

      <div style="margin-bottom:6px;">
        ${factors.map(f => `
          <div class="tip-factor">
            <div class="tip-dot ${dotColor(f)}"></div>
            <span>${f}</span>
          </div>
        `).join('') || '<div class="tip-factor"><div class="tip-dot green"></div><span>No risk factors</span></div>'}
      </div>

      ${rules.length ? `
        <div style="margin-top:6px;">
          ${rules.map(r => `<span class="tip-rule-tag">⚡ ${r}</span>`).join('')}
        </div>
      ` : ''}

      <button class="tip-override-btn" onclick="this.previousElementSibling && (this.textContent='✅ Manually Approved')">
        Override — Mark as Safe
      </button>
    </div>
  `;

  // ── Section 2: Buyer History ──────────────────────────────────────────────
  let section2 = '';
  if (history) {
    const rtoColor      = history.rto_count >= 2 ? 'danger' : history.rto_count === 1 ? 'warn' : 'good';
    const ordersColor   = history.total_orders >= 3 ? 'good' : '';
    section2 = `
      <div class="tip-section">
        <div class="tip-section-title">Buyer History</div>
        <div class="tip-profile-badge">${history.risk_profile}</div>
        <div class="tip-stat-grid">
          <div class="tip-stat-box">
            <div class="tip-stat-val ${ordersColor}">${history.total_orders}</div>
            <div class="tip-stat-lbl">Total Orders</div>
          </div>
          <div class="tip-stat-box">
            <div class="tip-stat-val ${rtoColor}">${history.rto_count}</div>
            <div class="tip-stat-lbl">RTOs</div>
          </div>
          <div class="tip-stat-box">
            <div class="tip-stat-val">${history.delivered_count}</div>
            <div class="tip-stat-lbl">Delivered</div>
          </div>
          <div class="tip-stat-box">
            <div class="tip-stat-val">${history.avg_score}</div>
            <div class="tip-stat-lbl">Avg Score</div>
          </div>
        </div>
        ${history.recent_orders.length > 0 ? `
          <div style="font-size:10px;color:#64748B;margin-top:4px;">Recent orders:</div>
          ${history.recent_orders.slice(0,3).map(o => `
            <div class="tip-area-row">
              <span class="tip-area-label">${o.order_id}</span>
              <span class="tip-area-val ${o.score < 40 ? 'danger' : o.score < 70 ? 'warn' : 'good'}">
                ${o.score}
              </span>
            </div>
          `).join('')}
        ` : '<div style="font-size:11px;color:#475569;text-align:center;">First order from this buyer</div>'}
      </div>
    `;
  }

  // ── Section 3: Area Intelligence ──────────────────────────────────────────
  let section3 = '';
  if (area) {
    const rtoColor = area.area_rto_rate >= 30 ? 'danger' : area.area_rto_rate >= 20 ? 'warn' : 'good';
    const codColor = area.cod_preference >= 60 ? 'danger' : area.cod_preference >= 45 ? 'warn' : 'good';
    section3 = `
      <div class="tip-section">
        <div class="tip-section-title">Area Intelligence — PIN ${area.pin_code}</div>
        <div class="tip-area-row">
          <span class="tip-area-label">Zone</span>
          <span class="tip-area-val">${area.tier_label}</span>
        </div>
        <div class="tip-area-row">
          <span class="tip-area-label">Area Risk</span>
          <span class="tip-area-val ${rtoColor}">${area.area_risk}</span>
        </div>
        <div class="tip-area-row">
          <span class="tip-area-label">Area RTO Rate</span>
          <span class="tip-area-val ${rtoColor}">${area.area_rto_rate}%</span>
        </div>
        <div class="tip-area-row">
          <span class="tip-area-label">COD Preference</span>
          <span class="tip-area-val ${codColor}">${area.cod_preference}%</span>
        </div>
        <div class="tip-area-row">
          <span class="tip-area-label">Internet Access</span>
          <span class="tip-area-val">${area.internet_pct}%</span>
        </div>
        <div class="tip-area-row">
          <span class="tip-area-label">Mobile Ownership</span>
          <span class="tip-area-val">${area.mobile_pct}%</span>
        </div>
        <div class="tip-area-row">
          <span class="tip-area-label">Urban Ratio</span>
          <span class="tip-area-val">${area.urban_pct}%</span>
        </div>
      </div>
    `;
  }

  // ── Privacy footer ────────────────────────────────────────────────────────
  const footer = `
    <div class="tip-privacy">
      🔐 ${hashedId.substring(0, 24)}...
    </div>
  `;

  content.innerHTML = section1 + section2 + section3 + footer;
}

// ── Start ─────────────────────────────────────────────────────────────────────
init();