const TRUVAK_API = 'http://127.0.0.1:8000';

const SECTION_ORDER = [
  'product-header',
  'review-shield',
  'seller-trust',
  'price-intel',
  'delivery-intel',
  'dark-patterns',
  'actions',
];

const state = {
  authToken: '',
  pageContext: null,
  productData: null,
  sidebar: null,
  contentArea: null,
  collapseButton: null,
  splashScreen: null,
  originalBodyMarginRight: '',
  isOpen: true,
};

async function getAuthToken() {
  try {
    if (typeof chrome === 'undefined' || !chrome.storage) {
      state.authToken = '';
      return state.authToken;
    }

    const storageArea = chrome.storage.sync || chrome.storage.local;
    if (!storageArea || !storageArea.get) {
      state.authToken = '';
      return state.authToken;
    }

    const storage = await storageArea.get('truvak_customer_token');
    state.authToken = storage.truvak_customer_token || '';
    return state.authToken;
  } catch (error) {
    console.error('Failed to get token:', error);
    state.authToken = '';
    return state.authToken;
  }
}

function ensureStyles() {
  if (document.getElementById('truvak-customer-sidebar-styles')) return;

  const style = document.createElement('style');
  style.id = 'truvak-customer-sidebar-styles';
  style.textContent = `
    #truvak-customer-sidebar {
      width: 300px;
      height: 100vh;
      position: fixed;
      right: 0;
      top: 0;
      background: #0D1117;
      border-left: 1px solid #30363D;
      z-index: 2147483647;
      display: flex;
      flex-direction: column;
      box-shadow: -4px 0 20px rgba(0, 0, 0, 0.5);
      transform: translateX(300px);
      opacity: 0;
      transition: transform 220ms ease, opacity 220ms ease;
      font-family: Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      color: #e6edf3;
    }

    #truvak-customer-sidebar * {
      box-sizing: border-box;
    }

    #truvak-customer-sidebar .truvak-header {
      background: #161B22;
      border-bottom: 1px solid #30363D;
      height: 48px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 14px;
      flex-shrink: 0;
    }

    #truvak-customer-sidebar .truvak-header-title {
      color: #ffffff;
      font-size: 16px;
      font-weight: 700;
      letter-spacing: 0.02em;
    }

    #truvak-customer-sidebar .truvak-collapse-btn {
      border: 0;
      background: transparent;
      color: #8B949E;
      cursor: pointer;
      font-size: 18px;
      line-height: 1;
      width: 28px;
      height: 28px;
      border-radius: 6px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      transition: background 150ms ease;
    }

    #truvak-customer-sidebar .truvak-collapse-btn:hover {
      background: #222a33;
    }

    #truvak-customer-sidebar .truvak-content {
      flex: 1;
      overflow-y: auto;
      padding: 10px;
      display: block;
      background: #0D1117;
    }

    #truvak-customer-sidebar .truvak-section {
      border: 1px solid #30363D;
      background: #111827;
      border-radius: 10px;
      margin-bottom: 10px;
      padding: 10px;
      min-height: 42px;
    }

    #truvak-customer-sidebar .truvak-footer {
      background: #0D1117;
      border-top: 1px solid #30363D;
      min-height: 32px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 12px;
      flex-shrink: 0;
      gap: 8px;
    }

    #truvak-customer-sidebar .truvak-footer-text {
      color: #8B949E;
      font-size: 10px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    #truvak-customer-sidebar .truvak-splash {
      position: absolute;
      inset: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      background: rgba(13, 17, 23, 0.97);
      z-index: 2;
      gap: 8px;
      pointer-events: none;
    }

    #truvak-customer-sidebar .truvak-brand {
      color: #ffffff;
      font-size: 24px;
      font-weight: 800;
      font-family: Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    }

    #truvak-customer-sidebar .truvak-credit {
      color: #2F81F7;
      font-size: 12px;
    }

    #truvak-customer-sidebar .truvak-spinner {
      width: 24px;
      height: 24px;
      border: 3px solid #1b2430;
      border-top-color: #2F81F7;
      border-radius: 50%;
      animation: truvak-spin 1.1s linear infinite;
    }

    #truvak-customer-sidebar .truvak-skeleton-loader {
      width: 100%;
      height: 18px;
      border-radius: 6px;
      background: linear-gradient(90deg, #1a2330 25%, #233046 37%, #1a2330 63%);
      background-size: 400% 100%;
      animation: truvak-shimmer 1.4s ease infinite;
    }

    #truvak-customer-sidebar .truvak-error-message {
      color: #ff7b72;
      font-size: 12px;
      line-height: 1.4;
    }

    @keyframes truvak-spin {
      to { transform: rotate(360deg); }
    }

    @keyframes truvak-shimmer {
      0% { background-position: 100% 0; }
      100% { background-position: 0 0; }
    }
  `;

  document.head.appendChild(style);
}

