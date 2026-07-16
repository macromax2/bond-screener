let allBonds = [];
let currentSort = 'yield_percent';
let currentDir = 'desc';
let compareList = JSON.parse(localStorage.getItem('bond_compare') || '[]');

const BROKERS = {
    tinkoff: { name: 'Т-Инвестиции', color: '#FFDD2D', icon: '⭐', url: 'https://www.tbank.ru/invest/bonds/' },
};

function getSelectedBroker() {
    return localStorage.getItem('bond_broker') || 'tinkoff';
}

function setSelectedBroker(id) {
    localStorage.setItem('bond_broker', id);
}

function renderBrokerSelector() {
    const selected = getSelectedBroker();
    return `
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px">
            <span style="font-size:13px;color:#8b949e">Покупать через:</span>
            ${Object.entries(BROKERS).map(([id, b]) => `
                <button onclick="setSelectedBroker('${id}');renderPortfolio();" style="
                    display:flex;align-items:center;gap:6px;
                    padding:6px 14px;border-radius:8px;border:2px solid ${id === selected ? b.color : '#30363d'};
                    background:${id === selected ? b.color + '22' : '#0d1117'};
                    color:${id === selected ? b.color : '#8b949e'};
                    font-size:13px;font-weight:${id === selected ? '600' : '400'};
                    cursor:pointer;transition:all 0.2s
                ">${b.icon} ${b.name}</button>
            `).join('')}
        </div>
    `;
}

function getPortfolio() {
    try { return JSON.parse(localStorage.getItem('bond_portfolio') || '[]'); } catch { return []; }
}

function savePortfolio(portfolio) {
    localStorage.setItem('bond_portfolio', JSON.stringify(portfolio));
    document.getElementById('portfolioBadge').textContent = portfolio.length;
    try { if (authToken) saveServerPortfolio(); } catch (e) {}
}

function toggleDropdown(id) {
    const el = document.getElementById(id.replace('Dropdown', 'List'));
    el.classList.toggle('open');
}

function getSelectedRatings() {
    return Array.from(document.querySelectorAll('#ratingList input:checked')).map(cb => cb.value);
}

function setSelectedRatings(ratings) {
    document.querySelectorAll('#ratingList input').forEach(cb => { cb.checked = ratings.includes(cb.value); });
    updateRatingLabel();
}

function updateRatingLabel() {
    const selected = getSelectedRatings();
    document.getElementById('ratingLabel').textContent = selected.length ? selected.join(', ') : 'Все';
}

function onRatingChange() {
    updateRatingLabel();
    loadBonds();
    loadCalendar();
}

document.addEventListener('click', e => {
    if (!e.target.closest('#ratingDropdown') && !e.target.closest('#ratingList')) {
        document.getElementById('ratingList').classList.remove('open');
    }
});

function sortTable(field) {
    if (currentSort === field) currentDir = currentDir === 'desc' ? 'asc' : 'desc';
    else { currentSort = field; currentDir = 'desc'; }
    loadBonds();
}

function switchTab(tab, el) {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    if (el) el.classList.add('active');
    switchTabDirect(tab);
    if (tab === 'calendar') loadCalendar();
    if (tab === 'analytics') renderAnalytics();
    if (tab === 'portfolio') renderPortfolio();
    if (tab === 'compare') renderCompare();
    if (tab === 'ai') renderAI();
}

function switchTabDirect(tab) {
    document.querySelectorAll('.tab').forEach(t => {
        const txt = t.textContent.toLowerCase();
        t.classList.toggle('active',
            (tab === 'table' && txt.includes('таблиц')) ||
            (tab === 'calendar' && txt.includes('календ')) ||
            (tab === 'analytics' && txt.includes('аналит')) ||
            (tab === 'portfolio' && txt.includes('портфел')) ||
            (tab === 'compare' && txt.includes('сравнен')) ||
            (tab === 'ai' && txt.includes('ai'))
        );
    });
    document.getElementById('tableView').style.display = tab === 'table' ? 'block' : 'none';
    document.getElementById('calendarView').style.display = tab === 'calendar' ? 'block' : 'none';
    document.getElementById('analyticsView').style.display = tab === 'analytics' ? 'block' : 'none';
    document.getElementById('portfolioView').style.display = tab === 'portfolio' ? 'block' : 'none';
    document.getElementById('compareView').style.display = tab === 'compare' ? 'block' : 'none';
    document.getElementById('aiView').style.display = tab === 'ai' ? 'block' : 'none';
}

function copyISIN(isin) {
    navigator.clipboard.writeText(isin).then(() => {
        const el = event.target;
        el.style.background = '#238636';
        setTimeout(() => el.style.background = '', 500);
    });
}
