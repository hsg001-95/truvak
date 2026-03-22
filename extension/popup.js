// Load saved config on open
document.addEventListener('DOMContentLoaded', () => {
  chrome.storage.local.get(
    ['apiUrl', 'merchantId', 'codThreshold', 'autoBlock'],
    (config) => {
      document.getElementById('apiUrl').value =
        config.apiUrl || 'http://127.0.0.1:8000';
      document.getElementById('merchantId').value =
        config.merchantId || 'merchant-amazon';
      document.getElementById('threshold').value =
        config.codThreshold || 40;
      document.getElementById('thresholdVal').textContent =
        config.codThreshold || 40;

      const toggle = document.getElementById('autoBlock');
      if (config.autoBlock) toggle.classList.add('on');
    }
  );

  checkApiStatus();
});

// Threshold slider
document.getElementById('threshold').addEventListener('input', (e) => {
  document.getElementById('thresholdVal').textContent = e.target.value;
});

// Auto-block toggle
document.getElementById('autoBlock').addEventListener('click', (e) => {
  e.target.classList.toggle('on');
});

// Save settings
document.getElementById('saveBtn').addEventListener('click', () => {
  const config = {
    apiUrl:       document.getElementById('apiUrl').value.trim(),
    merchantId:   document.getElementById('merchantId').value.trim(),
    codThreshold: parseInt(document.getElementById('threshold').value),
    autoBlock:    document.getElementById('autoBlock').classList.contains('on'),
  };

  chrome.storage.local.set(config, () => {
    const status = document.getElementById('status');
    status.textContent = '✅ Settings saved!';
    status.className   = 'status ok';
    setTimeout(() => {
      status.textContent = '';
      status.className   = 'status';
    }, 2000);
  });
});

// Check API health
async function checkApiStatus() {
  const statusEl = document.getElementById('apiStatus');
  try {
    const config = await new Promise(resolve =>
      chrome.storage.local.get(['apiUrl'], resolve)
    );
    const apiUrl = config.apiUrl || 'http://127.0.0.1:8000';
    const res    = await fetch(`${apiUrl}/health`, { method: 'GET' });
    const data   = await res.json();

    if (data.status === 'ok') {
      statusEl.textContent = `🟢 API Online — model: ${data.model}`;
      statusEl.className   = 'status ok';
    } else {
      throw new Error('API returned non-ok status');
    }
  } catch {
    statusEl.textContent = '🔴 API Offline — start uvicorn';
    statusEl.className   = 'status err';
  }
}