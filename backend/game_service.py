import os
import sqlite3
import json
import logging
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional, Tuple
import yfinance as yf

from database import DB_PATH, get_user
from symbol_mapper import mapper

logger = logging.getLogger(__name__)

# Game Configuration Defaults
STARTING_CAPITAL = 0.0
EXPOSURE_CAP = 50000.0
INTEREST_RATE_MONTHLY = 0.01
SLIPPAGE_RATE = 0.001
BUST_THRESHOLD = 0.0

def get_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn

# ── Helper: Live Price Fetch ──────────────────────────────────────────────────

def get_live_price(symbol: str) -> float:
    """Fetch the latest closing price of a stock using a fast yfinance history query."""
    ticker_symbol = symbol.upper().strip()
    if not ticker_symbol.endswith(".NS") and "^" not in ticker_symbol:
        ticker_symbol = f"{ticker_symbol}.NS"
    
    ticker = yf.Ticker(ticker_symbol)
    try:
        # Fetch last 1 day of data
        hist = ticker.history(period="1d")
        if not hist.empty:
            return float(hist["Close"].iloc[-1])
    except Exception as e:
        logger.warning(f"Fast price history fetch failed for {ticker_symbol}: {e}")

    # Fallback to info block
    try:
        info = ticker.info
        price = info.get("regularMarketPrice") or info.get("currentPrice") or info.get("previousClose")
        if price:
            return float(price)
    except Exception as e:
        logger.error(f"yfinance info price fetch failed for {ticker_symbol}: {e}")
        
    raise ValueError(f"Could not retrieve live price for {ticker_symbol}")

# ── Helper: Market Hours Check ────────────────────────────────────────────────

def is_market_open() -> bool:
    """
    Checks if the Indian stock market (BSE/NSE) is currently open.
    Trading hours: Monday to Friday, 9:15 AM to 3:30 PM IST (Asia/Kolkata).
    """
    import pytz
    ist = pytz.timezone('Asia/Kolkata')
    now_ist = datetime.now(timezone.utc).astimezone(ist)
    
    # Check weekday (0 = Monday, 6 = Sunday)
    if now_ist.weekday() >= 5:
        return False
        
    # Check time: 9:15 AM to 3:30 PM
    market_start = now_ist.replace(hour=9, minute=15, second=0, microsecond=0)
    market_end = now_ist.replace(hour=15, minute=30, second=0, microsecond=0)
    
    return market_start <= now_ist <= market_end

# ── Service Operations ────────────────────────────────────────────────────────

def accrue_interest_lazy(portfolio_id: int, conn: sqlite3.Connection) -> None:
    """
    Lazy accrual of loan interest.
    Accrues interest pro-rata on outstanding principal since the last update.
    Formula: interest = principal * (0.01 / 30) * days_elapsed
    """
    row = conn.execute("""
        SELECT loan_principal, accrued_interest, last_interest_accrual 
        FROM game_portfolios WHERE id = ?
    """, (portfolio_id,)).fetchone()
    
    if not row or row["loan_principal"] <= 0:
        return
        
    principal = row["loan_principal"]
    accrued = row["accrued_interest"]
    last_accrual_str = row["last_interest_accrual"]
    
    try:
        cleaned_str = last_accrual_str.replace("Z", "+00:00").replace(" ", "T")
        last_accrual = datetime.fromisoformat(cleaned_str)
        if last_accrual.tzinfo is not None:
            last_accrual = last_accrual.replace(tzinfo=None)
    except ValueError:
        # Fallback if parsing fails
        last_accrual = datetime.now(timezone.utc).replace(tzinfo=None)
        
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    seconds_elapsed = (now - last_accrual).total_seconds()
    
    # Prevent negative time updates
    if seconds_elapsed <= 0:
        return
        
    days_elapsed = seconds_elapsed / 86400.0
    interest_increment = principal * (INTEREST_RATE_MONTHLY / 30.0) * days_elapsed
    new_accrued = accrued + interest_increment
    
    conn.execute("""
        UPDATE game_portfolios 
        SET accrued_interest = ?, last_interest_accrual = ?, updated_at = datetime('now')
        WHERE id = ?
    """, (new_accrued, now.isoformat(), portfolio_id))
    
    # Record in transaction log if increment is meaningful (> 0.01) to keep audit trail
    if interest_increment >= 0.01:
        conn.execute("""
            INSERT INTO game_transactions (portfolio_id, type, amount, timestamp)
            VALUES (?, 'INTEREST_ACCRUAL', ?, datetime('now'))
        """, (portfolio_id, -interest_increment))

