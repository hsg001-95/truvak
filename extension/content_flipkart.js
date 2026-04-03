// Trust Intelligence Platform
// Flipkart compatibility script.
// The full runtime is shared in content_amazon.js for both seller platforms.

(() => {
	const host = window.location.hostname;
	if (!host.includes('seller.flipkart')) return;

	console.log('[TIP] Flipkart compatibility layer active');
})();