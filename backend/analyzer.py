import logging
import numpy as np
import pandas as pd
import yfinance as yf
from typing import Dict, Any, Tuple, Optional

logger = logging.getLogger(__name__)

def calculate_rsi(prices: pd.Series, period: int = 14) -> pd.Series:
    """Calculate Relative Strength Index (RSI)."""
    delta = prices.diff()
    gain = (delta.where(delta > 0, 0)).copy()
    loss = (-delta.where(delta < 0, 0)).copy()
    
    avg_gain = gain.rolling(window=period, min_periods=period).mean()
    avg_loss = loss.rolling(window=period, min_periods=period).mean()
    
    # First values are simple averages, subsequent are smoothed (Wilder's EMA)
    for i in range(period, len(prices)):
        avg_gain.iloc[i] = (avg_gain.iloc[i - 1] * (period - 1) + gain.iloc[i]) / period
        avg_loss.iloc[i] = (avg_loss.iloc[i - 1] * (period - 1) + loss.iloc[i]) / period
        
    rs = avg_gain / avg_loss
    rsi = 100 - (100 / (1 + rs))
    return rsi

def calculate_macd(prices: pd.Series, fast: int = 12, slow: int = 26, signal: int = 9) -> Tuple[pd.Series, pd.Series, pd.Series]:
    """Calculate MACD Line, Signal Line, and Histogram."""
    fast_ema = prices.ewm(span=fast, adjust=False).mean()
    slow_ema = prices.ewm(span=slow, adjust=False).mean()
    macd_line = fast_ema - slow_ema
    signal_line = macd_line.ewm(span=signal, adjust=False).mean()
    histogram = macd_line - signal_line
    return macd_line, signal_line, histogram