def process_pending_orders(portfolio_id: int, conn: sqlite3.Connection):
    """Processes any queued off-hours orders if the market is currently open."""
    if not is_market_open():
        return
        
    rows = conn.execute("""
        SELECT * FROM game_pending_orders WHERE portfolio_id = ?
    """, (portfolio_id,)).fetchall()
    
    if not rows:
        return
        
    for r in rows:
        order_id = r["id"]
        action = r["type"]
        symbol = r["symbol"]
        company_name = r["company_name"]
        quantity = r["quantity"]
        
        try:
            # Fetch opening price of current day
            import yfinance as yf
            ticker = yf.Ticker(symbol)
            hist = ticker.history(period="1d")
            if hist.empty:
                logger.warning(f"No history found for {symbol} when processing pending order.")
                continue
                
            open_price = float(hist["Open"].iloc[0])
            if open_price <= 0:
                open_price = float(hist["Close"].iloc[0])
                
            trade_value = open_price * quantity
            fee = trade_value * SLIPPAGE_RATE
            
            # Reload portfolio cash
            portfolio = conn.execute("SELECT cash FROM game_portfolios WHERE id = ?", (portfolio_id,)).fetchone()
            cash = portfolio["cash"]
            
            if action == "BUY":
                total_cost = trade_value + fee
                if cash < total_cost:
                    # Log failed transaction
                    conn.execute("""
                        INSERT INTO game_transactions (portfolio_id, type, symbol, quantity, price, fee, amount)
                        VALUES (?, 'BUY_FAILED', ?, ?, ?, ?, 0.0)
                    """, (portfolio_id, symbol, quantity, open_price, fee))
                    logger.warning(f"Pending BUY order failed for {symbol}: Insufficient funds (required: {total_cost}, available: {cash})")
                else:
                    new_cash = cash - total_cost
                    conn.execute("UPDATE game_portfolios SET cash = ?, updated_at = datetime('now') WHERE id = ?", (new_cash, portfolio_id))
                    
                    # Upsert holding
                    holding = conn.execute("""
                        SELECT * FROM game_holdings WHERE portfolio_id = ? AND symbol = ?
                    """, (portfolio_id, symbol)).fetchone()
                    
                    if holding:
                        current_qty = holding["quantity"]
                        current_avg = holding["average_buy_price"]
                        new_qty = current_qty + quantity
                        new_avg = ((current_qty * current_avg) + (quantity * open_price)) / new_qty
                        
                        conn.execute("""
                            UPDATE game_holdings SET quantity = ?, average_buy_price = ?, created_at = datetime('now') WHERE id = ?
                        """, (new_qty, new_avg, holding["id"]))
                    else:
                        conn.execute("""
                            INSERT INTO game_holdings (portfolio_id, symbol, company_name, quantity, average_buy_price)
                            VALUES (?, ?, ?, ?, ?)
                        """, (portfolio_id, symbol, company_name, quantity, open_price))
                        
                    # Log transaction
                    conn.execute("""
                        INSERT INTO game_transactions (portfolio_id, type, symbol, quantity, price, fee, amount)
                        VALUES (?, 'BUY', ?, ?, ?, ?, ?)
                    """, (portfolio_id, symbol, quantity, open_price, fee, -total_cost))
                    
            elif action == "SELL":
                # Check holding
                holding = conn.execute("""
                    SELECT * FROM game_holdings WHERE portfolio_id = ? AND symbol = ?
                """, (portfolio_id, symbol)).fetchone()
                
                if not holding or holding["quantity"] < quantity:
                    # Log failed transaction
                    conn.execute("""
                        INSERT INTO game_transactions (portfolio_id, type, symbol, quantity, price, fee, amount)
                        VALUES (?, 'SELL_FAILED', ?, ?, ?, ?, 0.0)
                    """, (portfolio_id, symbol, quantity, open_price, fee))
                    logger.warning(f"Pending SELL order failed for {symbol}: Insufficient shares.")
                else:
                    total_credit = trade_value - fee
                    new_cash = cash + total_credit
                    conn.execute("UPDATE game_portfolios SET cash = ?, updated_at = datetime('now') WHERE id = ?", (new_cash, portfolio_id))
                    
                    current_qty = holding["quantity"]
                    if current_qty == quantity:
                        conn.execute("DELETE FROM game_holdings WHERE id = ?", (holding["id"],))
                    else:
                        conn.execute("UPDATE game_holdings SET quantity = ? WHERE id = ?", (current_qty - quantity, holding["id"]))
                        
                    # Log transaction
                    conn.execute("""
                        INSERT INTO game_transactions (portfolio_id, type, symbol, quantity, price, fee, amount)
                        VALUES (?, 'SELL', ?, ?, ?, ?, ?)
                    """, (portfolio_id, symbol, quantity, open_price, fee, total_credit))
            
            # Delete order from queue
            conn.execute("DELETE FROM game_pending_orders WHERE id = ?", (order_id,))
            
        except Exception as e:
            logger.error(f"Error processing pending order {order_id} for {symbol}: {e}")

