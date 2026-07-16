function renderHeaderBroker() {
    const el = document.getElementById('headerBrokerSelect');
    if (!el) return;
    const selected = getSelectedBroker();
    el.innerHTML = `
        <span style="font-size:11px;color:#8b949e">Брокер:</span>
        ${Object.entries(BROKERS).map(([id, b]) => `
            <button onclick="setSelectedBroker('${id}');renderHeaderBroker();loadBonds();" style="
                padding:3px 8px;border-radius:6px;border:1px solid ${id === selected ? b.color : '#30363d'};
                background:${id === selected ? b.color + '22' : 'transparent'};
                color:${id === selected ? b.color : '#8b949e'};
                font-size:11px;cursor:pointer;
            ">${b.icon} ${b.name}</button>
        `).join('')}
    `;
}

async function initApp() {
    initAuth();
    renderHeaderBroker();
    const isAuth = await checkAuth();
    if (isAuth) {
        showApp();
    } else {
        showAuthScreen();
    }
}

document.getElementById('searchInput').addEventListener('keyup', e => { if (e.key === 'Enter') applyFilters(); });
document.getElementById('freqFilter').addEventListener('change', () => { loadBonds(); loadCalendar(); });

initApp();
