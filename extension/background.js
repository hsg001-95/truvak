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