def get_portfolio_summary(user_id: str) -> Dict[str, Any]:
    """Retrieves or creates the user's active game portfolio, computing live valuation."""
    with get_conn() as conn:
        # 1. Fetch active portfolio
        row = conn.execute("""
            SELECT * FROM game_portfolios WHERE user_id = ? AND is_active = 1
        """, (user_id,)).fetchone()
        
        if not row:
            # Create first season portfolio with 0 starting cash and 0 starting loan
            conn.execute("""
                INSERT INTO game_portfolios (user_id, season, cash, loan_principal)
                VALUES (?, 1, 0.0, 0.0)
            """, (user_id,))
            conn.commit()
            
            row = conn.execute("""
                SELECT * FROM game_portfolios WHERE user_id = ? AND is_active = 1
            """, (user_id,)).fetchone()
            
        portfolio = dict(row)
        portfolio_id = portfolio["id"]
        
        # Upgrade migration to zero starting capital model
        if portfolio["cash"] in [50000.0, 60000.0] and portfolio["loan_principal"] in [0.0, 10000.0]:
            holdings_count = conn.execute("SELECT COUNT(*) as count FROM game_holdings WHERE portfolio_id = ?", (portfolio_id,)).fetchone()["count"]
            tx_count = conn.execute("SELECT COUNT(*) as count FROM game_transactions WHERE portfolio_id = ?", (portfolio_id,)).fetchone()["count"]
            if holdings_count == 0 and tx_count <= 1:
                conn.execute("""
                    UPDATE game_portfolios 
                    SET cash = 0.0, loan_principal = 0.0, last_interest_accrual = datetime('now')
                    WHERE id = ?
                """, (portfolio_id,))
                conn.execute("DELETE FROM game_transactions WHERE portfolio_id = ?", (portfolio_id,))
                conn.commit()
                # Reload portfolio dict
                row = conn.execute("SELECT * FROM game_portfolios WHERE id = ?", (portfolio_id,)).fetchone()
                portfolio = dict(row)
        
        # Process any pending orders if market is open
        process_pending_orders(portfolio_id, conn)
        conn.commit()
        
        # Reload after processing pending orders & accrual
        row = conn.execute("SELECT * FROM game_portfolios WHERE id = ?", (portfolio_id,)).fetchone()
        portfolio = dict(row)
        
        # 2. Accrue interest up to the current second
        accrue_interest_lazy(portfolio_id, conn)
        conn.commit()
        
        # Reload after accrual
        row = conn.execute("SELECT * FROM game_portfolios WHERE id = ?", (portfolio_id,)).fetchone()
        portfolio = dict(row)
        
        # 3. Calculate current market value of holdings
        holdings = conn.execute("""
            SELECT symbol, quantity FROM game_holdings WHERE portfolio_id = ?
        """, (portfolio_id,)).fetchall()
        
        holdings_value = 0.0
        for h in holdings:
            try:
                price = get_live_price(h["symbol"])
                holdings_value += price * h["quantity"]
            except Exception as e:
                logger.error(f"Error valuing holding {h['symbol']}: {e}")
                
        # 4. Calculate Net Worth (loan is not subtracted from net worth assets)
        cash = portfolio["cash"]
        loan = portfolio["loan_principal"]
        interest = portfolio["accrued_interest"]
        net_worth = cash + holdings_value - interest
        
        # Calculate P&L for this season (own capital is net worth minus loan principal)
        season_pnl = net_worth - loan - STARTING_CAPITAL
        
        # Calculate Lifetime P&L (closed past seasons final return + current season return)
        past_seasons = conn.execute("""
            SELECT cash, loan_principal, accrued_interest, is_active FROM game_portfolios 
            WHERE user_id = ? AND is_active = 0
        """, (user_id,)).fetchall()
        
        lifetime_pnl = season_pnl
        for ps in past_seasons:
            # For closed seasons, net worth at close is stored in the final cash balance 
            # (since holdings were liquidated, and loan/interest settled upon restart).
            lifetime_pnl += (ps["cash"] - STARTING_CAPITAL)
            
        loan_headroom = max(0.0, (EXPOSURE_CAP - STARTING_CAPITAL) - loan)
        
        return {
            "id": portfolio_id,
            "season": portfolio["season"],
            "cash": cash,
            "loan_principal": loan,
            "accrued_interest": interest,
            "holdings_value": holdings_value,
            "net_worth": net_worth,
            "season_pnl": season_pnl,
            "lifetime_pnl": lifetime_pnl,
            "loan_headroom": loan_headroom,
            "is_bust": (net_worth < BUST_THRESHOLD) or (net_worth == BUST_THRESHOLD and (loan > 0.0 or holdings_value > 0.0))
        }