class StockAnalyzer:
    @staticmethod
    def analyze_ticker(
        ticker_symbol: str, 
        is_etf: bool = False,
        weight_fundamental: float = 0.60,
        weight_technical: float = 0.40
    ) -> Dict[str, Any]:
        """Runs complete technical and fundamental analysis on a resolved ticker symbol."""
        logger.info(f"Analyzing {ticker_symbol} (is_etf={is_etf})...")
        
        try:
            ticker = yf.Ticker(ticker_symbol)
            info = ticker.info
            
            # Fetch 1 year of daily historical prices
            history = ticker.history(period="1y")
            if history.empty:
                raise ValueError(f"No historical price data returned for {ticker_symbol}")
                
            latest_close = float(history['Close'].iloc[-1])
            prev_close = float(history['Close'].iloc[-2]) if len(history) > 1 else latest_close
            daily_change = latest_close - prev_close
            daily_change_pct = (daily_change / prev_close) * 100 if prev_close else 0.0
            
            # 1. Technical Analysis
            tech_results = StockAnalyzer._calculate_technical_indicators(history, latest_close)
            
            # 2. Fundamental Analysis (Skip or customize for ETFs)
            fund_results = {}
            if not is_etf:
                fund_results = StockAnalyzer._analyze_fundamentals(info)
            else:
                fund_results = {
                    "is_applicable": False,
                    "score": 0.0,
                    "metrics": {},
                    "reasoning": ["Fundamental analysis is not applicable to ETFs/Index funds."]
                }
                
            # 3. Combine Scores and Generate Signal
            analysis_report = StockAnalyzer._generate_signal(
                ticker_symbol,
                info.get("longName") or ticker_symbol,
                is_etf,
                latest_close,
                daily_change,
                daily_change_pct,
                tech_results,
                fund_results,
                weight_fundamental,
                weight_technical,
                info
            )
            
            return analysis_report
            
        except Exception as e:
            logger.error(f"Error analyzing {ticker_symbol}: {e}", exc_info=True)
            return {
                "symbol": ticker_symbol,
                "error": str(e),
                "success": False
            }

    @staticmethod
    def _calculate_technical_indicators(history: pd.DataFrame, latest_close: float) -> Dict[str, Any]:
        """Calculates advanced technical indicators and converts them to signals."""
        prices = history['Close']
        volumes = history['Volume']
        
        # Calculate Moving Averages
        ema_20 = prices.ewm(span=20, adjust=False).mean()
        ema_50 = prices.ewm(span=50, adjust=False).mean()
        ema_200 = prices.ewm(span=200, adjust=False).mean()
        
        # Latest indicator values
        l_ema20 = float(ema_20.iloc[-1]) if len(ema_20) >= 20 else latest_close
        l_ema50 = float(ema_50.iloc[-1]) if len(ema_50) >= 50 else latest_close
        l_ema200 = float(ema_200.iloc[-1]) if len(ema_200) >= 200 else latest_close
        
        # RSI
        rsi_series = calculate_rsi(prices, period=14)
        latest_rsi = float(rsi_series.iloc[-1]) if not rsi_series.empty and not np.isnan(rsi_series.iloc[-1]) else 50.0
        
        # MACD
        macd_line, signal_line, histogram = calculate_macd(prices)
        latest_macd = float(macd_line.iloc[-1]) if not macd_line.empty else 0.0
        latest_macd_sig = float(signal_line.iloc[-1]) if not signal_line.empty else 0.0
        latest_macd_hist = float(histogram.iloc[-1]) if not histogram.empty else 0.0
        
        # Bollinger Bands
        bb_middle = prices.rolling(window=20).mean()
        bb_std = prices.rolling(window=20).std()
        bb_upper = bb_middle + (2 * bb_std)
        bb_lower = bb_middle - (2 * bb_std)
        
        l_bb_upper = float(bb_upper.iloc[-1]) if len(bb_upper) >= 20 else latest_close
        l_bb_middle = float(bb_middle.iloc[-1]) if len(bb_middle) >= 20 else latest_close
        l_bb_lower = float(bb_lower.iloc[-1]) if len(bb_lower) >= 20 else latest_close
        
        # Volume Indicators
        vol_sma20 = float(volumes.rolling(window=20).mean().iloc[-1]) if len(volumes) >= 20 else float(volumes.iloc[-1])
        latest_volume = float(volumes.iloc[-1])
        vol_surge = latest_volume / vol_sma20 if vol_sma20 else 1.0
        
        # Determine signals and scores
        tech_score = 0.0
        max_score = 100.0
        reasons = []
        
        # EMA Trend scoring (30 pts)
        if latest_close > l_ema20 > l_ema50 > l_ema200:
            tech_score += 30
            reasons.append("Strong bullish trend (Price > EMA20 > EMA50 > EMA200).")
        elif latest_close > l_ema200:
            tech_score += 18
            reasons.append("Price lies above the long-term 200-day EMA (Bullish territory).")
        elif latest_close < l_ema20 < l_ema50 < l_ema200:
            tech_score += 0
            reasons.append("Strong bearish trend (Price < EMA20 < EMA50 < EMA200).")
        else:
            tech_score += 10
            reasons.append("Price is consolidating or showing mixed moving average alignments.")
            
        # Golden Cross check
        if l_ema50 > l_ema200 and len(ema_50) > 200:
            # Check if recently crossed
            prev_ema50 = float(ema_50.iloc[-10])
            prev_ema200 = float(ema_200.iloc[-10])
            if prev_ema50 <= prev_ema200:
                tech_score += 10 # Crossover bonus
                reasons.append("Recent Golden Cross identified (50-day EMA crossed above 200-day EMA).")
        
        # RSI scoring (25 pts)
        if latest_rsi < 30:
            tech_score += 25
            reasons.append(f"RSI is extremely oversold at {latest_rsi:.1f} (High probability of bullish rebound).")
        elif latest_rsi > 70:
            tech_score += 2
            reasons.append(f"RSI is overbought at {latest_rsi:.1f} (Risk of near-term consolidation or pullback).")
        else:
            # Scale score between 30 and 70. 30 -> 10 pts, 50 -> 18 pts, 70 -> 22 pts
            scaled_rsi_score = 10 + (latest_rsi - 30) * (12 / 40)
            tech_score += max(0, min(22, scaled_rsi_score))
            reasons.append(f"RSI is neutral at {latest_rsi:.1f}, indicating stable price momentum.")
            
        # MACD scoring (25 pts)
        if latest_macd_hist > 0:
            if latest_macd_hist > float(histogram.iloc[-2]) if len(histogram) > 1 else False:
                tech_score += 25
                reasons.append("MACD shows expanding bullish momentum (Histogram > 0 and expanding).")
            else:
                tech_score += 18
                reasons.append("MACD is positive, but bullish momentum is slowing down.")
        else:
            if latest_macd_hist < float(histogram.iloc[-2]) if len(histogram) > 1 else False:
                tech_score += 2
                reasons.append("MACD shows accelerating bearish momentum (Histogram < 0 and expanding).")
            else:
                tech_score += 8
                reasons.append("MACD is negative, but selling pressure is starting to weaken.")

        # Bollinger Bands scoring (20 pts)
        if latest_close <= l_bb_lower:
            tech_score += 20
            reasons.append("Price has touched or breached the Lower Bollinger Band (Potential undervalued dip).")
        elif latest_close >= l_bb_upper:
            tech_score += 3
            reasons.append("Price is pushing against the Upper Bollinger Band (Short-term overextension).")
        else:
            # Close to middle band is neutral
            tech_score += 12
            reasons.append("Price is trading within standard Bollinger volatility bands.")
            
        # High Volume adjustment
        if vol_surge > 1.8:
            if latest_close > prev_close:
                tech_score = min(100.0, tech_score + 5)
                reasons.append(f"Accumulation: High volume breakout detected (Vol {vol_surge:.1f}x SMA20) on an up day.")
            else:
                tech_score = max(0.0, tech_score - 5)
                reasons.append(f"Distribution: High volume sell-off detected (Vol {vol_surge:.1f}x SMA20) on a down day.")
                
        return {
            "score": tech_score,
            "metrics": {
                "rsi": latest_rsi,
                "macd": latest_macd,
                "macd_signal": latest_macd_sig,
                "macd_hist": latest_macd_hist,
                "ema20": l_ema20,
                "ema50": l_ema50,
                "ema200": l_ema200,
                "bb_upper": l_bb_upper,
                "bb_middle": l_bb_middle,
                "bb_lower": l_bb_lower,
                "volume_surge": vol_surge,
                "latest_volume": latest_volume
            },
            "reasoning": reasons
        }

    @staticmethod
    def _analyze_fundamentals(info: Dict[str, Any]) -> Dict[str, Any]:
        """Evaluates balance sheets, income statements, and ratios to output a fundamental score."""
        sector = info.get("sector", "Unknown")
        industry = info.get("industry", "Unknown")
        
        # Detect Financial sector
        is_financial = sector in ["Financial Services", "Financials"] or "Bank" in industry or "Insurance" in industry or "NBFC" in industry or "Wealth" in industry
        
        # Key Ratios
        pe = info.get("trailingPE") or info.get("forwardPE")
        pb = info.get("priceToBook")
        roe = info.get("returnOnEquity")
        de = info.get("debtToEquity")
        current_ratio = info.get("currentRatio")
        div_yield = info.get("dividendYield") # e.g. 0.015 (1.5%) or 1.5
        
        # Clean div yield to decimal percentage if in full numbers (like 1.83 instead of 0.0183)
        if div_yield and div_yield > 1.0:
            div_yield = div_yield / 100.0
            
        metrics = {
            "sector": sector,
            "industry": industry,
            "is_financial": is_financial,
            "pe": pe,
            "pb": pb,
            "roe": roe,
            "de": de,
            "current_ratio": current_ratio,
            "dividend_yield": div_yield
        }
        
        reasons = []
        fund_score = 0.0
        
        # Max score calculation depends on sector
        # For financials, we drop Debt-to-Equity and Current Ratio, dividing the remaining components proportionally
        if is_financial:
            # Ratios are ROE (35 pts), P/E (35 pts), P/B (30 pts)
            # ROE (35 pts)
            if roe is not None:
                roe_val = roe * 100 if roe < 1.0 else roe
                metrics["roe_percent"] = roe_val
                if roe_val >= 18:
                    fund_score += 35
                    reasons.append(f"Outstanding return on capital: ROE is {roe_val:.1f}% (excellent for banking/financial sectors).")
                elif roe_val >= 12:
                    fund_score += 26
                    reasons.append(f"Healthy capital efficiency: ROE is {roe_val:.1f}%.")
                elif roe_val > 0:
                    fund_score += 12
                    reasons.append(f"Suboptimal capital efficiency: ROE is low at {roe_val:.1f}%.")
                else:
                    reasons.append("Unprofitable operations: Return on Equity is negative.")
            else:
                fund_score += 15 # default average
                reasons.append("ROE data is unavailable; using historical banking averages.")
                
            # P/E Ratio (35 pts)
            if pe is not None:
                if pe < 12:
                    fund_score += 35
                    reasons.append(f"Highly attractive bank valuation: P/E is {pe:.1f} (significantly below normal market multiples).")
                elif pe <= 25:
                    fund_score += 24
                    reasons.append(f"Fairly valued: P/E is {pe:.1f} (within reasonable historical multiples).")
                else:
                    fund_score += 8
                    reasons.append(f"Premium valuation: P/E is high at {pe:.1f} (requires strong future earnings to justify).")
            else:
                fund_score += 18
                reasons.append("Earnings multiples are unavailable (potentially unprofitable).")
                
            # P/B Ratio (30 pts)
            if pb is not None:
                if pb < 1.5:
                    fund_score += 30
                    reasons.append(f"Substantial valuation margin: P/B is {pb:.2f}x (highly discounted net assets).")
                elif pb <= 3.0:
                    fund_score += 20
                    reasons.append(f"Standard financial valuation: P/B is {pb:.2f}x.")
                else:
                    fund_score += 5
                    reasons.append(f"High asset premium: P/B is elevated at {pb:.2f}x.")
            else:
                fund_score += 15
                reasons.append("Book value multiple is unavailable.")
                
        else:
            # Standard stocks: ROE (25 pts), P/E (25 pts), P/B (20 pts), Debt-to-Equity (15 pts), Current Ratio (15 pts)
            # ROE (25 pts)
            if roe is not None:
                roe_val = roe * 100 if roe < 1.0 else roe
                metrics["roe_percent"] = roe_val
                if roe_val >= 20:
                    fund_score += 25
                    reasons.append(f"Exceptional quality: ROE is highly efficient at {roe_val:.1f}%.")
                elif roe_val >= 14:
                    fund_score += 18
                    reasons.append(f"Solid quality: ROE is healthy at {roe_val:.1f}%.")
                elif roe_val > 0:
                    fund_score += 8
                    reasons.append(f"Modest capital efficiency: ROE is {roe_val:.1f}%.")
                else:
                    reasons.append("Unprofitable operations: Return on Equity is negative.")
            else:
                fund_score += 12
                reasons.append("ROE data is missing.")

            # P/E Ratio (25 pts)
            if pe is not None:
                if pe < 15:
                    fund_score += 25
                    reasons.append(f"Undervalued: P/E ratio is cheap at {pe:.1f}.")
                elif pe <= 35:
                    fund_score += 17
                    reasons.append(f"Fairly valued: P/E ratio is standard at {pe:.1f}.")
                else:
                    fund_score += 5
                    reasons.append(f"Overvalued: P/E ratio is high at {pe:.1f} (priced for high growth).")
            else:
                fund_score += 8
                reasons.append("P/E ratio is unavailable (negative earnings).")

            # P/B Ratio (20 pts)
            if pb is not None:
                if pb < 2.0:
                    fund_score += 20
                    reasons.append(f"Discounted assets: P/B ratio is attractive at {pb:.2f}x.")
                elif pb <= 5.0:
                    fund_score += 14
                    reasons.append(f"Standard premium: P/B ratio is {pb:.2f}x.")
                else:
                    fund_score += 3
                    reasons.append(f"Premium assets: P/B ratio is high at {pb:.2f}x.")
            else:
                fund_score += 10
                reasons.append("Book value metrics are missing.")

            # Debt-to-Equity (15 pts)
            if de is not None:
                # yfinance can express this as full percentage e.g. 80.5 (meaning 0.8) or 0.8. Let's adapt.
                de_val = de / 100.0 if de > 5.0 else de
                metrics["de_ratio"] = de_val
                if de_val < 0.5:
                    fund_score += 15
                    reasons.append(f"Excellent debt management: Debt-to-Equity is low at {de_val:.2f} (pristine balance sheet).")
                elif de_val <= 1.5:
                    fund_score += 10
                    reasons.append(f"Manageable leverage: Debt-to-Equity is {de_val:.2f}.")
                else:
                    fund_score += 2
                    reasons.append(f"Highly leveraged balance sheet: Debt-to-Equity is elevated at {de_val:.2f} (high risk).")
            else:
                fund_score += 10 # assume reasonable average
                reasons.append("Balance sheet leverage details are missing; assuming conservative debt.")

            # Current Ratio (15 pts)
            if current_ratio is not None:
                if current_ratio >= 1.8:
                    fund_score += 15
                    reasons.append(f"Excellent liquidity: Current Ratio is {current_ratio:.2f}x (ample short-term cover).")
                elif current_ratio >= 1.2:
                    fund_score += 10
                    reasons.append(f"Adequate liquidity: Current Ratio is {current_ratio:.2f}x.")
                else:
                    fund_score += 2
                    reasons.append(f"Weak liquidity risk: Current Ratio is tight at {current_ratio:.2f}x.")
            else:
                fund_score += 9
                reasons.append("Current liquidity ratios are missing.")
                
        # Div yield bonus (up to 5 pts)
        if div_yield and div_yield > 0.0:
            yield_pct = div_yield * 100
            bonus = min(5, int(yield_pct * 1.5))
            fund_score = min(100.0, fund_score + bonus)
            reasons.append(f"Income generation: Dividend Yield provides an extra stable cash return of {yield_pct:.2f}%.")
            
        return {
            "is_applicable": True,
            "score": fund_score,
            "metrics": metrics,
            "reasoning": reasons
        }

    @staticmethod
    def _generate_signal(
        symbol: str,
        company_name: str,
        is_etf: bool,
        latest_close: float,
        daily_change: float,
        daily_change_pct: float,
        tech_results: Dict[str, Any],
        fund_results: Dict[str, Any],
        weight_fundamental: float,
        weight_technical: float,
        info: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Combines technical and fundamental insights to generate a weighted Buy, Hold, Sell recommendation."""
        tech_score = tech_results.get("score", 50.0)
        fund_score = fund_results.get("score", 50.0)
        
        # Calculate combined score
        if is_etf:
            combined_score = tech_score
            weight_f = 0.0
            weight_t = 1.0
        else:
            # Normalize weights to add up to 1.0
            total_weight = weight_fundamental + weight_technical
            weight_f = weight_fundamental / total_weight
            weight_t = weight_technical / total_weight
            combined_score = (weight_f * fund_score) + (weight_t * tech_score)
            
        # Determine Recommendation Signal
        if combined_score >= 70:
            signal = "BUY"
            color_theme = "emerald"
            confidence = float(combined_score)
            verdict = "Attractive asset entry opportunity with positive momentum and underlying security health."
        elif combined_score >= 40:
            signal = "HOLD"
            color_theme = "amber"
            confidence = float(combined_score)
            verdict = "Consolidating price or fairly valued fundamentals. Maintain position without adding leverage."
        else:
            signal = "SELL"
            color_theme = "crimson"
            confidence = float(100 - combined_score)
            verdict = "Weak technical trends or severe overvaluation/balance sheet vulnerabilities. Risk mitigation recommended."
            
        # Generate summary synthesis
        synthesis = []
        if is_etf:
            synthesis.append(f"This ETF shows a technical strength score of {tech_score:.1f} out of 100.")
            synthesis.extend(tech_results.get("reasoning", [])[:2])
        else:
            sector_name = fund_results["metrics"].get("sector", "General")
            synthesis.append(
                f"As a {sector_name} equity, {company_name} is evaluated on a balanced blend of "
                f"fundamentals ({fund_score:.1f}/100) and technicals ({tech_score:.1f}/100)."
            )
            # Pick best positive/negative reason
            tech_reasons = tech_results.get("reasoning", [])
            fund_reasons = fund_results.get("reasoning", [])
            if tech_reasons:
                synthesis.append(f"Technically: {tech_reasons[0]}")
            if fund_reasons:
                synthesis.append(f"Fundamentally: {fund_reasons[0]}")
                
        summary_text = " ".join(synthesis) + " " + verdict
        
        return {
            "symbol": symbol,
            "company_name": company_name,
            "is_etf": is_etf,
            "latest_price": latest_close,
            "change": daily_change,
            "change_percent": daily_change_pct,
            "technical_score": tech_score,
            "fundamental_score": fund_score,
            "combined_score": combined_score,
            "signal": signal,
            "color_theme": color_theme,
            "confidence": confidence,
            "summary": summary_text,
            "technical_details": tech_results,
            "fundamental_details": fund_results,
            "weight_distribution": {
                "fundamental_weight": weight_f,
                "technical_weight": weight_t
            },
            "industry": info.get("industry", "N/A"),
            "market_cap": info.get("marketCap", 0),
            "success": True
        }
