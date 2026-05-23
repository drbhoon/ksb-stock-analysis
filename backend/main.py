import logging
import os
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Header, Depends
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
from typing import List, Dict, Any, Optional
import concurrent.futures
from pydantic import BaseModel
import pandas as pd

# Import backend modules
from symbol_mapper import mapper
from analyzer import StockAnalyzer
from excel_parser import ExcelParser


logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="General Stock Analysis API", version="1.0.0")

# Setup CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # In development, allow all. We can narrow this down for production if needed.
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Authentication Verification Helper
def get_current_user(authorization: Optional[str] = Header(None)):
    correct_password = os.getenv("APP_PASSWORD", "Welcome@123")
    if authorization == f"Bearer {correct_password}":
        return True
    raise HTTPException(status_code=401, detail="Unauthorized access. Invalid or missing password.")

class PasswordVerifyRequest(BaseModel):
    password: str

@app.get("/api/auth/status")
async def get_auth_status():
    """Check if app password protection is enabled."""
    return {"auth_required": True}

@app.post("/api/auth/verify")
async def verify_password(req: PasswordVerifyRequest):
    """Verify password and return bearer token."""
    correct_password = os.getenv("APP_PASSWORD", "Welcome@123")
    if req.password == correct_password:
        return {"success": True, "token": correct_password}
    else:
        raise HTTPException(status_code=401, detail="Invalid password.")

@app.get("/api/search")
async def search_stocks(q: str, authenticated: bool = Depends(get_current_user)):
    """Search for stocks in cached equity and ETF lists in memory."""
    if not q or len(q.strip()) < 2:
        return []
        
    query = q.strip().upper()
    matches = []
    
    # 1. Search in manual overrides first (prioritize them)
    from symbol_mapper import SYMBOL_OVERRIDES
    for key, val in SYMBOL_OVERRIDES.items():
        ticker, name, is_etf = val
        if query in key or query in ticker.upper() or query in name.upper():
            matches.append({
                "symbol": ticker,
                "name": name,
                "is_etf": is_etf,
                "isin": ""
            })
            
    # 2. Search in EQUITY_L and ETF loaded caches
    for isin, val in mapper.isin_to_symbol.items():
        ticker, name, is_etf = val
        # Avoid duplicate matches
        if any(m["symbol"] == ticker for m in matches):
            continue
            
        if query in ticker.upper() or query in name.upper() or query in isin:
            matches.append({
                "symbol": ticker,
                "name": name,
                "is_etf": is_etf,
                "isin": isin
            })
            if len(matches) >= 15: # Limit results for speed
                break
                
    return matches

# In-memory cache for portfolio results to support fast report exports and single analysis checks
portfolio_cache: Dict[str, Any] = {}

def analyze_single_stock_task(row: Dict[str, Any], weight_f: float, weight_t: float) -> Dict[str, Any]:
    """Helper function to map and analyze a single row, designed to run in thread pool."""
    isin = row.get("uploaded_isin", "")
    symbol_hint = row.get("uploaded_symbol", "")
    name_hint = row.get("uploaded_name", "")
    row_idx = row.get("row_index", 0)
    
    try:
        # 1. Resolve ISIN
        ticker, resolved_name, is_etf = mapper.resolve_isin(isin, symbol_hint, name_hint)
        
        # 2. Analyze Ticker
        analysis = StockAnalyzer.analyze_ticker(
            ticker, 
            is_etf=is_etf, 
            weight_fundamental=weight_f, 
            weight_technical=weight_t
        )
        
        if not analysis.get("success"):
            return {
                "success": False,
                "row_index": row_idx,
                "isin": isin,
                "symbol": symbol_hint,
                "name": name_hint,
                "error": analysis.get("error", "Quantitative analysis failed.")
            }
        
        # Add metadata
        analysis["uploaded_isin"] = isin
        analysis["uploaded_symbol"] = symbol_hint
        analysis["row_index"] = row_idx
        return {"success": True, "data": analysis}
        
    except Exception as e:
        logger.error(f"Failed to process row {row_idx} (ISIN: {isin}, Symbol: {symbol_hint}): {e}")
        return {
            "success": False,
            "row_index": row_idx,
            "isin": isin,
            "symbol": symbol_hint,
            "name": name_hint,
            "error": str(e)
        }

