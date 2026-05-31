"""
Mutual Fund Analyser — uses the free MFAPI.in API to fetch NAV history
and score funds on rolling returns, volatility and category peer ranking.
"""
import os
import json
import logging
import requests
import math
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Tuple

logger = logging.getLogger(__name__)

CACHE_DIR = os.path.join(os.path.dirname(__file__), ".cache")
os.makedirs(CACHE_DIR, exist_ok=True)

MF_SCHEMES_CACHE = os.path.join(CACHE_DIR, "mf_schemes.json")
MFAPI_BASE = "https://api.mfapi.in/mf"
HEADERS = {"User-Agent": "Mozilla/5.0"}

# --------------------------------------------------------------------------
# Category detection from scheme name keywords
# --------------------------------------------------------------------------
CATEGORY_MAP = [
    ("liquid",          "Liquid"),
    ("overnight",       "Overnight"),
    ("money market",    "Money Market"),
    ("ultra short",     "Ultra Short Duration"),
    ("low duration",    "Low Duration"),
    ("short duration",  "Short Duration"),
    ("medium duration", "Medium Duration"),
    ("long duration",   "Long Duration"),
    ("dynamic bond",    "Dynamic Bond"),
    ("corporate bond",  "Corporate Bond"),
    ("credit risk",     "Credit Risk"),
    ("gilt",            "Gilt"),
    ("floater",         "Floater"),
    ("banking and psu", "Banking & PSU Debt"),
    ("banking & psu",   "Banking & PSU Debt"),
    ("arbitrage",       "Arbitrage"),
    ("equity savings",  "Equity Savings"),
    ("balanced advantage","Balanced Advantage"),
    ("aggressive hybrid","Aggressive Hybrid"),
    ("conservative hybrid","Conservative Hybrid"),
    ("multi asset",     "Multi Asset"),
    ("index fund",      "Index Fund"),
    ("nifty",           "Index Fund"),
    ("sensex",          "Index Fund"),
    ("etf",             "ETF"),
    ("small cap",       "Small Cap"),
    ("mid cap",         "Mid Cap"),
    ("large and mid",   "Large & Mid Cap"),
    ("large & mid",     "Large & Mid Cap"),
    ("multi cap",       "Multi Cap"),
    ("flexi cap",       "Flexi Cap"),
    ("value fund",      "Value"),
    ("contra",          "Contra"),
    ("focussed",        "Focused"),
    ("focused",         "Focused"),
    ("thematic",        "Thematic"),
    ("sectoral",        "Sectoral"),
    ("pharma",          "Sectoral - Pharma"),
    ("technology",      "Sectoral - Technology"),
    ("infrastructure",  "Sectoral - Infrastructure"),
    ("banking",         "Sectoral - Banking"),
    ("fmcg",            "Sectoral - FMCG"),
    ("large cap",       "Large Cap"),
    ("elss",            "ELSS (Tax Saving)"),
    ("tax sav",         "ELSS (Tax Saving)"),
]

def categorize_fund(name: str) -> str:
    lower = name.lower()
    for keyword, category in CATEGORY_MAP:
        if keyword in lower:
            return category
    return "Other"

# --------------------------------------------------------------------------
# Scheme list — download once, cache for 7 days
# --------------------------------------------------------------------------
def load_scheme_list() -> List[Dict]:
    if os.path.exists(MF_SCHEMES_CACHE):
        age = datetime.now() - datetime.fromtimestamp(os.path.getmtime(MF_SCHEMES_CACHE))
        if age < timedelta(days=7):
            with open(MF_SCHEMES_CACHE, "r", encoding="utf-8") as f:
                return json.load(f)

    logger.info("Downloading MFAPI scheme list...")
    try:
        resp = requests.get(f"{MFAPI_BASE}", headers=HEADERS, timeout=20)
        resp.raise_for_status()
        schemes = resp.json()
        with open(MF_SCHEMES_CACHE, "w", encoding="utf-8") as f:
            json.dump(schemes, f)
        logger.info(f"Cached {len(schemes)} MF schemes")
        return schemes
    except Exception as e:
        logger.error(f"Failed to download MF scheme list: {e}")
        return []

# In-memory scheme list (loaded once on import)
_schemes: List[Dict] = []

def get_schemes() -> List[Dict]:
    global _schemes
    if not _schemes:
        _schemes = load_scheme_list()
    return _schemes

def search_schemes(query: str, limit: int = 15) -> List[Dict]:
    """Fuzzy substring search over schemeName and schemeCode."""
    q = query.strip().upper()
    if len(q) < 2:
        return []
    results = []
    for s in get_schemes():
        name = str(s.get("schemeName", "")).upper()
        code = str(s.get("schemeCode", ""))
        if q in name or q == code:
            results.append({
                "scheme_code": s.get("schemeCode"),
                "scheme_name": s.get("schemeName", ""),
                "category": categorize_fund(s.get("schemeName", ""))
            })
            if len(results) >= limit:
                break
    return results

