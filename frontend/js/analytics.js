function renderAnalytics() {
    const content = document.getElementById('analyticsContent');
    const portfolio = getPortfolio();

    if (!portfolio.length) {
        content.innerHTML = `<div class="portfolio-empty">
            <h3>Нет облигаций в портфеле</h3>
            <p>Добавь облигации из таблицы кнопкой "+", чтобы увидеть аналитику</p>
        </div>`;
        return;
    }

    const tax = 0.13;
    const bonds = portfolio.filter(b => b.yield_percent > 0);

    let totalInvested = 0;
    let totalFaceValue = 0;
    let totalCouponIncome = 0;
    let totalCapitalGain = 0;
    let weightedDuration = 0;
    let totalWeight = 0;

    const bondDetails = bonds.map(b => {
        const price = b.price || 0;
        const face = b.face_value || 1000;
        const qty = b.quantity || 1;
        const invested = price * face / 100 * qty;
        const faceTotal = face * qty;
        const daysToMat = b.days_to_mat || 0;
        const yearsToMat = daysToMat / 365;

        const totalCoupons = (b.coupon_value || 0) * (daysToMat / (b.coupon_period || 365)) * qty;
        const capitalGain = (face - price * face / 100) * qty;
        const totalReturn = totalCoupons + capitalGain;
        const annualizedReturn = yearsToMat > 0 ? (totalReturn / invested / yearsToMat * 100) : 0;

        totalInvested += invested;
        totalFaceValue += faceTotal;
        totalCouponIncome += totalCoupons;
        totalCapitalGain += capitalGain;
        weightedDuration += yearsToMat * invested;
        totalWeight += invested;

        return { ...b, invested, totalCoupons, capitalGain, totalReturn, annualizedReturn, yearsToMat, qty };
    });

    const avgDuration = totalWeight > 0 ? (weightedDuration / totalWeight).toFixed(1) : 0;
    const totalReturn = totalCouponIncome + totalCapitalGain;
    const totalReturnTax = totalReturn * (1 - tax);
    const totalYield = totalInvested > 0 ? ((totalReturn / totalInvested) * 100).toFixed(2) : 0;
    const annualizedYield = totalInvested > 0 && avgDuration > 0 ? ((totalReturn / totalInvested / avgDuration) * 100).toFixed(2) : 0;
    const avgYield = (bonds.reduce((s,b) => s + b.yield_percent, 0) / bonds.length).toFixed(2);

    const byFreq = {};
    bonds.forEach(b => {
        const f = b.coupon_freq || 'Неизвестно';
        if (!byFreq[f]) byFreq[f] = { count: 0, totalYield: 0, totalCoupon: 0 };
        byFreq[f].count++;
        byFreq[f].totalYield += b.yield_percent;
        byFreq[f].totalCoupon += b.coupon_value || 0;
    });

    const byRating = {};
    bonds.forEach(b => {
        const r = b.rating || 'Неизвестно';
        if (!byRating[r]) byRating[r] = { count: 0, totalYield: 0, totalInvested: 0 };
        byRating[r].count++;
        byRating[r].totalYield += b.yield_percent;
        byRating[r].totalInvested += (b.price || 0) * (b.face_value || 1000) / 100;
    });

    content.innerHTML = `
        <div style="background:#2a1a1a;border:1px solid #5a2020;border-radius:8px;padding:12px 16px;margin-bottom:20px;font-size:12px;color:#f85149">
            ⚠️ Данная информация носит исключительно информационный характер и не является индивидуальной инвестиционной рекомендацией. Расчёт доходности является предварительным и может отличаться от фактического. Принятие инвестиционных решений осуществляется пользователем самостоятельно.
        </div>

        <div style="background:#161b22;border:1px solid #30363d;border-radius:8px;padding:16px 20px;margin-bottom:20px">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
                <span style="font-size:18px">📊</span>
                <h3 style="margin:0;font-size:16px">Обзор портфеля</h3>
            </div>
            <p style="font-size:13px;color:#8b949e;margin:0">Здесь показано, сколько ты вложил, сколько заработаешь и из чего состоит твой портфель</p>
        </div>

        <div class="stats-row">
            <div class="stat-card" style="border-left:3px solid #58a6ff">
                <h3>Облигаций</h3>
                <div class="value">${bonds.length}</div>
                <div style="font-size:11px;color:#8b949e;margin-top:4px">Средний срок ${avgDuration} лет</div>
            </div>
            <div class="stat-card" style="border-left:3px solid #58a6ff">
                <h3>Вложено денег</h3>
                <div class="value">${Math.round(totalInvested).toLocaleString()} ₽</div>
                <div style="font-size:11px;color:#8b949e;margin-top:4px">Номинал: ${Math.round(totalFaceValue).toLocaleString()} ₽</div>
            </div>
            <div class="stat-card" style="border-left:3px solid #3fb950">
                <h3>Заработаешь</h3>
                <div class="value" style="color:#3fb950">${Math.round(totalReturn).toLocaleString()} ₽</div>
                <div style="font-size:11px;color:#8b949e;margin-top:4px">Из них после налога: <strong style="color:#58a6ff">${Math.round(totalReturnTax).toLocaleString()} ₽</strong></div>
            </div>
            <div class="stat-card" style="border-left:3px solid #3fb950">
                <h3>Доходность</h3>
                <div class="value" style="color:#3fb950">${totalYield}%</div>
                <div style="font-size:11px;color:#8b949e;margin-top:4px">В год: <strong style="color:#58a6ff">${annualizedYield}%</strong></div>
            </div>
        </div>

        <div style="background:#161b22;border:1px solid #30363d;border-radius:8px;padding:16px 20px;margin:24px 0 16px">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
                <span style="font-size:18px">💰</span>
                <h3 style="margin:0;font-size:16px">Откуда берётся доход</h3>
            </div>
            <p style="font-size:13px;color:#8b949e;margin:0 0 12px">Твой доход складывается из двух частей</p>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
                <div style="background:#0d1117;border:1px solid #30363d;border-radius:6px;padding:12px">
                    <div style="font-size:13px;font-weight:600;color:#3fb950;margin-bottom:4px">Купоны</div>
                    <div style="font-size:20px;font-weight:600;color:#3fb950">${Math.round(totalCouponIncome).toLocaleString()} ₽</div>
                    <div style="font-size:11px;color:#8b949e;margin-top:4px">Деньги, которые облигация платит тебе регулярно</div>
                    <div style="font-size:11px;color:#8b949e">После налога: ${Math.round(totalCouponIncome * (1 - tax)).toLocaleString()} ₽</div>
                </div>
                <div style="background:#0d1117;border:1px solid #30363d;border-radius:6px;padding:12px">
                    <div style="font-size:13px;font-weight:600;color:${totalCapitalGain >= 0 ? '#3fb950' : '#f85149'};margin-bottom:4px">Разница цены</div>
                    <div style="font-size:20px;font-weight:600;color:${totalCapitalGain >= 0 ? '#3fb950' : '#f85149'}">${Math.round(totalCapitalGain).toLocaleString()} ₽</div>
                    <div style="font-size:11px;color:#8b949e;margin-top:4px">Купил дешевле номинала — получишь 100₽ при погашении</div>
                    <div style="font-size:11px;color:#8b949e">Если цена > 100, будешь платить из кармана</div>
                </div>
            </div>
            <div style="margin-top:12px;padding:10px;background:#0d1117;border-radius:6px;display:flex;justify-content:space-between;align-items:center">
                <div>
                    <span style="font-size:13px;color:#8b949e">Налог НДФЛ (13%):</span>
                    <span style="font-size:13px;color:#f85149;font-weight:600;margin-left:8px">−${Math.round(totalReturn * tax).toLocaleString()} ₽</span>
                </div>
                <div>
                    <span style="font-size:13px;color:#8b949e">MOEX доходность:</span>
                    <span style="font-size:13px;color:#3fb950;font-weight:600;margin-left:8px">${avgYield}%</span>
                </div>
            </div>
        </div>

        <div style="background:#161b22;border:1px solid #30363d;border-radius:8px;padding:16px 20px;margin-bottom:16px">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
                <span style="font-size:18px">📋</span>
                <h3 style="margin:0;font-size:16px">Каждая облигация подробно</h3>
            </div>
            <p style="font-size:13px;color:#8b949e;margin:0">Сколько вложено, сколько получишь купонов и при погашении</p>
        </div>
        <div class="table-container">
            <table>
                <thead>
                    <tr>
                        <th>Название</th>
                        <th>Шт</th>
                        <th>Цена</th>
                        <th>Вложено</th>
                        <th>Номинал</th>
                        <th>Доходность</th>
                        <th>Купоны итого</th>
                        <th>По номиналу</th>
                        <th>Итого заработаешь</th>
                        <th>В год</th>
                        <th>Срок</th>
                    </tr>
                </thead>
                <tbody>
                    ${bondDetails.map(b => {
                        return `<tr>
                            <td title="${b.name}">${b.name.length > 18 ? b.name.substring(0, 18) + '...' : b.name}</td>
                            <td>${b.qty}</td>
                            <td>${b.price ? b.price.toFixed(2) : '—'}</td>
                            <td>${Math.round(b.invested).toLocaleString()} ₽</td>
                            <td>${Math.round(b.face_value || 1000).toLocaleString()} ₽</td>
                            <td class="positive">${b.yield_percent ? b.yield_percent.toFixed(2) + '%' : '—'}</td>
                            <td style="color:#3fb950">${Math.round(b.totalCoupons).toLocaleString()} ₽</td>
                            <td style="color:${b.capitalGain >= 0 ? '#3fb950' : '#f85149'}">${Math.round(b.capitalGain).toLocaleString()} ₽</td>
                            <td style="color:#58a6ff;font-weight:600">${Math.round(b.totalReturn).toLocaleString()} ₽</td>
                            <td class="positive">${b.annualizedReturn.toFixed(1)}%</td>
                            <td>${b.yearsToMat > 0 ? b.yearsToMat.toFixed(1) + ' лет' : '—'}</td>
                        </tr>`;
                    }).join('')}
                    <tr style="border-top:2px solid #58a6ff;font-weight:600">
                        <td>ИТОГО</td>
                        <td>${bonds.reduce((s, b) => s + (b.quantity || 1), 0)}</td>
                        <td></td>
                        <td>${Math.round(totalInvested).toLocaleString()} ₽</td>
                        <td>${Math.round(totalFaceValue).toLocaleString()} ₽</td>
                        <td class="positive">${totalYield}%</td>
                        <td style="color:#3fb950">${Math.round(totalCouponIncome).toLocaleString()} ₽</td>
                        <td style="color:${totalCapitalGain >= 0 ? '#3fb950' : '#f85149'}">${Math.round(totalCapitalGain).toLocaleString()} ₽</td>
                        <td style="color:#58a6ff">${Math.round(totalReturn).toLocaleString()} ₽</td>
                        <td class="positive">${annualizedYield}%</td>
                        <td>${avgDuration} лет</td>
                    </tr>
                </tbody>
            </table>
        </div>

        <div onclick="toggleSection('portfolioCalendar')" style="background:#161b22;border:1px solid #30363d;border-radius:8px;padding:16px 20px;margin:24px 0 16px;cursor:pointer;user-select:none">
            <div style="display:flex;align-items:center;justify-content:space-between">
                <div style="display:flex;align-items:center;gap:8px">
                    <span id="calSectionArrow" style="color:#8b949e;font-size:12px;transition:transform 0.2s">▶</span>
                    <span style="font-size:18px">📅</span>
                    <h3 style="margin:0;font-size:16px">Когда придут деньги</h3>
                </div>
            </div>
            <p style="font-size:13px;color:#8b949e;margin:8px 0 0 28px">Календарь купонных выплат твоих облигаций на ближайший год</p>
        </div>
        <div id="portfolioCalendar" style="display:none"></div>

        <div style="background:#161b22;border:1px solid #30363d;border-radius:8px;padding:16px 20px;margin:24px 0 16px">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
                <span style="font-size:18px">⚠️</span>
                <h3 style="margin:0;font-size:16px">Риски</h3>
            </div>
            <p style="font-size:13px;color:#8b949e;margin:0">Как распределены твои деньги по надёжности</p>
        </div>
        <div class="table-container">
            <table>
                <thead>
                    <tr>
                        <th>Рейтинг</th>
                        <th>Кол-во</th>
                        <th>Вложено</th>
                        <th>Доля портфеля</th>
                        <th>Средняя доходность</th>
                    </tr>
                </thead>
                <tbody>
                    ${Object.entries(byRating).sort((a,b) => b[1].totalInvested - a[1].totalInvested).map(([k,v]) => {
                        const avg = (v.totalYield / v.count).toFixed(2);
                        const share = (v.totalInvested / totalInvested * 100).toFixed(1);
                        const rc = k.includes('AAA') ? 'rating-aaa' : k.startsWith('A') ? 'rating-a' : k.includes('BBB') ? 'rating-bbb' : 'rating-bb';
                        return `<tr>
                            <td><span class="rating-badge ${rc}">${k}</span></td>
                            <td>${v.count}</td>
                            <td>${Math.round(v.totalInvested).toLocaleString()} ₽</td>
                            <td>
                                <div style="display:flex;align-items:center;gap:8px">
                                    <div style="width:80px;height:8px;background:#21262d;border-radius:4px;overflow:hidden">
                                        <div style="width:${share}%;height:100%;background:${k.includes('AAA') ? '#3fb950' : k.startsWith('A') ? '#58a6ff' : k.includes('BBB') ? '#d29922' : '#db6d28'};border-radius:4px"></div>
                                    </div>
                                    <span>${share}%</span>
                                </div>
                            </td>
                            <td class="positive">${avg}%</td>
                        </tr>`;
                    }).join('')}
                </tbody>
            </table>
        </div>

        <div style="background:#161b22;border:1px solid #30363d;border-radius:8px;padding:16px 20px;margin:24px 0 16px">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
                <span style="font-size:18px">🔄</span>
                <h3 style="margin:0;font-size:16px">Как часто платят купоны</h3>
            </div>
            <p style="font-size:13px;color:#8b949e;margin:0">Распределение по частоте выплат</p>
        </div>
        <div class="table-container">
            <table>
                <thead>
                    <tr>
                        <th>Периодичность</th>
                        <th>Кол-во</th>
                        <th>Средняя доходность</th>
                        <th>Средний купон (₽)</th>
                    </tr>
                </thead>
                <tbody>
                    ${Object.entries(byFreq).map(([k,v]) => {
                        const avg = (v.totalYield / v.count).toFixed(2);
                        const avgCoupon = (v.totalCoupon / v.count).toFixed(2);
                        return `<tr>
                            <td><span class="type-badge">${k}</span></td>
                            <td>${v.count}</td>
                            <td class="positive">${avg}%</td>
                            <td>${avgCoupon} ₽</td>
                        </tr>`;
                    }).join('')}
                </tbody>
            </table>
        </div>

        <div style="background:#161b22;border:1px solid #30363d;border-radius:8px;padding:16px 20px;margin:24px 0 16px">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
                <span style="font-size:18px">📑</span>
                <h3 style="margin:0;font-size:16px">Все облигации</h3>
            </div>
            <p style="font-size:13px;color:#8b949e;margin:0">Полная информация по каждой облигации из портфеля</p>
        </div>
        <div class="table-container">
            <table>
                <thead>
                    <tr>
                        <th>Название</th>
                        <th>ISIN</th>
                        <th>Цена</th>
                        <th>Доходность</th>
                        <th>Купон %</th>
                        <th>Купон (₽)</th>
                        <th>Периодичность</th>
                        <th>Погашение</th>
                        <th>Рейтинг</th>
                        <th>Дней до погашения</th>
                    </tr>
                </thead>
                <tbody>
                    ${bonds.map(b => {
                        const rc = (b.rating||'').includes('AAA') ? 'rating-aaa' : (b.rating||'').startsWith('A') ? 'rating-a' : (b.rating||'').includes('BBB') ? 'rating-bbb' : 'rating-bb';
                        return `<tr>
                            <td>${b.name}</td>
                            <td><span class="isin-code">${b.isin || '—'}</span></td>
                            <td>${b.price ? b.price.toFixed(2) : '—'}</td>
                            <td class="positive">${b.yield_percent ? b.yield_percent.toFixed(2) + '%' : '—'}</td>
                            <td>${b.coupon_percent ? b.coupon_percent.toFixed(2) + '%' : '—'}</td>
                            <td>${b.coupon_value ? b.coupon_value.toFixed(2) : '—'}</td>
                            <td><span class="type-badge">${b.coupon_freq || '—'}</span></td>
                            <td>${b.mat_date || '—'}</td>
                            <td><span class="rating-badge ${rc}">${b.rating || '—'}</span></td>
                            <td>${b.days_to_mat > 0 ? b.days_to_mat : '—'}</td>
                        </tr>`;
                    }).join('')}
                </tbody>
            </table>
        </div>
    `;
}

