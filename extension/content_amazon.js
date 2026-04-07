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
let isScoringInFlight = false;
let isSummaryInFlight = false;
let lastSummaryAt     = 0;
let currentViewMode   = 'init';
let extensionEnabled  = true;
let lastBestsellerBootstrapAt = 0;

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

function getDefaultMerchantIdByHost() {
  const host = window.location.hostname;

  if (host.includes('seller.flipkart')) {
    return 'merchant-flipkart';
  }

  if (host.includes('localhost') || host.includes('127.0.0.1')) {
    return 'merchant-local';
  }

  return 'merchant-amazon';
}

async function initCustomerCaptchaRecovery(config) {
  if (!config || config.role !== 'customer') return;
  if (!/amazon\.in/i.test(window.location.hostname)) return;
  if (!/\/dp\/[A-Z0-9]{10}/i.test(window.location.pathname)) return;

  if (!window.TruvakExtractor?.extractPageData) return;

  try {
    const extracted = await window.TruvakExtractor.extractPageData('amazon');
    if (extracted?.blocked && extracted.reason === 'captcha') {
      window.TruvakExtractor.watchForCaptchaResolution?.();
    }
  } catch (error) {
    console.warn('[TIP] Customer captcha recovery bootstrap failed', error);
  }
}

if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
  chrome.runtime.onMessage.addListener((message) => {
    if (!message) return;
    const shouldBootstrap =
      message.action === 'triggerBestsellerScrape' ||
      message.type === 'BOOTSTRAP_SCRAPE';

    if (!shouldBootstrap) return;

    handleBestsellerBootstrap().catch((error) => {
      console.warn('[TIP] Failed to trigger bestseller bootstrap from background', error);
    });
  });
}

// ── Init ──────────────────────────────────────────────────────────────────────
async function init() {
  const config = getSiteConfig();
  if (!config) return;

  await loadRuntimeConfig();
  if (!extensionEnabled) {
    console.log('[TIP] Extension disabled until sign-in toggle is enabled in popup');
    return;
  }

  await initCustomerCaptchaRecovery(config);

  if (config.role === 'customer' && isAmazonBestsellerPage()) {
    await handleBestsellerBootstrap();
    return;
  }

  if (config.role !== 'merchant') return;

  console.log(`[TIP] Activated on ${config.platform}`);
  injectSidebarStyles();
  injectSidebar(config.platform);
  observePageChanges();

  setTimeout(tryExtractAndScore, 900);
}

async function loadRuntimeConfig() {
  if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) return;

  const cfg = await new Promise((resolve) => {
    chrome.storage.local.get(
      ['apiUrl', 'merchantId', 'extensionEnabled'],
      resolve
    );
  });

  const host = window.location.hostname;
  const isLocalHost = host.includes('localhost') || host.includes('127.0.0.1');

  TIP_CONFIG.merchantId = getDefaultMerchantIdByHost();
  TIP_CONFIG.apiUrl = cfg.apiUrl || TIP_CONFIG.apiUrl;
  if (isLocalHost && cfg.merchantId) {
    TIP_CONFIG.merchantId = cfg.merchantId;
  }
  extensionEnabled = typeof cfg.extensionEnabled === 'boolean'
    ? cfg.extensionEnabled
    : true;
}

function isLoggedInSellerPage() {
  const host = window.location.hostname;
  const isLocalMock = host.includes('localhost') || host.includes('127.0.0.1');

  if (!isLocalMock) return true;

  const loginPage = document.getElementById('login-page');
  const appLayout = document.getElementById('app-layout');

  if (loginPage && loginPage.classList.contains('active')) return false;
  if (appLayout && (appLayout.style.display === 'none' || !appLayout.offsetParent)) return false;
  return true;
}

