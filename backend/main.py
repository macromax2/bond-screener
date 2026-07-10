import sqlite3
import urllib.request
import json
import threading
from datetime import datetime, timedelta
from pathlib import Path
from contextlib import contextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, FileResponse

app = FastAPI(title="Bond Screener", version="4.0.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

FRONTEND_DIR = Path(__file__).parent.parent / "frontend"
DB_PATH = Path(__file__).parent / "bonds.db"

import os
if os.environ.get("RENDER"):
    DB_PATH = Path("/tmp/bonds.db")
    FRONTEND_DIR = Path(__file__).parent.parent / "frontend"

BOARDS = ["TQOB", "TQCB", "TQNO", "TQOV", "TQOS", "TQNB"]
MOEX_BASE = "https://iss.moex.com/iss/engines/stock/markets/bonds/boards/{board}/securities.json"

sync_lock = threading.Lock()
last_sync = {"time": None, "count": 0, "boards": {}}


@contextmanager
def get_db():
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    try:
        yield conn
    finally:
        conn.close()


def init_db():
    with get_db() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS bonds (
                secid TEXT PRIMARY KEY, isin TEXT, name TEXT, short_name TEXT,
                price REAL, yield_percent REAL, coupon_percent REAL, coupon_value REAL,
                annual_coupon REAL, face_value REAL, mat_date TEXT, next_coupon TEXT,
                coupon_period INTEGER, days_to_mat INTEGER, bond_type TEXT, board TEXT,
                emitent TEXT, rating TEXT, coupon_freq TEXT, volume REAL, trades INTEGER, synced_at TEXT
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS sync_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                synced_at TEXT, bonds_count INTEGER, boards_data TEXT, status TEXT
            )
        """)
        conn.commit()


def fetch_board(board: str) -> dict:
    url = MOEX_BASE.format(board=board)
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read())


def detect_rating(name: str, secid: str, bond_type: str) -> str:
    name_lower = (name or "").lower()
    if "офз" in name_lower or secid.startswith("SU"):
        return "AAA (RU)"
    if any(x in name_lower for x in ["сбер", "газпром", "лукойл"]):
        return "A+ (RU)"
    if any(x in name_lower for x in ["втб", "роснефть"]):
        return "A (RU)"
    if any(x in name_lower for x in ["газпром нефть", "татнефть"]):
        return "A- (RU)"
    if "флоатер" in name_lower or (bond_type and "флоатер" in bond_type.lower()):
        return "BBB (RU)"
    if "амортиз" in (bond_type or "").lower():
        return "BBB (RU)"
    return "BB (RU)"


def parse_board(raw: dict, board: str) -> list:
    securities = raw.get("securities", {}).get("data", [])
    marketdata = raw.get("marketdata", {}).get("data", [])
    sec_cols = raw.get("securities", {}).get("columns", [])
    mkt_cols = raw.get("marketdata", {}).get("columns", [])

    mkt_map = {}
    for row in marketdata:
        sid = row[mkt_cols.index("SECID")]
        mkt_map[sid] = {col: row[i] for i, col in enumerate(mkt_cols)}

    bonds = []
    for row in securities:
        d = {col: row[i] for i, col in enumerate(sec_cols)}
        m = mkt_map.get(d["SECID"], {})

        price = m.get("LAST") or d.get("PREVPRICE")
        coupon_value = d.get("COUPONVALUE", 0) or 0
        face_value = d.get("FACEVALUE", 1000) or 1000
        coupon_percent = d.get("COUPONPERCENT", 0) or 0
        yield_val = m.get("YIELDATWAPRICE") or m.get("YIELD") or d.get("YIELDATPREVWAPRICE") or 0
        mat_date = d.get("MATDATE", "")
        next_coupon = d.get("NEXTCOUPON", "")
        coupon_period = d.get("COUPONPERIOD", 0) or 0
        isin = d.get("ISIN", "")
        short_name = d.get("SHORTNAME", d.get("SECNAME", ""))
        secid = d.get("SECID", "")
        bond_type = d.get("BONDTYPE", "")
        emitent = d.get("SECNAME", "")

        coupon_value_rub = coupon_value if coupon_value and face_value else 0
        annual_coupon = (coupon_value_rub * 365 / coupon_period) if coupon_period > 0 else 0

        if coupon_period <= 31:
            coupon_freq = "Ежемесячно"
        elif coupon_period <= 95:
            coupon_freq = "Ежеквартально"
        elif coupon_period <= 190:
            coupon_freq = "Раз в полгода"
        else:
            coupon_freq = "Ежегодно"

        days_to_mat = 0
        if mat_date:
            try:
                md = datetime.strptime(mat_date, "%Y-%m-%d")
                days_to_mat = (md - datetime.now()).days
            except:
                pass

        rating = detect_rating(short_name, secid, bond_type)

        bonds.append((
            secid, isin, short_name, short_name, price, yield_val, coupon_percent,
            coupon_value_rub, round(annual_coupon, 2), face_value, mat_date,
            next_coupon, coupon_period, days_to_mat, bond_type, board,
            emitent, rating, coupon_freq, m.get("VALTODAY", 0) or 0, m.get("NUMTRADES", 0) or 0,
            datetime.now().isoformat()
        ))
    return bonds


def sync_all():
    all_bonds = []
    board_counts = {}
    for board in BOARDS:
        try:
            raw = fetch_board(board)
            bonds = parse_board(raw, board)
            all_bonds.extend(bonds)
            board_counts[board] = len(bonds)
            print(f"  [SYNC] {board}: {len(bonds)} bonds")
        except Exception as e:
            print(f"  [SYNC ERROR] {board}: {e}")
            board_counts[board] = 0

    now = datetime.now().isoformat()
    with get_db() as conn:
        conn.execute("DELETE FROM bonds")
        conn.executemany("""
            INSERT INTO bonds
            (secid, isin, name, short_name, price, yield_percent, coupon_percent,
             coupon_value, annual_coupon, face_value, mat_date, next_coupon,
             coupon_period, days_to_mat, bond_type, board, emitent, rating, coupon_freq,
             volume, trades, synced_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, all_bonds)
        conn.execute("INSERT INTO sync_log (synced_at, bonds_count, boards_data, status) VALUES (?, ?, ?, ?)",
                     (now, len(all_bonds), json.dumps(board_counts), "ok"))
        conn.commit()

    last_sync["time"] = now
    last_sync["count"] = len(all_bonds)
    last_sync["boards"] = board_counts
    return len(all_bonds), board_counts


def sync_background():
    try:
        print("[SYNC] Starting full sync from MOEX...")
        count, boards = sync_all()
        print(f"[SYNC] Done: {count} bonds total")
    except Exception as e:
        print(f"[SYNC ERROR] {e}")


@app.on_event("startup")
def startup():
    init_db()
    with get_db() as conn:
        count = conn.execute("SELECT COUNT(*) FROM bonds").fetchone()[0]
    if count == 0:
        print("[STARTUP] Empty DB, syncing from MOEX...")
        sync_background()
    else:
        print(f"[STARTUP] DB has {count} bonds")
    threading.Thread(target=auto_sync, daemon=True).start()


def auto_sync():
    while True:
        import time
        time.sleep(3600)
        sync_background()


@app.post("/api/sync")
def manual_sync():
    if not sync_lock.acquire(blocking=False):
        return {"status": "already_syncing"}
    try:
        count, boards = sync_all()
        return {"status": "ok", "count": count, "boards": boards, "time": datetime.now().isoformat()}
    finally:
        sync_lock.release()


@app.get("/api/sync/status")
def sync_status():
    return last_sync


def _build_rating_condition(rating_str: str):
    ratings = [r.strip() for r in rating_str.split(",") if r.strip()]
    if not ratings:
        return None, []
    likes = ["rating = ?" for _ in ratings]
    exact = [f"{r} (RU)" for r in ratings]
    return f"({' OR '.join(likes)})", exact


@app.get("/api/bonds")
def get_bonds(
    min_yield: float = None, max_yield: float = None,
    min_price: float = None, max_price: float = None,
    bond_type: str = None, min_coupon: float = None,
    max_mat_days: int = None, search: str = None,
    board: str = None, rating: str = None, coupon_freq: str = None,
    sort_by: str = "yield_percent", sort_dir: str = "desc",
):
    allowed = {"name", "price", "yield_percent", "coupon_percent", "coupon_value",
               "annual_coupon", "mat_date", "days_to_mat", "bond_type", "volume", "rating", "board", "coupon_freq"}
    if sort_by not in allowed:
        sort_by = "yield_percent"
    order = "DESC" if sort_dir == "desc" else "ASC"

    conds, params = [], []

    if min_yield is not None:
        conds.append("yield_percent >= ?"); params.append(min_yield)
    if max_yield is not None:
        conds.append("yield_percent <= ?"); params.append(max_yield)
    if min_price is not None:
        conds.append("price >= ?"); params.append(min_price)
    if max_price is not None:
        conds.append("price <= ?"); params.append(max_price)
    if bond_type:
        conds.append("bond_type LIKE ?"); params.append(f"%{bond_type}%")
    if min_coupon is not None:
        conds.append("coupon_percent >= ?"); params.append(min_coupon)
    if max_mat_days is not None:
        conds.append("days_to_mat > 0 AND days_to_mat <= ?"); params.append(max_mat_days)
    if search:
        conds.append("(name LIKE ? OR isin LIKE ? OR secid LIKE ? OR emitent LIKE ?)")
        s = f"%{search}%"; params.extend([s, s, s, s])
    if board:
        conds.append("board = ?"); params.append(board)
    if coupon_freq:
        conds.append("coupon_freq = ?"); params.append(coupon_freq)
    if rating:
        rc, rp = _build_rating_condition(rating)
        if rc:
            conds.append(rc); params.extend(rp)

    where = " AND ".join(conds) if conds else "1=1"
    sql = f"SELECT * FROM bonds WHERE {where} ORDER BY {sort_by} {order}"

    with get_db() as conn:
        rows = conn.execute(sql, params).fetchall()
    bonds = [dict(r) for r in rows]

    return {"bonds": bonds, "total": len(bonds), "updated": last_sync.get("time")}


@app.get("/api/bonds/{secid}")
def get_bond_detail(secid: str):
    with get_db() as conn:
        row = conn.execute("SELECT * FROM bonds WHERE secid = ?", (secid,)).fetchone()
    return dict(row) if row else {"error": "Not found"}


@app.get("/api/calendar")
def get_coupon_calendar(months: int = 6, rating: str = None, board: str = None):
    conds, params = ["next_coupon != ''"], []

    if board:
        conds.append("board = ?"); params.append(board)
    if rating:
        rc, rp = _build_rating_condition(rating)
        if rc:
            conds.append(rc); params.extend(rp)

    where = " AND ".join(conds)
    with get_db() as conn:
        rows = conn.execute(
            f"SELECT secid, name, coupon_value, coupon_percent, next_coupon, rating, board FROM bonds WHERE {where}",
            params
        ).fetchall()

    calendar = {}
    today = datetime.now()

    for r in rows:
        try:
            nc = datetime.strptime(r["next_coupon"], "%Y-%m-%d")
        except:
            continue
        for m in range(months):
            try:
                if nc.month + m <= 12:
                    coupon_date = nc.replace(month=nc.month + m)
                else:
                    coupon_date = nc.replace(
                        month=((nc.month + m - 1) % 12) + 1,
                        year=nc.year + (nc.month + m - 1) // 12
                    )
            except:
                continue
            if today <= coupon_date <= today + timedelta(days=30 * months):
                key = coupon_date.strftime("%Y-%m-%d")
                if key not in calendar:
                    calendar[key] = []
                calendar[key].append({
                    "secid": r["secid"], "name": r["name"],
                    "coupon_value": r["coupon_value"],
                    "coupon_percent": r["coupon_percent"],
                })

    sorted_cal = [
        {"date": k, "coupons": v, "total": sum(c["coupon_value"] for c in v)}
        for k, v in sorted(calendar.items())
    ]
    return {"calendar": sorted_cal, "months": months}


@app.get("/api/ratings")
def get_ratings():
    with get_db() as conn:
        rows = conn.execute("""
            SELECT rating, COUNT(*) as count, ROUND(AVG(yield_percent), 2) as avg_yield
            FROM bonds WHERE yield_percent > 0 GROUP BY rating ORDER BY avg_yield DESC
        """).fetchall()
    return {"ratings": [dict(r) for r in rows]}


@app.get("/api/boards")
def get_boards():
    with get_db() as conn:
        rows = conn.execute("""
            SELECT board, COUNT(*) as count, ROUND(AVG(yield_percent), 2) as avg_yield
            FROM bonds WHERE yield_percent > 0 GROUP BY board ORDER BY count DESC
        """).fetchall()
    return {"boards": [dict(r) for r in rows]}


@app.get("/api/stats")
def get_stats():
    with get_db() as conn:
        row = conn.execute("""
            SELECT COUNT(*) as total, ROUND(AVG(yield_percent), 2) as avg_yield,
                   ROUND(MAX(yield_percent), 2) as max_yield, ROUND(MIN(yield_percent), 2) as min_yield,
                   ROUND(AVG(price), 2) as avg_price
            FROM bonds WHERE yield_percent > 0
        """).fetchone()
        by_board = conn.execute("SELECT board, COUNT(*) as count FROM bonds GROUP BY board").fetchall()
        by_rating = conn.execute("SELECT rating, COUNT(*) as count FROM bonds GROUP BY rating ORDER BY rating").fetchall()
    return {
        **dict(row),
        "by_board": {r["board"]: r["count"] for r in by_board},
        "by_rating": {r["rating"]: r["count"] for r in by_rating},
    }


@app.get("/api/history")
def sync_history(limit: int = 20):
    with get_db() as conn:
        rows = conn.execute("SELECT * FROM sync_log ORDER BY id DESC LIMIT ?", (limit,)).fetchall()
    return {"history": [dict(r) for r in rows]}


@app.get("/", response_class=HTMLResponse)
def root():
    return FileResponse(FRONTEND_DIR / "index.html")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8080)
