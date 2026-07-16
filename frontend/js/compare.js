function toggleCompare(secid) {
    const idx = compareList.indexOf(secid);
    if (idx >= 0) {
        compareList.splice(idx, 1);
    } else {
        if (compareList.length >= 5) { alert('Максимум 5 облигаций для сравнения'); return; }
        compareList.push(secid);
    }
    localStorage.setItem('bond_compare', JSON.stringify(compareList));
    updateCompareBar();
    renderTable();
    if (authToken) saveServerPortfolio();
}

function clearCompare() {
    compareList = [];
    localStorage.setItem('bond_compare', JSON.stringify(compareList));
    updateCompareBar();
    renderTable();
    if (document.getElementById('compareView').style.display !== 'none') renderCompare();
    if (authToken) saveServerPortfolio();
}

function updateCompareBar() {
    const bar = document.getElementById('compareBar');
    const cnt = document.getElementById('compareBarCount');
    const badge = document.getElementById('compareBadge');
    cnt.textContent = compareList.length;
    badge.textContent = compareList.length;
    bar.classList.toggle('visible', compareList.length > 0);
}

function renderCompare() {
    const content = document.getElementById('compareContent');
    if (compareList.length < 2) {
        content.innerHTML = `<div class="portfolio-empty"><h3>Выбери минимум 2 облигации</h3><p>В таблице поставь галочки на облигациях, которые хочешь сравнить</p></div>`;
        return;
    }

    const bonds = compareList.map(secid => allBonds.find(b => b.secid === secid)).filter(Boolean);
    if (bonds.length < 2) { content.innerHTML = '<div class="loading">Облигации не найдены</div>'; return; }

    const fields = [
        { key: 'price', label: 'Цена', format: v => v ? v.toFixed(2) : '—', compare: 'num' },
        { key: 'yield_percent', label: 'Доходность', format: v => v ? v.toFixed(2) + '%' : '—', compare: 'num', higher_better: true },
        { key: 'coupon_percent', label: 'Купон %', format: v => v ? v.toFixed(2) + '%' : '—', compare: 'num', higher_better: true },
        { key: 'coupon_value', label: 'Купон (₽)', format: v => v ? v.toFixed(2) : '—', compare: 'num', higher_better: true },
        { key: 'coupon_freq', label: 'Периодичность', format: v => v || '—', compare: 'str' },
        { key: 'mat_date', label: 'Погашение', format: v => v || '—', compare: 'str' },
        { key: 'days_to_mat', label: 'Дней до погашения', format: v => v > 0 ? v : '—', compare: 'num', higher_better: false },
        { key: 'rating', label: 'Рейтинг', format: v => v || '—', compare: 'str' },
        { key: 'board', label: 'Доска', format: v => v || '—', compare: 'str' },
    ];

    let html = `<div class="table-container"><table class="compare-table">
        <thead><tr><th>Параметр</th>${bonds.map(b => `<th style="color:#58a6ff">${b.name}</th>`).join('')}</tr></thead>
        <tbody>`;

    fields.forEach(f => {
        const values = bonds.map(b => b[f.key]);
        let bestIdx = -1, worstIdx = -1;
        if (f.compare === 'num' && f.higher_better !== undefined) {
            const nums = values.map(v => typeof v === 'number' ? v : -Infinity);
            const maxVal = Math.max(...nums);
            const minVal = Math.min(...nums.filter(v => v > -Infinity));
            if (f.higher_better) {
                bestIdx = nums.indexOf(maxVal);
                if (minVal < maxVal) worstIdx = nums.indexOf(minVal);
            } else {
                bestIdx = nums.indexOf(minVal);
                if (maxVal > minVal && minVal > -Infinity) worstIdx = nums.indexOf(maxVal);
            }
        }

        html += `<tr><td style="color:#8b949e;font-weight:500">${f.label}</td>`;
        bonds.forEach((b, i) => {
            let cls = '';
            if (i === bestIdx) cls = 'best';
            else if (i === worstIdx) cls = 'worst';
            html += `<td class="${cls}">${f.format(b[f.key])}</td>`;
        });
        html += '</tr>';
    });

    html += `</tbody></table></div>`;

    html += `<div style="margin-top:16px;padding:12px;background:#161b22;border:1px solid #30363d;border-radius:8px;font-size:12px;color:#8b949e">
        <span style="color:#3fb950">■</span> Лучшее значение &nbsp;&nbsp;
        <span style="color:#f85149">■</span> Худшее значение
    </div>`;

    html += `<div style="margin-top:12px;padding:10px;background:#2a1a1a;border:1px solid #5a2020;border-radius:6px;font-size:11px;color:#f85149">
        ⚠️ Сравнение носит информационный характер и не является рекомендацией к покупке или продаже.
    </div>`;

    content.innerHTML = html;
}
