import sys
import os
sys.path.insert(0, os.path.dirname(__file__))

import psycopg2
import psycopg2.extras
import urllib.request
import json
import threading
import hashlib
import hmac
import secrets
from datetime import datetime, timedelta
from pathlib import Path
from contextlib import contextmanager

import bcrypt
import jwt
from fastapi import FastAPI, HTTPException, Depends, Header
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from typing import Optional

app = FastAPI(title="BondPulse", version="7.0.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

FRONTEND_DIR = Path(__file__).parent.parent / "frontend"

PG_DSN = os.environ.get("DATABASE_URL", "dbname=bond_screener")
JWT_SECRET = os.environ.get("JWT_SECRET", secrets.token_hex(32))
JWT_ALGORITHM = "HS256"
JWT_EXPIRY_HOURS = 72
ENCRYPT_SALT = os.environ.get("ENCRYPT_SALT", "bond-screener-salt-v1")

BOARDS = ["TQOB", "TQCB", "TQNO", "TQOV", "TQOS", "TQNB"]
MOEX_BASE = "https://iss.moex.com/iss/engines/stock/markets/bonds/boards/{board}/securities.json"

sync_lock = threading.Lock()
last_sync = {"time": None, "count": 0, "boards": {}}


# === ENCRYPTION ===
def _derive_key(password: str) -> bytes:
    return hashlib.pbkdf2_hmac('sha256', password.encode(), ENCRYPT_SALT.encode(), 100000)

def encrypt_data(data: str, password: str) -> str:
    key = _derive_key(password)
    iv = os.urandom(16)
    from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
    cipher = Cipher(algorithms.AES(key), modes.CBC(iv))
    pad_len = 16 - len(data.encode()) % 16
    padded = data.encode() + bytes([pad_len] * pad_len)
    ct = cipher.encryptor().update(padded) + cipher.encryptor().finalize()
    return (iv + ct).hex()

def decrypt_data(hex_data: str, password: str) -> str:
    key = _derive_key(password)
    raw = bytes.fromhex(hex_data)
    iv, ct = raw[:16], raw[16:]
    from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
    cipher = Cipher(algorithms.AES(key), modes.CBC(iv))
    pt = cipher.decryptor().update(ct) + cipher.decryptor().finalize()
    pad_len = pt[-1]
    return pt[:-pad_len].decode()


# === AUTH ===
class UserRegister(BaseModel):
    email: str
    password: str
    name: Optional[str] = ""

class UserLogin(BaseModel):
    email: str
    password: str

def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()

def verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode(), hashed.encode())

def create_token(user_id: int, email: str) -> str:
    payload = {
        "user_id": user_id,
        "email": email,
        "exp": datetime.utcnow() + timedelta(hours=JWT_EXPIRY_HOURS)
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

def get_current_user(authorization: str = Header(None)):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Необходима авторизация")
    token = authorization.split(" ")[1]
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        return {"user_id": payload["user_id"], "email": payload["email"]}
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Токен истёк")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Неверный токен")