def restart_portfolio(user_id: str) -> int:
    """Closes the current active season, records its P&L, and starts a fresh season."""
    with get_conn() as conn:
        current = conn.execute("""
            SELECT * FROM game_portfolios WHERE user_id = ? AND is_active = 1
        """, (user_id,)).fetchone()
        
        if not current:
            raise ValueError("No active portfolio to restart.")
            
        portfolio_id = current["id"]
        season = current["season"]
        
        # 1. Accrue final interest
        accrue_interest_lazy(portfolio_id, conn)
        
        # Fetch current status
        row = conn.execute("SELECT * FROM game_portfolios WHERE id = ?", (portfolio_id,)).fetchone()
        cash = row["cash"]
        loan = row["loan_principal"]
        interest = row["accrued_interest"]
        
        # 2. Value and liquidate all holdings
        holdings = conn.execute("SELECT * FROM game_holdings WHERE portfolio_id = ?", (portfolio_id,)).fetchall()
        holdings_value = 0.0
        for h in holdings:
            try:
                price = get_live_price(h["symbol"])
                holdings_value += price * h["quantity"]
            except Exception as e:
                logger.error(f"Error valuing holding {h['symbol']} on restart: {e}")
                
        # Net worth at the moment of restart (own capital to archive is net worth minus loan principal)
        final_net_worth = cash + holdings_value - interest - loan
        
        # 3. Clean up database state for old portfolio
        # Delete holdings for this old season (since they are liquidated)
        conn.execute("DELETE FROM game_holdings WHERE portfolio_id = ?", (portfolio_id,))
        
        # Save final liquidated net worth as the cash field of this closed season 
        # so that lifetime_pnl formula works cleanly.
        conn.execute("""
            UPDATE game_portfolios 
            SET is_active = 0, cash = ?, loan_principal = 0.0, accrued_interest = 0.0, updated_at = datetime('now')
            WHERE id = ?
        """, (final_net_worth, portfolio_id))
        
        # 4. Insert new season portfolio with 0 starting cash and 0 starting loan
        new_season = season + 1
        conn.execute("""
            INSERT INTO game_portfolios (user_id, season, cash, loan_principal)
            VALUES (?, ?, 0.0, 0.0)
        """, (user_id, new_season))
        
        conn.commit()
        return new_season

def get_holdings_list(user_id: str) -> List[Dict[str, Any]]:
    """Returns the active holdings list for the user with live valuations."""
    with get_conn() as conn:
        portfolio = conn.execute("""
            SELECT id FROM game_portfolios WHERE user_id = ? AND is_active = 1
        """, (user_id,)).fetchone()
        
        if not portfolio:
            return []
            
        portfolio_id = portfolio["id"]
        
        # Process pending orders
        process_pending_orders(portfolio_id, conn)
        conn.commit()
        
        rows = conn.execute("""
            SELECT * FROM game_holdings WHERE portfolio_id = ?
        """, (portfolio_id,)).fetchall()
        
        holdings = []
        for r in rows:
            symbol = r["symbol"]
            qty = r["quantity"]
            avg_price = r["average_buy_price"]
            
            try:
                current_price = get_live_price(symbol)
            except Exception:
                current_price = avg_price # Fallback to cost
                
            market_value = qty * current_price
            cost_basis = qty * avg_price
            unrealized_pnl = market_value - cost_basis
            unrealized_pnl_pct = (unrealized_pnl / cost_basis * 100) if cost_basis else 0.0
            
            # Fetch daily price change percent (for green/red indicator)
            try:
                ticker = yf.Ticker(symbol)
                hist = ticker.history(period="2d")
                if len(hist) > 1:
                    prev_close = hist["Close"].iloc[-2]
                    change_pct = ((current_price - prev_close) / prev_close) * 100
                else:
                    change_pct = 0.0
            except Exception:
                change_pct = 0.0
                
            holdings.append({
                "symbol": symbol,
                "company_name": r["company_name"],
                "quantity": qty,
                "average_buy_price": avg_price,
                "current_price": current_price,
                "market_value": market_value,
                "unrealized_pnl_value": unrealized_pnl,
                "unrealized_pnl_percent": unrealized_pnl_pct,
                "change_percent": change_pct
            })
            
        return holdings

