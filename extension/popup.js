const API_BASE = 'http://127.0.0.1:8000';

const panelRoot = document.getElementById('panelRoot');
const collapseButton = document.getElementById('collapseButton');
const automateButton = document.getElementById('automateButton');
const logsButton = document.getElementById('logsButton');
const logsSection = document.getElementById('logsSection');
const openDashboardButton = document.getElementById('openDashboardButton');
const workspaceDashboardButton = document.getElementById('workspaceDashboardButton');
const helpButton = document.getElementById('helpButton');
const settingsButton = document.getElementById('settingsButton');
const legalLink = document.getElementById('legalLink');
const privacyLink = document.getElementById('privacyLink');

const workspaceName = document.getElementById('workspaceName');
const workspaceId = document.getElementById('workspaceId');
const syncState = document.getElementById('syncState');
const coverageBar = document.getElementById('coverageBar');
const coverageValue = document.getElementById('coverageValue');
const latencyValue = document.getElementById('latencyValue');
const resourceValue = document.getElementById('resourceValue');
const orderHistory = document.getElementById('orderHistory');
const MERCHANT_ID = localStorage.getItem('tip_merchant_id') || 'merchant_amazon';
const savedDashboardUrl = localStorage.getItem('tip_dashboard_url');
const shouldResetDashboardUrl =
    !savedDashboardUrl ||
    savedDashboardUrl.includes(':8501') ||
    savedDashboardUrl.includes(':5174') ||
    savedDashboardUrl.includes('merchant=merchant_combined');

const DASHBOARD_URL = shouldResetDashboardUrl
    ? 'http://127.0.0.1:5173'
    : savedDashboardUrl;

if (shouldResetDashboardUrl) {
    localStorage.setItem('tip_dashboard_url', DASHBOARD_URL);
}

if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    chrome.storage.local.set({
        dashboardUrl: DASHBOARD_URL,
        merchantId: MERCHANT_ID,
        apiUrl: API_BASE,
    });
}

let isCollapsed = false;
let logsVisible = false;

function setSyncState(text, isLive) {
    syncState.textContent = text;
    syncState.parentElement.style.color = isLive ? '#ffba42' : '#8b919d';
    syncState.previousElementSibling.style.background = isLive ? '#ffba42' : '#8b919d';
    syncState.previousElementSibling.style.boxShadow = isLive
        ? '0 0 10px rgba(255, 186, 66, 0.6)'
        : 'none';
}

function renderOrders(orders) {
    orderHistory.innerHTML = '';

    if (!orders.length) {
        const empty = document.createElement('div');
        empty.className = 'log-item';
        empty.textContent = 'No scored orders found yet.';
        orderHistory.appendChild(empty);
        return;
    }

    orders.slice(0, 8).forEach((order) => {
        const item = document.createElement('div');
        item.className = 'log-item';

        const risk = order.risk_level || 'UNKNOWN';
        const score = typeof order.score === 'number' ? order.score : '--';
        const action = order.recommended_action || 'n/a';

        item.innerHTML = `<strong>${order.id || 'ORD-NA'}</strong> ${risk} | Score ${score} | ${action}`;
        orderHistory.appendChild(item);
    });
}

function applyCoverage(orders) {
    const safeCount = orders.filter((o) => o.risk_level !== 'HIGH').length;
    const coverage = orders.length ? Math.round((safeCount / orders.length) * 100) : 0;
    coverageBar.style.width = `${coverage}%`;
    coverageValue.textContent = `${coverage}%`;
}

function applyResource(orders) {
    const totalValue = orders.reduce((acc, order) => acc + (order.order_value || 0), 0);
    resourceValue.textContent = `Tracked: Rs ${totalValue.toLocaleString('en-IN')}`;
}

async function loginWithConfiguredCredentials() {
    const response = await fetch(`${API_BASE}/v1/login`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            username: MERCHANT_ID,
            password: 'Trust@2024',
        }),
    });

    if (!response.ok) {
        throw new Error('Login failed');
    }

    const data = await response.json();
    localStorage.setItem('user', data.token);
    return data.token;
}

async function ensureToken() {
    const existing = localStorage.getItem('user');
    if (existing) return existing;
    return loginWithConfiguredCredentials();
}

async function loadOrders() {
    const start = performance.now();
    setSyncState('SYNCING', false);

    try {
        const token = await ensureToken();
        workspaceName.textContent = 'Seller Workspace';
        workspaceId.textContent = `${MERCHANT_ID} | #${String(token).slice(0, 10)}...`;

        const response = await fetch(`${API_BASE}/v1/orders`, {
            headers: {
                Authorization: `Bearer ${token}`,
            },
        });

        if (!response.ok) {
            throw new Error('Could not fetch orders');
        }

        const data = await response.json();
        const orders = data.orders || [];

        const elapsed = Math.round(performance.now() - start);
        latencyValue.textContent = `Latency: ${elapsed}ms`;
        applyCoverage(orders);
        applyResource(orders);
        renderOrders(orders);
        setSyncState('LIVE SYNC', true);
    } catch (error) {
        latencyValue.textContent = 'Latency: offline';
        resourceValue.textContent = 'Backend unavailable';
        coverageBar.style.width = '0%';
        coverageValue.textContent = '0%';
        renderOrders([]);
        setSyncState('OFFLINE', false);
    }
}

function toggleLogs() {
    logsVisible = !logsVisible;
    logsSection.classList.toggle('visible', logsVisible);
}

function toggleCollapse() {
    isCollapsed = !isCollapsed;
    panelRoot.classList.toggle('collapsed', isCollapsed);
    collapseButton.querySelector('.material-symbols-outlined').textContent = isCollapsed
        ? 'chevron_left'
        : 'chevron_right';
}

function openDashboard() {
    const activeMerchantId = localStorage.getItem('tip_merchant_id') || MERCHANT_ID;
    let targetUrl = DASHBOARD_URL;

    try {
        const url = new URL(DASHBOARD_URL);
        url.searchParams.set('merchant', activeMerchantId);
        targetUrl = url.toString();
    } catch (error) {
        // Fallback to base dashboard URL when URL parsing fails.
        targetUrl = DASHBOARD_URL;
    }

    try {
        if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.create) {
            chrome.tabs.create({ url: targetUrl });
            return;
        }
    } catch (error) {
        // Fall back to window.open if tabs API is unavailable.
    }

    window.open(targetUrl, '_blank');
}

function openDashboardOnKeyboard(event) {
    if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        openDashboard();
    }
}

collapseButton.addEventListener('click', toggleCollapse);
logsButton.addEventListener('click', toggleLogs);
automateButton.addEventListener('click', loadOrders);
if (openDashboardButton) openDashboardButton.addEventListener('click', openDashboard);
if (workspaceDashboardButton) {
    workspaceDashboardButton.addEventListener('click', openDashboard);
    workspaceDashboardButton.addEventListener('keydown', openDashboardOnKeyboard);
}
if (helpButton) helpButton.addEventListener('click', openDashboard);
if (settingsButton) settingsButton.addEventListener('click', openDashboard);
if (legalLink) legalLink.addEventListener('click', (event) => {
    event.preventDefault();
    openDashboard();
});
if (privacyLink) privacyLink.addEventListener('click', (event) => {
    event.preventDefault();
    openDashboard();
});

loadOrders();