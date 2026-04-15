const CUSTOMER_URL_PATTERNS = [
  {
    key: 'AMAZON_PRODUCT',
    platform: 'amazon',
    submode: 'product',
    regex: /amazon\.in\/(?:[^/]+\/)?dp\/[A-Z0-9]{10}/i,
  },
  {
    key: 'AMAZON_CART',
    platform: 'amazon',
    submode: 'cart',
    regex: /amazon\.in\/gp\/cart/i,
  },
  {
    key: 'AMAZON_ORDERS',
    platform: 'amazon',
    submode: 'orders',
    regex: /amazon\.in\/gp\/your-account\/order-history/i,
  },
  {
    key: 'AMAZON_BESTSELLERS',
    platform: 'amazon',
    submode: 'bestsellers',
    regex: /amazon\.in\/(gp\/)?bestsellers/i,
  },
  {
    key: 'FLIPKART_PRODUCT',
    platform: 'flipkart',
    submode: 'product',
    regex: /flipkart\.com\/[^/]+\/p\/[a-z0-9]+/i,
  },
  {
    key: 'FLIPKART_ORDERS',
    platform: 'flipkart',
    submode: 'orders',
    regex: /flipkart\.com\/account\/orders/i,
  },
  {
    key: 'FLIPKART_CART',
    platform: 'flipkart',
    submode: 'cart',
    regex: /flipkart\.com\/checkout/i,
  },
];

const MERCHANT_URL_PATTERNS = [
  {
    key: 'AMAZON_SELLER',
    platform: 'amazon',
    regex: /sellercentral\.amazon\.in/i,
  },
  {
    key: 'FLIPKART_SELLER',
    platform: 'flipkart',
    regex: /seller\.flipkart\.com/i,
  },
];

const WATCHLIST_ALARM_NAME = 'truvakPriceCheck';
const WATCHLIST_PERIOD_MINUTES = 360;
const WATCHLIST_API_BASE = 'https://api.truvak.com';
const API_BASE = WATCHLIST_API_BASE;
const notificationActionMap = new Map();

function detectPageMode(url) {
  if (!url || typeof url !== 'string') {
    return { mode: 'NONE', key: null, submode: null, platform: null };
  }

  for (const pattern of MERCHANT_URL_PATTERNS) {
    if (pattern.regex.test(url)) {
      return {
        mode: 'MERCHANT',
        key: pattern.key,
        submode: null,
        platform: pattern.platform,
      };
    }
  }

  for (const pattern of CUSTOMER_URL_PATTERNS) {
    if (pattern.regex.test(url)) {
      return {
        mode: 'CUSTOMER',
        key: pattern.key,
        submode: pattern.submode,
        platform: pattern.platform,
      };
    }
  }

  return { mode: 'NONE', key: null, submode: null, platform: null };
}

function getPageContext(url) {
  const context = detectPageMode(url);
  context.shouldInjectSidebar = ['product', 'cart', 'orders'].includes(context.submode);
  context.shouldScrapeOrders = context.submode === 'orders';
  context.shouldBootstrap = context.submode === 'bestsellers';
  context.shouldScrapeReviews = context.submode === 'product';
  return context;
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (!changeInfo.url) return;

  const context = getPageContext(changeInfo.url);
  if (context.mode === 'NONE') return;

  if (context.shouldBootstrap && context.platform === 'amazon') {
    chrome.tabs.sendMessage(tabId, { action: 'triggerBestsellerScrape', context }, () => {
      if (chrome.runtime.lastError) {
        // Ignore pages where no content script is available.
      }
    });
  }
});

function ensureWatchlistAlarm() {
  chrome.alarms.get(WATCHLIST_ALARM_NAME, (alarm) => {
    if (alarm) return;
    chrome.alarms.create(WATCHLIST_ALARM_NAME, {
      periodInMinutes: WATCHLIST_PERIOD_MINUTES,
    });
  });
}

chrome.runtime.onInstalled.addListener(() => {
  ensureWatchlistAlarm();
});

