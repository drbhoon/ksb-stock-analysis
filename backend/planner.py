"""
Smart Investment Planner — analyses a curated universe of quality NSE stocks
and recommends a diversified portfolio based on a user's risk profile.
"""
import logging
import concurrent.futures
from typing import Dict, List, Any

logger = logging.getLogger(__name__)

# --------------------------------------------------------------------------
# Curated quality NSE universe (~150 stocks), grouped by profile suitability
# Format: {"SYMBOL.NS": {"name": "...", "sector": "...", "cap": "large|mid|small"}}
# --------------------------------------------------------------------------
CURATED_UNIVERSE: Dict[str, Dict] = {
    # === LARGE CAP — Banking & Finance ===
    "HDFCBANK.NS":  {"name": "HDFC Bank",              "sector": "Banking",       "cap": "large"},
    "ICICIBANK.NS": {"name": "ICICI Bank",             "sector": "Banking",       "cap": "large"},
    "KOTAKBANK.NS": {"name": "Kotak Mahindra Bank",    "sector": "Banking",       "cap": "large"},
    "AXISBANK.NS":  {"name": "Axis Bank",              "sector": "Banking",       "cap": "large"},
    "SBIN.NS":      {"name": "State Bank of India",    "sector": "Banking",       "cap": "large"},
    "BAJFINANCE.NS":{"name": "Bajaj Finance",          "sector": "NBFC",          "cap": "large"},
    "HDFCLIFE.NS":  {"name": "HDFC Life Insurance",    "sector": "Insurance",     "cap": "large"},
    "SBILIFE.NS":   {"name": "SBI Life Insurance",     "sector": "Insurance",     "cap": "large"},
    # === LARGE CAP — IT ===
    "INFY.NS":      {"name": "Infosys",                "sector": "IT",            "cap": "large"},
    "TCS.NS":       {"name": "TCS",                    "sector": "IT",            "cap": "large"},
    "WIPRO.NS":     {"name": "Wipro",                  "sector": "IT",            "cap": "large"},
    "HCLTECH.NS":   {"name": "HCL Technologies",       "sector": "IT",            "cap": "large"},
    "TECHM.NS":     {"name": "Tech Mahindra",          "sector": "IT",            "cap": "large"},
    "LTIM.NS":      {"name": "LTIMindtree",            "sector": "IT",            "cap": "large"},
    # === LARGE CAP — FMCG ===
    "HINDUNILVR.NS":{"name": "Hindustan Unilever",     "sector": "FMCG",          "cap": "large"},
    "ITC.NS":       {"name": "ITC",                    "sector": "FMCG",          "cap": "large"},
    "NESTLEIND.NS": {"name": "Nestle India",           "sector": "FMCG",          "cap": "large"},
    "BRITANNIA.NS": {"name": "Britannia Industries",   "sector": "FMCG",          "cap": "large"},
    "DABUR.NS":     {"name": "Dabur India",            "sector": "FMCG",          "cap": "large"},
    "MARICO.NS":    {"name": "Marico",                 "sector": "FMCG",          "cap": "large"},
    # === LARGE CAP — Energy & Infrastructure ===
    "RELIANCE.NS":  {"name": "Reliance Industries",    "sector": "Energy",        "cap": "large"},
    "ONGC.NS":      {"name": "ONGC",                   "sector": "Energy",        "cap": "large"},
    "NTPC.NS":      {"name": "NTPC",                   "sector": "Energy",        "cap": "large"},
    "POWERGRID.NS": {"name": "Power Grid Corp",        "sector": "Energy",        "cap": "large"},
    "ADANIPORTS.NS":{"name": "Adani Ports",            "sector": "Infrastructure","cap": "large"},
    "LT.NS":        {"name": "Larsen & Toubro",        "sector": "Infrastructure","cap": "large"},
    "ULTRACEMCO.NS":{"name": "UltraTech Cement",       "sector": "Infrastructure","cap": "large"},
    # === LARGE CAP — Pharma ===
    "SUNPHARMA.NS": {"name": "Sun Pharmaceuticals",    "sector": "Pharma",        "cap": "large"},
    "CIPLA.NS":     {"name": "Cipla",                  "sector": "Pharma",        "cap": "large"},
    "DRREDDY.NS":   {"name": "Dr Reddy's Labs",        "sector": "Pharma",        "cap": "large"},
    "DIVISLAB.NS":  {"name": "Divi's Laboratories",    "sector": "Pharma",        "cap": "large"},
    # === LARGE CAP — Auto ===
    "MARUTI.NS":    {"name": "Maruti Suzuki",          "sector": "Auto",          "cap": "large"},
    "TATAMOTORS.NS":{"name": "Tata Motors",            "sector": "Auto",          "cap": "large"},
    "M&M.NS":       {"name": "Mahindra & Mahindra",    "sector": "Auto",          "cap": "large"},
    "BAJAJ-AUTO.NS":{"name": "Bajaj Auto",             "sector": "Auto",          "cap": "large"},
    "HEROMOTOCO.NS":{"name": "Hero MotoCorp",          "sector": "Auto",          "cap": "large"},
    # === MID CAP — IT / Digital ===
    "MPHASIS.NS":   {"name": "Mphasis",                "sector": "IT",            "cap": "mid"},
    "COFORGE.NS":   {"name": "Coforge",                "sector": "IT",            "cap": "mid"},
    "PERSISTENT.NS":{"name": "Persistent Systems",     "sector": "IT",            "cap": "mid"},
    "KPITTECH.NS":  {"name": "KPIT Technologies",      "sector": "IT",            "cap": "mid"},
    # === MID CAP — Pharma ===
    "AUROPHARMA.NS":{"name": "Aurobindo Pharma",       "sector": "Pharma",        "cap": "mid"},
    "TORNTPHARM.NS":{"name": "Torrent Pharma",         "sector": "Pharma",        "cap": "mid"},
    "ALKEM.NS":     {"name": "Alkem Laboratories",     "sector": "Pharma",        "cap": "mid"},
    "GLENMARK.NS":  {"name": "Glenmark Pharma",        "sector": "Pharma",        "cap": "mid"},
    # === MID CAP — Banking / Finance ===
    "BANDHANBNK.NS":{"name": "Bandhan Bank",           "sector": "Banking",       "cap": "mid"},
    "FEDERALBNK.NS":{"name": "Federal Bank",           "sector": "Banking",       "cap": "mid"},
    "IDFCFIRSTB.NS":{"name": "IDFC First Bank",        "sector": "Banking",       "cap": "mid"},
    "CHOLAFIN.NS":  {"name": "Cholamandalam Finance",  "sector": "NBFC",          "cap": "mid"},
    "MUTHOOTFIN.NS":{"name": "Muthoot Finance",        "sector": "NBFC",          "cap": "mid"},
    # === MID CAP — Consumer / FMCG ===
    "CROMPTON.NS":  {"name": "Crompton Greaves",       "sector": "Consumer",      "cap": "mid"},
    "VOLTAS.NS":    {"name": "Voltas",                 "sector": "Consumer",      "cap": "mid"},
    "WHIRLPOOL.NS": {"name": "Whirlpool India",        "sector": "Consumer",      "cap": "mid"},
    "VGUARD.NS":    {"name": "V-Guard Industries",     "sector": "Consumer",      "cap": "mid"},
    "TATACONSUM.NS":{"name": "Tata Consumer Products", "sector": "FMCG",          "cap": "mid"},
    # === MID CAP — Infrastructure / Capital Goods ===
    "CUMMINSIND.NS":{"name": "Cummins India",          "sector": "Capital Goods", "cap": "mid"},
    "ABB.NS":       {"name": "ABB India",              "sector": "Capital Goods", "cap": "mid"},
    "SIEMENS.NS":   {"name": "Siemens India",          "sector": "Capital Goods", "cap": "mid"},
    "THERMAX.NS":   {"name": "Thermax",                "sector": "Capital Goods", "cap": "mid"},
    "AIAENG.NS":    {"name": "AIA Engineering",        "sector": "Capital Goods", "cap": "mid"},
    "GRINDWELL.NS": {"name": "Grindwell Norton",       "sector": "Capital Goods", "cap": "mid"},
    # === MID CAP — Auto Ancillary ===
    "MOTHERSON.NS": {"name": "Motherson Sumi",         "sector": "Auto Ancillary","cap": "mid"},
    "BOSCHLTD.NS":  {"name": "Bosch India",            "sector": "Auto Ancillary","cap": "mid"},
    "MINDAIND.NS":  {"name": "Minda Industries",       "sector": "Auto Ancillary","cap": "mid"},
    "APOLLOTYRE.NS":{"name": "Apollo Tyres",           "sector": "Auto Ancillary","cap": "mid"},
    # === SMALL CAP ===
    "CRAFTSMAN.NS": {"name": "Craftsman Automation",   "sector": "Capital Goods", "cap": "small"},
    "LAXMIMACH.NS": {"name": "Lakshmi Machine Works",  "sector": "Capital Goods", "cap": "small"},
    "ELECON.NS":    {"name": "Elecon Engineering",     "sector": "Capital Goods", "cap": "small"},
    "GABRIEL.NS":   {"name": "Gabriel India",          "sector": "Auto Ancillary","cap": "small"},
    "WABAG.NS":     {"name": "VA Tech Wabag",          "sector": "Infrastructure","cap": "small"},
    "MAXHEALTH.NS": {"name": "Max Healthcare",         "sector": "Healthcare",    "cap": "small"},
    "LALPATHLAB.NS":{"name": "Dr Lal PathLabs",        "sector": "Healthcare",    "cap": "small"},
    "MEDANTA.NS":   {"name": "Global Health (Medanta)","sector": "Healthcare",    "cap": "small"},
    "ISGEC.NS":     {"name": "ISGEC Heavy Engineering","sector": "Capital Goods", "cap": "small"},
    "SAFARI.NS":    {"name": "Safari Industries",      "sector": "Consumer",      "cap": "small"},
    "CAMPUS.NS":    {"name": "Campus Activewear",      "sector": "Consumer",      "cap": "small"},
    "HAPPSTMNDS.NS":{"name": "Happiest Minds Tech",    "sector": "IT",            "cap": "small"},
}