async function loadPortfolioCalendar() {
    const calendarDiv = document.getElementById('portfolioCalendar');
    if (!calendarDiv) return;

    try {
        const res = await fetch('/api/calendar?months=12');
        const data = await res.json();
        const portfolio = getPortfolio();
        const portfolioSecids = new Set(portfolio.map(p => p.secid));

        const filtered = data.calendar.filter(day =>
            day.coupons.some(c => portfolioSecids.has(c.secid))
        ).map(day => ({
            ...day,
            coupons: day.coupons.filter(c => portfolioSecids.has(c.secid)),
            total: day.coupons.filter(c => portfolioSecids.has(c.secid)).reduce((s, c) => s + c.coupon_value, 0)
        })).filter(day => day.coupons.length > 0);

        if (!filtered.length) {
            calendarDiv.innerHTML = '<div style="color:#8b949e;font-size:13px;padding:12px">Нет купонных выплат в ближайшие 12 месяцев</div>';
            return;
        }

        let totalAll = 0;
        calendarDiv.innerHTML = filtered.map((day, i) => {
            totalAll += day.total;
            const dateStr = new Date(day.date).toLocaleDateString('ru-RU',{day:'numeric',month:'long',year:'numeric'});
            const bondsList = day.coupons.map(c => `<div style="display:flex;justify-content:space-between;font-size:12px;padding:4px 0;color:#8b949e;border-bottom:1px solid #21262d">
                <span>${c.name}</span>
                <span style="color:#3fb950">${c.coupon_value.toFixed(2)} ₽</span>
            </div>`).join('');
            return `<div style="background:#161b22;border:1px solid #30363d;border-radius:8px;margin-bottom:8px;overflow:hidden">
                <div onclick="toggleCalDay(${i})" style="display:flex;justify-content:space-between;align-items:center;padding:12px 16px;cursor:pointer;user-select:none">
                    <div style="display:flex;align-items:center;gap:8px">
                        <span id="calArrow${i}" style="color:#8b949e;font-size:12px;transition:transform 0.2s">▶</span>
                        <span style="color:#58a6ff;font-weight:500">${dateStr}</span>
                        <span style="font-size:11px;color:#8b949e">${day.coupons.length} обл.</span>
                    </div>
                    <span style="color:#3fb950;font-weight:600">+${Math.round(day.total).toLocaleString()} ₽</span>
                </div>
                <div id="calDay${i}" style="display:none;padding:0 16px 12px">
                    ${bondsList}
                </div>
            </div>`;
        }).join('');
    } catch(e) {
        calendarDiv.innerHTML = '<div style="color:#f85149;font-size:13px">Ошибка загрузки календаря</div>';
    }
}

function toggleCalDay(idx) {
    const el = document.getElementById('calDay' + idx);
    const arrow = document.getElementById('calArrow' + idx);
    if (el.style.display === 'none') {
        el.style.display = 'block';
        arrow.style.transform = 'rotate(90deg)';
    } else {
        el.style.display = 'none';
        arrow.style.transform = 'rotate(0deg)';
    }
}

function toggleSection(id) {
    const el = document.getElementById(id);
    const arrow = document.getElementById('calSectionArrow');
    if (el.style.display === 'none') {
        el.style.display = 'block';
        arrow.style.transform = 'rotate(90deg)';
        if (id === 'portfolioCalendar' && !el.dataset.loaded) {
            loadPortfolioCalendar();
            el.dataset.loaded = '1';
        }
    } else {
        el.style.display = 'none';
        arrow.style.transform = 'rotate(0deg)';
    }
}