@contextmanager
def get_db():
    conn = psycopg2.connect(PG_DSN)
    conn.autocommit = False
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def init_db():
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute("""
            CREATE TABLE IF NOT EXISTS bonds (
                secid TEXT PRIMARY KEY, isin TEXT, name TEXT, short_name TEXT,
                price DOUBLE PRECISION, yield_percent DOUBLE PRECISION, coupon_percent DOUBLE PRECISION, coupon_value DOUBLE PRECISION,
                annual_coupon DOUBLE PRECISION, face_value DOUBLE PRECISION, mat_date TEXT, next_coupon TEXT,
                coupon_period INTEGER, days_to_mat INTEGER, bond_type TEXT, board TEXT,
                emitent TEXT, rating TEXT, coupon_freq TEXT, volume DOUBLE PRECISION, trades INTEGER, synced_at TEXT
            )
        """)
        cur.execute("""
            CREATE TABLE IF NOT EXISTS sync_log (
                id SERIAL PRIMARY KEY,
                synced_at TEXT, bonds_count INTEGER, boards_data TEXT, status TEXT
            )
        """)
        cur.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                email TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                name TEXT DEFAULT '',
                plan TEXT DEFAULT 'free',
                created_at TEXT DEFAULT NOW()::TEXT
            )
        """)
        cur.execute("""
            CREATE TABLE IF NOT EXISTS user_portfolios (
                user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
                portfolio_data TEXT NOT NULL,
                compare_data TEXT DEFAULT '[]',
                updated_at TEXT DEFAULT NOW()::TEXT
            )
        """)
        cur.close()


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
        cur = conn.cursor()
        cur.execute("DELETE FROM bonds")
        args_str = ",".join(
            cur.mogrify(
                "(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)", b
            ).decode() for b in all_bonds
        ) if all_bonds else None
        if args_str:
            cur.execute(f"""
                INSERT INTO bonds
                (secid, isin, name, short_name, price, yield_percent, coupon_percent,
                 coupon_value, annual_coupon, face_value, mat_date, next_coupon,
                 coupon_period, days_to_mat, bond_type, board, emitent, rating, coupon_freq,
                 volume, trades, synced_at)
                VALUES {args_str}
            """)
        cur.execute(
            "INSERT INTO sync_log (synced_at, bonds_count, boards_data, status) VALUES (%s, %s, %s, %s)",
            (now, len(all_bonds), json.dumps(board_counts), "ok")
        )
        cur.close()

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
        cur = conn.cursor()
        cur.execute("SELECT COUNT(*) FROM bonds")
        count = cur.fetchone()[0]
        cur.close()
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


# === AUTH ENDPOINTS ===
@app.post("/api/auth/register")
def register(user: UserRegister):
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute("SELECT id FROM users WHERE email = %s", (user.email,))
        if cur.fetchone():
            cur.close()
            raise HTTPException(status_code=400, detail="Email уже зарегистрирован")
        pw_hash = hash_password(user.password)
        cur.execute(
            "INSERT INTO users (email, password_hash, name) VALUES (%s, %s, %s) RETURNING id",
            (user.email, pw_hash, user.name)
        )
        user_id = cur.fetchone()[0]
        cur.execute(
            "INSERT INTO user_portfolios (user_id, portfolio_data, compare_data) VALUES (%s, '[]', '[]')",
            (user_id,)
        )
        cur.close()
    token = create_token(user_id, user.email)
    return {"token": token, "user": {"id": user_id, "email": user.email, "name": user.name, "plan": "free"}}


@app.post("/api/auth/login")
def login(user: UserLogin):
    with get_db() as conn:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute("SELECT id, email, password_hash, name, plan FROM users WHERE email = %s", (user.email,))
        row = cur.fetchone()
        cur.close()
    if not row or not verify_password(user.password, row["password_hash"]):
        raise HTTPException(status_code=401, detail="Неверный email или пароль")
    token = create_token(row["id"], row["email"])
    return {"token": token, "user": {"id": row["id"], "email": row["email"], "name": row["name"], "plan": row["plan"]}}


@app.get("/api/auth/me")
def get_me(current_user: dict = Depends(get_current_user)):
    with get_db() as conn:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute("SELECT id, email, name, plan FROM users WHERE id = %s", (current_user["user_id"],))
        row = cur.fetchone()
        cur.close()
    if not row:
        raise HTTPException(status_code=404, detail="Пользователь не найден")
    return dict(row)


@app.post("/api/auth/portfolio/save")
def save_user_portfolio(data: dict, current_user: dict = Depends(get_current_user)):
    portfolio_json = json.dumps(data.get("portfolio", []))
    compare_json = json.dumps(data.get("compare", []))
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute("""
            UPDATE user_portfolios
            SET portfolio_data = %s, compare_data = %s, updated_at = NOW()::TEXT
            WHERE user_id = %s
        """, (portfolio_json, compare_json, current_user["user_id"]))
        cur.close()
    return {"status": "ok"}


@app.get("/api/auth/portfolio/load")
def load_user_portfolio(current_user: dict = Depends(get_current_user)):
    with get_db() as conn:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute("SELECT portfolio_data, compare_data FROM user_portfolios WHERE user_id = %s",
                    (current_user["user_id"],))
        row = cur.fetchone()
        cur.close()
    if not row:
        return {"portfolio": [], "compare": []}
    return {
        "portfolio": json.loads(row["portfolio_data"]),
        "compare": json.loads(row["compare_data"])
    }


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


@app.post("/api/ai/analyze")
def ai_analyze(data: dict):
    from ai_engine import analyze_portfolio
    portfolio = data.get("portfolio", [])
    result = analyze_portfolio(portfolio)
    return result


def _build_rating_condition(rating_str: str):
    ratings = [r.strip() for r in rating_str.split(",") if r.strip()]
    if not ratings:
        return None, []
    placeholders = ",".join(["%s"] * len(ratings))
    exact = [f"{r} (RU)" for r in ratings]
    return f"rating IN ({placeholders})", exact


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
        conds.append("yield_percent >= %s"); params.append(min_yield)
    if max_yield is not None:
        conds.append("yield_percent <= %s"); params.append(max_yield)
    if min_price is not None:
        conds.append("price >= %s"); params.append(min_price)
    if max_price is not None:
        conds.append("price <= %s"); params.append(max_price)
    if bond_type:
        conds.append("bond_type LIKE %s"); params.append(f"%{bond_type}%")
    if min_coupon is not None:
        conds.append("coupon_percent >= %s"); params.append(min_coupon)
    if max_mat_days is not None:
        conds.append("days_to_mat > 0 AND days_to_mat <= %s"); params.append(max_mat_days)
    if search:
        conds.append("(name LIKE %s OR isin LIKE %s OR secid LIKE %s OR emitent LIKE %s)")
        s = f"%{search}%"; params.extend([s, s, s, s])
    if board:
        conds.append("board = %s"); params.append(board)
    if coupon_freq:
        conds.append("coupon_freq = %s"); params.append(coupon_freq)
    if rating:
        rc, rp = _build_rating_condition(rating)
        if rc:
            conds.append(rc); params.extend(rp)

    where = " AND ".join(conds) if conds else "TRUE"
    sql = f"SELECT * FROM bonds WHERE {where} ORDER BY {sort_by} {order}"

    with get_db() as conn:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute(sql, params)
        rows = cur.fetchall()
        cur.close()
    bonds = [dict(r) for r in rows]

    return {"bonds": bonds, "total": len(bonds), "updated": last_sync.get("time")}


@app.get("/api/bonds/{secid}")
def get_bond_detail(secid: str):
    with get_db() as conn:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute("SELECT * FROM bonds WHERE secid = %s", (secid,))
        row = cur.fetchone()
        cur.close()
    return dict(row) if row else {"error": "Not found"}


@app.get("/api/calendar")
def get_coupon_calendar(months: int = 6, rating: str = None, board: str = None):
    conds, params = ["next_coupon != ''"], []

    if board:
        conds.append("board = %s"); params.append(board)
    if rating:
        rc, rp = _build_rating_condition(rating)
        if rc:
            conds.append(rc); params.extend(rp)

    where = " AND ".join(conds)
    with get_db() as conn:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute(
            f"SELECT secid, name, coupon_value, coupon_percent, next_coupon, rating, board FROM bonds WHERE {where}",
            params
        )
        rows = cur.fetchall()
        cur.close()

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
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute("""
            SELECT rating, COUNT(*) as count, ROUND(AVG(yield_percent)::numeric, 2) as avg_yield
            FROM bonds WHERE yield_percent > 0 GROUP BY rating ORDER BY avg_yield DESC
        """)
        rows = cur.fetchall()
        cur.close()
    return {"ratings": [dict(r) for r in rows]}


@app.get("/api/boards")
def get_boards():
    with get_db() as conn:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute("""
            SELECT board, COUNT(*) as count, ROUND(AVG(yield_percent)::numeric, 2) as avg_yield
            FROM bonds WHERE yield_percent > 0 GROUP BY board ORDER BY count DESC
        """)
        rows = cur.fetchall()
        cur.close()
    return {"boards": [dict(r) for r in rows]}


@app.get("/api/stats")
def get_stats():
    with get_db() as conn:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute("""
            SELECT COUNT(*) as total, ROUND(AVG(yield_percent)::numeric, 2) as avg_yield,
                   ROUND(MAX(yield_percent)::numeric, 2) as max_yield, ROUND(MIN(yield_percent)::numeric, 2) as min_yield,
                   ROUND(AVG(price)::numeric, 2) as avg_price
            FROM bonds WHERE yield_percent > 0
        """)
        row = cur.fetchone()
        cur.execute("SELECT board, COUNT(*) as count FROM bonds GROUP BY board")
        by_board = cur.fetchall()
        cur.execute("SELECT rating, COUNT(*) as count FROM bonds GROUP BY rating ORDER BY rating")
        by_rating = cur.fetchall()
        cur.close()
    return {
        **dict(row),
        "by_board": {r["board"]: r["count"] for r in by_board},
        "by_rating": {r["rating"]: r["count"] for r in by_rating},
    }


@app.get("/api/history")
def sync_history(limit: int = 20):
    with get_db() as conn:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute("SELECT * FROM sync_log ORDER BY id DESC LIMIT %s", (limit,))
        rows = cur.fetchall()
        cur.close()
    return {"history": [dict(r) for r in rows]}


@app.get("/", response_class=HTMLResponse)
def root():
    return FileResponse(FRONTEND_DIR / "index.html")


app.mount("/css", StaticFiles(directory=str(FRONTEND_DIR / "css")), name="css")
app.mount("/js", StaticFiles(directory=str(FRONTEND_DIR / "js")), name="js")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8080)