def execute_trade(user_id: str, symbol: str, action: str, quantity: int) -> Dict[str, Any]:
    """Places a BUY or SELL trade at the live market price, or queues it if off-hours."""
    if quantity <= 0:
        raise ValueError("Quantity must be greater than zero.")
        
    action_upper = action.upper().strip()
    if action_upper not in ["BUY", "SELL"]:
        raise ValueError("Invalid trade action. Must be BUY or SELL.")
        
    # Resolve symbol first using mapper overrides / lookup
    try:
        resolved_symbol, company_name, _ = mapper.resolve_isin("", symbol_hint=symbol)
    except Exception:
        # Fallback to direct resolution
        resolved_symbol = symbol.upper().strip()
        if not resolved_symbol.endswith(".NS") and "^" not in resolved_symbol:
            resolved_symbol = f"{resolved_symbol}.NS"
        company_name = resolved_symbol

    if not is_market_open():
        # Place off-hours order queued!
        with get_conn() as conn:
            portfolio = conn.execute("""
                SELECT * FROM game_portfolios WHERE user_id = ? AND is_active = 1
            """, (user_id,)).fetchone()
            
            if not portfolio:
                raise ValueError("No active portfolio session found.")
                
            portfolio_id = portfolio["id"]
            cash = portfolio["cash"]
            
            # Fetch latest price to estimate and run basic checks
            price = get_live_price(resolved_symbol)
            estimated_value = price * quantity
            estimated_fee = estimated_value * SLIPPAGE_RATE
            
            if action_upper == "BUY":
                total_cost = estimated_value + estimated_fee
                if cash < total_cost:
                    raise ValueError(f"Insufficient funds for off-hours order. Estimated cost: ₹{total_cost:,.2f}, Available cash: ₹{cash:,.2f}")
            else: # SELL
                # Check active holdings minus any queued sells
                holding = conn.execute("""
                    SELECT quantity FROM game_holdings WHERE portfolio_id = ? AND symbol = ?
                """, (portfolio_id, resolved_symbol)).fetchone()
                
                queued_qty = conn.execute("""
                    SELECT SUM(quantity) as total FROM game_pending_orders 
                    WHERE portfolio_id = ? AND symbol = ? AND type = 'SELL'
                """, (portfolio_id, resolved_symbol)).fetchone()
                
                total_queued = queued_qty["total"] if queued_qty and queued_qty["total"] else 0
                held = holding["quantity"] if holding else 0
                
                if held - total_queued < quantity:
                    raise ValueError(f"Insufficient shares for off-hours sell. Held: {held}, Already queued: {total_queued}, Requested: {quantity}")
            
            # Queue order
            conn.execute("""
                INSERT INTO game_pending_orders (portfolio_id, type, symbol, company_name, quantity)
                VALUES (?, ?, ?, ?, ?)
            """, (portfolio_id, action_upper, resolved_symbol, company_name, quantity))
            conn.commit()
            
            return {
                "success": True,
                "message": f"Off-hours {action_upper} order for {quantity} shares of {resolved_symbol} placed. It will be executed at the market opening price."
            }

    # Live market execution
    with get_conn() as conn:
        portfolio = conn.execute("""
            SELECT * FROM game_portfolios WHERE user_id = ? AND is_active = 1
        """, (user_id,)).fetchone()
        
        if not portfolio:
            raise ValueError("No active portfolio session found.")
            
        portfolio_id = portfolio["id"]
        
        # First process any pending orders that have just opened
        process_pending_orders(portfolio_id, conn)
        
        # Reload portfolio cash after processing pending
        portfolio = conn.execute("SELECT * FROM game_portfolios WHERE id = ?", (portfolio_id,)).fetchone()
        cash = portfolio["cash"]
        
        price = get_live_price(resolved_symbol)
        trade_value = price * quantity
        fee = trade_value * SLIPPAGE_RATE
        
        if action_upper == "BUY":
            total_cost = trade_value + fee
            if cash < total_cost:
                raise ValueError(f"Insufficient funds. Required: ₹{total_cost:,.2f}, Available: ₹{cash:,.2f}")
                
            # Deduct cash
            new_cash = cash - total_cost
            conn.execute("""
                UPDATE game_portfolios SET cash = ?, updated_at = datetime('now') WHERE id = ?
            """, (new_cash, portfolio_id))
            
            # Check existing position
            holding = conn.execute("""
                SELECT * FROM game_holdings WHERE portfolio_id = ? AND symbol = ?
            """, (portfolio_id, resolved_symbol)).fetchone()
            
            if holding:
                current_qty = holding["quantity"]
                current_avg = holding["average_buy_price"]
                new_qty = current_qty + quantity
                # Average price is pure execution cost basis (excluding transaction fees)
                new_avg = ((current_qty * current_avg) + (quantity * price)) / new_qty
                
                conn.execute("""
                    UPDATE game_holdings SET quantity = ?, average_buy_price = ?, created_at = datetime('now')
                    WHERE id = ?
                """, (new_qty, new_avg, holding["id"]))
            else:
                conn.execute("""
                    INSERT INTO game_holdings (portfolio_id, symbol, company_name, quantity, average_buy_price)
                    VALUES (?, ?, ?, ?, ?)
                """, (portfolio_id, resolved_symbol, company_name, quantity, price))
                
            # Log transaction
            cursor = conn.execute("""
                INSERT INTO game_transactions (portfolio_id, type, symbol, quantity, price, fee, amount)
                VALUES (?, 'BUY', ?, ?, ?, ?, ?)
            """, (portfolio_id, resolved_symbol, quantity, price, fee, -total_cost))
            
            conn.commit()
            return {
                "success": True,
                "message": f"Successfully bought {quantity} shares of {resolved_symbol}",
                "transaction_id": cursor.lastrowid
            }
            
        else: # SELL
            # Check position
            holding = conn.execute("""
                SELECT * FROM game_holdings WHERE portfolio_id = ? AND symbol = ?
            """, (portfolio_id, resolved_symbol)).fetchone()
            
            if not holding or holding["quantity"] < quantity:
                raise ValueError(f"Short-selling is rejected. You hold {holding['quantity'] if holding else 0} shares.")
                
            total_credit = trade_value - fee
            new_cash = cash + total_credit
            conn.execute("""
                UPDATE game_portfolios SET cash = ?, updated_at = datetime('now') WHERE id = ?
            """, (new_cash, portfolio_id))
            
            current_qty = holding["quantity"]
            if current_qty == quantity:
                conn.execute("DELETE FROM game_holdings WHERE id = ?", (holding["id"],))
            else:
                conn.execute("""
                    UPDATE game_holdings SET quantity = ? WHERE id = ?
                """, (current_qty - quantity, holding["id"]))
                
            # Log transaction
            cursor = conn.execute("""
                INSERT INTO game_transactions (portfolio_id, type, symbol, quantity, price, fee, amount)
                VALUES (?, 'SELL', ?, ?, ?, ?, ?)
            """, (portfolio_id, resolved_symbol, quantity, price, fee, total_credit))
            
            conn.commit()
            return {
                "success": True,
                "message": f"Successfully sold {quantity} shares of {resolved_symbol}",
                "transaction_id": cursor.lastrowid
            }

