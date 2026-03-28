chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'checkLogin') {
        fetch('/api/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ username: 'admin', password: 'password' })
        })
            .then((response) => response.json())
            .then((data) => {
                if (data.message === 'Login successful') {
                    sendResponse({ isLoggedIn: true });
                } else {
                    sendResponse({ isLoggedIn: false });
                }
            })
            .catch(() => {
                sendResponse({ isLoggedIn: false });
            });

        return true;
    }

    return false;
});