// ── Inject sidebar CSS into page ──────────────────────────────────────────────
function injectSidebarStyles() {
  if (document.getElementById('tip-styles')) return;

  if (!document.getElementById('tip-font-inter')) {
    const fontInter = document.createElement('link');
    fontInter.id = 'tip-font-inter';
    fontInter.rel = 'stylesheet';
    fontInter.href = 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap';
    document.head.appendChild(fontInter);
  }

  if (!document.getElementById('tip-font-material')) {
    const fontMaterial = document.createElement('link');
    fontMaterial.id = 'tip-font-material';
    fontMaterial.rel = 'stylesheet';
    fontMaterial.href = 'https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap';
    document.head.appendChild(fontMaterial);
  }

  const style = document.createElement('style');
  style.id = 'tip-styles';
  style.textContent = `
    #tip-sidebar {
      position: fixed;
      top: 0;
      right: 0;
      width: 300px;
      height: 100vh;
      background: #0D1117;
      border-left: 1px solid #30363D;
      box-shadow: -8px 0 28px rgba(0, 0, 0, 0.45);
      z-index: 999999;
      font-family: Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      color: #dfe2eb;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    body.tip-active {
      margin-right: 300px !important;
      transition: margin-right 0.2s ease;
    }

    #tip-shell {
      display: flex;
      flex-direction: column;
      height: 100%;
      width: 100%;
      background: #0D1117;
    }

    #tip-topbar {
      height: 48px;
      padding: 0 12px;
      background: #10141A;
      border-bottom: 1px solid rgba(255, 255, 255, 0.05);
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    #tip-topbar-left {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    #tip-topbar-title {
      font-size: 14px;
      font-weight: 500;
      letter-spacing: 0.03em;
    }

    .tip-icon-btn {
      width: 28px;
      height: 28px;
      border: 0;
      border-radius: 6px;
      background: transparent;
      color: #c0c7d4;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: background 0.15s ease;
    }

    .tip-icon-btn:hover {
      background: #262a31;
    }

    #tip-nav {
      display: flex;
      flex-direction: column;
      height: calc(100% - 48px);
      background: #0D1117;
      overflow-y: auto;
      overflow-x: hidden;
    }

    #tip-nav::-webkit-scrollbar {
      display: none;
    }

    #tip-nav {
      -ms-overflow-style: none;
      scrollbar-width: none;
    }

    .tip-nav-item {
      border: 0;
      width: 100%;
      background: transparent;
      color: #949a9f;
      padding: 12px 16px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      cursor: pointer;
      transition: background 0.15s ease;
      text-align: left;
    }

    .tip-nav-item:hover {
      background: #262a31;
    }

    .tip-nav-item-left {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .tip-nav-item-label {
      font-size: 12px;
      font-weight: 500;
      letter-spacing: 0.03em;
    }

    #tip-area-wrap {
      background: #262a31;
      border-left: 2px solid #58a6ff;
      display: flex;
      flex-direction: column;
    }

    #tip-area-head {
      padding: 12px 16px;
      color: #a2c9ff;
      font-weight: 600;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    #tip-area-head .tip-nav-item-left {
      gap: 10px;
    }

    #tip-area-content {
      padding: 0 16px 20px;
      display: flex;
      flex-direction: column;
      gap: 14px;
      animation: tipFadeIn 0.25s ease;
    }

    @keyframes tipFadeIn {
      from { opacity: 0; transform: translateY(-4px); }
      to { opacity: 1; transform: translateY(0); }
    }

    #tip-pin-header {
      display: flex;
      align-items: flex-end;
      justify-content: space-between;
      padding-top: 8px;
    }

    #tip-pin-label {
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      color: #c0c7d4;
      font-weight: 700;
      margin-bottom: 4px;
    }

    #tip-pin-code {
      font-size: 28px;
      font-weight: 700;
      color: #ffffff;
      font-family: 'JetBrains Mono', monospace;
      letter-spacing: -0.03em;
      line-height: 1;
    }

    #tip-live-pill {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 9px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: #a2c9ff;
      padding: 2px 8px;
      background: #262a31;
      border: 1px solid rgba(162, 201, 255, 0.22);
      border-radius: 999px;
    }

    #tip-live-dot {
      width: 6px;
      height: 6px;
      border-radius: 999px;
      background: #58a6ff;
      animation: tipPulse 1.8s infinite;
    }

    @keyframes tipPulse {
      0% { opacity: 1; }
      50% { opacity: 0.35; }
      100% { opacity: 1; }
    }

    #tip-area-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
    }

    .tip-area-card {
      background: #181c22;
      border: 1px solid rgba(255, 255, 255, 0.05);
      border-radius: 8px;
      padding: 10px;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .tip-area-card-label {
      font-size: 9px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: #c0c7d4;
      font-weight: 700;
    }

    .tip-area-card-value {
      font-size: 14px;
      font-weight: 700;
      color: #dfe2eb;
      line-height: 1.2;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    #tip-order-score-section {
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 12px;
      border-bottom: 1px solid #30363D;
      background: #0D1117;
    }

    #tip-score-row {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    #tip-gauge-wrap {
      position: relative;
      width: 64px;
      height: 64px;
      flex-shrink: 0;
    }

    #tip-score-svg {
      width: 100%;
      height: 100%;
      transform: rotate(-90deg);
    }

    #tip-score-bg {
      stroke: #1c2026;
      stroke-width: 4;
      fill: transparent;
    }

    #tip-score-ring {
      stroke: #ffba42;
      stroke-width: 4;
      fill: transparent;
      stroke-linecap: round;
      stroke-dasharray: 175.9;
      stroke-dashoffset: 175.9;
      transition: stroke-dashoffset 0.25s ease;
    }

    #tip-score-center {
      position: absolute;
      inset: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
    }

    #tip-score-value {
      font-size: 18px;
      font-weight: 700;
      line-height: 1;
      color: #fff;
    }

    #tip-score-label {
      font-size: 8px;
      text-transform: uppercase;
      color: #9ea3ae;
      font-weight: 500;
      letter-spacing: -0.01em;
    }

    #tip-flag-card {
      flex: 1;
      background: rgba(218, 150, 0, 0.1);
      border: 1px solid rgba(218, 150, 0, 0.3);
      border-radius: 8px;
      padding: 10px;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    #tip-flag-text {
      font-size: 11px;
      color: #ffba42;
      text-transform: uppercase;
      font-weight: 700;
      letter-spacing: 0.02em;
      line-height: 1.25;
    }

    #tip-factor-list {
      display: grid;
      gap: 6px;
    }

    .tip-factor-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-size: 11px;
    }

    .tip-factor-name {
      color: #9ea3ae;
    }

    .tip-factor-state {
      color: #fff;
      font-weight: 500;
    }

    #tip-buyer-wrap {
      border-top: 1px solid #30363D;
      border-bottom: 1px solid #30363D;
      background: rgba(24, 28, 34, 0.3);
    }

    #tip-buyer-head,
    #tip-area-toggle {
      width: 100%;
      border: 0;
      background: transparent;
      padding: 12px 16px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      cursor: pointer;
    }

    #tip-buyer-content,
    #tip-area-inner {
      padding: 0 16px 16px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    #tip-buyer-content.collapsed,
    #tip-area-inner.collapsed {
      display: none;
    }

    #tip-buyer-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
    }

    .tip-buyer-card {
      background: #10141a;
      border: 1px solid rgba(49, 53, 60, 0.3);
      border-radius: 4px;
      padding: 10px;
    }

    .tip-buyer-label {
      font-size: 10px;
      color: #9ea3ae;
      text-transform: uppercase;
      font-weight: 600;
    }

    .tip-buyer-value {
      font-size: 16px;
      font-weight: 700;
      color: #fff;
      margin-top: 4px;
      line-height: 1;
    }

    .tip-buyer-value.small {
      font-size: 12px;
      margin-top: 6px;
    }

    #tip-risk-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
    }

    #tip-risk-chip {
      padding: 4px 8px;
      border-radius: 4px;
      border: 1px solid rgba(63, 185, 80, 0.2);
      background: rgba(63, 185, 80, 0.1);
      color: #3FB950;
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
    }

    #tip-buyer-actions {
      display: flex;
      gap: 8px;
    }

    .tip-mini-btn {
      border: 1px solid;
      background: transparent;
      border-radius: 4px;
      padding: 6px 10px;
      font-size: 10px;
      font-weight: 700;
      cursor: pointer;
    }

    #tip-blacklist { border-color: rgba(239,68,68,0.3); color: #f87171; }
    #tip-whitelist { border-color: rgba(34,197,94,0.3); color: #4ade80; }

    #tip-extension-actions {
      padding: 16px;
      display: grid;
      gap: 10px;
      background: #0D1117;
    }

    .tip-wide-action {
      width: 100%;
      border: 1px solid;
      border-radius: 4px;
      background: transparent;
      padding: 10px 12px;
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      cursor: pointer;
    }

    #tip-delivered { border-color: rgba(34,197,94,0.5); color: #4ade80; }
    #tip-rto { border-color: rgba(239,68,68,0.5); color: #f87171; }
    #tip-return { border-color: rgba(234,179,8,0.5); color: #eab308; }

    #tip-open-dashboard {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 4px;
      color: #2F81F7;
      font-size: 11px;
      font-weight: 500;
      text-decoration: none;
    }

    #tip-signal-wrap {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    #tip-signal-title {
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      color: #c0c7d4;
      font-weight: 700;
    }

    #tip-signal-chips {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 8px;
    }

    .tip-signal-chip {
      background: #31353c;
      border-radius: 6px;
      padding: 6px 8px;
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .tip-signal-chip span:last-child {
      font-size: 10px;
      color: #dfe2eb;
      font-weight: 500;
    }

    #tip-map-card {
      width: 100%;
      height: 96px;
      border-radius: 8px;
      overflow: hidden;
      position: relative;
    }

    #tip-map-card img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      filter: grayscale(1);
      opacity: 0.42;
      transition: opacity 0.4s ease;
    }

    #tip-map-card:hover img {
      opacity: 0.58;
    }

    #tip-map-overlay {
      position: absolute;
      inset: 0;
      background: linear-gradient(to top, #262a31, transparent);
    }

    #tip-map-coords {
      position: absolute;
      left: 8px;
      bottom: 8px;
      display: flex;
      align-items: center;
      gap: 4px;
      font-size: 9px;
      color: #c0c7d4;
      font-family: 'JetBrains Mono', monospace;
    }

    #tip-footer {
      margin-top: auto;
      border-top: 1px solid rgba(65, 71, 82, 0.25);
      padding: 0;
      background: #10141a;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 2px;
      min-height: 58px;
    }

    #tip-footer-brand {
      font-size: 11px;
      color: #9ea3ae;
      font-weight: 500;
    }

    #tip-footer-copy {
      font-size: 10px;
      color: rgba(158,163,174,0.6);
    }

    #tip-skeleton {
      display: none;
      padding: 16px;
      gap: 10px;
    }

    .material-symbols-outlined {
      font-variation-settings: 'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24;
      display: inline-flex;
      align-items: center;
      justify-content: center;
    }

    .tip-shimmer {
      background: #31353c;
      border-radius: 6px;
      animation: tipShimmer 1.1s ease-in-out infinite alternate;
    }

    @keyframes tipShimmer {
      from { opacity: 0.4; }
      to { opacity: 0.85; }
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
    <div id="tip-shell">
      <header id="tip-topbar">
        <div id="tip-topbar-left">
          <span id="tip-topbar-title" style="font-weight:700;color:#fff;letter-spacing:-0.01em;">Truvak</span>
        </div>
        <button class="tip-icon-btn" id="tip-collapse-btn" title="Close">
          <span class="material-symbols-outlined" style="font-size:20px;">chevron_right</span>
        </button>
      </header>

      <nav id="tip-nav">
        <section id="tip-order-score-section">
          <div id="tip-score-row">
            <div id="tip-gauge-wrap">
              <svg id="tip-score-svg" viewBox="0 0 64 64">
                <circle id="tip-score-bg" cx="32" cy="32" r="28"></circle>
                <circle id="tip-score-ring" cx="32" cy="32" r="28"></circle>
              </svg>
              <div id="tip-score-center">
                <span id="tip-score-value">--</span>
                <span id="tip-score-label">Trust</span>
              </div>
            </div>

            <div id="tip-flag-card">
              <span class="material-symbols-outlined" style="font-size:16px;color:#ffba42;">warning</span>
              <span id="tip-flag-text">Awaiting score</span>
            </div>
          </div>

          <div id="tip-factor-list">
            <div class="tip-factor-row"><span class="tip-factor-name">Identity Check</span><span class="tip-factor-state" id="tip-factor-identity">Pending</span></div>
            <div class="tip-factor-row"><span class="tip-factor-name">Address Strength</span><span class="tip-factor-state" id="tip-factor-address">Pending</span></div>
            <div class="tip-factor-row"><span class="tip-factor-name">Previous RTO</span><span class="tip-factor-state" id="tip-factor-rto">Pending</span></div>
          </div>
        </section>

        <section id="tip-buyer-wrap">
          <button id="tip-buyer-head">
            <span style="display:flex;align-items:center;gap:8px;"><span class="material-symbols-outlined" style="font-size:14px;color:#a2c9ff;">history</span><span style="font-size:11px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;">Buyer History</span></span>
            <span class="material-symbols-outlined" style="font-size:16px;color:#9ea3ae;">expand_more</span>
          </button>

          <div id="tip-buyer-content">
            <div id="tip-buyer-grid">
              <div class="tip-buyer-card"><div class="tip-buyer-label">Total Orders</div><div class="tip-buyer-value" id="tip-metric-total">--</div></div>
              <div class="tip-buyer-card"><div class="tip-buyer-label">RTO Count</div><div class="tip-buyer-value" id="tip-metric-rto">--</div></div>
              <div class="tip-buyer-card"><div class="tip-buyer-label">Avg Score</div><div class="tip-buyer-value" id="tip-metric-avg">--</div></div>
              <div class="tip-buyer-card"><div class="tip-buyer-label">First Order</div><div class="tip-buyer-value small" id="tip-metric-first">--</div></div>
            </div>

            <div id="tip-risk-row">
              <span id="tip-risk-chip">Low Risk</span>
              <div id="tip-buyer-actions">
                <button class="tip-mini-btn" id="tip-blacklist">BLACKLIST</button>
                <button class="tip-mini-btn" id="tip-whitelist">WHITELIST</button>
              </div>
            </div>
          </div>
        </section>

        <button class="tip-nav-item" id="tip-nav-score">
          <span class="tip-nav-item-left">
            <span class="material-symbols-outlined" style="font-size:20px;">analytics</span>
            <span class="tip-nav-item-label">Order Score</span>
          </span>
          <span class="material-symbols-outlined" style="font-size:14px;">chevron_right</span>
        </button>

        <button class="tip-nav-item" id="tip-nav-history">
          <span class="tip-nav-item-left">
            <span class="material-symbols-outlined" style="font-size:20px;">history</span>
            <span class="tip-nav-item-label">Buyer History</span>
          </span>
          <span class="material-symbols-outlined" style="font-size:14px;">chevron_right</span>
        </button>

        <section id="tip-area-wrap">
          <button id="tip-area-toggle">
            <span class="tip-nav-item-left">
              <span class="material-symbols-outlined" style="font-size:20px;">explore</span>
              <span class="tip-nav-item-label">Area Intelligence</span>
            </span>
            <span class="material-symbols-outlined" style="font-size:14px;">expand_more</span>
          </button>

          <div id="tip-area-inner">
          <div id="tip-area-content">
            <div id="tip-pin-header">
              <div>
                <div id="tip-pin-label">Current PIN Code</div>
                <div id="tip-pin-code">------</div>
              </div>
              <div id="tip-live-pill">
                <span id="tip-live-dot"></span>
                <span id="tip-live-text">Live</span>
              </div>
            </div>

            <div id="tip-area-grid">
              <div class="tip-area-card">
                <span class="tip-area-card-label">PIN Tier</span>
                <span class="tip-area-card-value" id="tip-tier">--</span>
              </div>
              <div class="tip-area-card">
                <span class="tip-area-card-label">RTO Rate</span>
                <span class="tip-area-card-value" id="tip-rto-rate">--</span>
              </div>
              <div class="tip-area-card">
                <span class="tip-area-card-label">COD Pref</span>
                <span class="tip-area-card-value" id="tip-cod-pref">--</span>
              </div>
              <div class="tip-area-card">
                <span class="tip-area-card-label">District</span>
                <span class="tip-area-card-value" id="tip-district">--</span>
              </div>
            </div>

            <div id="tip-signal-wrap">
              <div id="tip-signal-title">Census Signals</div>
              <div id="tip-signal-chips">
                <div class="tip-signal-chip">
                  <span class="material-symbols-outlined" style="font-size:14px;color:#ffba42;">wifi</span>
                  <span id="tip-signal-internet">-- Internet</span>
                </div>
                <div class="tip-signal-chip">
                  <span class="material-symbols-outlined" style="font-size:14px;color:#a2c9ff;">location_city</span>
                  <span id="tip-signal-urban">-- Urban</span>
                </div>
                <div class="tip-signal-chip" style="grid-column:1 / span 2;">
                  <span class="material-symbols-outlined" style="font-size:14px;color:#aec8ef;">bolt</span>
                  <span id="tip-signal-electric">-- Elec.</span>
                </div>
              </div>
            </div>

            <div id="tip-map-card">
              <img id="tip-map-image" src="https://lh3.googleusercontent.com/aida-public/AB6AXuBcp6iSA30W5Anm2eoBVZZVdjGhNG70scz3Ife-nX7RdCrqFJ5DbWrqEv5FvlheC29DJWpFdZnKKu4xlBV_xiuQEQjkFGeAfgm0F4-h8dNJhPZq2TIPiCkU8smsZhO_WsgfJ5NOaR-YYDe62Gd1tg6rZ_hAbUVrILK4SlgvwKFZ5o7nF81nFwkbXZXRZKytL64DzP48uZWw9xlF3HeyiygWfJ7kX_D1Fqn04l8GdqskimhSAOWNMFGG9RQeKK0LbY3XS3oR-GENMQ" alt="Area map">
              <div id="tip-map-overlay"></div>
              <div id="tip-map-coords">
                <span class="material-symbols-outlined" style="font-size:12px;color:#a2c9ff;">location_on</span>
                <span id="tip-coords">Lat: --, Lon: --</span>
              </div>
            </div>
          </div>
          </div>
        </section>

        <section id="tip-extension-actions">
          <button class="tip-wide-action" id="tip-delivered"><span class="material-symbols-outlined" style="font-size:18px;">check_circle</span><span>Delivered</span></button>
          <button class="tip-wide-action" id="tip-rto"><span class="material-symbols-outlined" style="font-size:18px;">cancel</span><span>RTO</span></button>
          <button class="tip-wide-action" id="tip-return"><span class="material-symbols-outlined" style="font-size:18px;">assignment_return</span><span>Return</span></button>
          <a href="#" id="tip-open-dashboard"><span>Open in Dashboard</span><span class="material-symbols-outlined" style="font-size:14px;">open_in_new</span></a>
        </section>

        <div style="margin-top:auto;border-top:1px solid rgba(65,71,82,0.25);">
          <button class="tip-footer-btn" id="tip-settings-btn" style="border:0;background:transparent;width:100%;display:flex;align-items:center;gap:10px;padding:12px 16px;color:#94a3b8;cursor:pointer;">
            <span class="material-symbols-outlined" style="font-size:20px;">settings</span>
            <span>Settings</span>
          </button>
          <button class="tip-footer-btn" id="tip-support-btn" style="border:0;background:transparent;width:100%;display:flex;align-items:center;gap:10px;padding:12px 16px;color:#94a3b8;cursor:pointer;">
            <span class="material-symbols-outlined" style="font-size:20px;">help</span>
            <span>Support</span>
          </button>
        </div>

        <div id="tip-skeleton">
          <div class="tip-shimmer" style="height:24px;width:48%;"></div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
            <div class="tip-shimmer" style="height:64px;"></div>
            <div class="tip-shimmer" style="height:64px;"></div>
          </div>
          <div class="tip-shimmer" style="height:40px;width:100%;"></div>
        </div>
      </nav>

      <footer id="tip-footer">
        <p id="tip-footer-brand">Truvak by Snoxx Tech</p>
        <p id="tip-footer-copy">© 2024 Snoxx Tech</p>
      </footer>
    </div>
  `;

  document.body.appendChild(sidebar);
  sidebarInjected = true;

  const postOutcome = async (result) => {
    if (!currentOrderId) return;
    try {
      await fetch(`${TIP_CONFIG.apiUrl}/v1/outcome`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          order_id: currentOrderId,
          merchant_id: TIP_CONFIG.merchantId,
          raw_buyer_id: currentHashedId || currentOrderId,
          result,
        }),
      });
    } catch (err) {
      console.warn('[TIP] Failed to log outcome:', err);
    }
  };

  document.getElementById('tip-collapse-btn').addEventListener('click', () => {
    const sidebar = document.getElementById('tip-sidebar');
    if (sidebar) sidebar.style.display = 'none';
    document.body.classList.remove('tip-active');
  });

  document.getElementById('tip-nav-score').addEventListener('click', () => {
    window.open(TIP_CONFIG.dashboardUrl, '_blank');
  });

  document.getElementById('tip-nav-history').addEventListener('click', () => {
    window.open(TIP_CONFIG.dashboardUrl, '_blank');
  });

  document.getElementById('tip-settings-btn').addEventListener('click', () => {
    window.open(TIP_CONFIG.dashboardUrl, '_blank');
  });

  document.getElementById('tip-support-btn').addEventListener('click', () => {
    window.open(TIP_CONFIG.dashboardUrl, '_blank');
  });

  document.getElementById('tip-open-dashboard').addEventListener('click', (e) => {
    e.preventDefault();
    window.open(TIP_CONFIG.dashboardUrl, '_blank');
  });

  document.getElementById('tip-buyer-head').addEventListener('click', () => {
    const body = document.getElementById('tip-buyer-content');
    if (body) body.classList.toggle('collapsed');
  });

  document.getElementById('tip-area-toggle').addEventListener('click', () => {
    const body = document.getElementById('tip-area-inner');
    if (body) body.classList.toggle('collapsed');
  });

  document.getElementById('tip-delivered').addEventListener('click', async () => {
    await postOutcome('delivered');
    document.getElementById('tip-delivered').style.opacity = '0.8';
  });

  document.getElementById('tip-rto').addEventListener('click', async () => {
    await postOutcome('rto');
    document.getElementById('tip-rto').style.opacity = '0.8';
  });

  document.getElementById('tip-return').addEventListener('click', async () => {
    await postOutcome('return');
    document.getElementById('tip-return').style.opacity = '0.8';
  });

  document.getElementById('tip-blacklist').addEventListener('click', () => {
    const chip = document.getElementById('tip-risk-chip');
    chip.textContent = 'High Risk';
    chip.style.color = '#f87171';
    chip.style.background = 'rgba(239,68,68,0.12)';
    chip.style.borderColor = 'rgba(239,68,68,0.22)';
  });

  document.getElementById('tip-whitelist').addEventListener('click', () => {
    const chip = document.getElementById('tip-risk-chip');
    chip.textContent = 'Low Risk';
    chip.style.color = '#4ade80';
    chip.style.background = 'rgba(34,197,94,0.12)';
    chip.style.borderColor = 'rgba(34,197,94,0.22)';
  });
}