function sanitizeHtml(input) {
  if (typeof input !== 'string') return '';
  return input
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
    .replace(/\son\w+\s*=\s*"[^"]*"/gi, '')
    .replace(/\son\w+\s*=\s*'[^']*'/gi, '')
    .replace(/\son\w+\s*=\s*[^\s>]+/gi, '');
}

function createSidebar() {
  ensureStyles();

  const existing = document.getElementById('truvak-customer-sidebar');
  if (existing) {
    state.sidebar = existing;
    state.contentArea = existing.querySelector('.truvak-content');
    state.collapseButton = existing.querySelector('.truvak-collapse-btn');
    state.splashScreen = existing.querySelector('.truvak-splash');
    return existing;
  }

  const sidebar = document.createElement('div');
  sidebar.id = 'truvak-customer-sidebar';
  sidebar.setAttribute('aria-label', 'Truvak Customer Sidebar');

  const header = document.createElement('div');
  header.className = 'truvak-header';

  const headerText = document.createElement('div');
  headerText.className = 'truvak-header-title';
  headerText.textContent = 'Truvak';

  const collapseButton = document.createElement('button');
  collapseButton.className = 'truvak-collapse-btn';
  collapseButton.type = 'button';
  collapseButton.setAttribute('aria-label', 'Collapse sidebar');
  collapseButton.textContent = '\u2190';

  header.appendChild(headerText);
  header.appendChild(collapseButton);

  const contentArea = document.createElement('div');
  contentArea.className = 'truvak-content';

  for (const sectionId of SECTION_ORDER) {
    const section = document.createElement('div');
    section.className = 'truvak-section';
    section.id = `truvak-section-${sectionId}`;
    contentArea.appendChild(section);
  }

  const footer = document.createElement('div');
  footer.className = 'truvak-footer';

  const footerText1 = document.createElement('div');
  footerText1.className = 'truvak-footer-text';
  footerText1.textContent = 'Truvak by Snoxx Tech';

  const footerText2 = document.createElement('div');
  footerText2.className = 'truvak-footer-text';
  footerText2.textContent = '\u00a9 2024 Snoxx Tech';

  footer.appendChild(footerText1);
  footer.appendChild(footerText2);

  const splashScreen = document.createElement('div');
  splashScreen.className = 'truvak-splash';

  const truvakText = document.createElement('div');
  truvakText.className = 'truvak-brand';
  truvakText.textContent = 'Truvak';

  const developerText = document.createElement('div');
  developerText.className = 'truvak-credit';
  developerText.textContent = 'Developed by Snoxx Tech';

  const spinner = document.createElement('div');
  spinner.className = 'truvak-spinner';

  splashScreen.appendChild(truvakText);
  splashScreen.appendChild(developerText);
  splashScreen.appendChild(spinner);

  sidebar.appendChild(header);
  sidebar.appendChild(contentArea);
  sidebar.appendChild(footer);
  sidebar.appendChild(splashScreen);
  document.body.appendChild(sidebar);

  state.sidebar = sidebar;
  state.contentArea = contentArea;
  state.collapseButton = collapseButton;
  state.splashScreen = splashScreen;

  return sidebar;
}

function animateSidebar(sidebar, open) {
  if (!sidebar) return;
  if (open) {
    sidebar.style.transform = 'translateX(0)';
    sidebar.style.opacity = '1';
  } else {
    sidebar.style.transform = 'translateX(300px)';
    sidebar.style.opacity = '0';
  }
}

function updateBodyOffset(open) {
  if (open) {
    document.body.style.marginRight = '300px';
    if (state.contentArea) state.contentArea.style.display = 'block';
    if (state.collapseButton) state.collapseButton.textContent = '\u2190';
  } else {
    document.body.style.marginRight = '40px';
    if (state.contentArea) state.contentArea.style.display = 'none';
    if (state.collapseButton) state.collapseButton.textContent = '\u2192';
  }
}