def fuzzy_match_fund(name: str) -> Optional[Dict]:
    """Best-effort match of an uploaded fund name to a scheme entry."""
    query = name.strip().upper()
    best: Optional[Dict] = None
    best_score = 0
    for s in get_schemes():
        candidate = str(s.get("schemeName", "")).upper()
        # Score = number of query words found in candidate
        words = [w for w in query.split() if len(w) > 2]
        score = sum(1 for w in words if w in candidate)
        if score > best_score:
            best_score = score
            best = s
    if best and best_score >= 2:
        return {
            "scheme_code": best.get("schemeCode"),
            "scheme_name": best.get("schemeName", ""),
            "category": categorize_fund(best.get("schemeName", ""))
        }
    return None

# --------------------------------------------------------------------------
# NAV history and scoring
# --------------------------------------------------------------------------
def fetch_nav_history(scheme_code: int) -> List[Dict]:
    """Fetch NAV history from MFAPI. Returns list of {date, nav} dicts."""
    try:
        url = f"{MFAPI_BASE}/{scheme_code}"
        resp = requests.get(url, headers=HEADERS, timeout=15)
        resp.raise_for_status()
        data = resp.json()
        return data.get("data", [])  # [{date, nav}, ...]
    except Exception as e:
        logger.error(f"Failed to fetch NAV for {scheme_code}: {e}")
        return []

def _parse_nav(entry: Dict) -> Optional[Tuple[datetime, float]]:
    try:
        d = datetime.strptime(entry["date"], "%d-%m-%Y")
        v = float(entry["nav"])
        return d, v
    except Exception:
        return None

def _compute_return(nav_sorted: List[Tuple[datetime, float]], days: int) -> Optional[float]:
    """Compute return over last `days` calendar days."""
    if not nav_sorted:
        return None
    latest_date, latest_nav = nav_sorted[0]
    cutoff = latest_date - timedelta(days=days)
    older = [(d, n) for d, n in nav_sorted if d <= cutoff]
    if not older:
        return None
    _, older_nav = max(older, key=lambda x: x[0])
    if older_nav == 0:
        return None
    return round(((latest_nav - older_nav) / older_nav) * 100, 2)

def score_fund(scheme_code: int, scheme_name: str) -> Dict:
    """
    Fetch NAV history and compute momentum score + Buy/Hold/Sell signal.
    Returns a result dict ready for the frontend.
    """
    nav_raw = fetch_nav_history(scheme_code)
    if not nav_raw:
        return {
            "scheme_code": scheme_code,
            "scheme_name": scheme_name,
            "category": categorize_fund(scheme_name),
            "error": "Could not fetch NAV data"
        }

    # Parse and sort descending (newest first)
    parsed = [_parse_nav(e) for e in nav_raw]
    parsed = [p for p in parsed if p is not None]
    parsed.sort(key=lambda x: x[0], reverse=True)

    ret_1m  = _compute_return(parsed, 30)
    ret_3m  = _compute_return(parsed, 90)
    ret_6m  = _compute_return(parsed, 182)
    ret_1y  = _compute_return(parsed, 365)

    # Volatility: std dev of daily % changes over last 90 days
    recent = parsed[:90]
    daily_changes = []
    for i in range(len(recent) - 1):
        if recent[i+1][1] != 0:
            chg = (recent[i][1] - recent[i+1][1]) / recent[i+1][1] * 100
            daily_changes.append(chg)
    volatility = None
    if len(daily_changes) >= 10:
        mean = sum(daily_changes) / len(daily_changes)
        variance = sum((x - mean) ** 2 for x in daily_changes) / len(daily_changes)
        volatility = round(math.sqrt(variance), 3)

    # Momentum Score (0-100)
    # Weighted: 1Y=40%, 6M=25%, 3M=20%, 1M=15%
    score = 50.0
    weights = 0
    if ret_1y is not None:
        score += ret_1y * 0.40
        weights += 0.40
    if ret_6m is not None:
        score += ret_6m * 0.25
        weights += 0.25
    if ret_3m is not None:
        score += ret_3m * 0.20
        weights += 0.20
    if ret_1m is not None:
        score += ret_1m * 0.15
        weights += 0.15

    # Penalise high volatility
    if volatility and volatility > 2.0:
        score -= (volatility - 2.0) * 5

    score = max(0, min(100, round(score, 1)))

    if score >= 68:
        signal = "BUY"
    elif score >= 42:
        signal = "HOLD"
    else:
        signal = "SELL"

    latest_nav = parsed[0][1] if parsed else None

    return {
        "scheme_code": scheme_code,
        "scheme_name": scheme_name,
        "category": categorize_fund(scheme_name),
        "latest_nav": round(latest_nav, 4) if latest_nav else None,
        "return_1m": ret_1m,
        "return_3m": ret_3m,
        "return_6m": ret_6m,
        "return_1y": ret_1y,
        "volatility": volatility,
        "score": score,
        "signal": signal,
    }

# Pre-warm scheme list on import (non-blocking — if file already cached it's instant)
try:
    get_schemes()
except Exception:
    pass
