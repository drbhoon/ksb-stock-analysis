import asyncio
import base64
import hashlib
import hmac
import json
import logging
import os
import sys
import threading
import time
import traceback
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

import pandas as pd
import requests
from dotenv import load_dotenv, set_key
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

# Ensure TradingAgents repo is on sys.path
BASE_DIR = Path(__file__).resolve().parent
REPO_DIR = BASE_DIR / "TradingAgents"
ENV_FILE = BASE_DIR / ".env"
DATA_DIR = BASE_DIR / "data"
BACKEND_CACHE_DIR = BASE_DIR.parent / "backend" / ".cache"

if str(REPO_DIR) not in sys.path:
    sys.path.insert(0, str(REPO_DIR))

# Load .env before importing tradingagents
load_dotenv(ENV_FILE, override=True)

from tradingagents.agents.rating import run_rating
from tradingagents.default_config import build_default_config
from tradingagents.graph.trading_graph import TradingAgentsGraph

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("trading_agent_server")

app = FastAPI(title="KSB Trading Agent Microservice", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:8000",
        "http://localhost:3000",
        "https://stocks.bhoon.org",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

GEMINI_MODELS = [
    {"id": "gemini-3.5-flash-lite", "label": "Gemini 3.5 Flash Lite (Fastest - Default Quick-Think)"},
    {"id": "gemini-2.5-flash", "label": "Gemini 2.5 Flash (Recommended Deep-Think)"},
    {"id": "gemini-3.8-flash", "label": "Gemini 3.8 Flash (Latest Flagship Flash)"},
    {"id": "gemini-3.5-flash", "label": "Gemini 3.5 Flash (Balanced Reasoning)"},
    {"id": "gemini-3.1-flash-lite", "label": "Gemini 3.1 Flash Lite (Ultra-Lightweight)"},
    {"id": "gemini-3.1-pro-preview", "label": "Gemini 3.1 Pro Preview (Deepest Reasoning)"},
]


class ApiKeyUpdateRequest(BaseModel):
    google_api_key: str


class AnalyzeRequest(BaseModel):
    ticker: str
    trade_date: Optional[str] = None
    asset_type: str = "stock"
    selected_analysts: List[str] = ["market", "fundamentals"]
    research_depth: int = 1
    quick_think_llm: str = "gemini-3.5-flash-lite"
    deep_think_llm: str = "gemini-2.5-flash"
    google_api_key: Optional[str] = None


def _mask_key(key: str) -> str:
    if not key or len(key) < 8:
        return ""
    return f"{key[:4]}...{key[-4:]}"


def _create_local_dev_jwt() -> str:
    """Create a local dev JWT compatible with backend/auth.py default dev secret."""
    secret = os.getenv("JWT_SECRET", "dev-secret-change-in-production-32chars!")
    header = {"alg": "HS256", "typ": "JWT"}
    now = int(time.time())
    payload = {
        "sub": "admin-bypass",
        "email": "drbhoon@gmail.com",
        "name": "Dr KS Bhoon (Local)",
        "picture": "",
        "iat": now,
        "exp": now + 30 * 86400,
    }
    def b64url(data: bytes) -> str:
        return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")
    h_b64 = b64url(json.dumps(header, separators=(",", ":")).encode("utf-8"))
    p_b64 = b64url(json.dumps(payload, separators=(",", ":")).encode("utf-8"))
    signing_input = f"{h_b64}.{p_b64}".encode("ascii")
    sig = hmac.new(secret.encode("utf-8"), signing_input, hashlib.sha256).digest()
    return f"{h_b64}.{p_b64}.{b64url(sig)}"


@app.get("/api/trading-agent/status")
async def get_status():
    """Return microservice health, API key status, and available Gemini models."""
    load_dotenv(ENV_FILE, override=True)
    current_key = os.getenv("GOOGLE_API_KEY", "").strip()
    return {
        "status": "online",
        "provider": "google",
        "has_google_api_key": bool(current_key),
        "masked_google_api_key": _mask_key(current_key),
        "models": GEMINI_MODELS,
        "default_quick_llm": os.getenv("TRADINGAGENTS_QUICK_THINK_LLM", "gemini-2.5-flash"),
        "default_deep_llm": os.getenv("TRADINGAGENTS_DEEP_THINK_LLM", "gemini-2.5-flash"),
        "today": datetime.now().strftime("%Y-%m-%d"),
        "local_dev_token": _create_local_dev_jwt(),
    }


@app.post("/api/trading-agent/config")
async def save_api_key(req: ApiKeyUpdateRequest):
    """Save GOOGLE_API_KEY into TradingAgent/.env and current process environment."""
    cleaned_key = req.google_api_key.strip()
    if not cleaned_key:
        raise HTTPException(status_code=400, detail="Gemini API key cannot be empty.")

    if not ENV_FILE.exists():
        ENV_FILE.write_text("", encoding="utf-8")

    set_key(str(ENV_FILE), "GOOGLE_API_KEY", cleaned_key)
    os.environ["GOOGLE_API_KEY"] = cleaned_key
    return {
        "success": True,
        "has_google_api_key": True,
        "masked_google_api_key": _mask_key(cleaned_key),
    }


@app.get("/api/trading-agent/history")
async def get_history():
    """List saved past runs from TradingAgent/data/results."""
    results_root = DATA_DIR / "results"
    if not results_root.exists():
        return {"runs": []}

    runs = []
    for log_file in results_root.rglob("full_states_log_*.json"):
        try:
            stat = log_file.stat()
            data = json.loads(log_file.read_text(encoding="utf-8"))
            runs.append({
                "id": str(log_file.relative_to(results_root)).replace("\\", "/"),
                "ticker": data.get("company_of_interest", ""),
                "trade_date": data.get("trade_date", ""),
                "final_rating": data.get("final_rating", "REVIEW"),
                "timestamp": datetime.fromtimestamp(stat.st_mtime).strftime("%Y-%m-%d %H:%M:%S"),
                "mtime": stat.st_mtime,
                "data": data,
            })
        except Exception as e:
            logger.warning(f"Could not read history file {log_file}: {e}")

    runs.sort(key=lambda r: r["mtime"], reverse=True)
    return {"runs": runs[:20]}


# Load cached NSE equities & ETFs for instant search and symbol auto-resolution
_NSE_SECURITIES: List[Dict[str, Any]] = []
_NSE_SYMBOL_MAP: Dict[str, str] = {}


def _load_nse_securities():
    global _NSE_SECURITIES, _NSE_SYMBOL_MAP
    if _NSE_SECURITIES:
        return
    eq_path = BACKEND_CACHE_DIR / "EQUITY_L.csv"
    etf_path = BACKEND_CACHE_DIR / "eq_etfseclist.csv"
    items: List[Dict[str, Any]] = []
    seen = set()

    if eq_path.exists():
        try:
            df = pd.read_csv(eq_path)
            df.columns = df.columns.str.strip()
            for _, row in df.iterrows():
                raw_sym = str(row.get("SYMBOL", "")).strip()
                name = str(row.get("NAME OF COMPANY", raw_sym)).strip()
                if raw_sym and raw_sym != "nan":
                    full_sym = f"{raw_sym}.NS"
                    if full_sym not in seen:
                        seen.add(full_sym)
                        items.append({"symbol": full_sym, "raw": raw_sym.upper(), "name": name, "exchange": "NSE", "is_etf": False})
                        _NSE_SYMBOL_MAP[raw_sym.upper()] = full_sym
        except Exception as e:
            logger.warning(f"Could not load EQUITY_L.csv: {e}")

    if etf_path.exists():
        try:
            df = pd.read_csv(etf_path)
            df.columns = df.columns.str.strip()
            for _, row in df.iterrows():
                raw_sym = str(row.get("Symbol", "")).strip()
                name = str(row.get("Security Name", raw_sym)).strip()
                if raw_sym and raw_sym != "nan":
                    full_sym = f"{raw_sym}.NS"
                    if full_sym not in seen:
                        seen.add(full_sym)
                        items.append({"symbol": full_sym, "raw": raw_sym.upper(), "name": name, "exchange": "NSE ETF", "is_etf": True})
                        _NSE_SYMBOL_MAP[raw_sym.upper()] = full_sym
        except Exception as e:
            logger.warning(f"Could not load eq_etfseclist.csv: {e}")

    _NSE_SECURITIES = items
    logger.info(f"Loaded {len(_NSE_SECURITIES)} NSE securities for TradingAgent search.")


_load_nse_securities()


@app.get("/api/trading-agent/search")
async def search_tickers(q: str = ""):
    """Search NSE cached equities/ETFs plus global Yahoo Finance tickers."""
    query = q.strip().upper()
    if len(query) < 1:
        return []

    _load_nse_securities()
    matches: List[Dict[str, Any]] = []
    seen = set()

    # 1. Exact or prefix symbol matches in NSE
    for item in _NSE_SECURITIES:
        if item["raw"] == query or item["symbol"].upper() == query or item["raw"].startswith(query):
            matches.append(item)
            seen.add(item["symbol"])
            if len(matches) >= 10:
                break

    # 2. Substring company name or symbol matches in NSE
    if len(matches) < 12:
        for item in _NSE_SECURITIES:
            if item["symbol"] in seen:
                continue
            if query in item["raw"] or query in item["name"].upper():
                matches.append(item)
                seen.add(item["symbol"])
                if len(matches) >= 12:
                    break

    # 3. Also query Yahoo Finance autocomplete for global/US/crypto/BSE stocks
    try:
        yf_resp = requests.get(
            "https://query2.finance.yahoo.com/v1/finance/search",
            params={"q": q.strip(), "quotesCount": 6, "newsCount": 0},
            headers={"User-Agent": "Mozilla/5.0"},
            timeout=3,
        )
        if yf_resp.ok:
            for quote in yf_resp.json().get("quotes", []):
                sym = quote.get("symbol", "")
                if sym and sym not in seen:
                    seen.add(sym)
                    matches.append({
                        "symbol": sym,
                        "raw": sym,
                        "name": quote.get("longname") or quote.get("shortname") or sym,
                        "exchange": quote.get("exchDisp") or quote.get("exchange") or "Global",
                        "is_etf": quote.get("quoteType") == "ETF",
                    })
    except Exception:
        pass

    return matches[:15]


def _resolve_ticker(raw_ticker: str) -> str:
    """Resolve bare Indian NSE symbols (e.g. TCS -> TCS.NS) or company names automatically."""
    _load_nse_securities()
    cleaned = raw_ticker.strip().upper()
    if "." in cleaned or "-" in cleaned or "^" in cleaned:
        return cleaned
    if cleaned in _NSE_SYMBOL_MAP:
        return _NSE_SYMBOL_MAP[cleaned]
    # Check if user typed a company name matching an NSE security
    for item in _NSE_SECURITIES:
        if cleaned == item["name"].upper():
            return item["symbol"]
    return cleaned


def _prepare_config(req: AnalyzeRequest, resolved_ticker: str = "") -> dict:
    load_dotenv(ENV_FILE, override=True)
    if req.google_api_key and req.google_api_key.strip():
        cleaned = req.google_api_key.strip()
        os.environ["GOOGLE_API_KEY"] = cleaned
        try:
            set_key(str(ENV_FILE), "GOOGLE_API_KEY", cleaned)
        except Exception:
            pass

    if not os.getenv("GOOGLE_API_KEY", "").strip():
        raise ValueError("Missing Gemini API Key (GOOGLE_API_KEY). Please enter your Gemini API Key in the settings panel.")

    config = build_default_config()
    config["llm_provider"] = "google"
    config["quick_think_llm"] = req.quick_think_llm.strip() or "gemini-3.5-flash-lite"
    config["deep_think_llm"] = req.deep_think_llm.strip() or "gemini-2.5-flash"
    config["max_debate_rounds"] = max(1, min(3, req.research_depth))
    config["max_risk_discuss_rounds"] = max(1, min(3, req.research_depth))
    config["max_tool_rounds"] = 4
    # For non-US tickers (.NS, .BO, etc.), use yfinance directly for fundamentals
    # instead of querying US SEC EDGAR first.
    if resolved_ticker.endswith(".NS") or resolved_ticker.endswith(".BO"):
        config["data_vendors"] = dict(config.get("data_vendors") or {})
        config["data_vendors"]["fundamental_data"] = "yfinance"
    config["results_dir"] = str(DATA_DIR / "results")
    config["data_cache_dir"] = str(DATA_DIR / "cache")
    config["memory_log_path"] = str(DATA_DIR / "memory" / "trading_memory.md")
    config["checkpoint_enabled"] = False
    return config


@app.post("/api/trading-agent/stream")
async def stream_analysis(req: AnalyzeRequest):
    """Stream multi-agent execution events and live reports via Server-Sent Events (SSE)."""
    raw_ticker = req.ticker.strip().upper()
    if not raw_ticker:
        raise HTTPException(status_code=400, detail="Ticker symbol is required.")

    ticker = _resolve_ticker(raw_ticker)
    trade_date = (req.trade_date or datetime.now().strftime("%Y-%m-%d")).strip()
    valid_analysts = [a for a in ["market", "social", "news", "fundamentals"] if a in req.selected_analysts]
    if not valid_analysts:
        valid_analysts = ["market", "fundamentals"]

    try:
        config = _prepare_config(req, resolved_ticker=ticker)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    queue: asyncio.Queue = asyncio.Queue()
    loop = asyncio.get_running_loop()

    def push_event(event_type: str, payload: Dict[str, Any]):
        loop.call_soon_threadsafe(queue.put_nowait, {"event": event_type, "data": payload})

    def worker():
        start_time = time.time()
        try:
            push_event("log", {
                "timestamp": datetime.now().strftime("%H:%M:%S"),
                "type": "System",
                "content": f"Initializing TradingAgentsGraph for {ticker} ({trade_date}) using Gemini ({config['quick_think_llm']} / {config['deep_think_llm']})...",
            })

            graph = TradingAgentsGraph(
                selected_analysts=valid_analysts,
                debug=True,
                config=config,
            )

            analyst_map = {
                "market": "Market Analyst",
                "social": "Sentiment Analyst",
                "news": "News Analyst",
                "fundamentals": "Fundamentals Analyst",
            }
            agent_status: Dict[str, str] = {}
            for k in valid_analysts:
                agent_status[analyst_map[k]] = "in_progress"
            for fixed in [
                "Bull Researcher", "Bear Researcher", "Research Manager",
                "Trader",
                "Aggressive Analyst", "Neutral Analyst", "Conservative Analyst",
                "Portfolio Manager",
            ]:
                agent_status[fixed] = "pending"

            push_event("status", {"agent_status": dict(agent_status)})

            init_state = graph.create_run_state(
                ticker, trade_date, asset_type=req.asset_type
            )
            args = graph.propagator.get_graph_args()

            processed_msg_ids = set()
            final_state: Dict[str, Any] = {}

            for messages, chunk in graph.stream_run(init_state, **args):
                # Process messages & tool calls
                for msg in messages:
                    msg_id = getattr(msg, "id", None)
                    if msg_id:
                        if msg_id in processed_msg_ids:
                            continue
                        processed_msg_ids.add(msg_id)

                    if hasattr(msg, "tool_calls") and msg.tool_calls:
                        for tc in msg.tool_calls:
                            tc_name = tc.get("name") if isinstance(tc, dict) else getattr(tc, "name", "tool")
                            tc_args = tc.get("args") if isinstance(tc, dict) else getattr(tc, "args", {})
                            args_preview = ", ".join(f"{k}={v}" for k, v in (tc_args or {}).items())
                            push_event("log", {
                                "timestamp": datetime.now().strftime("%H:%M:%S"),
                                "type": "Tool Call",
                                "content": f"{tc_name}({args_preview[:140]})",
                            })

                    content = getattr(msg, "content", "")
                    if isinstance(content, list):
                        content = " ".join(
                            b.get("text", "") if isinstance(b, dict) else str(b) for b in content
                        )
                    if isinstance(content, str) and content.strip():
                        push_event("log", {
                            "timestamp": datetime.now().strftime("%H:%M:%S"),
                            "type": "Agent",
                            "content": content.strip()[:280],
                        })

                if chunk is None:
                    continue

                final_state.update(chunk)

                # Update analyst completion
                if chunk.get("market_report") and "Market Analyst" in agent_status:
                    agent_status["Market Analyst"] = "completed"
                if chunk.get("sentiment_report") and "Sentiment Analyst" in agent_status:
                    agent_status["Sentiment Analyst"] = "completed"
                if chunk.get("news_report") and "News Analyst" in agent_status:
                    agent_status["News Analyst"] = "completed"
                if chunk.get("fundamentals_report") and "Fundamentals Analyst" in agent_status:
                    agent_status["Fundamentals Analyst"] = "completed"

                # Check if all selected analysts are done -> start Research Team
                analysts_done = all(
                    agent_status.get(analyst_map[k]) == "completed" for k in valid_analysts
                )
                if analysts_done and agent_status["Bull Researcher"] == "pending":
                    agent_status["Bull Researcher"] = "in_progress"
                    agent_status["Bear Researcher"] = "in_progress"

                # Research Debate State
                if chunk.get("investment_debate_state"):
                    deb = chunk["investment_debate_state"]
                    if deb.get("bull_history", "").strip() or deb.get("bear_history", "").strip():
                        agent_status["Bull Researcher"] = "in_progress"
                        agent_status["Bear Researcher"] = "in_progress"
                        agent_status["Research Manager"] = "in_progress"
                    if chunk.get("investment_plan", "").strip():
                        agent_status["Bull Researcher"] = "completed"
                        agent_status["Bear Researcher"] = "completed"
                        agent_status["Research Manager"] = "completed"
                        if agent_status["Trader"] == "pending":
                            agent_status["Trader"] = "in_progress"

                # Trader Plan
                if chunk.get("trader_investment_plan", "").strip():
                    agent_status["Trader"] = "completed"
                    if agent_status["Aggressive Analyst"] == "pending":
                        agent_status["Aggressive Analyst"] = "in_progress"
                        agent_status["Neutral Analyst"] = "in_progress"
                        agent_status["Conservative Analyst"] = "in_progress"

                # Risk Management Debate State
                if chunk.get("risk_debate_state"):
                    rdeb = chunk["risk_debate_state"]
                    if (
                        rdeb.get("aggressive_history", "").strip()
                        or rdeb.get("conservative_history", "").strip()
                        or rdeb.get("neutral_history", "").strip()
                    ):
                        agent_status["Aggressive Analyst"] = "in_progress"
                        agent_status["Neutral Analyst"] = "in_progress"
                        agent_status["Conservative Analyst"] = "in_progress"
                        agent_status["Portfolio Manager"] = "in_progress"

                if chunk.get("final_trade_decision", "").strip():
                    for k in agent_status:
                        agent_status[k] = "completed"

                push_event("state_update", {
                    "agent_status": dict(agent_status),
                    "reports": {
                        "market_report": final_state.get("market_report", ""),
                        "sentiment_report": final_state.get("sentiment_report", ""),
                        "news_report": final_state.get("news_report", ""),
                        "fundamentals_report": final_state.get("fundamentals_report", ""),
                        "investment_debate_state": final_state.get("investment_debate_state", {}),
                        "investment_plan": final_state.get("investment_plan", ""),
                        "trader_investment_plan": final_state.get("trader_investment_plan", ""),
                        "risk_debate_state": final_state.get("risk_debate_state", {}),
                        "final_trade_decision": final_state.get("final_trade_decision", ""),
                    },
                })

            # Finalize and save
            try:
                graph.record_decision(ticker, trade_date, final_state)
            except Exception as rec_err:
                logger.warning(f"record_decision warning: {rec_err}")

            rating = run_rating(final_state)
            elapsed = round(time.time() - start_time, 1)

            for k in agent_status:
                agent_status[k] = "completed"

            push_event("complete", {
                "ticker": ticker,
                "trade_date": trade_date,
                "final_rating": rating,
                "elapsed_seconds": elapsed,
                "agent_status": agent_status,
                "reports": {
                    "market_report": final_state.get("market_report", ""),
                    "sentiment_report": final_state.get("sentiment_report", ""),
                    "news_report": final_state.get("news_report", ""),
                    "fundamentals_report": final_state.get("fundamentals_report", ""),
                    "investment_debate_state": final_state.get("investment_debate_state", {}),
                    "investment_plan": final_state.get("investment_plan", ""),
                    "trader_investment_plan": final_state.get("trader_investment_plan", ""),
                    "risk_debate_state": final_state.get("risk_debate_state", {}),
                    "final_trade_decision": final_state.get("final_trade_decision", ""),
                },
            })
        except Exception as exc:
            logger.error(f"TradingAgent stream error: {exc}\n{traceback.format_exc()}")
            push_event("error", {"detail": str(exc)})
        finally:
            loop.call_soon_threadsafe(queue.put_nowait, None)

    threading.Thread(target=worker, daemon=True).start()

    async def event_generator():
        while True:
            item = await queue.get()
            if item is None:
                break
            yield f"data: {json.dumps(item, default=str)}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


if __name__ == "__main__":
    import uvicorn

    port = int(os.getenv("TRADING_AGENT_PORT", "8001"))
    logger.info(f"Starting KSB Trading Agent Microservice on http://127.0.0.1:{port}")
    uvicorn.run(app, host="0.0.0.0", port=port)