@app.post("/api/upload")
async def upload_portfolio(
    file: UploadFile = File(...),
    fundamental_weight: float = Form(0.60),
    technical_weight: float = Form(0.40),
    authenticated: bool = Depends(get_current_user)
):
    """Handles Excel/CSV portfolio upload, runs concurrent analysis, and aggregates signals."""
    logger.info(f"Received portfolio upload: {file.filename}")
    
    try:
        # Read file contents
        contents = await file.read()
        
        # Parse spreadsheet
        rows = ExcelParser.parse_file(contents, file.filename)
        
        if not rows:
            raise HTTPException(status_code=400, detail="The uploaded sheet is empty or contains no valid rows.")
            
        results = []
        failed = []
        
        # Analyze concurrently using ThreadPoolExecutor for speed
        max_workers = min(15, len(rows))
        logger.info(f"Starting concurrent analysis with {max_workers} threads for {len(rows)} rows.")
        
        with concurrent.futures.ThreadPoolExecutor(max_workers=max_workers) as executor:
            # Submit all rows for processing
            futures = {
                executor.submit(
                    analyze_single_stock_task, row, fundamental_weight, technical_weight
                ): row for row in rows
            }
            
            for future in concurrent.futures.as_completed(futures):
                res = future.result()
                if res["success"]:
                    results.append(res["data"])
                else:
                    failed.append(res)
                    
        # Sort results by original row index to keep ordering consistent
        results.sort(key=lambda x: x.get("row_index", 0))
        
        # Compute portfolio stats
        total_stocks = len(results)
        buy_count = sum(1 for r in results if r.get("signal") == "BUY")
        hold_count = sum(1 for r in results if r.get("signal") == "HOLD")
        sell_count = sum(1 for r in results if r.get("signal") == "SELL")
        
        avg_combined_score = sum(r.get("combined_score", 0.0) for r in results) / total_stocks if total_stocks else 0.0
        
        # Determine overall portfolio sentiment
        if avg_combined_score >= 70:
            portfolio_sentiment = "BULLISH"
        elif avg_combined_score >= 40:
            portfolio_sentiment = "NEUTRAL"
        else:
            portfolio_sentiment = "BEARISH"
            
        payload = {
            "file_name": file.filename,
            "total_items": total_stocks + len(failed),
            "analyzed_count": total_stocks,
            "failed_count": len(failed),
            "stats": {
                "buy_count": buy_count,
                "hold_count": hold_count,
                "sell_count": sell_count,
                "avg_score": avg_combined_score,
                "sentiment": portfolio_sentiment
            },
            "results": results,
            "failed": failed
        }
        
        # Cache results in memory
        portfolio_cache["latest"] = payload
        
        return payload
        
    except Exception as e:
        logger.error(f"Upload processing failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Portfolio processing failed: {str(e)}")

