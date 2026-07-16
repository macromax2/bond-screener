async function loadBonds() {
    const p = new URLSearchParams();

    const mapIds = {minYield:'min_yield',maxYield:'max_yield',minPrice:'min_price',maxPrice:'max_price',minCoupon:'min_coupon',maxMatDays:'max_mat_days'};
    Object.entries(mapIds).forEach(([id,param]) => {
        const v = document.getElementById(id).value;
        if (v) p.set(param, v);
    });

    const board = document.getElementById('boardFilter').value;
    if (board) p.set('board', board);

    const search = document.getElementById('searchInput').value;
    if (search) p.set('search', search);

    const rating = getSelectedRatings();
    if (rating.length) p.set('rating', rating.join(','));

    const freq = document.getElementById('freqFilter').value;
    if (freq) p.set('coupon_freq', freq);

    p.set('sort_by', currentSort);
    p.set('sort_dir', currentDir);

    try {
        const res = await fetch('/api/bonds?' + p);
        const data = await res.json();
        allBonds = data.bonds;
        renderTable();
        document.getElementById('countBadge').textContent = data.total;
    } catch (e) { console.error(e); }
}

function loadCalendarFiltered() {
    loadCalendar();
}

async function loadCalendar() {
    const p = new URLSearchParams({months: '6'});
    const ratings = getSelectedRatings();
    if (ratings.length) p.set('rating', ratings.join(','));
    const board = document.getElementById('boardFilter').value;
    if (board) p.set('board', board);

    try {
        const res = await fetch('/api/calendar?' + p);
        const data = await res.json();
        const grid = document.getElementById('calendarGrid');
        if (!data.calendar || !data.calendar.length) {
            grid.innerHTML = '<div class="loading">Нет данных по фильтру</div>'; return;
        }
        const portfolio = getPortfolio();
        grid.innerHTML = data.calendar.map((day, i) => {
            const allCoupons = day.coupons;
            return `
            <div class="calendar-card" id="calCard${i}">
                <div onclick="toggleCalCard(${i})" style="display:flex;justify-content:space-between;align-items:center;cursor:pointer;user-select:none">
                    <div style="display:flex;align-items:center;gap:8px">
                        <span id="calCardArrow${i}" style="color:#8b949e;font-size:12px;transition:transform 0.2s">▶</span>
                        <span style="font-size:14px;color:#58a6ff;font-weight:500">${new Date(day.date).toLocaleDateString('ru-RU',{day:'numeric',month:'long',year:'numeric'})}</span>
                        <span style="font-size:11px;color:#8b949e">${allCoupons.length} обл.</span>
                    </div>
                    <span style="color:#3fb950;font-weight:600">${day.total.toFixed(2)} ₽</span>
                </div>
                <div id="calCardBody${i}" style="display:none;margin-top:12px">
                    ${allCoupons.map(c => {
                        const inP = portfolio.some(p => p.secid === c.secid);
                        return `<div class="calendar-item">
                            <span class="clickable-link" onclick="event.stopPropagation();filterBySearch('${c.name}')" title="Найти ${c.name}">${c.name}</span>
                            <span style="display:flex;align-items:center;gap:6px">
                                ${c.coupon_value.toFixed(2)} ₽
                                <button class="add-btn ${inP?'added':''}" onclick="event.stopPropagation();togglePortfolio('${c.secid}')" title="${inP?'Убрать':'Добавить'}" style="width:20px;height:20px;font-size:11px">${inP?'✓':'+'}</button>
                            </span>
                        </div>`;
                    }).join('')}
                </div>
            </div>`;
        }).join('');
    } catch(e) {}
}

function toggleCalCard(idx) {
    const body = document.getElementById('calCardBody' + idx);
    const arrow = document.getElementById('calCardArrow' + idx);
    if (body.style.display === 'none') {
        body.style.display = 'block';
        arrow.style.transform = 'rotate(90deg)';
    } else {
        body.style.display = 'none';
        arrow.style.transform = 'rotate(0deg)';
    }
}

async function manualSync() {
    const btn = document.getElementById('syncBtn');
    const st = document.getElementById('syncStatus');
    btn.disabled = true; btn.textContent = '⏳ Загрузка...';
    st.textContent = 'Синхронизация со всеми досками MOEX...';
    try {
        const res = await fetch('/api/sync', {method:'POST'});
        const d = await res.json();
        const boards = Object.entries(d.boards||{}).map(([k,v])=>`${k}:${v}`).join(' ');
        st.textContent = `OK: ${d.count} | ${boards}`;
        loadBonds();
    } catch(e) { st.textContent = 'Ошибка'; }
    btn.disabled = false; btn.textContent = '⟳ Синхронизировать';
}
