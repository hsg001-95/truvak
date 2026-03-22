// Background service worker
// Handles messages between content scripts and popup

chrome.runtime.onInstalled.addListener(() => {
  console.log('Trust Intelligence Platform installed');

  // Set default config
  chrome.storage.local.set({
    apiUrl: 'http://127.0.0.1:8000',
    merchantId: 'merchant-amazon',
    codThreshold: 40,
    autoBlock: false,
  });
});

// Listen for messages from content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'SCORE_ORDER') {
    scoreOrder(message.payload)
      .then(result => sendResponse({ success: true, data: result }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true; // Keep channel open for async response
  }

  if (message.type === 'GET_CONFIG') {
    chrome.storage.local.get(
      ['apiUrl', 'merchantId', 'codThreshold', 'autoBlock'],
      config => sendResponse({ success: true, data: config })
    );
    return true;
  }
});

async function scoreOrder(payload) {
  const config = await chrome.storage.local.get(['apiUrl', 'merchantId']);
  const apiUrl = config.apiUrl || 'http://127.0.0.1:8000';
  const merchantId = config.merchantId || 'merchant-amazon';

  const response = await fetch(`${apiUrl}/v1/score`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...payload, merchant_id: merchantId }),
  });

  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }
  return response.json();
}
