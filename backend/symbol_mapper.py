import os
import io
import re
import logging
import requests
import pandas as pd
from typing import Dict, Optional, Tuple

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

EQUITY_LIST_URL = "https://archives.nseindia.com/content/equities/EQUITY_L.csv"
ETF_LIST_URL = "https://archives.nseindia.com/content/equities/eq_etfseclist.csv"

CACHE_DIR = os.path.join(os.path.dirname(__file__), ".cache")
os.makedirs(CACHE_DIR, exist_ok=True)

EQUITY_CACHE_PATH = os.path.join(CACHE_DIR, "EQUITY_L.csv")
ETF_CACHE_PATH = os.path.join(CACHE_DIR, "eq_etfseclist.csv")

# Manual mapping overrides for common custom broker symbol/ISIN inconsistencies
SYMBOL_OVERRIDES = {
    "MAXHEA": ("MAXHEALTH.NS", "Max Healthcare Institute Limited", False),
    "MAXHEALTH": ("MAXHEALTH.NS", "Max Healthcare Institute Limited", False),
    "MAXHEALTHCARE": ("MAXHEALTH.NS", "Max Healthcare Institute Limited", False),
    "MAXHEALTHCAREINSTITUTE": ("MAXHEALTH.NS", "Max Healthcare Institute Limited", False),
    "ELEENG": ("ELECON.NS", "Elecon Engineering Company Limited", False),
    "ELECON": ("ELECON.NS", "Elecon Engineering Company Limited", False),
    "ELECONENGINEERING": ("ELECON.NS", "Elecon Engineering Company Limited", False),
    "VARBEV": ("VBL.NS", "Varun Beverages Limited", False),
    "VBL": ("VBL.NS", "Varun Beverages Limited", False),
    "VARUNBEVERAGES": ("VBL.NS", "Varun Beverages Limited", False),
    "KGKHOS": ("KIRLPNU.NS", "Kirloskar Pneumatic Company Limited", False),
    "KIRLPNU": ("KIRLPNU.NS", "Kirloskar Pneumatic Company Limited", False),
    "ELESTE": ("ELECTCAST.NS", "Electrosteel Castings Limited", False),
    "ELECTCAST": ("ELECTCAST.NS", "Electrosteel Castings Limited", False),
    "GABIND": ("GABRIEL.NS", "Gabriel India Limited", False),
    "ASHLEY": ("ASHOKLEY.NS", "Ashok Leyland Limited", False),
    "BAAUTO": ("BAJAJ-AUTO.NS", "Bajaj Auto Limited", False),
    "TVSMOT": ("TVSMOTOR.NS", "TVS Motor Company Limited", False),
    "AXIBAN": ("AXISBANK.NS", "Axis Bank Limited", False),
    "BANMAH": ("MAHABANK.NS", "Bank of Maharashtra", False),
    "FEDBAN": ("FEDERALBNK.NS", "Federal Bank Limited", False),
    "HDFBAN": ("HDFCBANK.NS", "HDFC Bank Limited", False),
    "ICIBAN": ("ICICIBANK.NS", "ICICI Bank Limited", False),
    "SOUBAN": ("SOUTHBANK.NS", "South Indian Bank Limited", False),
    "STABAN": ("SBIN.NS", "State Bank of India", False),
    "KEIIND": ("KEI.NS", "KEI Industries Limited", False),
    "NAVFLU": ("NAVINFLUOR.NS", "Navin Fluorine International Limited", False),
    "TATCHE": ("TATACHEM.NS", "Tata Chemicals Limited", False),
    "KALPOW": ("KPIL.NS", "Kalpataru Projects International Limited", False),
    "MACDEV": ("LODHA.NS", "Macrotech Developers Limited", False),
    "SOBDEV": ("SOBHA.NS", "Sobha Limited", False),
    "SWILIM": ("SWIGGY.NS", "Swiggy Limited", False),
    "ZOMLIM": ("ETERNAL.NS", "Eternal Limited (Zomato)", False),
    "ZOMATO": ("ETERNAL.NS", "Eternal Limited (Zomato)", False),
    "HDFGOL": ("HDFCGOLD.NS", "HDFC Gold ETF", True),
    "ICINIF": ("NIFTYIETF.NS", "ICICI Pru Nifty ETF", True),
    "NIPSIL": ("SILVERBEES.NS", "Nippon India Silver ETF", True),
    "PSUBAN": ("PSUBNKBEES.NS", "Nippon India ETF PSB", True)
}