function toggleSidebar() {
  // Intentionally kept for compatibility with older calls.
}

// ── MutationObserver ──────────────────────────────────────────────────────────
function observePageChanges() {
  let timer;
  new MutationObserver(() => {
    clearTimeout(timer);
    timer = setTimeout(tryExtractAndScore, 1200);
  }).observe(document.body, { childList: true, subtree: true });
}

function isOrderDetailUrl(url = window.location.href) {
  return (
    url.includes('/order-detail') ||
    url.includes('orderID=') ||
    url.includes('/orders/') ||
    url.includes('order.html')
  );
}

function isAmazonBestsellerPage(url = window.location.href) {
  return /amazon\.in\/(gp\/)?bestsellers/i.test(url);
}

function extractBestsellersPage() {
  const categoryPage =
    (document.querySelector('h1')?.textContent || '').trim() ||
    window.location.pathname
      .split('/')
      .filter((segment) => segment && !segment.includes('bestsellers'))
      .pop() ||
    'bestsellers';

  const cardSelectors = [
    '[data-asin]:not([data-asin=""])',
    '.p13n-sc-uncoverable-faceout',
    '.zg-item-immersion',
    '.s-result-item[data-asin]'
  ];

  const priceSelectors = [
    '.p13n-sc-price',
    '._cDEzb_p13n-sc-price_3mJ9Z',
    '.a-price .a-offscreen',
    '.a-size-base.a-color-price'
  ];

  const titleSelectors = [
    '.p13n-sc-truncate-desktop-type2',
    '._cDEzb_p13n-sc-truncate-desktop_nJ0Hg',
    '.a-size-base-plus',
    '[class*="p13n-sc-truncate"]'
  ];

  const rankSelectors = [
    '.zg-bdg-text',
    '.p13n-sc-badge-label',
    '[class*="zg-badge"]'
  ];

  const seenAsins = new Set();
  const items = [];

  for (const cardSelector of cardSelectors) {
    const cards = document.querySelectorAll(cardSelector);
    cards.forEach((card) => {
      let asin = (card.getAttribute('data-asin') || '').trim();

      if (!asin) {
        const href = card.getAttribute('href') || card.querySelector('a[href*="/dp/"]')?.getAttribute('href') || '';
        asin = href.match(/\/dp\/([A-Z0-9]{10})/i)?.[1] || '';
      }

      if (!asin || seenAsins.has(asin)) return;

      let priceText = '';
      for (const priceSelector of priceSelectors) {
        priceText = (card.querySelector(priceSelector)?.textContent || '').trim();
        if (priceText) break;
      }

      const price = parseFloat(priceText.replace(/[₹,\s]/g, ''));
      if (!Number.isFinite(price) || price <= 0) return;

      let title = '';
      for (const titleSelector of titleSelectors) {
        title = (card.querySelector(titleSelector)?.textContent || '').trim();
        if (title) break;
      }

      let rankText = '';
      for (const rankSelector of rankSelectors) {
        rankText = (card.querySelector(rankSelector)?.textContent || '').trim();
        if (rankText) break;
      }

      const rank = parseInt(rankText.replace(/[^0-9]/g, ''), 10) || null;

      seenAsins.add(asin);
      items.push({
        product_id: asin,
        price,
        title: title.slice(0, 80),
        category: categoryPage,
        rank,
      });
    });
  }

  return items.filter((item) => item.product_id && item.price > 0);
}

