async function renderAI() {
    const content = document.getElementById('aiContent');
    const portfolio = getPortfolio();

    if (!portfolio.length) {
        content.innerHTML = `<div class="portfolio-empty">
            <h3>Нет облигаций для анализа</h3>
            <p>Добавь облигации из таблицы кнопкой "+", чтобы AI проанализировал твой портфель</p>
        </div>`;
        return;
    }

    content.innerHTML = `<div class="loading">🤖 Анализирую портфель...</div>`;

    try {
        const res = await fetch('/api/ai/analyze', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ portfolio })
        });
        const data = await res.json();
        renderAIResults(data);
    } catch (e) {
        content.innerHTML = `<div style="color:#f85149">Ошибка анализа: ${e.message}</div>`;
    }
}

function renderAIResults(data) {
    const content = document.getElementById('aiContent');
    const { recommendations, score, summary, stats } = data;

    const scoreColor = score >= 80 ? '#3fb950' : score >= 60 ? '#d29922' : score >= 40 ? '#db6d28' : '#f85149';
    const scoreLabel = score >= 80 ? 'Отлично' : score >= 60 ? 'Хорошо' : score >= 40 ? 'Есть замечания' : 'Нужна оптимизация';

    content.innerHTML = `
        <div style="display:grid;grid-template-columns:1fr 2fr;gap:20px;margin-bottom:24px">
            <div style="background:#161b22;border:1px solid #30363d;border-radius:12px;padding:24px;text-align:center">
                <div style="font-size:14px;color:#8b949e;margin-bottom:8px">Оценка портфеля</div>
                <div style="font-size:48px;font-weight:700;color:${scoreColor}">${score}</div>
                <div style="font-size:13px;color:${scoreColor};margin-top:4px">${scoreLabel}</div>
                <div style="font-size:12px;color:#8b949e;margin-top:8px">${summary}</div>
            </div>
            <div style="background:#161b22;border:1px solid #30363d;border-radius:12px;padding:20px">
                <div style="font-size:14px;color:#8b949e;margin-bottom:12px">Характеристики портфеля</div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
                    <div>
                        <div style="font-size:11px;color:#8b949e">Облигаций</div>
                        <div style="font-size:18px;font-weight:600;color:#58a6ff">${stats.bonds_count}</div>
                    </div>
                    <div>
                        <div style="font-size:11px;color:#8b949e">Средняя доходность</div>
                        <div style="font-size:18px;font-weight:600;color:#3fb950">${stats.avg_yield}%</div>
                    </div>
                    <div>
                        <div style="font-size:11px;color:#8b949e">Средний срок</div>
                        <div style="font-size:18px;font-weight:600;color:#58a6ff">${stats.avg_duration_years} лет</div>
                    </div>
                    <div>
                        <div style="font-size:11px;color:#8b949e">Средний купон</div>
                        <div style="font-size:18px;font-weight:600;color:#58a6ff">${stats.avg_coupon} ₽</div>
                    </div>
                    <div>
                        <div style="font-size:11px;color:#8b949e">Вложено</div>
                        <div style="font-size:18px;font-weight:600;color:#58a6ff">${stats.total_invested.toLocaleString()} ₽</div>
                    </div>
                </div>
            </div>
        </div>

        <div style="background:#2a1a1a;border:1px solid #5a2020;border-radius:8px;padding:12px 16px;margin-bottom:20px;font-size:12px;color:#f85149">
            ⚠️ Данная информация не является индивидуальной инвестиционной рекомендацией. Все решения об инвестициях вы принимаете самостоятельно на свой страх и риск.
        </div>

        <div style="margin-bottom:24px">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px">
                <span style="font-size:18px">📊</span>
                <h3 style="margin:0;font-size:16px">Распределение</h3>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px">
                <div style="background:#161b22;border:1px solid #30363d;border-radius:8px;padding:16px">
                    <div style="font-size:12px;color:#8b949e;margin-bottom:8px">По рейтингам</div>
                    ${Object.entries(stats.by_rating).map(([k,v]) => {
                        const pct = (v / stats.bonds_count * 100).toFixed(0);
                        const rc = k.includes('AAA') ? '#3fb950' : k.startsWith('A') ? '#58a6ff' : k.includes('BBB') ? '#d29922' : '#db6d28';
                        return `<div style="display:flex;justify-content:space-between;font-size:12px;padding:2px 0">
                            <span style="color:${rc}">${k}</span>
                            <span>${v} (${pct}%)</span>
                        </div>`;
                    }).join('')}
                </div>
                <div style="background:#161b22;border:1px solid #30363d;border-radius:8px;padding:16px">
                    <div style="font-size:12px;color:#8b949e;margin-bottom:8px">По секторам</div>
                    ${Object.entries(stats.by_sector).map(([k,v]) => {
                        const pct = (v / stats.bonds_count * 100).toFixed(0);
                        return `<div style="display:flex;justify-content:space-between;font-size:12px;padding:2px 0">
                            <span>${k}</span>
                            <span>${v} (${pct}%)</span>
                        </div>`;
                    }).join('')}
                </div>
                <div style="background:#161b22;border:1px solid #30363d;border-radius:8px;padding:16px">
                    <div style="font-size:12px;color:#8b949e;margin-bottom:8px">По периодичности</div>
                    ${Object.entries(stats.by_freq).map(([k,v]) => {
                        const pct = (v / stats.bonds_count * 100).toFixed(0);
                        return `<div style="display:flex;justify-content:space-between;font-size:12px;padding:2px 0">
                            <span>${k}</span>
                            <span>${v} (${pct}%)</span>
                        </div>`;
                    }).join('')}
                </div>
            </div>
        </div>

        <div>
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px">
                <span style="font-size:18px">💡</span>
                <h3 style="margin:0;font-size:16px">Аналитика портфеля</h3>
                <span style="font-size:12px;color:#8b949e">(${recommendations.length})</span>
            </div>
            ${recommendations.length === 0 ? `
                <div style="background:#161b22;border:1px solid #30363d;border-radius:8px;padding:20px;text-align:center">
                    <div style="font-size:32px;margin-bottom:8px">✅</div>
                    <div style="color:#3fb950;font-weight:600">Критичных замечаний нет</div>
                    <div style="color:#8b949e;font-size:13px;margin-top:4px">Портфель выглядит сбалансированным</div>
                </div>
            ` : recommendations.map(r => {
                const bg = r.type === 'warning' ? '#2a1a1a' : '#1a2a3a';
                const border = r.type === 'warning' ? '#5a2020' : '#1a3a5a';
                return `<div style="background:${bg};border:1px solid ${border};border-radius:8px;padding:16px;margin-bottom:12px">
                    <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
                        <span style="font-size:18px">${r.icon}</span>
                        <span style="font-weight:600;font-size:14px">${r.title}</span>
                    </div>
                    <div style="font-size:13px;color:#b0b8c4;margin-bottom:8px">${r.text}</div>
                    <div style="font-size:12px;color:#58a6ff">→ ${r.action}</div>
                </div>`;
            }).join('')}
        </div>
    `;
}
