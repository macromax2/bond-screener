// === AUTH ===
let currentUser = null;
let authToken = localStorage.getItem('bond_auth_token');

async function checkAuth() {
    if (!authToken) return false;
    try {
        const res = await fetch('/api/auth/me', {
            headers: { 'Authorization': 'Bearer ' + authToken }
        });
        if (res.ok) {
            currentUser = await res.json();
            return true;
        }
    } catch (e) {}
    logout();
    return false;
}

function logout() {
    authToken = null;
    currentUser = null;
    localStorage.removeItem('bond_auth_token');
    showAuthScreen();
}

async function login(email, password) {
    const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || 'Ошибка входа');
    authToken = data.token;
    localStorage.setItem('bond_auth_token', authToken);
    currentUser = data.user;
    await loadServerPortfolio();
    showApp();
}

async function register(email, password, name) {
    const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, name })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || 'Ошибка регистрации');
    authToken = data.token;
    localStorage.setItem('bond_auth_token', authToken);
    currentUser = data.user;
    await saveServerPortfolio();
    showApp();
}

async function saveServerPortfolio() {
    if (!authToken || !currentUser) return;
    try {
        await fetch('/api/auth/portfolio/save', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + authToken
            },
            body: JSON.stringify({
                portfolio: getPortfolio(),
                compare: compareList
            })
        });
    } catch (e) {}
}

async function loadServerPortfolio() {
    if (!authToken || !currentUser) return;
    try {
        const res = await fetch('/api/auth/portfolio/load', {
            headers: { 'Authorization': 'Bearer ' + authToken }
        });
        if (res.ok) {
            const data = await res.json();
            if (data.portfolio && data.portfolio.length) {
                localStorage.setItem('bond_portfolio', JSON.stringify(data.portfolio));
            }
            if (data.compare) {
                localStorage.setItem('bond_compare', JSON.stringify(data.compare));
                compareList = data.compare;
            }
        }
    } catch (e) {}
}

function showAuthScreen() {
    document.getElementById('appRoot').style.display = 'none';
    document.getElementById('authScreen').style.display = 'block';
    document.getElementById('authError').textContent = '';
}

function showApp() {
    document.getElementById('authScreen').style.display = 'none';
    document.getElementById('appRoot').style.display = 'block';
    if (currentUser) {
        document.getElementById('userEmail').textContent = currentUser.email;
    }
    document.getElementById('portfolioBadge').textContent = getPortfolio().length;
    document.getElementById('compareBadge').textContent = compareList.length;
    try { renderHeaderBroker(); } catch (e) {}
    loadBonds();
    updateCompareBar();
}

function initAuth() {
    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');
    const showReg = document.getElementById('showRegister');
    const showLogin = document.getElementById('showLogin');

    showReg.onclick = () => {
        loginForm.style.display = 'none';
        registerForm.style.display = 'block';
        document.getElementById('authError').textContent = '';
    };
    showLogin.onclick = () => {
        registerForm.style.display = 'none';
        loginForm.style.display = 'block';
        document.getElementById('authError').textContent = '';
    };

    loginForm.onsubmit = async (e) => {
        e.preventDefault();
        const email = document.getElementById('loginEmail').value;
        const password = document.getElementById('loginPassword').value;
        try {
            await login(email, password);
        } catch (err) {
            document.getElementById('authError').textContent = err.message;
        }
    };

    registerForm.onsubmit = async (e) => {
        e.preventDefault();
        const email = document.getElementById('regEmail').value;
        const password = document.getElementById('regPassword').value;
        const name = document.getElementById('regName').value;
        try {
            await register(email, password, name);
        } catch (err) {
            document.getElementById('authError').textContent = err.message;
        }
    };
}
