import { useState, useEffect, useMemo } from 'react';
import { Dashboard } from './components/Dashboard';
import { StockDetail } from './components/StockDetail';
import { SingleStockAnalysis } from './components/SingleStockAnalysis';
import { MutualFundAnalysis } from './components/MutualFundAnalysis';
import { SmartPlanner } from './components/SmartPlanner';
import { LoginPage } from './components/LoginPage';
import { AdminPanel } from './components/AdminPanel';
import { ShieldAlert, TrendingUp, LogOut } from 'lucide-react';

const API_BASE_URL = window.location.origin.includes('localhost:5173') 
  ? 'http://localhost:8000' 
  : window.location.origin;

function App() {
  const [token, setToken] = useState<string | null>(localStorage.getItem('ksb_auth_token'));
  const [authRequired, setAuthRequired] = useState<boolean>(false);
  const [adminBypassEnabled, setAdminBypassEnabled] = useState<boolean>(false);
  const [authChecking, setAuthChecking] = useState<boolean>(true);
  const [currentTab, setCurrentTab] = useState<'PORTFOLIO' | 'SINGLE' | 'MF' | 'PLANNER' | 'ADMIN'>('PORTFOLIO');
  const [userProfile, setUserProfile] = useState<{email: string; name: string; picture?: string} | null>(null);
  const [oauthError, setOauthError] = useState<string | null>(null);

  // Hydrate portfolio from localStorage on mount
  const [portfolioData, setPortfolioData] = useState<any>(() => {
    try {
      const saved = localStorage.getItem('ksb_portfolio_cache');
      return saved ? JSON.parse(saved) : null;
    } catch { return null; }
  });
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [selectedStock, setSelectedStock] = useState<string | null>(null);
  const [selectedStockDetail, setSelectedStockDetail] = useState<any>(null);
  const [isLoadingDetail, setIsLoadingDetail] = useState<boolean>(false);
  const [marketSummary, setMarketSummary] = useState<any[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  
  // Weights (default: 60% Fundamental / 40% Technical)
  const [weightF, setWeightF] = useState<number>(0.60);
  const [weightT, setWeightT] = useState<number>(0.40);

  const fetchProfileAndPortfolio = async (authToken: string) => {
    setAuthChecking(true);
    try {
      // 1. Fetch user profile
      const profileRes = await fetch(`${API_BASE_URL}/api/auth/me`, {
        headers: { 'Authorization': `Bearer ${authToken}` }
      });
      if (profileRes.ok) {
        const profile = await profileRes.json();
        setUserProfile(profile);

        // 2. Fetch portfolio from database
        const portfolioRes = await fetch(`${API_BASE_URL}/api/portfolio/load`, {
          headers: { 'Authorization': `Bearer ${authToken}` }
        });
        if (portfolioRes.ok) {
          const portfolio = await portfolioRes.json();
          if (portfolio.found) {
            setPortfolioData(portfolio);
            try { localStorage.setItem('ksb_portfolio_cache', JSON.stringify(portfolio)); } catch {}
          }
        }
      } else {
        // Token invalid/expired
        handleLogout();
      }
    } catch (e) {
      console.warn("Error fetching profile or portfolio:", e);
    } finally {
      setAuthChecking(false);
    }
  };

  // Check auth status and handle OAuth callbacks on mount
  useEffect(() => {
    const initAuth = async () => {
      const params = new URLSearchParams(window.location.search);
      const urlToken = params.get('token');
      const urlError = params.get('auth_error');
      let currentToken = token;

      if (urlToken) {
        localStorage.setItem('ksb_auth_token', urlToken);
        setToken(urlToken);
        currentToken = urlToken;
        params.delete('token');
        const newSearch = params.toString() ? `?${params.toString()}` : '';
        window.history.replaceState({}, document.title, `${window.location.pathname}${newSearch}`);
      }

      if (urlError) {
        setOauthError(urlError);
        params.delete('auth_error');
        params.delete('email'); // if present in URL
        const newSearch = params.toString() ? `?${params.toString()}` : '';
        window.history.replaceState({}, document.title, `${window.location.pathname}${newSearch}`);
      }

      // Fetch server auth status configuration
      try {
        const res = await fetch(`${API_BASE_URL}/api/auth/status`);
        if (res.ok) {
          const data = await res.json();
          setAuthRequired(data.auth_required);
          setAdminBypassEnabled(data.admin_bypass);
        }
      } catch (e) {
        console.warn("Could not check auth status:", e);
      }

      if (currentToken) {
        await fetchProfileAndPortfolio(currentToken);
      } else {
        setAuthChecking(false);
      }
    };
    initAuth();
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

  const handleAdminLogin = async (password: string): Promise<boolean> => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/auth/admin-login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password })
      });
      
      if (res.ok) {
        const data = await res.json();
        if (data.token) {
          const bearerToken = data.token;
          setToken(bearerToken);
          localStorage.setItem('ksb_auth_token', bearerToken);
          await fetchProfileAndPortfolio(bearerToken);
          return true;
        }
      }
      return false;
    } catch (e) {
      console.error("Admin login failed:", e);
      throw e;
    }
  };

  const handleLogout = () => {
    if (token) {
      fetch(`${API_BASE_URL}/api/auth/logout`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      }).catch(() => {});
    }
    setToken(null);
    setUserProfile(null);
    localStorage.removeItem('ksb_auth_token');
    localStorage.removeItem('ksb_portfolio_cache');
    setPortfolioData(null);
    setSelectedStock(null);
    setSelectedStockDetail(null);
  };

  const handleClearPortfolio = async () => {
    if (token) {
      try {
        await fetch(`${API_BASE_URL}/api/portfolio/clear`, {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${token}` }
        });
      } catch (e) {
        console.warn("Failed to clear portfolio on server:", e);
      }
    }
    localStorage.removeItem('ksb_portfolio_cache');
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
      // Persist to localStorage so it survives refresh and tab switches
      try { localStorage.setItem('ksb_portfolio_cache', JSON.stringify(data)); } catch {}

      // Server-side save if authenticated
      if (token) {
        await fetch(`${API_BASE_URL}/api/portfolio/save`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ file_name: file.name, data })
        }).catch(e => console.warn("Failed to auto-save portfolio to server:", e));
      }
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
    return (
      <LoginPage 
        API_BASE_URL={API_BASE_URL}
        onAdminLogin={handleAdminLogin}
        showAdminBypass={adminBypassEnabled}
        authError={oauthError}
      />
    );
  }

  const isAdmin = userProfile?.email === "admin@ksbhoon.local" || userProfile?.email === "drbhoon@gmail.com";
  const tabs = isAdmin 
    ? (['PORTFOLIO', 'SINGLE', 'MF', 'PLANNER', 'ADMIN'] as const)
    : (['PORTFOLIO', 'SINGLE', 'MF', 'PLANNER'] as const);

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
        <div style={{ display: 'flex', background: 'rgba(255,255,255,0.03)', padding: '4px', borderRadius: '8px', border: '1px solid var(--border-glass)', flexWrap: 'wrap', gap: '2px' }}>
          {tabs.map(tab => {
            const labels: Record<string, string> = {
              PORTFOLIO: 'Portfolio',
              SINGLE: 'Single Stock',
              MF: 'Mutual Funds',
              PLANNER: 'Smart Planner',
              ADMIN: 'Admin Panel'
            };
            return (
              <button
                key={tab}
                onClick={() => setCurrentTab(tab)}
                style={{
                  background: currentTab === tab ? 'var(--color-primary)' : 'transparent',
                  border: 'none',
                  color: currentTab === tab ? 'white' : 'var(--text-muted)',
                  padding: '8px 14px',
                  borderRadius: '6px',
                  fontSize: '0.82rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  fontFamily: 'var(--font-heading)',
                  whiteSpace: 'nowrap'
                }}
              >
                {labels[tab]}
              </button>
            );
          })}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          {userProfile && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', background: 'rgba(255,255,255,0.03)', padding: '6px 12px', borderRadius: '20px', border: '1px solid var(--border-glass)' }}>
              {userProfile.picture ? (
                <img 
                  src={userProfile.picture} 
                  alt={userProfile.name} 
                  style={{ width: '24px', height: '24px', borderRadius: '50%', border: '1px solid rgba(255,255,255,0.2)' }}
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: 'var(--color-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', color: 'white', fontWeight: 700 }}>
                  {userProfile.name ? userProfile.name[0].toUpperCase() : 'U'}
                </div>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', textAlign: 'left' }}>
                <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'white', lineHeight: 1.2 }}>{userProfile.name}</span>
                <span style={{ fontSize: '0.68rem', color: 'var(--text-dim)', lineHeight: 1 }}>{userProfile.email}</span>
              </div>
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: '20px', fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#10b981', boxShadow: '0 0 6px #10b981' }} />
              API Connected
            </span>
            {token && (
              <button 
                onClick={handleLogout}
                className="btn-secondary"
                style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', fontSize: '0.75rem' }}
              >
                <LogOut size={12} />
                <span>Sign Out</span>
              </button>
            )}
          </div>
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

        {currentTab === 'PORTFOLIO' && (
          <Dashboard 
            portfolioData={recalculatedPortfolioData}
            onUpload={handleUpload}
            onSelectStock={handleSelectStock}
            onClearPortfolio={handleClearPortfolio}
            isLoading={isLoading}
            weightF={weightF}
            weightT={weightT}
            setWeightF={setWeightF}
            setWeightT={setWeightT}
            marketSummary={marketSummary}
          />
        )}
        {currentTab === 'SINGLE' && (
          <SingleStockAnalysis 
            API_BASE_URL={API_BASE_URL}
            weightF={weightF}
            weightT={weightT}
            onSelectStock={handleSelectStock}
            token={token}
          />
        )}
        {currentTab === 'MF' && (
          <MutualFundAnalysis
            API_BASE_URL={API_BASE_URL}
            token={token}
          />
        )}
        {currentTab === 'PLANNER' && (
          <SmartPlanner
            API_BASE_URL={API_BASE_URL}
            token={token}
            onSelectStock={handleSelectStock}
          />
        )}
        {currentTab === 'ADMIN' && (
          <AdminPanel
            API_BASE_URL={API_BASE_URL}
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
