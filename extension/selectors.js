(function () {
  const BASE_COMPARISON_TTL_MS = 2 * 60 * 60 * 1000;
  const MAX_USER_JITTER_MS = 10 * 60 * 1000;
  const USER_JITTER_STORAGE_KEY = 'truvak_user_cache_jitter_ms';

  function getPerUserJitterMs() {
    try {
      const stored = Number(localStorage.getItem(USER_JITTER_STORAGE_KEY));
      if (Number.isFinite(stored) && stored >= 0 && stored <= MAX_USER_JITTER_MS) {
        return stored;
      }

      const generated = Math.floor(Math.random() * MAX_USER_JITTER_MS);
      localStorage.setItem(USER_JITTER_STORAGE_KEY, String(generated));
      return generated;
    } catch {
      return Math.floor(Math.random() * MAX_USER_JITTER_MS);
    }
  }

  const EFFECTIVE_COMPARISON_TTL_MS = BASE_COMPARISON_TTL_MS + getPerUserJitterMs();

  const SELECTORS = {
    amazon: {
      captcha: ['#captchacharacters', 'form[action*="validateCaptcha"]'],
      robotTitleText: 'Robot Check',
      asin: ['/\\/dp\\/([A-Z0-9]{10})/i', '#ASIN'],
      title: ['#productTitle', '#title'],
      brand: ['#bylineInfo', '#brand'],
      price: [
        '.a-price .a-offscreen',
        '#priceblock_ourprice',
        '#corePriceDisplay_desktop_feature_div .a-offscreen',
        '#corePrice_feature_div .a-offscreen',
        '.apexPriceToPay .a-offscreen'
      ],
      sellerName: ['#merchant-info', '#sellerProfileTriggerId', '#tabular-buybox-truncate-1'],
      sellerIdHref: ['#merchant-info a', '#sellerProfileTriggerId'],
      image: ['#landingImage', '#imgBlkFront', '#main-image-container img'],
      detailRows: ['#productDetailsTable tr', '#productDetails_detailBullets_sections1 tr'],
      breadcrumbsLinks: ['#wayfinding-breadcrumbs_feature_div a'],
      breadcrumbsSpans: ['#wayfinding-breadcrumbs_feature_div span'],
      reviewRows: ['[data-hook="review"]']
    },
    flipkart: {
      title: ['.B_NuCI', 'h1.yhB1nd', 'h1._6EBuvT'],
      price: ['._30jeq3._16Jk6d', '._30jeq3', '._25b18'],
      image: ['img._396CS4._2amPTT', 'img._53J4C-', 'img.DByuf4'],
      breadcrumbs: ['#breadCrumbs a', '.r2CdBx a'],
      reviewRows: ['div.col.EPCmJX', '._27M-vq', '.RcXBOT'],
      searchResultPrice: [
        '._30jeq3._16Jk6d',
        '.CEmiEU ._30jeq3',
        '._25b18 ._30jeq3',
        '._30jeq3'
      ]
    },
    comparison: {
      croma: {
        jsonLd: true,
        dataAttrs: ['data-price', 'data-product-price', 'data-sale-price'],
        cssPrice: ['.amount', '[class*="price"]']
      },
      tatacliq: {
        jsonLd: true,
        dataAttrs: ['data-price', 'data-product-price', 'data-discounted-price'],
        cssPrice: ['.ProductDescription__priceHolder', '[class*="price"]']
      },
      meesho: {
        jsonLd: true,
        nextDataPaths: [
          'props.pageProps.data.price.discounted',
          'props.pageProps.data.price.original',
          'props.pageProps.pdpData.product_price',
          'props.pageProps.pdpData.price'
        ],
        dataAttrs: ['data-price', 'data-discount-price'],
        cssPrice: ['[class*="price"]']
      },
      myntra: {
        jsonLd: true,
        nextDataPaths: [
          'props.pageProps.pdpData.price.discounted',
          'props.pageProps.pdpData.price.mrp',
          'props.pageProps.data.price',
          'props.pageProps.productData.price'
        ],
        dataAttrs: ['data-price', 'data-discounted-price'],
        cssPrice: ['[class*="price"]']
      },
      flipkart: {
        jsonLd: true,
        dataAttrs: ['data-price', 'data-product-price'],
        cssPrice: [
          '._30jeq3._16Jk6d',
          '.CEmiEU ._30jeq3',
          '._25b18 ._30jeq3',
          '._30jeq3'
        ]
      }
    }
  };

  const PLATFORM_DELAYS_MS = {
    flipkart: 0,
    croma: 800,
    tatacliq: 1600,
    meesho: 2400,
    myntra: 3200
  };

  const CACHE_TTL_MS = {
    amazon_product: 30 * 60 * 1000,
    comparison: EFFECTIVE_COMPARISON_TTL_MS,
    bestseller_page: 4 * 60 * 60 * 1000
  };

  const SEARCH_URLS = {
    flipkart: (query) => `https://www.flipkart.com/search?q=${encodeURIComponent(query)}`,
    croma: (query) => `https://www.croma.com/searchB?q=${encodeURIComponent(query)}`,
    tatacliq: (query) => `https://www.tatacliq.com/search/?text=${encodeURIComponent(query)}`,
    meesho: (query) => `https://www.meesho.com/search?q=${encodeURIComponent(query)}`,
    myntra: (query) => `https://www.myntra.com/${encodeURIComponent(query)}`
  };

  window.TruvakSelectors = {
    SELECTORS,
    PLATFORM_DELAYS_MS,
    CACHE_TTL_MS,
    SEARCH_URLS
  };
})();
