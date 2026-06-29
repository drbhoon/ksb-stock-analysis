import React, { useState, useEffect } from 'react';
import { 
  TrendingUp, TrendingDown, RefreshCw, BarChart2, 
  Search, DollarSign, ArrowRightLeft, History, AlertTriangle 
} from 'lucide-react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip } from 'recharts';

interface PortfolioSummary {
  id: number;
  season: number;
  cash: number;
  trading_cash?: number;
  available_cash?: number;
  loan_principal: number;
  accrued_interest: number;
  holdings_value: number;
  net_worth: number;
  season_pnl: number;
  lifetime_pnl: number;
  loan_headroom: number;
  reset_request_pending?: boolean;
  reset_requested_at?: string | null;
  is_bust: boolean;
}

interface Holding {
  symbol: string;
  company_name: string;
  quantity: number;
  average_buy_price: number;
  current_price: number;
  market_value: number;
  unrealized_pnl_value: number;
  unrealized_pnl_percent: number;
  change_percent: number;
}

interface Transaction {
  id: number;
  type: string;
  symbol: string | null;
  quantity: number | null;
  price: number | null;
  fee: number | null;
  amount: number;
  timestamp: string;
}

interface Snapshot {
  date: string;
  net_worth: number;
  cash: number;
  holdings_value: number;
  loan_principal: number;
  accrued_interest: number;
}

interface SearchResult {
  symbol: string;
  name: string;
  is_etf: boolean;
  isin: string;
}

interface PaperTradingProps {
  API_BASE_URL: string;
  token: string | null;
  isAdmin: boolean;
}

