const STORAGE_KEY_PREFIX = 'truvak_order_';
const ORDER_SYNC_BATCH_SIZE = 50;

function getApiBaseUrl() {
  return window.TRUVAK_API || window.TruvakConfig?.apiUrl || 'http://127.0.0.1:8000';
}

function cleanText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function parseAmount(value) {
  const normalized = cleanText(value).replace(/[^0-9.]/g, '');
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function inferCategoryFromTitle(title) {
  const lowered = cleanText(title).toLowerCase();
  if (!lowered) return 'uncategorized';

  if (lowered.includes('electronics')) return 'electronics';
  if (lowered.includes('mobile') || lowered.includes('cellular') || lowered.includes('phone')) return 'mobile';
  if (lowered.includes('fashion') || lowered.includes('accessories') || lowered.includes('apparel')) return 'fashion';
  if (lowered.includes('home') || lowered.includes('interior') || lowered.includes('household')) return 'home';
  if (lowered.includes('kitchen') || lowered.includes('cookware') || lowered.includes('dining')) return 'kitchen';
  if (lowered.includes('beauty') || lowered.includes('cosmetics') || lowered.includes('skincare')) return 'beauty';
  if (lowered.includes('sports') || lowered.includes('fitness') || lowered.includes('outdoor')) return 'sports';
  if (lowered.includes('books') || lowered.includes('book')) return 'books';
  if (lowered.includes('grocery') || lowered.includes('pantry')) return 'grocery';
  if (lowered.includes('toys') || lowered.includes('game')) return 'toys';

  return 'uncategorized';
}

function parseAmazonOrderDate(raw) {
  const text = cleanText(raw).replace(',', '');
  if (!text) return null;

  const normalized = text.replace(/\s+/g, ' ');
  const direct = new Date(normalized);
  if (!Number.isNaN(direct.getTime())) {
    return direct.toISOString().split('T')[0];
  }

  const parts = normalized.split(' ');
  const monthNames = {
    jan: 0,
    feb: 1,
    mar: 2,
    apr: 3,
    may: 4,
    jun: 5,
    jul: 6,
    aug: 7,
    sep: 8,
    oct: 9,
    nov: 10,
    dec: 11,
  };

  if (parts.length >= 2) {
    const day = Number.parseInt(parts[0], 10);
    const monthKey = parts[1].slice(0, 3).toLowerCase();
    const month = monthNames[monthKey];
    const year = parts.length >= 3 ? Number.parseInt(parts[2], 10) : new Date().getFullYear();

    if (Number.isFinite(day) && Number.isFinite(month) && Number.isFinite(year)) {
      const date = new Date(year, month, day);
      if (!Number.isNaN(date.getTime())) {
        return date.toISOString().split('T')[0];
      }
    }
  }

  return null;
}

function parseFlipkartOrderDate(raw) {
  const text = cleanText(raw);
  if (!text) return null;

  const direct = new Date(text);
  if (!Number.isNaN(direct.getTime())) return direct.toISOString().split('T')[0];

  const dateParts = text.split(/[-/]/).map((v) => Number.parseInt(v, 10));
  if (dateParts.length === 3 && dateParts.every((v) => Number.isFinite(v))) {
    let year = dateParts[2];
    let month = dateParts[0] - 1;
    let day = dateParts[1];

    if (year < 100) year += 2000;
    const d = new Date(year, month, day);
    if (!Number.isNaN(d.getTime())) return d.toISOString().split('T')[0];
  }

  return null;
}

async function sha256Hex(input) {
  const data = new TextEncoder().encode(String(input || 'unknown-order'));
  const digest = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(digest));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

function normalizeOrderStatus(raw) {
  const status = cleanText(raw).toLowerCase();
  if (status.includes('delivered')) return 'delivered';
  if (status.includes('cancelled') || status.includes('canceled')) return 'cancelled';
  if (status.includes('returned') || status.includes('return')) return 'returned';
  return 'pending';
}

function getSafeText(root, selector) {
  return cleanText(root.querySelector(selector)?.textContent || '');
}

function getAmazonProductCategory(row) {
  const breadcrumbItems = row.querySelectorAll('.a-breadcrumb-item span');
  if (breadcrumbItems.length >= 3) {
    return cleanText(breadcrumbItems[2].textContent).toLowerCase() || 'uncategorized';
  }

  const title = getSafeText(row, 'h3.a-size-mini, .yohtmlc-product-title, .a-size-base-plus');
  return inferCategoryFromTitle(title);
}

function getFlipkartProductCategory(row) {
  const breadcrumbItems = row.querySelectorAll('._2aKgVJ, ._1R0K0g');
  if (breadcrumbItems.length >= 2) {
    return cleanText(breadcrumbItems[1].textContent).toLowerCase() || 'uncategorized';
  }

  const title = getSafeText(row, '._3YIyXj, .s1Q9rs, .KzDlHZ');
  return inferCategoryFromTitle(title);
}

async function scrapeAmazonOrders() {
  const orderRows = document.querySelectorAll('.order, [class*="order-card"], .a-box-group.a-spacing-base');
  const orders = [];

  for (const row of orderRows) {
    const orderIdRaw = getSafeText(row, '.yohtmlc-order-id span[dir="ltr"], [id*="order-id"], [class*="order-id"]')
      .replace(/Order\s*#?\s*/i, '');
    if (!orderIdRaw) continue;

    const orderDateRaw = getSafeText(row, '.order-info .a-column.a-span4 .a-color-secondary, [class*="order-date"], .a-color-secondary');
    const orderDate = parseAmazonOrderDate(orderDateRaw);

    const orderValueRaw = getSafeText(row, '.a-column.a-span2 .a-color-secondary, .a-color-price, [class*="order-total"]');
    const orderValue = parseAmount(orderValueRaw);

    const orderStatusRaw = getSafeText(row, '.delivery-box .a-color-success, [class*="delivery"], [class*="status"]');
    const orderStatus = normalizeOrderStatus(orderStatusRaw);

    const productCategory = getAmazonProductCategory(row);

    const paymentText = getSafeText(row, '.payment-info, .order-summary, [class*="payment"]');
    const isCOD = paymentText.toLowerCase().includes('cash on delivery');

    const orderHour = null;
    const orderId = await sha256Hex(orderIdRaw);

    orders.push({
      orderId,
      orderDate,
      orderValue,
      orderStatus,
      productCategory,
      isCOD,
      orderHour,
    });
  }

  return orders;
}

async function scrapeFlipkartOrders() {
  const orderRows = document.querySelectorAll('._2XOlPr, ._1YokD2._3Zrg6f, [class*="orderItem"]');
  const orders = [];

  for (const row of orderRows) {
    const orderIdRaw = getSafeText(row, '.CxlFHH, [class*="order-id"], [data-testid*="order-id"]');
    if (!orderIdRaw) continue;

    const orderDateRaw = getSafeText(row, '._3XZmCf, [class*="date"], [data-testid*="date"]');
    const orderDate = parseFlipkartOrderDate(orderDateRaw);

    const orderValueRaw = getSafeText(row, '._3_6Uyw, [class*="price"], [class*="amount"]');
    const orderValue = parseAmount(orderValueRaw);

    const orderStatusRaw = getSafeText(row, '._2Tpdn3 ._3uMzX7, [class*="status"]');
    const orderStatus = normalizeOrderStatus(orderStatusRaw);

    const productCategory = getFlipkartProductCategory(row);

    const paymentText = getSafeText(row, '._24Jq0W, [class*="payment"]');
    const isCOD = paymentText.toLowerCase().includes('cash on delivery');

    const orderHour = null;
    const orderId = await sha256Hex(orderIdRaw);

    orders.push({
      orderId,
      orderDate,
      orderValue,
      orderStatus,
      productCategory,
      isCOD,
      orderHour,
    });
  }

  return orders;
}

function buildOrderSyncUI(total, synced) {
  const safeTotal = Math.max(0, Number(total) || 0);
  const safeSynced = Math.max(0, Number(synced) || 0);
  const pct = safeTotal > 0 ? (safeSynced / safeTotal) * 100 : 0;

  return `
    <div class="sync-container">
      <h3>Syncing your orders with Truvak</h3>
      <div class="progress-bar" style="background:#30363D;border-radius:4px;height:6px;overflow:hidden;">
        <div class="filled" style="width:${pct.toFixed(1)}%;background:#2F81F7;height:100%;"></div>
      </div>
      <p>${safeSynced} of ${safeTotal} orders</p>
      <p style="color:grey;font-style:italic;">Only anonymous data stored. No names or addresses.</p>
    </div>
  `;
}

function getSyncSectionElement() {
  return document.getElementById('sync-section') || document.getElementById('truvak-section-actions');
}

function buildSearchQuery(productData, priority) {
  if (!productData) return '';

  if (priority === 'EAN') {
    return cleanText(productData.ean || '');
  }

  if (priority === 'Model') {
    return cleanText(`${productData.brand || ''} ${productData.model_number || ''}`);
  }

  const words = cleanText(productData.title || '')
    .split(' ')
    .filter((word) => word && !['with', 'for', 'and', 'the', 'in'].includes(word.toLowerCase()));
  return words.slice(0, 6).join(' ');
}

function extractJsonLdBlocks(html) {
  const blocks = [];
  const regex = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match = regex.exec(html);

  while (match) {
    blocks.push(match[1]);
    match = regex.exec(html);
  }

  return blocks;
}

function tryExtractPriceFromJsonLd(jsonText) {
  try {
    const parsed = JSON.parse(jsonText);
    const candidates = Array.isArray(parsed) ? parsed : [parsed];

    for (const item of candidates) {
      const direct = num(item?.price, NaN);
      if (Number.isFinite(direct) && direct > 0) return { price: direct, found: true };

      const offerPrice = num(item?.offers?.price, NaN);
      if (Number.isFinite(offerPrice) && offerPrice > 0) return { price: offerPrice, found: true };
    }
  } catch {
    // Ignore malformed JSON-LD.
  }

  return { price: null, found: false };
}

async function extractFlipkartPrice(html) {
  try {
    const blocks = extractJsonLdBlocks(html);
    for (const block of blocks) {
      const result = tryExtractPriceFromJsonLd(block);
      if (result.found) return result;
    }

    const classPriceMatch = html.match(/class=["'][^"']*(_30jeq3|_16Jk6d)[^"']*["'][^>]*>\s*₹?\s*([0-9,]+(?:\.[0-9]+)?)/i);
    if (classPriceMatch?.[2]) {
      const price = parseAmount(classPriceMatch[2]);
      if (price > 0) return { price, found: true };
    }

    return { price: null, found: false };
  } catch (error) {
    console.error('Error extracting Flipkart price:', error);
    return { price: null, found: false };
  }
}

async function extractCromaPrice(html) {
  try {
    const blocks = extractJsonLdBlocks(html);
    for (const block of blocks) {
      const result = tryExtractPriceFromJsonLd(block);
      if (result.found) return result;
    }
    return { price: null, found: false };
  } catch (error) {
    console.error('Error extracting Croma price:', error);
    return { price: null, found: false };
  }
}

async function extractTatacliqPrice(html) {
  try {
    const blocks = extractJsonLdBlocks(html);
    for (const block of blocks) {
      const result = tryExtractPriceFromJsonLd(block);
      if (result.found) return result;
    }
    return { price: null, found: false };
  } catch (error) {
    console.error('Error extracting Tatacliq price:', error);
    return { price: null, found: false };
  }
}

async function extractMeeshoPrice(html) {
  try {
    const scriptTag = html.match(/<script[^>]*id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i);
    if (scriptTag?.[1]) {
      const parsed = JSON.parse(scriptTag[1]);
      const price = num(
        parsed?.props?.pageProps?.data?.price?.discounted ||
        parsed?.props?.pageProps?.data?.price?.original,
        NaN
      );

      if (Number.isFinite(price) && price > 0) {
        return { price, found: true };
      }
    }
    return { price: null, found: false };
  } catch (error) {
    console.error('Error extracting Meesho price:', error);
    return { price: null, found: false };
  }
}

async function extractMyntraPrice(html) {
  try {
    const scriptTag = html.match(/<script[^>]*id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i);
    if (scriptTag?.[1]) {
      const parsed = JSON.parse(scriptTag[1]);
      const price = num(
        parsed?.props?.product?.price?.discounted ||
        parsed?.props?.product?.price?.original,
        NaN
      );

      if (Number.isFinite(price) && price > 0) {
        return { price, found: true };
      }
    }
    return { price: null, found: false };
  } catch (error) {
    console.error('Error extracting Myntra price:', error);
    return { price: null, found: false };
  }
}

async function fetchWithTimeout(url, options, ms = 4000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), ms);

  try {
    const response = await fetch(url, { ...(options || {}), signal: controller.signal });
    clearTimeout(id);
    return response;
  } catch (error) {
    clearTimeout(id);
    if (error.name === 'AbortError') {
      return { status: 'timeout', url };
    }
    throw error;
  }
}

function mapOrderToProductData(order, platform) {
  return {
    product_id: order.orderId,
    ean: null,
    model_number: null,
    brand: platform === 'amazon' ? 'Amazon' : 'Flipkart',
    title: `${platform} order ${order.orderId.slice(0, 8)}`,
    platform,
    current_price: order.orderValue,
  };
}

async function fetchCompetitorPrices(productData) {
  const TIMEOUT_MS = 4000;
  const primaryPriority = productData?.ean
    ? 'EAN'
    : productData?.model_number
      ? 'Model'
      : 'Title';

  const queries = [
    { platform: 'flipkart', query: buildSearchQuery(productData, primaryPriority) },
    { platform: 'croma', query: buildSearchQuery(productData, primaryPriority) },
    { platform: 'tatacliq', query: buildSearchQuery(productData, primaryPriority) },
    { platform: 'meesho', query: buildSearchQuery(productData, primaryPriority) },
    { platform: 'myntra', query: buildSearchQuery(productData, primaryPriority) },
  ].filter((q) => q.query);

  const results = await Promise.allSettled(
    queries.map(async (query) => {
      const url = `https://${query.platform}.com/search/?q=${encodeURIComponent(query.query)}`;
      try {
        const response = await fetchWithTimeout(
          url,
          {
            headers: {
              Accept: 'text/html,application/xhtml+xml,application/xml',
              'Accept-Language': 'en-IN,en;q=0.9,hi;q=0.8',
            },
          },
          TIMEOUT_MS
        );

        if (!response || response.status === 'timeout') {
          return { platform: query.platform, url, confidence: null, found: false, price: null };
        }

        if (!response.ok) {
          return { platform: query.platform, url, confidence: null, found: false, price: null };
        }

        const html = await response.text();
        const confidence = primaryPriority === 'EAN'
          ? 'HIGH'
          : primaryPriority === 'Model'
            ? 'MEDIUM'
            : 'LOW';

        let extractFunction = extractFlipkartPrice;
        if (query.platform === 'croma') extractFunction = extractCromaPrice;
        if (query.platform === 'tatacliq') extractFunction = extractTatacliqPrice;
        if (query.platform === 'meesho') extractFunction = extractMeeshoPrice;
        if (query.platform === 'myntra') extractFunction = extractMyntraPrice;

        const priceResult = await extractFunction(html);
        return {
          platform: query.platform,
          url,
          confidence,
          found: Boolean(priceResult.found),
          price: priceResult.price,
        };
      } catch {
        return { platform: query.platform, url, confidence: null, found: false, price: null };
      }
    })
  );

  return results.map((result, index) => {
    if (result.status === 'fulfilled') return result.value;
    return {
      platform: queries[index]?.platform || 'unknown',
      url: null,
      confidence: null,
      found: false,
      price: null,
    };
  });
}

async function runOrderScraper(platform) {
  const syncSection = getSyncSectionElement();
  if (!syncSection) {
    throw new Error('Sync section element not found');
  }

  syncSection.innerHTML = buildOrderSyncUI(0, 0);

  const normalizedPlatform = String(platform || '').toLowerCase();
  let orders = [];

  if (normalizedPlatform === 'amazon') {
    orders = await scrapeAmazonOrders();
  } else if (normalizedPlatform === 'flipkart') {
    orders = await scrapeFlipkartOrders();
  } else {
    throw new Error(`Unsupported platform: ${platform}`);
  }

  try {
    localStorage.setItem(`${STORAGE_KEY_PREFIX}last_count_${normalizedPlatform}`, String(orders.length));
  } catch {
    // Ignore storage write failures.
  }

  const totalOrders = orders.length;
  if (totalOrders === 0) {
    syncSection.innerHTML = `
      <div class="sync-complete">
        <p>No orders found to sync yet.</p>
      </div>
    `;
    return { totalOrders, syncedOrders: 0, orders: [] };
  }

  let syncedOrders = 0;
  const apiBase = getApiBaseUrl();

  for (let i = 0; i < totalOrders; i += ORDER_SYNC_BATCH_SIZE) {
    const batch = orders.slice(i, i + ORDER_SYNC_BATCH_SIZE);

    const response = await fetch(`${apiBase}/v1/customer/orders/sync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ platform: normalizedPlatform, orders: batch }),
    });

    if (!response.ok) {
      throw new Error(`Sync API failed with status ${response.status}`);
    }

    syncedOrders += batch.length;
    syncSection.innerHTML = buildOrderSyncUI(totalOrders, syncedOrders);
  }

  syncSection.innerHTML = `
    <div class="sync-complete">
      <p>${totalOrders} orders synced. View Spend Analysis.</p>
      <a href="${apiBase}/spend" target="_blank" rel="noopener noreferrer">Go to Dashboard</a>
    </div>
  `;

  return { totalOrders, syncedOrders, orders };
}

async function scrapeOrders(platform) {
  const normalizedPlatform = String(platform || '').toLowerCase();

  if (normalizedPlatform === 'amazon') {
    return scrapeAmazonOrders();
  }

  if (normalizedPlatform === 'flipkart') {
    return scrapeFlipkartOrders();
  }

  const host = window.location.hostname;
  if (host.includes('amazon')) return scrapeAmazonOrders();
  if (host.includes('flipkart')) return scrapeFlipkartOrders();

  return [];
}

if (typeof chrome !== 'undefined' && chrome.runtime && chrome.contextMenus) {
  chrome.runtime.onInstalled?.addListener(() => {
    try {
      chrome.contextMenus.create({
        id: 'scrape-orders',
        title: 'Scrape Orders from current page',
        contexts: ['page'],
      });
    } catch {
      // Menu may already exist.
    }
  });

  chrome.contextMenus.onClicked?.addListener(async (info) => {
    if (info.menuItemId !== 'scrape-orders') return;
    try {
      const orders = await scrapeOrders();
      console.log('[TIP] Scraped orders:', orders);
    } catch (error) {
      console.error('[TIP] Error scraping orders:', error);
    }
  });
}

window.TruvakOrderScraper = {
  scrapeAmazonOrders,
  scrapeFlipkartOrders,
  scrapeOrders,
  buildOrderSyncUI,
  buildSearchQuery,
  fetchCompetitorPrices,
  mapOrderToProductData,
  runOrderScraper,
};