chrome.runtime.onStartup.addListener(() => {
  ensureWatchlistAlarm();
});

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchTextWithTimeout(url, timeoutMs) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) return null;
    return await response.text();
  } catch (error) {
    console.error('[TIP] Failed to fetch product page for price check:', error);
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

function parseAmazonPrice(html) {
  if (!html) return null;

  const patterns = [
    /class=["'][^"']*a-offscreen[^"']*["'][^>]*>\s*₹?\s*([0-9,]+(?:\.[0-9]+)?)/i,
    /"priceToPay"[\s\S]*?"amount"\s*:\s*([0-9]+(?:\.[0-9]+)?)/i,
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (!match?.[1]) continue;
    const price = Number.parseFloat(String(match[1]).replace(/,/g, ''));
    if (Number.isFinite(price) && price > 0) return price;
  }

  return null;
}

function parseFlipkartPrice(html) {
  if (!html) return null;

  const patterns = [
    /"price"\s*:\s*"?([0-9,]+(?:\.[0-9]+)?)"?/i,
    /class=["'][^"']*(_30jeq3|_16Jk6d)[^"']*["'][^>]*>\s*₹?\s*([0-9,]+(?:\.[0-9]+)?)/i,
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    const raw = match?.[2] || match?.[1];
    if (!raw) continue;
    const price = Number.parseFloat(String(raw).replace(/,/g, ''));
    if (Number.isFinite(price) && price > 0) return price;
  }

  return null;
}

async function fetchCurrentPrice(productUrl, platform) {
  try {
    const html = await fetchTextWithTimeout(productUrl, 8000);
    if (!html) return null;

    switch (String(platform || '').toLowerCase()) {
      case 'amazon':
        return parseAmazonPrice(html);
      case 'flipkart':
        return parseFlipkartPrice(html);
      default:
        console.warn(`[TIP] Unsupported platform for price extraction: ${platform}`);
        return null;
    }
  } catch (error) {
    console.error('[TIP] Failed to fetch current price:', error);
    return null;
  }
}

async function processWatchlistItems(items, token) {
  const list = Array.isArray(items) ? items : [];

  for (let i = 0; i < list.length; i += 5) {
    const batch = list.slice(i, i + 5);

    for (const item of batch) {
      try {
        const currentPrice = await fetchCurrentPrice(item.product_url, item.platform);
        if (currentPrice === null) {
          await sleep(1000);
          continue;
        }

        const responseUpdatePrice = await fetch(
          `${WATCHLIST_API_BASE}/v1/customer/watchlist/${item.id}`,
          {
            method: 'PATCH',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ current_price: currentPrice }),
          }
        );

        if (responseUpdatePrice.ok) {
          const data = await responseUpdatePrice.json();
          if (data.alert_triggered) {
            const priceAtSave = Number(item.price_at_save) || 0;
            const savings = priceAtSave - currentPrice;
            const savingsPct = priceAtSave > 0
              ? ((savings / priceAtSave) * 100).toFixed(1)
              : '0.0';

            const notificationId = `truvak_alert_${item.id}_${Date.now()}`;
            notificationActionMap.set(notificationId, {
              productUrl: item.product_url,
              itemId: item.id,
              token,
            });

            chrome.notifications.create(notificationId, {
              type: 'basic',
              iconUrl: 'icons/icon48.png',
              title: 'Truvak Price Alert',
              message: `${String(item.product_name || 'Item').substring(0, 50)} dropped INR ${Math.round(savings)} (${savingsPct}% on ${item.platform})`,
              buttons: [{ title: 'View Product' }, { title: 'Dismiss' }],
              requireInteraction: false,
            });
          }
        }
      } catch (error) {
        console.error('[TIP] Error processing watchlist item:', error);
      }

      // Add delay between item checks.
      await sleep(1000);
    }
  }
}

chrome.notifications.onButtonClicked.addListener(async (notificationId, buttonIndex) => {
  const action = notificationActionMap.get(notificationId);
  if (!action) return;

  if (buttonIndex === 0) {
    chrome.tabs.create({ url: action.productUrl });
  } else {
    try {
      await fetch(`${WATCHLIST_API_BASE}/v1/customer/watchlist/${action.itemId}/alert-sent`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${action.token}`,
        },
      });
    } catch (error) {
      console.error('[TIP] Failed to mark alert as sent:', error);
    }
  }

  chrome.notifications.clear(notificationId);
  notificationActionMap.delete(notificationId);
});

chrome.notifications.onClosed.addListener((notificationId) => {
  notificationActionMap.delete(notificationId);
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== WATCHLIST_ALARM_NAME) return;

  try {
    const storage = await chrome.storage.sync.get([
      'truvak_customer_token',
      'truvak_customer_id_hash',
    ]);

    const token = storage.truvak_customer_token;
    const customerIdHash = storage.truvak_customer_id_hash;

    if (!token || !customerIdHash) {
      console.log('[TIP] Watchlist alarm skipped: user not logged in');
      return;
    }

    const responseCheckPrices = await fetch(
      `${WATCHLIST_API_BASE}/v1/customer/watchlist/check-prices`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ customer_id_hash: customerIdHash }),
      }
    );

    if (!responseCheckPrices.ok) {
      console.error('[TIP] Failed to check prices:', responseCheckPrices.status);
      return;
    }

    const items = await responseCheckPrices.json();
    await processWatchlistItems(items, token);
  } catch (error) {
    console.error('[TIP] Error in watchlist alarm handler:', error);
  }
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || typeof msg !== 'object') return;

  if (msg.type === 'OPEN_DASHBOARD') {
    const targetUrl = String(msg.url || '').trim() || 'http://localhost:5174';
    chrome.tabs.create({ url: targetUrl }, () => {
      if (chrome.runtime.lastError) {
        sendResponse?.({ ok: false, reason: chrome.runtime.lastError.message });
        return;
      }
      sendResponse?.({ ok: true });
    });
    return true;
  }

  if (msg.type === 'SHOW_NOTIFICATION') {
    chrome.notifications.create(`tip_notice_${Date.now()}`, {
      type: 'basic',
      iconUrl: 'icons/icon48.png',
      title: 'Truvak',
      message: String(msg.message || 'Action completed').slice(0, 120),
      requireInteraction: false,
    });
    sendResponse?.({ ok: true });
    return;
  }

  if (msg.type === 'BESTSELLER_BATCH') {
    const items = Array.isArray(msg.items) ? msg.items : [];
    if (!items.length) {
      sendResponse?.({ ok: false, reason: 'empty_items' });
      return;
    }

    fetch(`${API_BASE}/v1/product/bestseller-batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items,
        page_url: sender?.url || null,
      }),
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        return response.json().catch(() => ({}));
      })
      .then((data) => {
        sendResponse?.({ ok: true, data });
      })
      .catch((error) => {
        console.error('[TIP] Failed to process BESTSELLER_BATCH:', error);
        sendResponse?.({ ok: false, reason: String(error?.message || error) });
      });

    return true;
  }
});
