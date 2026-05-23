import { useState, useEffect } from 'react';
import { Dashboard } from './components/Dashboard';
import { StockDetail } from './components/StockDetail';
import { ShieldAlert, TrendingUp } from 'lucide-react';

const API_BASE_URL = 'http://localhost:8000';

function App() {
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

  // Fetch market indices on mount
  useEffect(() => {
    fetchMarketIndices();
    const interval = setInterval(fetchMarketIndices, 60000); // refresh every minute
    return () => clearInterval(interval);
  }, []);

  const fetchMarketIndices = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/market-summary`);
      if (res.ok) {
        const data = await res.json();
        setMarketSummary(data);
      }
    } catch (e) {
      console.warn("Could not fetch market indices:", e);
    }
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
      const res = await fetch(`${API_BASE_URL}/api/upload`, {
        method: 'POST',
        body: formData,
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
      const res = await fetch(
        `${API_BASE_URL}/api/analyze/${encodeURIComponent(symbol)}?is_etf=${isEtf}&fundamental_weight=${weightF}&technical_weight=${weightT}`
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
            ANTIGRAVITY <span style={{ color: 'var(--color-primary)' }}>QUANT</span>
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#10b981', boxShadow: '0 0 6px #10b981' }} />
            API Connected
          </span>
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

        <Dashboard 
          portfolioData={portfolioData}
          onUpload={handleUpload}
          onSelectStock={handleSelectStock}
          isLoading={isLoading}
          weightF={weightF}
          weightT={weightT}
          setWeightF={setWeightF}
          setWeightT={setWeightT}
          marketSummary={marketSummary}
        />

        {/* Slide-out details drawer */}
        {selectedStock && (
          <StockDetail 
            stockDetail={selectedStockDetail}
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
        © {new Date().getFullYear()} Antigravity Quant Analytics. All calculations are mathematical models; not direct financial recommendations.
      </footer>
    </div>
  );
}

export default App;
