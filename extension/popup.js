const API_BASE = 'http://127.0.0.1:8000';

const loginCard = document.getElementById('loginCard');
const dashboardCard = document.getElementById('dashboardCard');
const loginError = document.getElementById('loginError');

const usernameInput = document.getElementById('username');
const passwordInput = document.getElementById('password');
const loginButton = document.getElementById('loginButton');

const seller = document.getElementById('sellerDetails');
const saved = document.getElementById('totalMoneySaved');
const active = document.getElementById('currentActiveOrders');
const history = document.getElementById('orderHistory');

const refreshButton = document.getElementById('refreshButton');
const logoutButton = document.getElementById('logoutButton');

function showLogin(message = '') {
    loginCard.classList.remove('hidden');
    dashboardCard.classList.add('hidden');
    if (message) {
        loginError.innerText = message;
        loginError.classList.remove('hidden');
    } else {
        loginError.classList.add('hidden');
        loginError.innerText = '';
    }
}

function showDashboard() {
    loginCard.classList.add('hidden');
    dashboardCard.classList.remove('hidden');
}

function renderOrders(token, orders) {
    seller.innerText = `Merchant: ${token}`;
    saved.innerText = `${orders.length} scored orders loaded`;
    active.innerText = `${orders.filter((o) => o.status !== 'Delivered').length} Active Orders`;
    history.innerHTML = '';

    if (!orders.length) {
        const empty = document.createElement('div');
        empty.className = 'order-item';
        empty.innerText = 'No scored orders found yet.';
        history.appendChild(empty);
        return;
    }

    orders.slice(0, 12).forEach((order) => {
        const div = document.createElement('div');
        div.className = 'order-item';
        div.innerText = `${order.id} | ${order.status} | ${order.risk_level} | Score ${order.score}`;
        history.appendChild(div);
    });
}

async function loadOrders() {
    const token = localStorage.getItem('user');
    if (!token) {
        showLogin();
        return;
    }

    showDashboard();

    try {
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
        renderOrders(token, orders);
    } catch (error) {
        showLogin('API unreachable. Start backend on 127.0.0.1:8000');
    }
}

async function login() {
    const username = (usernameInput.value || '').trim();
    const password = passwordInput.value || '';

    if (!username || !password) {
        showLogin('Enter both username and password.');
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/v1/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ username, password }),
        });

        if (!response.ok) {
            throw new Error('Invalid credentials');
        }

        const data = await response.json();
        localStorage.setItem('user', data.token);
        showLogin();
        await loadOrders();
    } catch (error) {
        showLogin('Login failed. Check credentials.');
    }
}

function logout() {
    localStorage.removeItem('user');
    history.innerHTML = '';
    usernameInput.value = '';
    passwordInput.value = '';
    showLogin();
}

loginButton.addEventListener('click', login);
passwordInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
        login();
    }
});
refreshButton.addEventListener('click', loadOrders);
logoutButton.addEventListener('click', logout);

loadOrders();