def draw_loan_funds(user_id: str, amount: float) -> Dict[str, Any]:
    """Draws virtual cash for leverage, validating against the ₹1,00,000 exposure cap."""
    if amount <= 0:
        raise ValueError("Borrowing amount must be greater than zero.")
        
    with get_conn() as conn:
        portfolio = conn.execute("""
            SELECT * FROM game_portfolios WHERE user_id = ? AND is_active = 1
        """, (user_id,)).fetchone()
        
        if not portfolio:
            raise ValueError("No active portfolio session found.")
            
        portfolio_id = portfolio["id"]
        cash = portfolio["cash"]
        loan = portfolio["loan_principal"]
        
        # Recalculate interest before changing loan terms
        accrue_interest_lazy(portfolio_id, conn)
        
        # Reload portfolio row
        row = conn.execute("SELECT * FROM game_portfolios WHERE id = ?", (portfolio_id,)).fetchone()
        cash = row["cash"]
        loan = row["loan_principal"]
        
        # Validate Cap: loan principal cannot exceed ₹50,000 (exposure ₹1,00,000 cap inclusive of ₹50,000 capital)
        max_loan_allowed = EXPOSURE_CAP - STARTING_CAPITAL
        if loan + amount > max_loan_allowed:
            raise ValueError(f"Borrowing cap breached. Maximum loan headroom is ₹{max_loan_allowed - loan:,.2f}")
            
        # Draw loan
        new_cash = cash + amount
        new_loan = loan + amount
        
        conn.execute("""
            UPDATE game_portfolios 
            SET cash = ?, loan_principal = ?, last_interest_accrual = datetime('now'), updated_at = datetime('now')
            WHERE id = ?
        """, (new_cash, new_loan, portfolio_id))
        
        conn.execute("""
            INSERT INTO game_transactions (portfolio_id, type, amount)
            VALUES (?, 'LOAN_DRAW', ?)
        """, (portfolio_id, amount))
        
        conn.commit()
        return {
            "success": True,
            "cash": new_cash,
            "loan_principal": new_loan
        }