function showBootstrapNotice(message) {
  const text = String(message || 'Truvak capture completed').trim();

  const existing = document.getElementById('tip-bootstrap-toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.id = 'tip-bootstrap-toast';
  toast.textContent = text;
  toast.style.position = 'fixed';
  toast.style.bottom = '18px';
  toast.style.right = '18px';
  toast.style.zIndex = '2147483647';
  toast.style.background = 'rgba(13, 17, 23, 0.95)';
  toast.style.color = '#e6edf3';
  toast.style.border = '1px solid #30363D';
  toast.style.borderRadius = '8px';
  toast.style.padding = '8px 10px';
  toast.style.fontSize = '12px';
  toast.style.boxShadow = '0 8px 24px rgba(0, 0, 0, 0.35)';
  document.body.appendChild(toast);

  setTimeout(() => {
    toast.remove();
  }, 3000);
}

async function runBestsellerBootstrap() {
  const items = extractBestsellersPage();
  if (!items.length) return;

  const message = `Truvak captured ${items.length} price points`;

  if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
    chrome.runtime.sendMessage({ type: 'SHOW_NOTIFICATION', message, options: { timeout: 3000 } }, () => {
      // Ignore runtime errors (e.g., no background listener).
    });

    chrome.runtime.sendMessage({ type: 'BESTSELLER_BATCH', items }, (response) => {
      if (chrome.runtime.lastError) {
        postBestsellerBatch(items).catch((error) => {
          console.error('[TIP] Fallback bestseller API post failed:', error);
        });
        return;
      }

      if (!response || !response.ok) {
        postBestsellerBatch(items).catch((error) => {
          console.error('[TIP] Fallback bestseller API post failed:', error);
        });
      }
    });
  } else {
    await postBestsellerBatch(items);
  }

  showBootstrapNotice(message);
}