export const PaperTrading: React.FC<PaperTradingProps> = ({ API_BASE_URL, token, isAdmin }) => {
  // State
  const [summary, setSummary] = useState<PortfolioSummary | null>(null);
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [history, setHistory] = useState<Transaction[]>([]);
  const [equityCurve, setEquityCurve] = useState<Snapshot[]>([]);
  
  // Loading & error states
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  
  // Search & Trade State
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState<boolean>(false);
  const [selectedStock, setSelectedStock] = useState<SearchResult | null>(null);
  const [selectedStockPrice, setSelectedStockPrice] = useState<number | null>(null);
  const [fetchingPrice, setFetchingPrice] = useState<boolean>(false);
  
  const [tradeAction, setTradeAction] = useState<'BUY' | 'SELL'>('BUY');
  const [tradeQty, setTradeQty] = useState<number | ''>('');
  const [executingTrade, setExecutingTrade] = useState<boolean>(false);

  // Loan State
  const [loanAction, setLoanAction] = useState<'BORROW' | 'REPAY'>('BORROW');
  const [loanAmount, setLoanAmount] = useState<number | ''>('');
  const [executingLoan, setExecutingLoan] = useState<boolean>(false);
  const [requestingReset, setRequestingReset] = useState<boolean>(false);

  // Market hours status helper
  const [marketOpen, setMarketOpen] = useState<boolean>(false);

  const authHeaders = () => ({
    'Authorization': token ? `Bearer ${token}` : '',
    'Content-Type': 'application/json'
  });

  // Calculate local market status banner (EST time mappings to IST)
  const updateMarketStatus = () => {
    // Standard IST Hours: Mon-Fri 9:15 AM - 3:30 PM
    const now = new Date();
    // Convert to IST
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Kolkata',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
      hour12: false,
      weekday: 'short'
    });
    
    try {
      const parts = formatter.formatToParts(now);
      const weekday = parts.find(p => p.type === 'weekday')?.value || 'Mon';
      const hour = parseInt(parts.find(p => p.type === 'hour')?.value || '0', 10);
      const minute = parseInt(parts.find(p => p.type === 'minute')?.value || '0', 10);
      
      const isWeekend = weekday === 'Sat' || weekday === 'Sun';
      const timeVal = hour * 60 + minute;
      const isTradingHours = timeVal >= 555 && timeVal <= 930; // 9:15 is 555 min, 15:30 is 930 min
      
      setMarketOpen(!isWeekend && isTradingHours);
    } catch (e) {
      setMarketOpen(false);
    }
  };

  // Fetch all game data
  const fetchGameData = async (quiet = false) => {
    if (!quiet) setIsLoading(true);
    try {
      updateMarketStatus();
      
      // Fetch summary
      const sumRes = await fetch(`${API_BASE_URL}/api/game/portfolio`, { headers: authHeaders() });
      if (!sumRes.ok) throw new Error('Failed to load portfolio summary.');
      const sumData = await sumRes.json();
      setSummary(sumData);

      // Fetch holdings
      const holdRes = await fetch(`${API_BASE_URL}/api/game/holdings`, { headers: authHeaders() });
      if (holdRes.ok) {
        const holdData = await holdRes.json();
        setHoldings(holdData);
      }

      // Fetch history
      const histRes = await fetch(`${API_BASE_URL}/api/game/history`, { headers: authHeaders() });
      if (histRes.ok) {
        const histData = await histRes.json();
        setHistory(histData);
      }

      // Fetch equity curve
      const curveRes = await fetch(`${API_BASE_URL}/api/game/equity-curve`, { headers: authHeaders() });
      if (curveRes.ok) {
        const curveData = await curveRes.json();
        setEquityCurve(curveData);
      }
    } catch (err: any) {
      setActionError(err.message || 'Error fetching trading data.');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchGameData();
    
    // Set up polling interval every 30 seconds
    const interval = setInterval(() => {
      updateMarketStatus();
      fetchGameData(true);
    }, 30000);

    return () => clearInterval(interval);
  }, []);

  // Symbol Search handler
  useEffect(() => {
    if (searchQuery.trim().length < 2) {
      setSearchResults([]);
      return;
    }

    const delayDebounce = setTimeout(async () => {
      setSearchLoading(true);
      try {
        const res = await fetch(`${API_BASE_URL}/api/search?q=${encodeURIComponent(searchQuery)}`, { headers: authHeaders() });
        if (res.ok) {
          const data = await res.json();
          setSearchResults(data);
        }
      } catch (e) {
        console.error('Search failed', e);
      } finally {
        setSearchLoading(false);
      }
    }, 300);

    return () => clearTimeout(delayDebounce);
  }, [searchQuery]);

  // Fetch price when selected stock changes
  const handleSelectStock = async (stock: SearchResult) => {
    setSelectedStock(stock);
    setSearchQuery('');
    setSearchResults([]);
    setFetchingPrice(true);
    setActionError(null);
    setSuccessMsg(null);
    
    try {
      // Use core analyse endpoint to get latest close price
      const cleanSym = stock.symbol.replace('.NS', '');
      const res = await fetch(`${API_BASE_URL}/api/analyze/${cleanSym}`, { headers: authHeaders() });
      if (res.ok) {
        const data = await res.json();
        setSelectedStockPrice(data.latest_price);
      } else {
        throw new Error("Failed to load price from live feed.");
      }
    } catch (err: any) {
      setActionError(`Could not fetch quote for ${stock.symbol}`);
      setSelectedStockPrice(null);
    } finally {
      setFetchingPrice(false);
    }
  };

  // Trade Executor
  const handleTradeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStock || !selectedStockPrice || !tradeQty || tradeQty <= 0) return;
    
    setExecutingTrade(true);
    setActionError(null);
    setSuccessMsg(null);

    try {
      const res = await fetch(`${API_BASE_URL}/api/game/trade`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          symbol: selectedStock.symbol,
          action: tradeAction,
          quantity: tradeQty
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || 'Trade execution failed.');
      }

      setSuccessMsg(data.message || 'Trade executed successfully.');
      setSelectedStock(null);
      setSelectedStockPrice(null);
      setTradeQty('');
      
      // Re-fetch
      await fetchGameData(true);
    } catch (err: any) {
      setActionError(err.message);
    } finally {
      setExecutingTrade(false);
    }
  };

  // Loan Executor
  const handleLoanSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loanAmount || loanAmount <= 0) return;
    
    setExecutingLoan(true);
    setActionError(null);
    setSuccessMsg(null);

    const path = loanAction === 'BORROW' ? 'draw' : 'repay';
    try {
      const res = await fetch(`${API_BASE_URL}/api/game/loan/${path}`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ amount: loanAmount })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || 'Loan operation failed.');
      }

      setSuccessMsg(data.message || `${loanAction} request successful.`);
      setLoanAmount('');
      
      // Re-fetch
      await fetchGameData(true);
    } catch (err: any) {
      setActionError(err.message);
    } finally {
      setExecutingLoan(false);
    }
  };

  // Reset Game Season
  const handleResetGame = async () => {
    if (!window.confirm("Are you sure you want to restart your portfolio? Your current holdings will be liquidated, loan settled, and a new season will start with ₹0 cash and ₹0 loan. Your prior P&L history will be saved to your Lifetime P&L.")) {
      return;
    }

    setIsRefreshing(true);
    setActionError(null);
    setSuccessMsg(null);

    try {
      const res = await fetch(`${API_BASE_URL}/api/game/portfolio/restart`, {
        method: 'POST',
        headers: authHeaders()
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || 'Restart failed.');
      }

      setSuccessMsg('Portfolio reset successfully. Welcome to Season ' + data.season + '!');
      await fetchGameData();
    } catch (err: any) {
      setActionError(err.message);
      setIsRefreshing(false);
    }
  };

  // Reset Game Request
  const handleRequestResetGame = async () => {
    if (!window.confirm("Send a reset request to the admin? Your game will only reset if the admin approves it.")) {
      return;
    }

    setRequestingReset(true);
    setActionError(null);
    setSuccessMsg(null);

    try {
      const res = await fetch(`${API_BASE_URL}/api/game/portfolio/reset-request`, {
        method: 'POST',
        headers: authHeaders()
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || 'Restart failed.');
      }

      setSuccessMsg(data.message || 'Reset request sent to the admin.');
      await fetchGameData(true);
    } catch (err: any) {
      setActionError(err.message);
    } finally {
      setRequestingReset(false);
    }
  };

  // Quick action: set trade ticker from holdings list
  const selectHoldingForTrade = (symbol: string, compName: string) => {
    handleSelectStock({
      symbol,
      name: compName,
      is_etf: false,
      isin: ''
    });
  };

  if (isLoading) {
    return (
      <div className="glass-panel" style={{ padding: '60px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', margin: '40px auto', maxWidth: '600px' }}>
        <div className="glow-active" style={{ width: '50px', height: '50px', borderRadius: '50%', border: '4px solid rgba(59, 130, 246, 0.1)', borderTopColor: 'var(--color-primary)', animation: 'spin 1.2s linear infinite', marginBottom: '20px' }} />
        <h3>Loading Paper Trading Simulator...</h3>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '6px' }}>Fetching virtual ledger and holdings prices...</p>
      </div>
    );
  }

  if (!summary) return null;

  // Calculation helpers
  const dailyInterest = summary.loan_principal * (0.01 / 30.0);
  const totalValue = summary.holdings_value;
  const isLoss = summary.season_pnl < 0;
  const netWorthReturn = summary.loan_principal > 0 ? (summary.season_pnl / summary.loan_principal) * 100 : 0;

  return (
    <div style={{ padding: '32px 40px', maxWidth: '1440px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '28px' }}>
      
      {/* 1. Header Banner & Status */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-primary)', fontWeight: 700 }}>
            BEGINNERS GAME · SEASON {summary.season}
          </span>
          <h1 style={{ fontSize: '1.8rem', fontWeight: 800, fontFamily: 'var(--font-heading)', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '10px' }}>
            Virtual Paper Trading
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem', marginTop: '4px' }}>
            Buy and sell Indian equities at live prices. Leverage with simulated interest-bearing loans.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
            {/* Market Status Banner */}
            <div className="glass-panel" style={{
              padding: '8px 16px',
              borderRadius: '20px',
              fontSize: '0.82rem',
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              background: marketOpen ? 'rgba(16, 185, 129, 0.05)' : 'rgba(239, 68, 68, 0.05)',
              border: marketOpen ? '1px solid rgba(16, 185, 129, 0.2)' : '1px solid rgba(239, 68, 68, 0.2)'
            }}>
              <span className={`pulse-dot ${marketOpen ? 'pulse-dot-buy' : 'pulse-dot-sell'}`} />
              {marketOpen ? 'MARKET OPEN (IST)' : 'MARKET CLOSED (IST)'}
            </div>

            <button
              onClick={handleRequestResetGame}
              disabled={requestingReset || summary.reset_request_pending}
              className="btn-secondary"
              style={{
                padding: '8px 14px',
                borderRadius: '20px',
                color: summary.reset_request_pending ? 'var(--color-hold)' : 'var(--color-sell)',
                border: summary.reset_request_pending ? '1px solid rgba(245, 158, 11, 0.25)' : '1px solid rgba(239, 68, 68, 0.2)',
                opacity: requestingReset ? 0.6 : 1
              }}
              title={summary.reset_request_pending ? 'Reset request is waiting for admin review' : 'Ask admin to reset your game'}
            >
              {requestingReset ? 'Sending...' : summary.reset_request_pending ? 'Reset Requested' : 'Request Reset'}
            </button>
          </div>

          <button 
            onClick={() => { setIsRefreshing(true); fetchGameData(); }}
            disabled={isRefreshing}
            className="btn-secondary" 
            style={{ padding: '9px 14px', borderRadius: '10px' }}
            title="Refresh Prices"
          >
            <RefreshCw size={14} className={isRefreshing ? 'spin' : ''} />
          </button>
          
          {isAdmin && (
            <button
              onClick={handleResetGame}
              className="btn-secondary"
              style={{ padding: '9px 16px', borderRadius: '10px', color: 'var(--color-sell)', border: '1px solid rgba(239, 68, 68, 0.2)' }}
            >
              Reset Game
            </button>
          )}
        </div>
      </div>

      {/* Action Notifications */}
      {actionError && (
        <div className="glass-panel" style={{ padding: '16px 20px', borderLeft: '4px solid var(--color-sell)', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <AlertTriangle size={20} style={{ color: 'var(--color-sell)' }} />
          <span style={{ fontSize: '0.88rem', color: 'var(--text-muted)' }}>{actionError}</span>
        </div>
      )}
      {successMsg && (
        <div className="glass-panel" style={{ padding: '16px 20px', borderLeft: '4px solid var(--color-buy)', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <TrendingUp size={20} style={{ color: 'var(--color-buy)' }} />
          <span style={{ fontSize: '0.88rem', color: 'var(--text-muted)' }}>{successMsg}</span>
        </div>
      )}

      {/* 2. Hero Dashboard Statistics */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '20px' }}>
        
        {/* Net Worth (Headline) */}
        <div className="glass-panel glow-active" style={{ padding: '24px', borderLeft: `4px solid ${isLoss ? 'var(--color-sell)' : 'var(--color-buy)'}` }}>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600, letterSpacing: '0.04em' }}>PORTFOLIO NET WORTH</div>
          <h2 style={{ fontSize: '2rem', fontWeight: 900, marginTop: '8px', color: 'white' }}>
            ₹{summary.net_worth.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </h2>
          <div style={{ 
            fontSize: '0.82rem', 
            fontWeight: 700, 
            marginTop: '6px', 
            display: 'flex', 
            alignItems: 'center',
            gap: '4px',
            color: isLoss ? 'var(--color-sell)' : 'var(--color-buy)'
          }}>
            {isLoss ? <TrendingDown size={14} /> : <TrendingUp size={14} />}
            {isLoss ? '' : '+'}{summary.season_pnl.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
            {summary.loan_principal > 0 ? ` (${netWorthReturn.toFixed(2)}%)` : ''}
          </div>
        </div>

        {/* Invested Value */}
        <div className="glass-panel" style={{ padding: '24px' }}>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600, letterSpacing: '0.04em' }}>INVESTED VALUE</div>
          <h2 style={{ fontSize: '1.6rem', fontWeight: 800, marginTop: '8px', color: 'white' }}>
            ₹{totalValue.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </h2>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginTop: '6px', display: 'block' }}>
            Market valuation of active stocks
          </span>
        </div>

        {/* Available to Borrow */}
        <div className="glass-panel" style={{ padding: '24px' }}>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600, letterSpacing: '0.04em' }}>AVAILABLE TO BORROW</div>
          <h2 style={{ fontSize: '1.6rem', fontWeight: 800, marginTop: '8px', color: 'white' }}>
            ₹{summary.loan_headroom.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </h2>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginTop: '6px', display: 'block' }}>
            Bank credit still available
          </span>
          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '4px', display: 'block' }}>
            Trading cash: ₹{summary.cash.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
          </span>
        </div>

        {/* Active Loan Principal */}
        <div className="glass-panel" style={{ padding: '24px' }}>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600, letterSpacing: '0.04em' }}>ACTIVE LOAN</div>
          <h2 style={{ fontSize: '1.6rem', fontWeight: 800, marginTop: '8px', color: summary.loan_principal > 0 ? 'var(--color-hold)' : 'white' }}>
            ₹{summary.loan_principal.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
          </h2>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginTop: '6px', display: 'block' }}>
            Borrowed principal
          </span>
        </div>

        {/* Accrued Interest & Lifetime P&L */}
        <div className="glass-panel" style={{ padding: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>ACCRUED INTEREST</span>
            <span style={{ fontSize: '0.72rem', color: 'var(--color-sell)', fontWeight: 700 }}>₹{summary.accrued_interest.toFixed(2)}</span>
          </div>
          <hr style={{ border: 'none', borderTop: '1px solid rgba(255,255,255,0.06)', margin: '10px 0' }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>LIFETIME P&L</span>
            <span style={{ 
              fontSize: '0.85rem', 
              fontWeight: 800, 
              color: summary.lifetime_pnl >= 0 ? 'var(--color-buy)' : 'var(--color-sell)' 
            }}>
              ₹{summary.lifetime_pnl.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
            </span>
          </div>
        </div>

      </div>

      {/* 3. Core Working Panels Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: '28px', alignItems: 'start', flexWrap: 'wrap' }}>
        
        {/* LEFT COLUMN: Holdings & Trading */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
          
          {/* Holdings Table */}
          <div className="glass-panel" style={{ padding: '24px' }}>
            <h3 style={{ fontSize: '1.05rem', fontWeight: 800, marginBottom: '18px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <BarChart2 size={18} style={{ color: 'var(--color-primary)' }} />
              Active Equity Holdings
            </h3>
            
            {holdings.length === 0 ? (
              <div style={{ padding: '40px 20px', color: 'var(--text-dim)', fontSize: '0.88rem', textAlign: 'center' }}>
                You have no active stock positions in Season {summary.season}.
                <br />
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginTop: '6px' }}>Use the Trade Panel below to purchase shares.</span>
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table className="premium-table">
                  <thead>
                    <tr>
                      <th>Ticker</th>
                      <th style={{ textAlign: 'right' }}>Qty</th>
                      <th style={{ textAlign: 'right' }}>Avg Price</th>
                      <th style={{ textAlign: 'right' }}>Live Price</th>
                      <th style={{ textAlign: 'right' }}>Current Value</th>
                      <th style={{ textAlign: 'right' }}>P&L (%)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {holdings.map((h) => {
                      const isHoldingLoss = h.unrealized_pnl_value < 0;
                      return (
                        <tr key={h.symbol}>
                          <td>
                            <button 
                              onClick={() => selectHoldingForTrade(h.symbol, h.company_name)}
                              style={{ 
                                background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left',
                                color: 'white', fontWeight: 700, fontSize: '0.85rem', padding: 0
                              }}
                              title="Trade Ticker"
                            >
                              {h.symbol.replace('.NS', '')}
                              <span style={{ display: 'block', fontSize: '0.72rem', color: 'var(--text-dim)', fontWeight: 400, marginTop: '2px', maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {h.company_name}
                              </span>
                            </button>
                          </td>
                          <td style={{ textAlign: 'right', fontWeight: 600 }}>{h.quantity}</td>
                          <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>₹{h.average_buy_price.toFixed(2)}</td>
                          <td style={{ textAlign: 'right', fontFamily: 'monospace', color: h.change_percent >= 0 ? 'var(--color-buy)' : 'var(--color-sell)' }}>
                            ₹{h.current_price.toFixed(2)}
                          </td>
                          <td style={{ textAlign: 'right', fontWeight: 600 }}>₹{h.market_value.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</td>
                          <td style={{ textAlign: 'right', fontWeight: 700, color: isHoldingLoss ? 'var(--color-sell)' : 'var(--color-buy)' }}>
                            {isHoldingLoss ? '' : '+'}{h.unrealized_pnl_value.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                            <span style={{ display: 'block', fontSize: '0.72rem', fontWeight: 500 }}>
                              ({h.unrealized_pnl_percent.toFixed(2)}%)
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Trade Panel */}
          <div className="glass-panel" style={{ padding: '24px' }}>
            <h3 style={{ fontSize: '1.05rem', fontWeight: 800, marginBottom: '18px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <ArrowRightLeft size={18} style={{ color: 'var(--color-primary)' }} />
              Execution Panel
            </h3>

            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '24px', alignItems: 'start', flexWrap: 'wrap' }}>
              
              {/* Left Column: Symbol Search & Display */}
              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, marginBottom: '6px' }}>SEARCH TICKER</label>
                <div style={{ position: 'relative', marginBottom: '16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-glass)', borderRadius: '10px', padding: '0 12px', gap: '8px' }}>
                    <Search size={14} style={{ color: 'var(--text-dim)' }} />
                    <input 
                      type="text"
                      placeholder="Search ticker (e.g. Reliance, TCS, SBIN)..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      style={{
                        flex: 1, background: 'transparent', border: 'none', outline: 'none',
                        color: 'white', fontSize: '0.85rem', padding: '12px 0'
                      }}
                    />
                    {searchLoading && <RefreshCw size={12} className="spin" style={{ color: 'var(--text-dim)' }} />}
                  </div>

                  {/* Dropdown results */}
                  {searchResults.length > 0 && (
                    <div style={{
                      position: 'absolute', top: '105%', left: 0, right: 0,
                      background: '#0a0e19', border: '1px solid var(--border-glass)',
                      borderRadius: '8px', zIndex: 100, maxHeight: '200px', overflowY: 'auto'
                    }}>
                      {searchResults.map((stock) => (
                        <button
                          key={stock.symbol}
                          onClick={() => handleSelectStock(stock)}
                          style={{
                            display: 'block', width: '100%', padding: '10px 14px', background: 'transparent',
                            border: 'none', borderBottom: '1px solid rgba(255,255,255,0.04)', color: 'white',
                            textAlign: 'left', cursor: 'pointer', transition: 'background 0.15s'
                          }}
                          onMouseEnter={e => e.currentTarget.style.background = 'rgba(59,130,246,0.12)'}
                          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                        >
                          <div style={{ fontSize: '0.85rem', fontWeight: 700 }}>{stock.symbol.replace('.NS', '')}</div>
                          <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)', marginTop: '2px' }}>{stock.name}</div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Selected Quote Information Box */}
                {selectedStock && (
                  <div className="glass-panel" style={{ padding: '16px', background: 'rgba(255,255,255,0.01)' }}>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)', fontWeight: 600 }}>SELECTED QUOTE</div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: '6px' }}>
                      <span style={{ fontWeight: 800, fontSize: '1.25rem' }}>{selectedStock.symbol.replace('.NS', '')}</span>
                      {fetchingPrice ? (
                        <span style={{ fontSize: '0.78rem', color: 'var(--text-dim)' }}>Fetching price...</span>
                      ) : selectedStockPrice ? (
                        <span style={{ fontSize: '1.25rem', fontWeight: 900, fontFamily: 'monospace' }}>₹{selectedStockPrice.toFixed(2)}</span>
                      ) : (
                        <span style={{ fontSize: '0.78rem', color: 'var(--color-sell)' }}>Quote unavailable</span>
                      )}
                    </div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {selectedStock.name}
                    </div>
                  </div>
                )}
              </div>

              {/* Right Column: Execution Form */}
              <form onSubmit={handleTradeSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, marginBottom: '6px' }}>ACTION</label>
                  <div style={{ display: 'flex', gap: '8px', background: 'rgba(255,255,255,0.03)', padding: '2px', borderRadius: '8px', border: '1px solid var(--border-glass)' }}>
                    {['BUY', 'SELL'].map((act) => (
                      <button
                        key={act}
                        type="button"
                        onClick={() => setTradeAction(act as any)}
                        style={{
                          flex: 1, padding: '8px 0', border: 'none', borderRadius: '6px', fontSize: '0.8rem',
                          fontWeight: 700, cursor: 'pointer', transition: 'all 0.15s',
                          background: tradeAction === act ? (act === 'BUY' ? 'var(--color-buy-trans)' : 'var(--color-sell-trans)') : 'transparent',
                          color: tradeAction === act ? (act === 'BUY' ? 'var(--color-buy)' : 'var(--color-sell)') : 'var(--text-muted)'
                        }}
                      >
                        {act}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, marginBottom: '6px' }}>QUANTITY</label>
                  <input 
                    type="number"
                    min="1"
                    step="1"
                    value={tradeQty}
                    onChange={(e) => setTradeQty(e.target.value === '' ? '' : Math.max(0, parseInt(e.target.value, 10) || 0))}
                    disabled={!selectedStockPrice}
                    style={{
                      width: '100%', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-glass)',
                      borderRadius: '8px', padding: '10px 12px', color: 'white', outline: 'none',
                      fontSize: '0.85rem', fontFamily: 'monospace'
                    }}
                  />
                </div>

                {/* Estimate calculations */}
                {selectedStockPrice && (() => {
                  const qtyNum = Number(tradeQty) || 0;
                  return (
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span>Subtotal:</span>
                        <span>₹{(selectedStockPrice * qtyNum).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span>Brokerage (0.1%):</span>
                        <span>₹{(selectedStockPrice * qtyNum * 0.001).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                      </div>
                      <hr style={{ border: 'none', borderTop: '1px solid rgba(255,255,255,0.04)', margin: '4px 0' }} />
                      <div style={{ display: 'flex', justifyContent: 'space-between', color: 'white', fontWeight: 700 }}>
                        <span>Total {tradeAction === 'BUY' ? 'Cost' : 'Credit'}:</span>
                        <span>
                          ₹{(selectedStockPrice * qtyNum * (tradeAction === 'BUY' ? 1.001 : 0.999)).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                    </div>
                  );
                })()}

                <button
                  type="submit"
                  disabled={!selectedStockPrice || executingTrade}
                  className="btn-primary"
                  style={{
                    width: '100%', padding: '12px 0', borderRadius: '10px', fontSize: '0.85rem',
                    fontWeight: 700, opacity: (!selectedStockPrice || executingTrade) ? 0.5 : 1,
                    background: tradeAction === 'BUY' ? 'var(--color-buy)' : 'var(--color-sell)',
                    borderColor: 'transparent'
                  }}
                >
                  {executingTrade ? 'Executing...' : `Confirm ${tradeAction} Order`}
                </button>
              </form>

            </div>
          </div>

        </div>

        {/* RIGHT COLUMN: Loans & History Ledger */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
          
          {/* Loan panel */}
          <div className="glass-panel" style={{ padding: '24px' }}>
            <h3 style={{ fontSize: '1.05rem', fontWeight: 800, marginBottom: '18px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <DollarSign size={18} style={{ color: 'var(--color-primary)' }} />
              Simulated Leverage Loan
            </h3>

            {/* Accrual alert notice */}
            {summary.loan_principal > 0 && (
              <div style={{ 
                background: 'rgba(245, 158, 11, 0.03)', border: '1px solid rgba(245, 158, 11, 0.15)',
                borderRadius: '8px', padding: '10px 14px', fontSize: '0.78rem', color: 'var(--color-hold)',
                marginBottom: '18px', fontStyle: 'italic'
              }}>
                ⚡ Accruing loan interest: ₹{dailyInterest.toFixed(2)} / calendar-day (1% per month).
              </div>
            )}

            <form onSubmit={handleLoanSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              
              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, marginBottom: '6px' }}>TRANSACTION TYPE</label>
                <div style={{ display: 'flex', gap: '8px', background: 'rgba(255,255,255,0.03)', padding: '2px', borderRadius: '8px', border: '1px solid var(--border-glass)' }}>
                  {['BORROW', 'REPAY'].map((act) => (
                    <button
                      key={act}
                      type="button"
                      onClick={() => setLoanAction(act as any)}
                      style={{
                        flex: 1, padding: '8px 0', border: 'none', borderRadius: '6px', fontSize: '0.8rem',
                        fontWeight: 700, cursor: 'pointer', transition: 'all 0.15s',
                        background: loanAction === act ? 'var(--color-primary-glow)' : 'transparent',
                        color: loanAction === act ? 'var(--color-primary)' : 'var(--text-muted)'
                      }}
                    >
                      {act === 'BORROW' ? 'Borrow Cash' : 'Repay Principal'}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>AMOUNT (₹)</label>
                  {loanAction === 'BORROW' ? (
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>Headroom: ₹{summary.loan_headroom.toLocaleString()}</span>
                  ) : (
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>Owed: ₹{summary.loan_principal.toLocaleString()}</span>
                  )}
                </div>
                <input 
                  type="number"
                  min="0"
                  step="100"
                  value={loanAmount}
                  onChange={(e) => setLoanAmount(e.target.value === '' ? '' : Math.max(0, parseInt(e.target.value, 10) || 0))}
                  style={{
                    width: '100%', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-glass)',
                    borderRadius: '8px', padding: '10px 12px', color: 'white', outline: 'none',
                    fontSize: '0.85rem', fontFamily: 'monospace'
                  }}
                />
              </div>

              <button
                type="submit"
                disabled={executingLoan || !loanAmount || loanAmount <= 0}
                className="btn-primary"
                style={{
                  width: '100%', padding: '12px 0', borderRadius: '10px', fontSize: '0.85rem',
                  fontWeight: 700, opacity: (executingLoan || !loanAmount || loanAmount <= 0) ? 0.5 : 1
                }}
              >
                {executingLoan ? 'Processing...' : `Confirm ${loanAction === 'BORROW' ? 'Borrow' : 'Repayment'}`}
              </button>

            </form>
          </div>

          {/* Ledger History List */}
          <div className="glass-panel" style={{ padding: '24px' }}>
            <h3 style={{ fontSize: '1.05rem', fontWeight: 800, marginBottom: '18px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <History size={18} style={{ color: 'var(--color-primary)' }} />
              Virtual Ledger
            </h3>

            {history.length === 0 ? (
              <div style={{ padding: '30px 10px', color: 'var(--text-dim)', fontSize: '0.8rem', textAlign: 'center' }}>
                No transaction logs recorded in Season {summary.season}.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '310px', overflowY: 'auto', paddingRight: '4px' }}>
                {history.map((tx) => {
                  const isNegative = tx.amount < 0;
                  const dateStr = new Date(tx.timestamp).toLocaleString('en-IN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short' });
                  return (
                    <div key={tx.id} style={{ 
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      padding: '10px 12px', background: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.03)',
                      borderRadius: '6px'
                    }}>
                      <div>
                        <span style={{ 
                          fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.04em',
                          color: tx.type === 'BUY' ? 'var(--color-buy)' : tx.type === 'SELL' ? 'var(--color-sell)' : 'var(--color-primary)'
                        }}>
                          {tx.type} {tx.symbol && `· ${tx.symbol.replace('.NS', '')}`}
                        </span>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)', marginTop: '2px' }}>
                          {tx.quantity ? `${tx.quantity} shares @ ₹${tx.price?.toFixed(1)}` : 'Loan adjustment'}
                        </div>
                        <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)', marginTop: '2px' }}>{dateStr}</div>
                      </div>
                      <span style={{ 
                        fontFamily: 'monospace', fontSize: '0.8rem', fontWeight: 700,
                        color: isNegative ? 'var(--color-sell)' : 'var(--color-buy)'
                      }}>
                        {isNegative ? '-' : '+'}₹{Math.abs(tx.amount).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

        </div>

      </div>

      {/* 4. Bottom Equity Curve chart */}
      {equityCurve.length > 0 && (
        <div className="glass-panel" style={{ padding: '24px' }}>
          <h3 style={{ fontSize: '1.05rem', fontWeight: 800, marginBottom: '18px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <TrendingUp size={18} style={{ color: 'var(--color-primary)' }} />
            Season Equity Curve (Net Worth Trajectory)
          </h3>
          
          <div style={{ width: '100%', height: '260px', background: 'rgba(0,0,0,0.1)', borderRadius: '12px', padding: '10px 0' }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={equityCurve} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorNetWorth" cx="0" cy="0" r="1">
                    <stop offset="5%" stopColor="var(--color-primary)" stopOpacity={0.25}/>
                    <stop offset="95%" stopColor="var(--color-primary)" stopOpacity={0.0}/>
                  </linearGradient>
                </defs>
                <XAxis dataKey="date" tickLine={false} axisLine={false} tick={{ fill: 'var(--text-dim)', fontSize: 10 }} />
                <YAxis domain={['auto', 'auto']} tickLine={false} axisLine={false} tick={{ fill: 'var(--text-dim)', fontSize: 10 }} />
                <Tooltip 
                  contentStyle={{ background: '#0e1428', border: '1px solid var(--border-glass)', borderRadius: '8px', color: '#fff', fontSize: '0.8rem' }}
                  labelStyle={{ fontWeight: 600 }}
                  formatter={(val: any) => [`₹${parseFloat(val).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`, 'Net Worth']}
                />
                <Area 
                  type="monotone" 
                  dataKey="net_worth" 
                  stroke="var(--color-primary)" 
                  strokeWidth={2.5} 
                  fillOpacity={1} 
                  fill="url(#colorNetWorth)" 
                  name="Net Worth" 
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

    </div>
  );
};