async function fetchSectionData(sectionId) {
  try {
    const query = new URLSearchParams({ section: sectionId });
    if (state.pageContext && state.pageContext.platform) {
      query.set('platform', state.pageContext.platform);
    }
    if (state.pageContext && state.pageContext.submode) {
      query.set('submode', state.pageContext.submode);
    }
    query.set('url', window.location.href);

    const response = await fetch(`${TRUVAK_API}/v1/customer/sidebar?${query.toString()}`, {
      headers: {
        'Content-Type': 'application/json',
        ...(state.authToken ? { Authorization: `Bearer ${state.authToken}` } : {}),
      },
    });

    if (!response.ok) {
      throw new Error(`Network response was not ok (${response.status})`);
    }

    return await response.json();
  } catch (error) {
    console.error(`Failed to fetch section data for ${sectionId}:`, error);
    return null;
  }
}

async function ensureProductData() {
  if (state.productData) return state.productData;

  if (!window.TruvakExtractor || typeof window.TruvakExtractor.extractPageData !== 'function') {
    return null;
  }

  const platform = state.pageContext?.platform;
  if (!platform) return null;

  try {
    state.productData = await window.TruvakExtractor.extractPageData(platform);
    return state.productData;
  } catch (error) {
    console.warn('[TIP] Failed to extract product data for sidebar sections', error);
    return null;
  }
}

async function tryRenderDarkPatternsLocally() {
  if (!window.TruvakDarkPatternDetector) return false;

  const hasRunner = typeof window.TruvakDarkPatternDetector.runDarkPatternDetection === 'function';
  const hasBuilder = typeof window.TruvakDarkPatternDetector.buildDarkPatternHTML === 'function';
  if (!hasRunner || !hasBuilder) return false;

  const productData = await ensureProductData();
  const productId =
    productData?.asin ||
    productData?.productId ||
    state.pageContext?.submode ||
    'unknown-product';

  const originalPrice = Number(productData?.currentPrice || 0);
  const platform = state.pageContext?.platform || 'unknown';

  try {
    const patterns = window.TruvakDarkPatternDetector.runDarkPatternDetection(
      productId,
      platform,
      originalPrice
    );

    const html = window.TruvakDarkPatternDetector.buildDarkPatternHTML(patterns);
    if (html) {
      renderSection('dark-patterns', html);
    } else {
      renderSection(
        'dark-patterns',
        '<div style="font-size:12px;color:#8B949E;">No obvious dark patterns detected on this page.</div>'
      );
    }

    return true;
  } catch (error) {
    console.warn('[TIP] Local dark-pattern detection failed, falling back to API', error);
    return false;
  }
}

function renderSection(sectionId, htmlContent = '') {
  const section = document.getElementById(`truvak-section-${sectionId}`);
  if (!section) return;
  section.innerHTML = sanitizeHtml(htmlContent);
}

function showSectionLoading(sectionId) {
  renderSection(sectionId, '<div class="truvak-skeleton-loader"></div>');
}

function showSectionError(sectionId, message) {
  const safeMessage = String(message || 'Something went wrong').replace(/[<>]/g, '');
  renderSection(sectionId, `<div class="truvak-error-message">${safeMessage}</div>`);
}

function ensureActionsControls() {
  const actionsSection = document.getElementById('truvak-section-actions');
  if (!actionsSection) return;

  if (actionsSection.querySelector('#truvak-order-sync-controls')) return;

  const controls = document.createElement('div');
  controls.id = 'truvak-order-sync-controls';
  controls.style.marginTop = '8px';
  controls.innerHTML = `
    <div style="border:1px solid #30363D;border-radius:10px;padding:10px;background:#0d1117;">
      <button id="truvak-order-sync-btn" type="button" style="width:100%;border:1px solid #30363D;background:#132238;color:#e6edf3;border-radius:8px;padding:8px 10px;font-size:12px;font-weight:600;cursor:pointer;">
        Sync Orders and Check Competitor Prices
      </button>
      <div id="truvak-competitor-summary" style="margin-top:8px;color:#8B949E;font-size:11px;"></div>
      <div id="sync-section" style="margin-top:8px;"></div>
    </div>
  `;

  actionsSection.appendChild(controls);
}

function summarizeCompetitorResults(results) {
  const flat = (Array.isArray(results) ? results : []).flat();
  const found = flat.filter((r) => r && r.found && Number.isFinite(Number(r.price)));

  if (!found.length) {
    return 'No competitor price matches found for recent synced orders.';
  }

  const sorted = found.slice().sort((a, b) => Number(a.price) - Number(b.price));
  const best = sorted[0];
  const avg = found.reduce((acc, item) => acc + Number(item.price), 0) / found.length;

  return `Found ${found.length} matches across competitors. Best: INR ${Number(best.price).toFixed(2)} on ${String(best.platform || 'unknown')}. Avg: INR ${avg.toFixed(2)}.`;
}