async function postBestsellerBatch(items) {
  const response = await fetch(`${TIP_CONFIG.apiUrl}/v1/product/bestseller-batch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      items,
      category_page: window.location.pathname,
      page_url: window.location.href,
    }),
  });

  if (!response.ok) {
    throw new Error(`Bestseller batch API ${response.status}`);
  }

  return response.json();
}

async function handleBestsellerBootstrap() {
  if (!isAmazonBestsellerPage()) return;
  if (Date.now() - lastBestsellerBootstrapAt < 15000) return;

  lastBestsellerBootstrapAt = Date.now();
  try {
    await runBestsellerBootstrap();
  } catch (error) {
    console.error('[TIP] Error running bestseller bootstrap:', error);
  }
}

// ── Extract order data ────────────────────────────────────────────────────────
function extractOrderData() {
  const text = document.body.innerText || '';
  const url  = window.location.href;

  // Detect order detail page specifically
  const isOrderDetailPage = isOrderDetailUrl(url);
  if (!isOrderDetailPage) return null;

  // Order ID
  let orderId = null;
  const amzMatch = text.match(/\d{3}-\d{7}-\d{7}/);
  const fkMatch  = text.match(/\bOD-?[A-Z0-9]{10,}\b/i);
  if (amzMatch) orderId = amzMatch[0];
  else if (fkMatch) orderId = fkMatch[0];
  if (!orderId) return null;

  // Order value — look for Rs/INR patterns near total keywords first
  let orderValue = 1000;
  const valuePatterns = [
    /(?:Order Total|Grand Total|Total Amount)[^\n]*?₹\s*([0-9,]+)/i,
    /(?:Order Total|Grand Total|Total Amount)[^\n]*?Rs\.?\s*([0-9,]+)/i,
    /₹\s*([0-9,]+\.[0-9]{2})/,
  ];
  for (const p of valuePatterns) {
    const m = text.match(p);
    if (m) {
      const val = parseFloat(m[1].replace(/,/g, ''));
      if (val > 0 && val < 200000) {
        orderValue = val;
        break;
      }
    }
  }

  // PIN code — search near address block to avoid false matches
  let pinCode = '110001';
  const addressSection = text.match(
    /(?:ship to|shipping address|deliver to|delivery address)([\s\S]{0,400})/i
  );
  const searchText = addressSection ? addressSection[1] : text;
  const pinMatches = searchText.match(/\b([1-9][0-9]{5})\b/g);
  if (pinMatches) {
    const validPin = pinMatches.find((p) => {
      const n = parseInt(p, 10);
      return n >= 110001 && n <= 855126;
    });
    if (validPin) pinCode = validPin;
  }

  // COD detection — rely on payment section first
  const paymentSection = text.match(
    /(?:payment method|payment type|pay with|paid via)([\s\S]{0,200})/i
  );
  const payText = paymentSection ? paymentSection[1].toLowerCase() : '';
  const isCod = (
    /cash on delivery|cod|pay on delivery/.test(payText) ||
    (/cash on delivery|pay on delivery/i.test(text) &&
      !(/paid|prepaid|upi|card|netbanking/i.test(payText)))
  ) ? 1 : 0;

  // Buyer identifier
  let buyerId = orderId;
  const emailMatch = text.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/);
  if (emailMatch) buyerId = emailMatch[0];

  // Item count
  let itemCount = 1;
  const itemMatch = text.match(/(\d+)\s+(?:item|product)s?/i);
  if (itemMatch) itemCount = Math.min(parseInt(itemMatch[1], 10), 20);

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
  if (!extensionEnabled) return;

  if (!isLoggedInSellerPage()) {
    currentOrderId = null;
    currentHashedId = null;
    return;
  }

  const onOrderUrl = isOrderDetailUrl();
  const orderData = extractOrderData();

  if (!orderData) {
    currentOrderId = null;
    currentHashedId = null;

    if (onOrderUrl) {
      if (currentViewMode !== 'order-detecting') {
        showLoading('order details');
        currentViewMode = 'order-detecting';
      }
      return;
    }

    await showMerchantSummary();
    return;
  }

  if (isScoringInFlight) return;
  if (orderData.order_id === currentOrderId && currentViewMode === 'order') return;

  currentOrderId = orderData.order_id;
  showLoading(orderData.order_id);
  currentViewMode = 'order-loading';
  isScoringInFlight = true;

  try {
    const [scoreResult, areaResult] = await Promise.all([
      scoreOrder(orderData),
      getAreaIntelligence(orderData.pin_code),
    ]);

    currentHashedId = scoreResult.hashed_buyer_id;
    const historyResult = await getBuyerHistory(currentHashedId);
    renderSidebar(scoreResult, historyResult, areaResult, orderData);
    currentViewMode = 'order';
  } catch (err) {
    showError(err.message);
    currentViewMode = 'error';
  } finally {
    isScoringInFlight = false;
  }
}

async function showMerchantSummary() {
  const scoreValue = document.getElementById('tip-score-value');
  const scoreRing = document.getElementById('tip-score-ring');
  const flagText = document.getElementById('tip-flag-text');
  const factorIdentity = document.getElementById('tip-factor-identity');
  const factorAddress = document.getElementById('tip-factor-address');
  const factorRto = document.getElementById('tip-factor-rto');
  const pinNode = document.getElementById('tip-pin-code');
  const liveText = document.getElementById('tip-live-text');
  const liveDot = document.getElementById('tip-live-dot');
  const tierNode = document.getElementById('tip-tier');
  const rtoNode = document.getElementById('tip-rto-rate');
  const codNode = document.getElementById('tip-cod-pref');
  const districtNode = document.getElementById('tip-district');
  const internetNode = document.getElementById('tip-signal-internet');
  const urbanNode = document.getElementById('tip-signal-urban');
  const electricNode = document.getElementById('tip-signal-electric');
  const coordsNode = document.getElementById('tip-coords');
  const skeleton = document.getElementById('tip-skeleton');

  if (!scoreValue || !scoreRing || !flagText || !factorIdentity || !factorAddress || !factorRto || !pinNode || !liveText || !liveDot || !tierNode || !rtoNode || !codNode || !districtNode || !internetNode || !urbanNode || !electricNode || !coordsNode || !skeleton) {
    return;
  }

  if (isSummaryInFlight) return;
  if (Date.now() - lastSummaryAt < 15000 && currentViewMode === 'summary') return;

  isSummaryInFlight = true;
  currentViewMode = 'summary-loading';

  scoreValue.textContent = '--';
  scoreRing.style.strokeDashoffset = '175.9';
  flagText.textContent = 'Awaiting score';
  factorIdentity.textContent = 'Pending';
  factorAddress.textContent = 'Pending';
  factorRto.textContent = 'Pending';

  skeleton.style.display = 'flex';
  pinNode.textContent = '------';
  liveText.textContent = 'Syncing';
  liveDot.style.background = '#ffba42';
  tierNode.textContent = '--';
  rtoNode.textContent = '--';
  codNode.textContent = '--';
  districtNode.textContent = '--';
  internetNode.textContent = '-- Internet';
  urbanNode.textContent = '-- Urban';
  electricNode.textContent = '-- Elec.';
  coordsNode.textContent = 'Lat: --, Lon: --';

  try {
    const r = await fetch(
      `${TIP_CONFIG.apiUrl}/v1/scores/${TIP_CONFIG.merchantId}?limit=200`
    );
    if (!r.ok) throw new Error('No data');
    const data = await r.json();
    const orders = data.orders || [];

    if (orders.length === 0) {
      scoreValue.textContent = '--';
      scoreRing.style.strokeDashoffset = '175.9';
      flagText.textContent = 'Open order to score';
      liveText.textContent = 'Idle';
      liveDot.style.background = '#8b919d';
      tierNode.textContent = 'Waiting';
      rtoNode.textContent = '--';
      codNode.textContent = '--';
      districtNode.textContent = 'Open order';
      skeleton.style.display = 'none';
      return;
    }

    const total = orders.length;
    const avgScoreRaw = orders.reduce((sum, o) => sum + (o.score || 0), 0) / total;
    const avgScore = Math.round(avgScoreRaw);
    const avgRto = Math.max(1, Math.min(35, Math.round(orders.filter((o) => o.risk_level === 'HIGH').length / total * 100)));
    const codOrders = orders.filter((o) => o.is_cod === 1).length;
    const codPct = Math.round((codOrders / total) * 100);

    scoreValue.textContent = String(avgScore);
    scoreRing.style.stroke = avgScore >= 70 ? '#3FB950' : avgScore >= 40 ? '#ffba42' : '#f87171';
    scoreRing.style.strokeDashoffset = `${175.9 - (175.9 * Math.max(0, Math.min(100, avgScore))) / 100}`;
    flagText.textContent = avgScore >= 70 ? 'Approve - low risk' : avgScore >= 40 ? 'Flag - review before shipping' : 'Block - high risk order';
    factorIdentity.textContent = avgScore >= 70 ? 'Verified' : 'Check manually';
    factorIdentity.style.color = avgScore >= 70 ? '#4ade80' : '#ffba42';
    factorAddress.textContent = avgRto <= 15 ? 'Strong' : avgRto <= 25 ? 'Moderate' : 'Weak';
    factorAddress.style.color = avgRto <= 15 ? '#4ade80' : avgRto <= 25 ? '#ffba42' : '#f87171';
    factorRto.textContent = avgRto <= 15 ? 'None Found' : `${avgRto}% corridor risk`;

    pinNode.textContent = 'LIVE-DATA';
    liveText.textContent = 'Live';
    liveDot.style.background = '#58a6ff';
    tierNode.textContent = 'Merchant';
    rtoNode.textContent = `${avgRto}%`;
    codNode.textContent = `${codPct}%`;
    districtNode.textContent = 'Across stores';
    internetNode.textContent = 'Realtime Link';
    urbanNode.textContent = `${total} Orders`;
    electricNode.textContent = `${codOrders} COD`;
    coordsNode.textContent = 'Live merchant telemetry';
    skeleton.style.display = 'none';
    currentViewMode = 'summary';
  } catch {
    scoreValue.textContent = '--';
    scoreRing.style.strokeDashoffset = '175.9';
    flagText.textContent = 'Backend unavailable';
    factorIdentity.textContent = 'Unavailable';
    factorAddress.textContent = 'Unavailable';
    factorRto.textContent = 'Unavailable';
    liveText.textContent = 'Offline';
    liveDot.style.background = '#ffb4ab';
    districtNode.textContent = 'Backend unavailable';
    skeleton.style.display = 'none';
    currentViewMode = 'summary';
  } finally {
    lastSummaryAt = Date.now();
    isSummaryInFlight = false;
  }
}

// ── Loading state ─────────────────────────────────────────────────────────────
function showLoading(orderId) {
  const scoreValue = document.getElementById('tip-score-value');
  const scoreRing = document.getElementById('tip-score-ring');
  const flagText = document.getElementById('tip-flag-text');
  const factorIdentity = document.getElementById('tip-factor-identity');
  const factorAddress = document.getElementById('tip-factor-address');
  const factorRto = document.getElementById('tip-factor-rto');
  const pinNode = document.getElementById('tip-pin-code');
  const liveText = document.getElementById('tip-live-text');
  const liveDot = document.getElementById('tip-live-dot');
  const districtNode = document.getElementById('tip-district');
  const skeleton = document.getElementById('tip-skeleton');
  if (!scoreValue || !scoreRing || !flagText || !factorIdentity || !factorAddress || !factorRto || !pinNode || !liveText || !liveDot || !districtNode || !skeleton) return;

  scoreValue.textContent = '--';
  scoreRing.style.strokeDashoffset = '175.9';
  flagText.textContent = 'Scoring in progress';
  factorIdentity.textContent = 'Pending';
  factorAddress.textContent = 'Pending';
  factorRto.textContent = 'Pending';

  pinNode.textContent = String(orderId).slice(-6);
  liveText.textContent = 'Syncing';
  liveDot.style.background = '#ffba42';
  districtNode.textContent = 'Scoring area';
  skeleton.style.display = 'flex';
}

// ── Error state ───────────────────────────────────────────────────────────────
function showError(msg) {
  const scoreValue = document.getElementById('tip-score-value');
  const scoreRing = document.getElementById('tip-score-ring');
  const flagText = document.getElementById('tip-flag-text');
  const factorIdentity = document.getElementById('tip-factor-identity');
  const factorAddress = document.getElementById('tip-factor-address');
  const factorRto = document.getElementById('tip-factor-rto');
  const liveText = document.getElementById('tip-live-text');
  const liveDot = document.getElementById('tip-live-dot');
  const districtNode = document.getElementById('tip-district');
  const skeleton = document.getElementById('tip-skeleton');
  if (!scoreValue || !scoreRing || !flagText || !factorIdentity || !factorAddress || !factorRto || !liveText || !liveDot || !districtNode || !skeleton) return;

  scoreValue.textContent = '--';
  scoreRing.style.strokeDashoffset = '175.9';
  flagText.textContent = 'Flag - API error';
  factorIdentity.textContent = 'Unavailable';
  factorAddress.textContent = 'Unavailable';
  factorRto.textContent = 'Unavailable';

  liveText.textContent = 'Error';
  liveDot.style.background = '#ffb4ab';
  districtNode.textContent = `Error: ${msg}`;
  skeleton.style.display = 'none';
}

// ── Render full sidebar ───────────────────────────────────────────────────────
function renderSidebar(score, history, area, orderData) {
  const scoreValueNode = document.getElementById('tip-score-value');
  const scoreRing = document.getElementById('tip-score-ring');
  const flagText = document.getElementById('tip-flag-text');
  const factorIdentity = document.getElementById('tip-factor-identity');
  const factorAddress = document.getElementById('tip-factor-address');
  const factorRto = document.getElementById('tip-factor-rto');
  const buyerTotalNode = document.getElementById('tip-metric-total');
  const buyerRtoNode = document.getElementById('tip-metric-rto');
  const buyerAvgNode = document.getElementById('tip-metric-avg');
  const buyerFirstNode = document.getElementById('tip-metric-first');
  const riskChip = document.getElementById('tip-risk-chip');
  const pinNode = document.getElementById('tip-pin-code');
  const liveText = document.getElementById('tip-live-text');
  const liveDot = document.getElementById('tip-live-dot');
  const tierNode = document.getElementById('tip-tier');
  const rtoNode = document.getElementById('tip-rto-rate');
  const codNode = document.getElementById('tip-cod-pref');
  const districtNode = document.getElementById('tip-district');
  const internetNode = document.getElementById('tip-signal-internet');
  const urbanNode = document.getElementById('tip-signal-urban');
  const electricNode = document.getElementById('tip-signal-electric');
  const coordsNode = document.getElementById('tip-coords');
  const skeleton = document.getElementById('tip-skeleton');

  if (!scoreValueNode || !scoreRing || !flagText || !factorIdentity || !factorAddress || !factorRto || !buyerTotalNode || !buyerRtoNode || !buyerAvgNode || !buyerFirstNode || !riskChip || !pinNode || !liveText || !liveDot || !tierNode || !rtoNode || !codNode || !districtNode || !internetNode || !urbanNode || !electricNode || !coordsNode || !skeleton) {
    return;
  }

  const scoreValue = Math.max(0, Math.min(100, Math.round(score?.score || 0)));
  const riskLevel = score?.risk_level || 'LOW';
  const historyOrders = history?.total_orders ?? 0;
  const historyRto = history?.rto_count ?? 0;
  const historyAvg = history?.avg_score ?? scoreValue;

  scoreValueNode.textContent = String(scoreValue);
  scoreRing.style.stroke = riskLevel === 'HIGH' ? '#f87171' : riskLevel === 'MEDIUM' ? '#ffba42' : '#3FB950';
  scoreRing.style.strokeDashoffset = `${175.9 - (175.9 * scoreValue) / 100}`;
  flagText.textContent = riskLevel === 'HIGH' ? 'Block - high risk order' : riskLevel === 'MEDIUM' ? 'Flag - Review before shipping' : 'Approve - low risk';

  factorIdentity.textContent = scoreValue >= 70 ? 'Verified' : scoreValue >= 40 ? 'Cross-check' : 'Mismatch';
  factorIdentity.style.color = scoreValue >= 70 ? '#4ade80' : scoreValue >= 40 ? '#ffba42' : '#f87171';
  factorAddress.textContent = area?.area_rto_rate !== undefined && area.area_rto_rate <= 15 ? 'Strong' : area?.area_rto_rate !== undefined && area.area_rto_rate <= 25 ? 'Moderate' : 'Weak';
  factorAddress.style.color = area?.area_rto_rate !== undefined && area.area_rto_rate <= 15 ? '#4ade80' : area?.area_rto_rate !== undefined && area.area_rto_rate <= 25 ? '#ffba42' : '#f87171';
  factorRto.textContent = historyRto === 0 ? 'None Found' : `${historyRto} previous`; 

  buyerTotalNode.textContent = String(historyOrders);
  buyerRtoNode.textContent = String(historyRto);
  buyerAvgNode.textContent = String(historyAvg);
  buyerFirstNode.textContent = history?.recent_orders?.length ? "History" : "New";
  riskChip.textContent = riskLevel === 'HIGH' ? 'High Risk' : riskLevel === 'MEDIUM' ? 'Medium Risk' : 'Low Risk';
  riskChip.style.color = riskLevel === 'HIGH' ? '#f87171' : riskLevel === 'MEDIUM' ? '#ffba42' : '#4ade80';
  riskChip.style.background = riskLevel === 'HIGH' ? 'rgba(239,68,68,0.12)' : riskLevel === 'MEDIUM' ? 'rgba(234,179,8,0.12)' : 'rgba(34,197,94,0.12)';
  riskChip.style.borderColor = riskLevel === 'HIGH' ? 'rgba(239,68,68,0.22)' : riskLevel === 'MEDIUM' ? 'rgba(234,179,8,0.22)' : 'rgba(34,197,94,0.22)';

  const pin = area?.pin_code || orderData.pin_code || '------';
  const tier = area?.tier_label || (area?.pin_tier ? `Tier ${area.pin_tier}` : 'Tier --');
  const rto = area?.area_rto_rate !== undefined ? `${area.area_rto_rate}%` : '--';
  const cod = area?.cod_preference !== undefined ? `${area.cod_preference}%` : (orderData.is_cod ? '100%' : '0%');
  const district = area?.district || area?.district_name || area?.area_name || 'Unknown';
  const internet = area?.internet_pct !== undefined ? `${area.internet_pct}% Internet` : '-- Internet';
  const urban = area?.urban_pct !== undefined ? `${area.urban_pct}% Urban` : '-- Urban';
  const electric = area?.electricity_pct !== undefined
    ? `${area.electricity_pct}% Elec.`
    : area?.electrification_pct !== undefined
      ? `${area.electrification_pct}% Elec.`
      : '-- Elec.';

  pinNode.textContent = String(pin);
  liveText.textContent = 'Live';
  liveDot.style.background = '#58a6ff';
  tierNode.textContent = tier;
  rtoNode.textContent = rto;
  codNode.textContent = cod;
  districtNode.textContent = district;
  internetNode.textContent = internet;
  urbanNode.textContent = urban;
  electricNode.textContent = electric;

  const defaultCoords = 'Lat: 12.9716, Lon: 77.5946';
  if (area?.latitude !== undefined && area?.longitude !== undefined) {
    coordsNode.textContent = `Lat: ${Number(area.latitude).toFixed(4)}, Lon: ${Number(area.longitude).toFixed(4)}`;
  } else {
    coordsNode.textContent = defaultCoords;
  }

  skeleton.style.display = 'none';
}

// ── Start ─────────────────────────────────────────────────────────────────────
init();