def repay_loan_funds(user_id: str, amount: float) -> Dict[str, Any]:
    """Repays outstanding loan principal from available cash."""
    if amount <= 0:
        raise ValueError("Repayment amount must be greater than zero.")
        
    with get_conn() as conn:
        portfolio = conn.execute("""
            SELECT * FROM game_portfolios WHERE user_id = ? AND is_active = 1
        """, (user_id,)).fetchone()
        
        if not portfolio:
            raise ValueError("No active portfolio session found.")
            
        portfolio_id = portfolio["id"]
        cash = portfolio["cash"]
        loan = portfolio["loan_principal"]
        accrued_interest = portfolio["accrued_interest"]
        
        # Recalculate interest before changing loan terms
        accrue_interest_lazy(portfolio_id, conn)
        
        # Reload portfolio row
        row = conn.execute("SELECT * FROM game_portfolios WHERE id = ?", (portfolio_id,)).fetchone()
        cash = row["cash"]
        loan = row["loan_principal"]
        accrued_interest = row["accrued_interest"]
        
        if amount > cash:
            raise ValueError(f"Insufficient cash for repayment. Available cash: ₹{cash:,.2f}")
            
        total_debt = loan + accrued_interest
        if amount > total_debt:
            raise ValueError(f"Repayment amount (₹{amount:,.2f}) exceeds total outstanding debt (₹{total_debt:,.2f})")
            
        # We allow paying off principal first (to stop interest accumulation),
        # but if the principal is paid to 0, excess payment reduces accrued interest.
        repay_to_principal = min(amount, loan)
        repay_to_interest = 0.0
        
        if amount > repay_to_principal:
            repay_to_interest = min(amount - repay_to_principal, accrued_interest)
            
        total_repaid = repay_to_principal + repay_to_interest
        if total_repaid <= 0:
            raise ValueError("No outstanding loan debt or interest to repay.")
            
        new_cash = cash - total_repaid
        new_loan = loan - repay_to_principal
        new_interest = accrued_interest - repay_to_interest
        
        conn.execute("""
            UPDATE game_portfolios 
            SET cash = ?, loan_principal = ?, accrued_interest = ?, last_interest_accrual = datetime('now'), updated_at = datetime('now')
            WHERE id = ?
        """, (new_cash, new_loan, new_interest, portfolio_id))
        
        conn.execute("""
            INSERT INTO game_transactions (portfolio_id, type, amount)
            VALUES (?, 'LOAN_REPAY', ?)
        """, (portfolio_id, -total_repaid))
        
        conn.commit()
        return {
            "success": True,
            "cash": new_cash,
            "loan_principal": new_loan,
            "accrued_interest": new_interest
        }

def get_transaction_history(user_id: str) -> List[Dict[str, Any]]:
    """Returns the active season transaction history ledger."""
    with get_conn() as conn:
        portfolio = conn.execute("""
            SELECT id FROM game_portfolios WHERE user_id = ? AND is_active = 1
        """, (user_id,)).fetchone()
        
        if not portfolio:
            return []
            
        portfolio_id = portfolio["id"]
        
        # Process pending orders
        process_pending_orders(portfolio_id, conn)
        conn.commit()
        
        rows = conn.execute("""
            SELECT * FROM game_transactions WHERE portfolio_id = ? ORDER BY id DESC
        """, (portfolio_id,)).fetchall()
        
        return [dict(r) for r in rows]

# ── Equity Curve Snapshot Logic ────────────────────────────────────────────────

def save_daily_snapshot_job() -> None:
    """System-level job to take equity curve snapshots for all active portfolios."""
    with get_conn() as conn:
        active_portfolios = conn.execute("SELECT id, cash, loan_principal, accrued_interest FROM game_portfolios WHERE is_active = 1").fetchall()
        today = datetime.now(timezone.utc).strftime('%Y-%m-%d')
        
        for p in active_portfolios:
            portfolio_id = p["id"]
            cash = p["cash"]
            loan = p["loan_principal"]
            interest = p["accrued_interest"]
            
            # Recalculate interest
            accrue_interest_lazy(portfolio_id, conn)
            
            # Value holdings
            holdings = conn.execute("SELECT symbol, quantity FROM game_holdings WHERE portfolio_id = ?", (portfolio_id,)).fetchall()
            holdings_value = 0.0
            for h in holdings:
                try:
                    price = get_live_price(h["symbol"])
                    holdings_value += price * h["quantity"]
                except Exception:
                    pass
                    
            net_worth = cash + holdings_value - interest
            
            # Insert daily snapshot
            conn.execute("""
                INSERT INTO game_daily_snapshots (portfolio_id, date, cash, holdings_value, loan_principal, accrued_interest, net_worth)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(portfolio_id, date) DO UPDATE SET
                    cash = excluded.cash,
                    holdings_value = excluded.holdings_value,
                    loan_principal = excluded.loan_principal,
                    accrued_interest = excluded.accrued_interest,
                    net_worth = excluded.net_worth,
                    timestamp = datetime('now')
            """, (portfolio_id, today, cash, holdings_value, loan, interest, net_worth))
        conn.commit()