@app.get("/api/analyze/{symbol}")
async def analyze_stock_details(
    symbol: str, 
    is_etf: bool = False,
    fundamental_weight: float = 0.60,
    technical_weight: float = 0.40,
    authenticated: bool = Depends(get_current_user)
):
    """Endpoint for detailed live-analysis of a single stock, including full chart history."""
    try:
        # Ensure correct symbol suffix
        ticker_symbol = symbol.upper().strip()
        if not ticker_symbol.endswith(".NS") and "^" not in ticker_symbol:
            ticker_symbol = f"{ticker_symbol}.NS"
            
        # 1. Run core analysis
        report = StockAnalyzer.analyze_ticker(
            ticker_symbol, 
            is_etf=is_etf, 
            weight_fundamental=fundamental_weight, 
            weight_technical=technical_weight
        )
        
        if not report.get("success"):
            raise HTTPException(status_code=400, detail=report.get("error"))
            
        # 2. Fetch and format chart data
        ticker = uvicorn.config.Config  # mock ref to yfinance
        import yfinance as yf
        ticker = yf.Ticker(ticker_symbol)
        history = ticker.history(period="1y")
        
        chart_data = []
        if not history.empty:
            history.index = history.index.strftime('%Y-%m-%d')
            # Add calculated indicators to the chart data points for visualization
            prices = history['Close']
            ema20 = prices.ewm(span=20, adjust=False).mean()
            ema50 = prices.ewm(span=50, adjust=False).mean()
            ema200 = prices.ewm(span=200, adjust=False).mean()
            
            bb_middle = prices.rolling(window=20).mean()
            bb_std = prices.rolling(window=20).std()
            bb_upper = bb_middle + (2 * bb_std)
            bb_lower = bb_middle - (2 * bb_std)
            
            for date, row in history.iterrows():
                idx_pos = history.index.get_loc(date)
                chart_data.append({
                    "date": date,
                    "close": float(row["Close"]),
                    "high": float(row["High"]),
                    "low": float(row["Low"]),
                    "open": float(row["Open"]),
                    "volume": int(row["Volume"]),
                    "ema20": float(ema20.iloc[idx_pos]) if pd.notna(ema20.iloc[idx_pos]) else None,
                    "ema50": float(ema50.iloc[idx_pos]) if pd.notna(ema50.iloc[idx_pos]) else None,
                    "ema200": float(ema200.iloc[idx_pos]) if pd.notna(ema200.iloc[idx_pos]) else None,
                    "bb_upper": float(bb_upper.iloc[idx_pos]) if pd.notna(bb_upper.iloc[idx_pos]) else None,
                    "bb_lower": float(bb_lower.iloc[idx_pos]) if pd.notna(bb_lower.iloc[idx_pos]) else None
                })
                
        report["chart_history"] = chart_data
        return report
        
    except Exception as e:
        logger.error(f"Single stock analysis failed for {symbol}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/market-summary")
async def get_market_summary(authenticated: bool = Depends(get_current_user)):
    """Fetches key indices (Nifty 50, Nifty Bank, Nifty Midcap) to display market benchmarks."""
    import yfinance as yf
    indices = {
        "NIFTY 50": "^NSEI",
        "NIFTY BANK": "^NSEBANK",
        "NIFTY MIDCAP 50": "^NSEMDCP50"
    }
    
    summary = []
    for name, sym in indices.items():
        try:
            ticker = yf.Ticker(sym)
            history = ticker.history(period="5d")
            if not history.empty:
                latest_close = float(history['Close'].iloc[-1])
                prev_close = float(history['Close'].iloc[-2]) if len(history) > 1 else latest_close
                change = latest_close - prev_close
                change_pct = (change / prev_close) * 100 if prev_close else 0.0
                summary.append({
                    "name": name,
                    "symbol": sym,
                    "price": latest_close,
                    "change": change,
                    "change_percent": change_pct
                })
        except Exception as e:
            logger.warning(f"Failed to fetch market index {name}: {e}")
            
    return summary

# Serve static frontend files in production if dist folder is present
frontend_dist_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "frontend", "dist")
if os.path.exists(frontend_dist_dir):
    logger.info(f"Frontend dist folder detected at {frontend_dist_dir}. Enabling production same-origin static serving.")
    from fastapi.staticfiles import StaticFiles
    from fastapi.responses import FileResponse
    
    # Mount assets folder
    assets_dir = os.path.join(frontend_dist_dir, "assets")
    if os.path.exists(assets_dir):
        app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")
        
    # Catch-all route to serve Index.html for SPA routing
    @app.get("/{catchall:path}")
    async def serve_index(catchall: str):
        index_path = os.path.join(frontend_dist_dir, "index.html")
        if os.path.exists(index_path):
            return FileResponse(index_path)

if __name__ == "__main__":
    logger.info("Starting FastAPI server...")
    # Respect Railway's dynamic PORT binding variable, defaulting to 8000
    server_port = int(os.getenv("PORT", "8000"))
    uvicorn.run(app, host="0.0.0.0", port=server_port)
