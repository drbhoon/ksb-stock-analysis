import { useState, useEffect, useMemo } from 'react';
import { Dashboard } from './components/Dashboard';
import { StockDetail } from './components/StockDetail';
import { SingleStockAnalysis } from './components/SingleStockAnalysis';
import { PasswordGate } from './components/PasswordGate';
import { ShieldAlert, TrendingUp, Lock } from 'lucide-react';

const API_BASE_URL = window.location.origin.includes('localhost:5173') 
  ? 'http://localhost:8000' 
  : window.location.origin;

function App() {
  const [token, setToken] = useState<string | null>(localStorage.getItem('ksb_auth_token'));
  const [authRequired, setAuthRequired] = useState<boolean>(false);
  const [authChecking, setAuthChecking] = useState<boolean>(true);
  const [currentTab, setCurrentTab] = useState<'PORTFOLIO' | 'SINGLE'>('PORTFOLIO');

  const [portfolioData, setPortfolioData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [selectedStock, setSelectedStock] = useState<string | null>(null);
  const [selectedStockDetail, setSelectedStockDetail] = useState<any>(null);
  const [isLoadingDetail, setIsLoadingDetail] = useState<boolean>(false);
  const [marketSummary, setMarketSummary] = useState<any[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  
  // Weights (default: 60% Fundamental / 40% Technical)
  const [weightF, setWeightF] = useState<number>(0.60);
  const [weightT, setWeightT] = useState<number>(0.40);

  // Check auth status on mount
  useEffect(() => {
    const checkAuthStatus = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/auth/status`);
        if (res.ok) {
          const data = await res.json();
          setAuthRequired(data.auth_required);
        }
      } catch (e) {
        console.warn("Could not check auth status:", e);
      } finally {
        setAuthChecking(false);
      }
    };
    checkAuthStatus();
  }, []);

  // Fetch market indices on mount (and after auth token is available)
  useEffect(() => {
    if (authChecking) return;
    if (authRequired && !token) return;

    fetchMarketIndices();
    const interval = setInterval(fetchMarketIndices, 60000); // refresh every minute
    return () => clearInterval(interval);
  }, [authChecking, authRequired, token]);

  const fetchMarketIndices = async () => {
    try {
      const headers: HeadersInit = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      
      const res = await fetch(`${API_BASE_URL}/api/market-summary`, { headers });
      if (res.ok) {
        const data = await res.json();
        setMarketSummary(data);
      }
    } catch (e) {
      console.warn("Could not fetch market indices:", e);
    }
  };

  const handleVerifyPassword = async (password: string): Promise<boolean> => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/auth/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password })
      });
      
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          const bearerToken = data.token;
          setToken(bearerToken);
          localStorage.setItem('ksb_auth_token', bearerToken);
          return true;
        }
      }
      return false;
    } catch (e) {
      console.error("Password verification failed:", e);
      throw e;
    }
  };

  const handleLogout = () => {
    setToken(null);
    localStorage.removeItem('ksb_auth_token');
    setPortfolioData(null);
    setSelectedStock(null);
    setSelectedStockDetail(null);
  };

  const handleUpload = async (file: File, fWeight: number, tWeight: number) => {
    setIsLoading(true);
    setErrorMessage(null);
    setSelectedStock(null);
    setSelectedStockDetail(null);
    
    const formData = new FormData();
    formData.append('file', file);
    formData.append('fundamental_weight', fWeight.toString());
    formData.append('technical_weight', tWeight.toString());
    
    try {
      const headers: HeadersInit = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const res = await fetch(`${API_BASE_URL}/api/upload`, {
        method: 'POST',
        body: formData,
        headers
      });
      
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Failed to process portfolio file.');
      }
      
      const data = await res.json();
      setPortfolioData(data);
    } catch (err: any) {
      console.error(err);
      setErrorMessage(err.message || 'Network connection failed. Make sure your FastAPI backend is running on port 8000.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectStock = async (symbol: string, isEtf: boolean) => {
    setSelectedStock(symbol);
    setIsLoadingDetail(true);
    setErrorMessage(null);
    
    try {
      const headers: HeadersInit = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const res = await fetch(
        `${API_BASE_URL}/api/analyze/${encodeURIComponent(symbol)}?is_etf=${isEtf}&fundamental_weight=${weightF}&technical_weight=${weightT}`,
        { headers }
      );
      
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || `Failed to fetch detailed analytics for ${symbol}`);
      }
      
      const data = await res.json();
      setSelectedStockDetail(data);
    } catch (err: any) {
      console.error(err);
      setSelectedStock(null);
      setErrorMessage(err.message || 'Failed to retrieve detailed technical indicators.');
    } finally {
      setIsLoadingDetail(false);
    }
  };

  // 1. Dynamic Client-Side Portfolio Recalculation
  const recalculatedPortfolioData = useMemo(() => {
    if (!portfolioData) return null;
    
    const recalculatedResults = portfolioData.results.map((stock: any) => {
      let combinedScore = 50.0;
      const techScore = stock.technical_score ?? 50.0;
      const fundScore = stock.fundamental_score ?? 50.0;
      
      if (stock.is_etf) {
        combinedScore = techScore;
      } else {
        combinedScore = (weightF * fundScore) + (weightT * techScore);
      }
      
      let signal = "HOLD";
      let colorTheme = "amber";
      let confidence = combinedScore;
      
      if (combinedScore >= 70) {
        signal = "BUY";
        colorTheme = "emerald";
        confidence = combinedScore;
      } else if (combinedScore >= 40) {
        signal = "HOLD";
        colorTheme = "amber";
        confidence = combinedScore;
      } else {
        signal = "SELL";
        colorTheme = "crimson";
        confidence = 100 - combinedScore;
      }
      
      let verdict = "Consolidating price or fairly valued fundamentals. Maintain position without adding leverage.";
      if (signal === "BUY") {
        verdict = "Attractive asset entry opportunity with positive momentum and underlying security health.";
      } else if (signal === "SELL") {
        verdict = "Weak technical trends or severe overvaluation/balance sheet vulnerabilities. Risk mitigation recommended.";
      }
      
      let summaryText = stock.summary || "";
      if (summaryText) {
        const parts = summaryText.split(/\. (Attractive asset entry|Consolidating price|Weak technical)/);
        if (parts.length > 0) {
          summaryText = parts[0].trim() + ". " + verdict;
        }
      }
      
      return {
        ...stock,
        combined_score: combinedScore,
        signal,
        color_theme: colorTheme,
        confidence,
        summary: summaryText
      };
    });
    
    const total = recalculatedResults.length;
    const buyCount = recalculatedResults.filter((r: any) => r.signal === "BUY").length;
    const holdCount = recalculatedResults.filter((r: any) => r.signal === "HOLD").length;
    const sellCount = recalculatedResults.filter((r: any) => r.signal === "SELL").length;
    
    const avgScore = total ? (recalculatedResults.reduce((acc: number, curr: any) => acc + curr.combined_score, 0) / total) : 0;
    
    let sentiment = "NEUTRAL";
    if (avgScore >= 70) {
      sentiment = "BULLISH";
    } else if (avgScore >= 40) {
      sentiment = "NEUTRAL";
    } else {
      sentiment = "BEARISH";
    }
    
    return {
      ...portfolioData,
      stats: {
        buy_count: buyCount,
        hold_count: holdCount,
        sell_count: sellCount,
        avg_score: avgScore,
        sentiment
      },
      results: recalculatedResults
    };
  }, [portfolioData, weightF, weightT]);

  // 2. Dynamic Client-Side Single Stock Detail Recalculation
  const recalculatedStockDetail = useMemo(() => {
    if (!selectedStockDetail) return null;
    
    const stock = selectedStockDetail;
    let combinedScore = 50.0;
    const techScore = stock.technical_score ?? 50.0;
    const fundScore = stock.fundamental_score ?? 50.0;
    
    if (stock.is_etf) {
      combinedScore = techScore;
    } else {
      combinedScore = (weightF * fundScore) + (weightT * techScore);
    }
    
    let signal = "HOLD";
    let colorTheme = "amber";
    let confidence = combinedScore;
    
    if (combinedScore >= 70) {
      signal = "BUY";
      colorTheme = "emerald";
      confidence = combinedScore;
    } else if (combinedScore >= 40) {
      signal = "HOLD";
      colorTheme = "amber";
      confidence = combinedScore;
    } else {
      signal = "SELL";
      colorTheme = "crimson";
      confidence = 100 - combinedScore;
    }
    
    let verdict = "Consolidating price or fairly valued fundamentals. Maintain position without adding leverage.";
    if (signal === "BUY") {
      verdict = "Attractive asset entry opportunity with positive momentum and underlying security health.";
    } else if (signal === "SELL") {
      verdict = "Weak technical trends or severe overvaluation/balance sheet vulnerabilities. Risk mitigation recommended.";
    }
    
    let summaryText = stock.summary || "";
    if (summaryText) {
      const parts = summaryText.split(/\. (Attractive asset entry|Consolidating price|Weak technical)/);
      if (parts.length > 0) {
        summaryText = parts[0].trim() + ". " + verdict;
      }
    }
    
    return {
      ...stock,
      combined_score: combinedScore,
      signal,
      color_theme: colorTheme,
      confidence,
      summary: summaryText
    };
  }, [selectedStockDetail, weightF, weightT]);

  // Handle loading state for auth check
  if (authChecking) {
    return (
      <div style={{ minHeight: '100vh', background: '#020617', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ position: 'relative', width: '60px', height: '60px' }}>
          <div className="glow-active" style={{ width: '60px', height: '60px', borderRadius: '50%', border: '4px solid rgba(59, 130, 246, 0.1)', borderTopColor: 'var(--color-primary)', animation: 'spin 1.2s linear infinite' }} />
        </div>
      </div>
    );
  }

  // Display Lock Screen if auth is enabled and token is missing
  if (authRequired && !token) {
    return <PasswordGate onVerify={handleVerifyPassword} />;
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      
      {/* Navbar header */}
      <header className="glass-panel" style={{
        padding: '16px 40px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderRadius: '0 0 16px 16px',
        borderTop: 'none',
        position: 'sticky',
        top: 0,
        zIndex: 50
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ background: 'linear-gradient(135deg, var(--color-primary), var(--color-accent))', padding: '10px', borderRadius: '10px', display: 'flex', color: '#fff' }}>
            <TrendingUp size={20} />
          </div>
          <span style={{ fontSize: '1.25rem', fontWeight: 800, fontFamily: 'var(--font-heading)', letterSpacing: '-0.02em' }}>
            PORTFOLIO <span style={{ color: 'var(--color-primary)' }}>ANALYSER</span>
          </span>
        </div>

        {/* Tab switch Navigation pills */}
        <div style={{ display: 'flex', background: 'rgba(255,255,255,0.03)', padding: '4px', borderRadius: '8px', border: '1px solid var(--border-glass)' }}>
          <button 
            onClick={() => setCurrentTab('PORTFOLIO')}
            style={{
              background: currentTab === 'PORTFOLIO' ? 'var(--color-primary)' : 'transparent',
              border: 'none',
              color: currentTab === 'PORTFOLIO' ? 'white' : 'var(--text-muted)',
              padding: '8px 18px',
              borderRadius: '6px',
              fontSize: '0.85rem',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              fontFamily: 'var(--font-heading)'
            }}
          >
            Portfolio Analysis
          </button>
          <button 
            onClick={() => setCurrentTab('SINGLE')}
            style={{
              background: currentTab === 'SINGLE' ? 'var(--color-primary)' : 'transparent',
              border: 'none',
              color: currentTab === 'SINGLE' ? 'white' : 'var(--text-muted)',
              padding: '8px 18px',
              borderRadius: '6px',
              fontSize: '0.85rem',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              fontFamily: 'var(--font-heading)'
            }}
          >
            Single Stock Analysis
          </button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '20px', fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#10b981', boxShadow: '0 0 6px #10b981' }} />
            API Connected
          </span>
          {authRequired && (
            <button 
              onClick={handleLogout}
              className="btn-secondary"
              style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', fontSize: '0.75rem' }}
            >
              <Lock size={12} />
              <span>Lock Terminal</span>
            </button>
          )}
        </div>
      </header>

      <main style={{ flex: '1', position: 'relative' }}>
        {/* Universal Error Message toast */}
        {errorMessage && (
          <div className="glass-panel" style={{
            maxWidth: '640px',
            margin: '24px auto 0',
            padding: '16px 24px',
            borderLeft: '4px solid var(--color-sell)',
            background: 'rgba(239, 68, 68, 0.05)',
            display: 'flex',
            alignItems: 'center',
            gap: '16px'
          }}>
            <ShieldAlert size={24} style={{ color: 'var(--color-sell)', flexShrink: 0 }} />
            <div>
              <h4 style={{ fontWeight: 700 }}>Connection or Processing Alert</h4>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '2px' }}>{errorMessage}</p>
            </div>
            <button 
              onClick={() => setErrorMessage(null)}
              style={{
                marginLeft: 'auto',
                background: 'transparent',
                border: 'none',
                color: 'white',
                cursor: 'pointer',
                fontWeight: 700
              }}
            >
              ×
            </button>
          </div>
        )}

        {currentTab === 'PORTFOLIO' ? (
          <Dashboard 
            portfolioData={recalculatedPortfolioData}
            onUpload={handleUpload}
            onSelectStock={handleSelectStock}
            isLoading={isLoading}
            weightF={weightF}
            weightT={weightT}
            setWeightF={setWeightF}
            setWeightT={setWeightT}
            marketSummary={marketSummary}
          />
        ) : (
          <SingleStockAnalysis 
            API_BASE_URL={API_BASE_URL}
            weightF={weightF}
            weightT={weightT}
            onSelectStock={handleSelectStock}
            token={token}
          />
        )}

        {/* Slide-out details drawer */}
        {selectedStock && (
          <StockDetail 
            stockDetail={recalculatedStockDetail}
            onClose={() => {
              setSelectedStock(null);
              setSelectedStockDetail(null);
            }}
            isLoading={isLoadingDetail}
            onRefresh={handleSelectStock}
          />
        )}
      </main>

      <footer style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-dim)', fontSize: '0.8rem', borderTop: '1px solid rgba(255,255,255,0.02)' }}>
        © {new Date().getFullYear()} Portfolio Analyser by Dr KS Bhoon. All calculations are mathematical models; not direct financial recommendations.
      </footer>
    </div>
  );
}

export default App;