function attachActionsHandlers() {
  const syncButton = document.getElementById('truvak-order-sync-btn');
  const summaryNode = document.getElementById('truvak-competitor-summary');
  if (!syncButton || syncButton.dataset.bound === '1') return;

  syncButton.dataset.bound = '1';
  syncButton.addEventListener('click', async () => {
    if (!window.TruvakOrderScraper || typeof window.TruvakOrderScraper.runOrderScraper !== 'function') {
      if (summaryNode) {
        summaryNode.textContent = 'Order scraper module not loaded.';
      }
      return;
    }

    const platform = state.pageContext?.platform || '';
    syncButton.disabled = true;
    syncButton.style.opacity = '0.75';
    if (summaryNode) {
      summaryNode.textContent = 'Syncing orders...';
    }

    try {
      const syncResult = await window.TruvakOrderScraper.runOrderScraper(platform);
      const orders = Array.isArray(syncResult?.orders) ? syncResult.orders : [];

      if (!orders.length) {
        if (summaryNode) {
          summaryNode.textContent = 'No orders available for competitor checks.';
        }
        return;
      }

      if (summaryNode) {
        summaryNode.textContent = 'Running competitor checks on latest synced orders...';
      }

      const latestOrders = orders
        .slice()
        .sort((a, b) => String(b.orderDate || '').localeCompare(String(a.orderDate || '')))
        .slice(0, 3);

      const checkResults = await Promise.all(
        latestOrders.map(async (order) => {
          const productData =
            typeof window.TruvakOrderScraper.mapOrderToProductData === 'function'
              ? window.TruvakOrderScraper.mapOrderToProductData(order, platform)
              : {
                title: `Order ${String(order.orderId || '').slice(0, 8)}`,
                current_price: order.orderValue,
                brand: platform,
              };

          if (typeof window.TruvakOrderScraper.fetchCompetitorPrices !== 'function') {
            return [];
          }

          return window.TruvakOrderScraper.fetchCompetitorPrices(productData);
        })
      );

      if (summaryNode) {
        summaryNode.textContent = summarizeCompetitorResults(checkResults);
      }
    } catch (error) {
      console.error('[TIP] Failed to sync orders and run competitor checks', error);
      if (summaryNode) {
        summaryNode.textContent = 'Failed to complete sync/check flow. Try again.';
      }
    } finally {
      syncButton.disabled = false;
      syncButton.style.opacity = '1';
    }
  });
}

async function renderAllSections() {
  for (const sectionId of SECTION_ORDER) {
    showSectionLoading(sectionId);
  }

  await Promise.all(
    SECTION_ORDER.map(async (sectionId) => {
      if (sectionId === 'dark-patterns') {
        const renderedLocally = await tryRenderDarkPatternsLocally();
        if (renderedLocally) return;
      }

      const data = await fetchSectionData(sectionId);
      if (data && typeof data.content === 'string') {
        renderSection(sectionId, data.content);
      } else if (data && data.content != null) {
        renderSection(sectionId, String(data.content));
      } else {
        showSectionError(sectionId, 'Failed to load section data');
      }
    })
  );

  ensureActionsControls();
  attachActionsHandlers();
}

async function init(pageContext = {}) {
  state.pageContext = pageContext;
  state.productData = null;
  state.isOpen = true;

  await getAuthToken();

  const sidebar = createSidebar();
  if (!sidebar) return;

  if (!state.originalBodyMarginRight) {
    state.originalBodyMarginRight = document.body.style.marginRight || '';
  }

  updateBodyOffset(true);

  if (state.collapseButton) {
    state.collapseButton.onclick = () => {
      state.isOpen = !state.isOpen;
      animateSidebar(sidebar, state.isOpen);
      updateBodyOffset(state.isOpen);
    };
  }

  window.requestAnimationFrame(() => {
    animateSidebar(sidebar, true);
  });

  await renderAllSections();

  if (state.splashScreen) {
    setTimeout(() => {
      if (state.splashScreen) {
        state.splashScreen.style.display = 'none';
      }
    }, 550);
  }
}

function destroy() {
  const sidebar = document.getElementById('truvak-customer-sidebar');
  if (sidebar) {
    sidebar.remove();
  }

  const styleTag = document.getElementById('truvak-customer-sidebar-styles');
  if (styleTag) {
    styleTag.remove();
  }

  document.body.style.marginRight = state.originalBodyMarginRight || '';

  state.sidebar = null;
  state.contentArea = null;
  state.collapseButton = null;
  state.splashScreen = null;
  state.pageContext = null;
  state.productData = null;
  state.isOpen = true;
}

window.TruvakSidebar = {
  init,
  destroy,
  renderSection,
  showSectionLoading,
  showSectionError,
};
