function renderTable() {
    const tbody = document.getElementById('bondsTable');
    if (!allBonds.length) { tbody.innerHTML = '<tr><td colspan="13" class="loading">Нет данных</td></tr>'; return; }
    const portfolio = getPortfolio();
    const broker = (typeof BROKERS !== 'undefined' && BROKERS[getSelectedBroker()]) || (typeof BROKERS !== 'undefined' ? BROKERS.tinkoff : { name: 'Купить', color: '#58a6ff', icon: '🔗', url: '#' });

    document.querySelectorAll('th[data-sort]').forEach(th => {
        const field = th.dataset.sort;
        const arrow = th.querySelector('.sort-arrow');
        if (field === currentSort) {
            th.classList.add('sorted');
            if (arrow) arrow.textContent = currentDir === 'desc' ? ' ▼' : ' ▲';
        } else {
            th.classList.remove('sorted');
            if (arrow) arrow.textContent = '';
        }
    });

    tbody.innerHTML = allBonds.map(b => {
        const rc = (b.rating||'').includes('AAA') ? 'rating-aaa' :
                   (b.rating||'').startsWith('A') ? 'rating-a' :
                   (b.rating||'').includes('BBB') ? 'rating-bbb' :
                   (b.rating||'').includes('BB') ? 'rating-bb' : 'rating-b';
        const inPortfolio = portfolio.some(p => p.secid === b.secid);
        const inCompare = compareList.includes(b.secid);
        const pItem = portfolio.find(p => p.secid === b.secid);
        const qty = pItem ? (pItem.quantity || 1) : 1;
        const buyUrl = broker.url + encodeURIComponent(b.secid || b.isin || b.name);
        return `<tr>
            <td><button class="add-btn ${inPortfolio?'added':''}" onclick="togglePortfolio('${b.secid}')" title="${inPortfolio?'Убрать из портфеля':'Добавить в портфель'}">${inPortfolio?'✓':'+'}</button></td>
            <td><input type="checkbox" class="compare-cb" ${inCompare?'checked':''} onchange="toggleCompare('${b.secid}')" title="Сравнить"></td>
            <td title="${b.name}">${b.name}</td>
            <td><span class="isin-code" onclick="copyISIN('${b.isin}')" title="Нажми чтобы скопировать">${b.isin || '—'}</span></td>
            <td>${b.price ? b.price.toFixed(2) : '—'}</td>
            <td class="${(b.yield_percent||0)>=15?'positive':''}">${b.yield_percent ? b.yield_percent.toFixed(2)+'%' : '—'}</td>
            <td>${b.coupon_percent ? b.coupon_percent.toFixed(2)+'%' : '—'}</td>
            <td>${b.coupon_value ? b.coupon_value.toFixed(2) : '—'}</td>
            <td><span class="type-badge">${b.coupon_freq || '—'}</span></td>
            <td>${b.mat_date || '—'}</td>
            <td>${b.days_to_mat > 0 ? b.days_to_mat : '—'}</td>
            <td><span class="rating-badge ${rc}">${b.rating || '—'}</span></td>
            <td>${b.volume ? (b.volume/1e6).toFixed(1)+'M' : '—'}</td>
            <td><a href="${buyUrl}" target="_blank" class="broker-link" style="color:${broker.color};border-color:${broker.color}44" title="Купить через ${broker.name}">${broker.icon} ${broker.name}</a></td>
        </tr>`;
    }).join('');
    updateCompareBar();
}

function filterByRating(rating) {
    setSelectedRatings([rating]);
    document.getElementById('boardFilter').value = '';
    document.getElementById('searchInput').value = '';
    switchTabDirect('table');
    loadBonds();
    loadCalendar();
}

function filterByBoard(board) {
    document.getElementById('boardFilter').value = board;
    setSelectedRatings([]);
    switchTabDirect('table');
    loadBonds();
    loadCalendar();
}

function filterBySearch(text) {
    document.getElementById('searchInput').value = text;
    setSelectedRatings([]);
    document.getElementById('boardFilter').value = '';
    switchTabDirect('table');
    loadBonds();
}

function filterOFZ() {
    document.getElementById('boardFilter').value = 'TQOB';
    setSelectedRatings([]);
    switchTabDirect('table');
    loadBonds();
    loadCalendar();
}

function applyFilters() {
    loadBonds();
    loadCalendar();
}

function resetFilters() {
    document.querySelectorAll('.filters input[type=text],.filters input[type=number]').forEach(i => i.value = '');
    document.querySelectorAll('.filters select').forEach(s => s.value = '');
    setSelectedRatings([]);
    loadBonds();
    loadCalendar();
}
