chrome.runtime.onInstalled.addListener(() => {
    chrome.action.onClicked.addListener((tab) => {
        chrome.tabs.sendMessage(tab.id, { action: 'checkLogin' }, (response) => {
            if (!response || !response.isLoggedIn) {
                chrome.scripting.executeScript({
                    target: { tabId: tab.id },
                    files: ['login.html']
                });
            } else {
                chrome.scripting.executeScript({
                    target: { tabId: tab.id },
                    files: ['dashboard.js']
                });
            }
        });
    });
});
