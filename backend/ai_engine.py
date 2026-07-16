from datetime import datetime


def analyze_portfolio(portfolio: list, all_bonds: list = None) -> dict:
    if not portfolio:
        return {"recommendations": [], "score": 0, "summary": "Портфель пуст"}

    recs = []
    total_invested = sum(p.get("price", 0) * (p.get("face_value", 1000) or 1000) / 100 * (p.get("quantity", 1) or 1) for p in portfolio)
    avg_yield = sum(p.get("yield_percent", 0) or 0 for p in portfolio) / len(portfolio)
    avg_days = sum(p.get("days_to_mat", 0) or 0 for p in portfolio) / len(portfolio)
    avg_coupon = sum(p.get("coupon_value", 0) or 0 for p in portfolio) / len(portfolio)

    ratings = {}
    boards = {}
    freqs = {}
    sectors = {}
    for p in portfolio:
        r = p.get("rating", "BB (RU)")
        ratings[r] = ratings.get(r, 0) + 1
        b = p.get("board", "")
        boards[b] = boards.get(b, 0) + 1
        f = p.get("coupon_freq", "Неизвестно")
        freqs[f] = freqs.get(f, 0) + 1
        name = (p.get("name", "") or "").lower()
        if any(x in name for x in ["сбер", "втб", "альфа", "газпромбанк"]):
            sectors["Банки"] = sectors.get("Банки", 0) + 1
        elif any(x in name for x in ["газпром", "лукойл", "роснефть", "татнефть", "новатэк"]):
            sectors["Нефть и газ"] = sectors.get("Нефть и газ", 0) + 1
        elif any(x in name for x in ["офз", "су "]):
            sectors["Государственные"] = sectors.get("Государственные", 0) + 1
        else:
            sectors["Другие"] = sectors.get("Другие", 0) + 1

    # === КОНЦЕНТРАЦИЯ ===
    max_sector = max(sectors.values()) if sectors else 0
    if len(portfolio) > 2 and max_sector / len(portfolio) > 0.6:
        dominant = [k for k, v in sectors.items() if v == max_sector][0]
        recs.append({
            "type": "warning",
            "icon": "⚠️",
            "title": "Высокая концентрация",
            "text": f"{dominant} — {round(max_sector/len(portfolio)*100)}% портфеля. Диверсифицируй по секторам.",
            "action": "Добавь облигации из других секторов"
        })

    # === РЕЙТИНГ ===
    bb_count = sum(1 for r in ratings if "BB" in r and "BBB" not in r)
    if bb_count / len(portfolio) > 0.5:
        recs.append({
            "type": "warning",
            "icon": "⚠️",
            "title": "Много рискованных облигаций",
            "text": f"{bb_count} из {len(portfolio)} — рейтинг BB или ниже. Высокий риск дефолта.",
            "action": "Добавь ОФЗ или облигации с рейтингом A+ и выше"
        })

    aaa_count = sum(1 for r in ratings if "AAA" in r)
    if aaa_count == 0 and len(portfolio) > 0:
        recs.append({
            "type": "info",
            "icon": "💡",
            "title": "Нет гос. облигаций",
            "text": "ОФЗ — безрисковая база портфеля. Сейчас доходность ~12%.",
            "action": "Добавь хотя бы 20% ОФЗ"
        })

    # === СРОК ===
    years = avg_days / 365
    if years > 5:
        recs.append({
            "type": "warning",
            "icon": "⏰",
            "title": "Длинный портфель",
            "text": f"Средний срок {years:.1f} лет. При росте ставок ЦБ облигации подешевеют.",
            "action": "Сократи срок до 1-2 лет или добавь короткие облигации"
        })
    elif years < 0.3:
        recs.append({
            "type": "info",
            "icon": "💡",
            "title": "Короткий портфель",
            "text": f"Средний срок {years*12:.0f} мес. Мало времени для реинвестирования купонов.",
            "action": "Рассмотри облигации на 1-2 года"
        })

    # === ДОХОДНОСТЬ ===
    if avg_yield < 8:
        recs.append({
            "type": "info",
            "icon": "📉",
            "title": "Низкая доходность",
            "text": f"Средняя доходность {avg_yield:.1f}% — ниже инфляции (~7.5%).",
            "action": "Ищи облигации с доходностью выше 10%"
        })
    elif avg_yield > 25:
        recs.append({
            "type": "warning",
            "icon": "⚠️",
            "title": "Подозрительно высокая доходность",
            "text": f"Средняя {avg_yield:.1f}% — рынок боится дефолта этих облигаций.",
            "action": "Проверь рейтинги и новости эмитентов"
        })

    # === КУПОНЫ ===
    if freqs.get("Ежегодно", 0) / len(portfolio) > 0.7:
        recs.append({
            "type": "info",
            "icon": "📅",
            "title": "Редкие купоны",
            "text": "Большинство облигаций платят раз в год. Деньги простаивают.",
            "action": "Добавь ежемесячные или ежеквартальные облигации"
        })

    # === НАЛОГИ ===
    high_yield_bonds = [p for p in portfolio if (p.get("yield_percent", 0) or 0) > 18]
    if high_yield_bonds:
        total_tax = sum(p.get("coupon_value", 0) * 0.13 * (p.get("quantity", 1) or 1) for p in high_yield_bonds)
        recs.append({
            "type": "info",
            "icon": "💰",
            "title": "Налоговый вычет",
            "text": f"Потенциал налогового вычета: ~{round(total_tax)} ₽/год через ИИС.",
            "action": "Открой ИИС типа Б — освобождение от НДФЛ на 3 года"
        })

    # === ПРОСРОЧЕННЫЕ ===
    overdue = [p for p in portfolio if (p.get("days_to_mat", 0) or 0) < 30 and (p.get("days_to_mat", 0) or 0) > 0]
    if overdue:
        recs.append({
            "type": "warning",
            "icon": "🔴",
            "title": "Скоро погашение",
            "text": f"{len(overdue)} облигаций погашаются в ближайшие 30 дней.",
            "action": "Найди замену заранее"
        })

    # === SCORE ===
    score = 100
    for r in recs:
        if r["type"] == "warning":
            score -= 15
    score = max(0, min(100, score))

    # === SUMMARY ===
    if score >= 80:
        summary = "Портфель сбалансирован"
    elif score >= 60:
        summary = "Есть замечания — но критичных проблем нет"
    elif score >= 40:
        summary = "Нужна оптимизация"
    else:
        summary = "Высокий риск — стоит пересмотреть состав"

    return {
        "recommendations": recs,
        "score": score,
        "summary": summary,
        "disclaimer": "Данная информация носит исключительно информационный характер и не является индивидуальной инвестиционной рекомендацией. Принятие инвестиционных решений осуществляется пользователем самостоятельно.",
        "stats": {
            "avg_yield": round(avg_yield, 2),
            "avg_duration_years": round(years, 1),
            "avg_coupon": round(avg_coupon, 2),
            "total_invested": round(total_invested),
            "bonds_count": len(portfolio),
            "by_rating": ratings,
            "by_sector": sectors,
            "by_freq": freqs,
        }
    }
