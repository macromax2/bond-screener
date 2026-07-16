function togglePortfolio(secid) {
    let portfolio = getPortfolio();
    const idx = portfolio.findIndex(p => p.secid === secid);
    if (idx >= 0) {
        portfolio.splice(idx, 1);
    } else {
        const bond = allBonds.find(b => b.secid === secid);
        if (bond) {
            portfolio.push({
                secid: bond.secid, isin: bond.isin, name: bond.name,
                price: bond.price, yield_percent: bond.yield_percent,
                coupon_percent: bond.coupon_percent, coupon_value: bond.coupon_value,
                coupon_freq: bond.coupon_freq, mat_date: bond.mat_date,
                days_to_mat: bond.days_to_mat, rating: bond.rating,
                board: bond.board, face_value: bond.face_value,
                coupon_period: bond.coupon_period,
                quantity: 1,
                added_at: new Date().toISOString()
            });
        } else {
            console.error('Bond not found in allBonds:', secid, 'allBonds length:', allBonds.length);
            alert('Ошибка: облигация не найдена. Попробуйте обновить страницу.');
            return;
        }
    }
    savePortfolio(portfolio);
    renderTable();
    if (document.getElementById('portfolioView').style.display !== 'none') renderPortfolio();
}

function updateQuantity(secid, qty) {
    let portfolio = getPortfolio();
    const item = portfolio.find(p => p.secid === secid);
    if (item) {
        item.quantity = Math.max(1, parseInt(qty) || 1);
        savePortfolio(portfolio);
        if (document.getElementById('portfolioView').style.display !== 'none') renderPortfolio();
        if (document.getElementById('analyticsView').style.display !== 'none') renderAnalytics();
    }
}

function removeFromPortfolio(secid) {
    let portfolio = getPortfolio();
    portfolio = portfolio.filter(p => p.secid !== secid);
    savePortfolio(portfolio);
    renderPortfolio();
    renderTable();
}

function clearPortfolio() {
    if (confirm('Очистить весь портфель?')) {
        savePortfolio([]);
        renderPortfolio();
        renderTable();
    }
}

function exportPortfolio() {
    const portfolio = getPortfolio();
    if (!portfolio.length) { alert('Портфель пуст'); return; }
    const isins = portfolio.map(p => `${p.isin}\t${p.name}\t${p.rating}\t${p.yield_percent}%\t${p.quantity || 1} шт`).join('\n');
    const header = 'ISIN\tНазвание\tРейтинг\tДоходность\tКол-во\n';
    navigator.clipboard.writeText(header + isins).then(() => alert('ISIN скопированы в буфер!'));
}

function renderPortfolio() {
    const portfolio = getPortfolio();
    const content = document.getElementById('portfolioContent');
    const stats = document.getElementById('portfolioStats');
    document.getElementById('portfolioBadge').textContent = portfolio.length;

    if (!portfolio.length) {
        content.innerHTML = `<div class="portfolio-empty">
            <h3>Портфель пуст</h3>
            <p>Добавляй облигации из таблицы кнопкой "+"
            </p>
        </div>`;
        stats.innerHTML = '';
        return;
    }

    const totalValue = portfolio.reduce((s, p) => s + (p.price || 0) * (p.face_value || 1000) / 100 * (p.quantity || 1), 0);
    const totalQty = portfolio.reduce((s, p) => s + (p.quantity || 1), 0);
    const selectedBroker = (typeof BROKERS !== 'undefined' && BROKERS[getSelectedBroker()]) || (typeof BROKERS !== 'undefined' ? BROKERS.tinkoff : { name: 'Купить', color: '#58a6ff', icon: '🔗', url: '#' });

    stats.innerHTML = `
        <div class="portfolio-stat"><div class="label">Облигаций</div><div class="value">${portfolio.length}</div></div>
        <div class="portfolio-stat"><div class="label">Всего штук</div><div class="value">${totalQty}</div></div>
        <div class="portfolio-stat"><div class="label">Стоимость портфеля</div><div class="value">${totalValue.toLocaleString()} ₽</div></div>
    `;

    content.innerHTML = `
        <div style="background:#2a1a1a;border:1px solid #5a2020;border-radius:8px;padding:12px 16px;margin-bottom:16px;font-size:12px;color:#f85149">
            ⚠️ Информация в портфеле носит справочный характер. Ссылки на брокеров не являются рекомендацией к приобретению ценных бумаг.
        </div>

        ${renderBrokerSelector()}

        <div class="table-container">
            <table>
                <thead>
                    <tr>
                        <th></th>
                        <th>Название</th>
                        <th>ISIN</th>
                        <th>Кол-во</th>
                        <th>Цена</th>
                        <th>Сумма</th>
                        <th>Доходность</th>
                        <th>Купон (₽)</th>
                        <th>Купон × шт</th>
                        <th>Периодичность</th>
                        <th>Погашение</th>
                        <th>Рейтинг</th>
                        <th>Купить</th>
                    </tr>
                </thead>
                <tbody>
                    ${portfolio.map(p => {
                        const qty = p.quantity || 1;
                        const sum = (p.price || 0) * (p.face_value || 1000) / 100 * qty;
                        const couponTotal = (p.coupon_value || 0) * qty;
                        const buyUrl = selectedBroker.url + encodeURIComponent(p.secid || p.isin || p.name);
                        return `<tr>
                            <td><button class="add-btn added" onclick="removeFromPortfolio('${p.secid}')" title="Убрать">✕</button></td>
                            <td>${p.name}</td>
                            <td><span class="isin-code" onclick="copyISIN('${p.isin}')" title="Копировать ISIN">${p.isin || '—'}</span></td>
                            <td><input type="number" class="qty-input" value="${qty}" min="1" onchange="updateQuantity('${p.secid}', this.value)"></td>
                            <td>${p.price ? p.price.toFixed(2) : '—'}</td>
                            <td style="font-weight:600">${Math.round(sum).toLocaleString()} ₽</td>
                            <td class="${(p.yield_percent||0)>=15?'positive':''}">${p.yield_percent ? p.yield_percent.toFixed(2)+'%' : '—'}</td>
                            <td>${p.coupon_value ? p.coupon_value.toFixed(2) : '—'}</td>
                            <td style="color:#3fb950">${couponTotal.toFixed(2)} ₽</td>
                            <td><span class="type-badge">${p.coupon_freq || '—'}</span></td>
                            <td>${p.mat_date || '—'}</td>
                            <td><span class="rating-badge ${(p.rating||'').includes('AAA')?'rating-aaa':(p.rating||'').startsWith('A')?'rating-a':(p.rating||'').includes('BBB')?'rating-bbb':'rating-bb'}">${p.rating || '—'}</span></td>
                            <td>
                                <a href="${buyUrl}" target="_blank" style="
                                    display:inline-flex;align-items:center;gap:4px;
                                    padding:4px 10px;border-radius:6px;
                                    background:${selectedBroker.color}22;color:${selectedBroker.color};
                                    border:1px solid ${selectedBroker.color}44;
                                    font-size:12px;font-weight:500;text-decoration:none;
                                    transition:all 0.2s
                                " onmouseover="this.style.background='${selectedBroker.color}44'" onmouseout="this.style.background='${selectedBroker.color}22'">
                                    ${selectedBroker.icon} ${selectedBroker.name}
                                </a>
                            </td>
                        </tr>`;
                    }).join('')}
                </tbody>
            </table>
        </div>
    `;
}