# Risk profile definitions
RISK_PROFILES = {
    "conservative": {
        "allowed_caps": ["large"],
        "min_score": 55,
        "max_stocks": 8,
        "max_sector_pct": 0.30,
        "description": "Capital preservation focus: Large-cap, low-volatility blue chips."
    },
    "moderate": {
        "allowed_caps": ["large", "mid"],
        "min_score": 52,
        "max_stocks": 12,
        "max_sector_pct": 0.28,
        "description": "Balanced growth: Mix of large and mid-cap quality stocks."
    },
    "aggressive": {
        "allowed_caps": ["large", "mid", "small"],
        "min_score": 48,
        "max_stocks": 15,
        "max_sector_pct": 0.25,
        "description": "High growth focus: Full spectrum including small-caps with strong momentum."
    }
}


def generate_plan(amount: float, risk_profile: str, weight_f: float = 0.6, weight_t: float = 0.4) -> Dict:
    """
    Analyse the curated universe for the given risk profile and return
    an allocation recommendation.
    """
    from analyzer import StockAnalyzer

    profile = RISK_PROFILES.get(risk_profile.lower())
    if not profile:
        raise ValueError(f"Unknown risk profile: {risk_profile}")

    allowed_caps = profile["allowed_caps"]
    min_score = profile["min_score"]
    max_stocks = profile["max_stocks"]
    max_sector_pct = profile["max_sector_pct"]

    # Filter universe to caps allowed by profile
    candidate_symbols = {
        sym: meta for sym, meta in CURATED_UNIVERSE.items()
        if meta["cap"] in allowed_caps
    }

    logger.info(f"Planner: analysing {len(candidate_symbols)} stocks for profile '{risk_profile}'")

    # Analyse in parallel
    results = []

    def _analyze(sym: str, meta: Dict) -> Dict:
        try:
            data = StockAnalyzer.analyze_ticker(
                sym,
                is_etf=False,
                weight_fundamental=weight_f,
                weight_technical=weight_t
            )
            if not data or not data.get("success"):
                return {}
            tech = data.get("technical_score", 50.0) or 50.0
            fund = data.get("fundamental_score", 50.0) or 50.0
            combined = (weight_f * fund) + (weight_t * tech)
            return {
                "symbol": sym,
                "name": meta["name"],
                "sector": meta["sector"],
                "cap": meta["cap"],
                "technical_score": round(tech, 1),
                "fundamental_score": round(fund, 1),
                "combined_score": round(combined, 1),
                "latest_price": data.get("latest_price"),
                "change_percent": data.get("change_percent"),
            }
        except Exception as e:
            logger.warning(f"Planner failed to analyse {sym}: {e}")
            return {}

    with concurrent.futures.ThreadPoolExecutor(max_workers=10) as pool:
        futures = {pool.submit(_analyze, sym, meta): sym for sym, meta in candidate_symbols.items()}
        for future in concurrent.futures.as_completed(futures):
            res = future.result()
            if res and res.get("combined_score", 0) >= min_score:
                results.append(res)

    if not results:
        return {"error": "Not enough data to generate a plan. Please try again."}

    # Sort by combined score desc
    results.sort(key=lambda x: x["combined_score"], reverse=True)

    # Sector diversification: no sector > max_sector_pct of slots
    selected = []
    sector_count: Dict[str, int] = {}
    for stock in results:
        if len(selected) >= max_stocks:
            break
        sector = stock["sector"]
        current = sector_count.get(sector, 0)
        sector_limit = max(1, int(max_stocks * max_sector_pct))
        if current < sector_limit:
            selected.append(stock)
            sector_count[sector] = current + 1

    if not selected:
        selected = results[:max_stocks]  # fallback without sector cap

    # Equal-weight allocation
    n = len(selected)
    per_stock_amount = amount / n if n > 0 else 0

    allocation = []
    for stock in selected:
        weight_pct = round(100 / n, 1) if n > 0 else 0
        alloc_amount = round(per_stock_amount, 2)
        shares = None
        price = stock.get("latest_price")
        if price and price > 0:
            shares = int(alloc_amount / price)

        signal = "BUY" if stock["combined_score"] >= 70 else "HOLD" if stock["combined_score"] >= 40 else "SELL"

        allocation.append({
            **stock,
            "weight_pct": weight_pct,
            "allocated_amount": alloc_amount,
            "shares": shares,
            "signal": signal
        })

    buy_count = sum(1 for a in allocation if a["signal"] == "BUY")
    hold_count = sum(1 for a in allocation if a["signal"] == "HOLD")
    avg_score = round(sum(a["combined_score"] for a in allocation) / len(allocation), 1) if allocation else 0

    return {
        "risk_profile": risk_profile,
        "profile_description": profile["description"],
        "total_amount": amount,
        "stock_count": len(allocation),
        "avg_score": avg_score,
        "buy_count": buy_count,
        "hold_count": hold_count,
        "allocation": allocation,
    }