def lazy_backfill_snapshots(portfolio_id: int, conn: sqlite3.Connection) -> None:
    """
    Backfills missing daily snapshots for the active season.
    Uses historical yfinance data for holdings on missing dates.
    """
    portfolio = conn.execute("SELECT created_at, cash, loan_principal, accrued_interest FROM game_portfolios WHERE id = ?", (portfolio_id,)).fetchone()
    if not portfolio:
        return
        
    # Get creation date
    try:
        created_dt = datetime.fromisoformat(portfolio["created_at"].replace("Z", "+00:00"))
    except Exception:
        created_dt = datetime.now(timezone.utc)
        
    today = datetime.now(timezone.utc)
    
    # Calculate difference in days
    delta = today.date() - created_dt.date()
    if delta.days <= 0:
        return
        
    # Fetch existing snapshot dates
    existing = conn.execute("SELECT date FROM game_daily_snapshots WHERE portfolio_id = ?", (portfolio_id,)).fetchall()
    existing_dates = {e["date"] for e in existing}
    
    # Backfill missing dates
    from datetime import timedelta
    for d in range(delta.days + 1):
        snapshot_date = (created_dt + timedelta(days=d)).date().strftime('%Y-%m-%d')
        if snapshot_date in existing_dates or snapshot_date == today.strftime('%Y-%m-%d'):
            continue
            
        # For historical dates, we assume cash, loan, and interest were constant (simplification),
        # but holdings values are fetched dynamically using closing price on that date.
        holdings = conn.execute("SELECT symbol, quantity FROM game_holdings WHERE portfolio_id = ?", (portfolio_id,)).fetchall()
        holdings_value = 0.0
        
        for h in holdings:
            symbol = h["symbol"]
            qty = h["quantity"]
            
            try:
                # Fetch history around that date
                ticker = yf.Ticker(symbol)
                # fetch 3 days window to account for weekends/market holidays
                hist = ticker.history(start=snapshot_date, end=(datetime.strptime(snapshot_date, '%Y-%m-%d') + timedelta(days=3)).strftime('%Y-%m-%d'))
                if not hist.empty:
                    close_price = float(hist["Close"].iloc[0])
                    holdings_value += close_price * qty
            except Exception:
                pass
                
        # Calculate historical net worth
        cash = portfolio["cash"]
        loan = portfolio["loan_principal"]
        interest = portfolio["accrued_interest"]
        net_worth = cash + holdings_value - interest
        
        conn.execute("""
            INSERT OR IGNORE INTO game_daily_snapshots (portfolio_id, date, cash, holdings_value, loan_principal, accrued_interest, net_worth)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (portfolio_id, snapshot_date, cash, holdings_value, loan, interest, net_worth))

def get_equity_curve_snapshots(user_id: str) -> List[Dict[str, Any]]:
    """Returns the equity curve history for the active season, after running backfilling."""
    with get_conn() as conn:
        portfolio = conn.execute("""
            SELECT id FROM game_portfolios WHERE user_id = ? AND is_active = 1
        """, (user_id,)).fetchone()
        
        if not portfolio:
            return []
            
        portfolio_id = portfolio["id"]
        
        # 1. Backfill missing snapshots
        try:
            lazy_backfill_snapshots(portfolio_id, conn)
            conn.commit()
        except Exception as e:
            logger.error(f"Snapshot backfill failed: {e}")
            
        # 2. Return snapshots sorted chronologically
        rows = conn.execute("""
            SELECT * FROM game_daily_snapshots WHERE portfolio_id = ? ORDER BY date ASC
        """, (portfolio_id,)).fetchall()
        
        snapshots = [dict(r) for r in rows]
        
        # 3. Append today's live point dynamically at the end
        today_str = datetime.now(timezone.utc).strftime('%Y-%m-%d')
        if not any(s["date"] == today_str for s in snapshots):
            current_summary = get_portfolio_summary(user_id)
            snapshots.append({
                "date": today_str,
                "net_worth": current_summary["net_worth"],
                "cash": current_summary["cash"],
                "holdings_value": current_summary["holdings_value"],
                "loan_principal": current_summary["loan_principal"],
                "accrued_interest": current_summary["accrued_interest"]
            })
            
        return snapshots

# ── Leaderboard Stub Ranking ──────────────────────────────────────────────────

def get_leaderboard_stub() -> Dict[str, List[Dict[str, Any]]]:
    """Stub leaderboard database returns for phase 2 integration."""
    return {
        "by_season_return": [
            { "username": "Dr KS Bhoon", "return_percent": 18.25, "season": 1 },
            { "username": "Admin Test", "return_percent": 8.44, "season": 1 },
            { "username": "Beginner Trader", "return_percent": -3.12, "season": 2 }
        ],
        "by_lifetime_pnl": [
            { "username": "Dr KS Bhoon", "lifetime_pnl": 9125.0 },
            { "username": "Admin Test", "lifetime_pnl": 4220.0 },
            { "username": "Beginner Trader", "lifetime_pnl": -1560.0 }
        ]
    }