class SymbolMapper:
    def __init__(self):
        self.isin_to_symbol: Dict[str, Tuple[str, str, bool]] = {} # isin -> (symbol, name, is_etf)
        self.headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
        self.initialize_mappings()

    def fetch_with_retry(self, url: str, path: str, retries: int = 3) -> bool:
        """Fetch and cache official NSE files with retries."""
        for attempt in range(retries):
            try:
                logger.info(f"Downloading {url} (Attempt {attempt+1}/{retries})...")
                response = requests.get(url, headers=self.headers, timeout=15)
                response.raise_for_status()
                with open(path, "wb") as f:
                    f.write(response.content)
                logger.info(f"Cached file to {path}")
                return True
            except Exception as e:
                logger.warning(f"Failed to fetch {url} on attempt {attempt+1}: {e}")
        return False

    def load_equity_list(self):
        """Loads and parses EQUITY_L.csv to populate mapping."""
        if not os.path.exists(EQUITY_CACHE_PATH):
            success = self.fetch_with_retry(EQUITY_LIST_URL, EQUITY_CACHE_PATH)
            if not success:
                logger.error("Could not fetch equity list from NSE. Fallback lookup will be used.")
                return

        try:
            df = pd.read_csv(EQUITY_CACHE_PATH)
            df.columns = df.columns.str.strip()
            
            # Identify columns
            isin_col = 'ISIN NUMBER'
            symbol_col = 'SYMBOL'
            name_col = 'NAME OF COMPANY'
            
            if isin_col not in df.columns or symbol_col not in df.columns:
                # Find matching column names dynamically
                isin_col = [c for c in df.columns if 'ISIN' in c.upper()][0]
                symbol_col = [c for c in df.columns if 'SYMBOL' in c.upper()][0]
                name_col = [c for c in df.columns if 'NAME' in c.upper() or 'COMPANY' in c.upper()][0]

            for _, row in df.iterrows():
                isin = str(row[isin_col]).strip()
                symbol = str(row[symbol_col]).strip()
                name = str(row[name_col]).strip()
                if isin and symbol:
                    # Clean whitespaces including hidden ones
                    clean_isin = re.sub(r'\s+', '', isin).upper()
                    # Append .NS suffix for Yahoo Finance
                    self.isin_to_symbol[clean_isin] = (f"{symbol}.NS", name, False)
            
            logger.info(f"Loaded {len(self.isin_to_symbol)} equities from cached list.")
        except Exception as e:
            logger.error(f"Error loading equity list from cache: {e}")

    def load_etf_list(self):
        """Loads and parses eq_etfseclist.csv to populate mapping."""
        if not os.path.exists(ETF_CACHE_PATH):
            success = self.fetch_with_retry(ETF_LIST_URL, ETF_CACHE_PATH)
            if not success:
                logger.error("Could not fetch ETF list from NSE.")
                return

        try:
            # Using encoding='latin-1' to avoid decoding errors for special symbols
            df = pd.read_csv(ETF_CACHE_PATH, encoding='latin-1')
            df.columns = df.columns.str.strip()
            
            isin_col = 'ISINNumber'
            symbol_col = 'Symbol'
            name_col = 'SecurityName'
            
            if isin_col not in df.columns or symbol_col not in df.columns:
                isin_col = [c for c in df.columns if 'ISIN' in c.upper()][0]
                symbol_col = [c for c in df.columns if 'SYMBOL' in c.upper()][0]
                name_col = [c for c in df.columns if 'NAME' in c.upper() or 'SECURITY' in c.upper() or 'COMPANY' in c.upper()][0]

            count = 0
            for _, row in df.iterrows():
                isin = str(row[isin_col]).strip()
                symbol = str(row[symbol_col]).strip()
                name = str(row[name_col]).strip()
                if isin and symbol:
                    clean_isin = re.sub(r'\s+', '', isin).upper()
                    self.isin_to_symbol[clean_isin] = (f"{symbol}.NS", name, True)
                    count += 1
            
            logger.info(f"Loaded {count} ETFs from cached list.")
        except Exception as e:
            logger.error(f"Error loading ETF list from cache: {e}")

    def initialize_mappings(self):
        """Pre-populate mappings by loading local list caches."""
        self.load_equity_list()
        self.load_etf_list()

    def query_yahoo_finance_isin(self, isin: str) -> Optional[Tuple[str, str, bool]]:
        """Queries Yahoo Finance Search API as fallback to resolve ISIN to Ticker."""
        try:
            logger.info(f"Querying Yahoo Finance search API for ISIN: {isin}")
            url = f"https://query2.finance.yahoo.com/v1/finance/search?q={isin}&newsCount=0&enableFuzzyQuery=false"
            response = requests.get(url, headers=self.headers, timeout=10)
            response.raise_for_status()
            data = response.json()
            
            quotes = data.get("quotes", [])
            if not quotes:
                return None
                
            # Filter for NSE tickers (.NS)
            nse_quotes = [q for q in quotes if str(q.get("symbol")).endswith(".NS")]
            
            if nse_quotes:
                best_match = nse_quotes[0]
                symbol = best_match.get("symbol")
                name = best_match.get("longname") or best_match.get("shortname") or symbol
                # Detect if ETF/Mutual Fund
                quote_type = str(best_match.get("quoteType", "")).upper()
                is_etf = quote_type in ["ETF", "MUTUALFUND"]
                logger.info(f"Resolved ISIN {isin} via Yahoo Search: {symbol}")
                return symbol, name, is_etf
                
            # Any valid quote if no .NS found
            best_match = quotes[0]
            symbol = best_match.get("symbol")
            name = best_match.get("longname") or best_match.get("shortname") or symbol
            quote_type = str(best_match.get("quoteType", "")).upper()
            is_etf = quote_type in ["ETF", "MUTUALFUND"]
            logger.info(f"Resolved ISIN {isin} via Yahoo Search (non-NSE): {symbol}")
            return symbol, name, is_etf
        except Exception as e:
            logger.error(f"Yahoo Search fallback failed for {isin}: {e}")
            return None

    def resolve_isin(self, isin: str, symbol_hint: Optional[str] = None, name_hint: Optional[str] = None) -> Tuple[str, str, bool]:
        """Resolves an ISIN to a Yahoo ticker symbol, name, and asset type.
        
        Args:
            isin: The unique 12-char ISIN code.
            symbol_hint: A backup symbol if ISIN mapping fails.
            name_hint: A backup name if ISIN mapping fails.
            
        Returns:
            Tuple containing: (yahoo_ticker, company_name, is_etf)
        """
        # Clean ISIN (remove all hidden or standard whitespace)
        isin_clean = re.sub(r'\s+', '', str(isin)).strip().upper() if isin else ""
        symbol_clean = re.sub(r'\s+', '', str(symbol_hint)).strip().upper() if symbol_hint else ""
        
        # Normalize common empty or NaN representations to empty string
        if isin_clean in ["NAN", "NONE", "NULL", "NAT", "UNDEFINED", "N/A", "NA", ""]:
            isin_clean = ""
            
        if symbol_clean in ["NAN", "NONE", "NULL", "NAT", "UNDEFINED", "N/A", "NA", ""]:
            symbol_clean = ""
            
        # A valid ISIN must be exactly 12 characters and completely alphanumeric.
        # If it is not valid, treat it as empty so we ignore and skip Yahoo Search / cache lookups with "NAN" / "NONE".
        if isin_clean and (len(isin_clean) != 12 or not isin_clean.isalnum()):
            logger.info(f"Ignoring invalid ISIN code format: '{isin_clean}'")
            isin_clean = ""
        
        # 1. Check for manual symbol override (e.g. ELESTE -> ELECTCAST, MAXHEA -> MAXHEALTH, VARBEV -> VBL)
        if symbol_clean in SYMBOL_OVERRIDES:
            logger.info(f"Manual Override Match for Symbol Hint: {symbol_clean}")
            return SYMBOL_OVERRIDES[symbol_clean]
            
        # 2. Primary check in cached lists
        if isin_clean and isin_clean in self.isin_to_symbol:
            return self.isin_to_symbol[isin_clean]
            
        # 3. Secondary check using Yahoo Search API
        if isin_clean:
            resolved = self.query_yahoo_finance_isin(isin_clean)
            if resolved:
                # Cache it in memory for subsequent lookups
                self.isin_to_symbol[isin_clean] = resolved
                return resolved
            
        # 4. Fallback to using the symbol hint
        if symbol_hint:
            # If the user uploaded a shortened symbol, let's append .NS
            if not symbol_clean.endswith(".NS"):
                ticker = f"{symbol_clean}.NS"
            else:
                ticker = symbol_clean
                
            name = name_hint or symbol_clean
            
            # Check prefix to guess ETF
            is_etf = isin_clean.startswith("INF") or "ETF" in name.upper() or "BEES" in ticker.upper()
            return ticker, name, is_etf
            
        raise ValueError(f"Could not resolve security for ISIN {isin} and Symbol {symbol_hint}")

# Singleton Mapper instance
mapper = SymbolMapper()
