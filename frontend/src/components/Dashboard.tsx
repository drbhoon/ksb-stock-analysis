import React, { useState, useMemo } from 'react';
import { Upload, AlertTriangle, TrendingUp, TrendingDown, Activity, Settings, RefreshCw, BarChart2, ShieldAlert, Download } from 'lucide-react';

interface StockResult {
  symbol: string;
  company_name: string;
  is_etf: boolean;
  latest_price: number;
  change: number;
  change_percent: number;
  technical_score: number;
  fundamental_score: number;
  combined_score: number;
  signal: string;
  color_theme: string;
  confidence: number;
  summary: string;
  uploaded_isin: string;
  uploaded_symbol: string;
  row_index: number;
}

interface DashboardProps {
  portfolioData: any;
  onUpload: (file: File, weightF: number, weightT: number) => void;
  onSelectStock: (symbol: string, isEtf: boolean) => void;
  onClearPortfolio: () => void;
  isLoading: boolean;
  weightF: number;
  weightT: number;
  setWeightF: (w: number) => void;
  setWeightT: (w: number) => void;
  marketSummary: any[];
}

export const Dashboard: React.FC<DashboardProps> = ({
  portfolioData,
  onUpload,
  onSelectStock,
  onClearPortfolio,
  isLoading,
  weightF,
  weightT,
  setWeightF,
  setWeightT,
  marketSummary
}) => {
  const [dragActive, setDragActive] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState('ALL');
  const [showSettings, setShowSettings] = useState(false);

  const downloadTemplateCSV = () => {
    const headers = ["Stock Symb", "Company Name", "ISIN Code"];
    const sampleRows = [
      ["GABIND", "GABRIEL INDIA", "INE524A01029"],
      ["ASHLEY", "ASHOK LEYLAND", "INE208A01029"],
      ["ELEENG", "ELECON ENGINEERING", "INE205B01031"],
      ["VARBEV", "VARUN BEVERAGES", "INE200M01039"],
      ["MAXHEA", "MAX HEALTHCARE", "INE027H01010"]
    ];
    
    const csvContent = [
      headers.join(","),
      ...sampleRows.map(row => row.join(","))
    ].join("\n");
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", "portfolio_upload_template.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      onUpload(e.dataTransfer.files[0], weightF, weightT);
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      onUpload(e.target.files[0], weightF, weightT);
    }
  };

  // Filter & Search stocks
  const filteredStocks = useMemo(() => {
    if (!portfolioData || !portfolioData.results) return [];
    
    return portfolioData.results.filter((stock: StockResult) => {
      const matchesSearch = 
        stock.symbol.toLowerCase().includes(searchQuery.toLowerCase()) ||
        stock.company_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        stock.uploaded_isin.toLowerCase().includes(searchQuery.toLowerCase());
        
      const matchesFilter = activeFilter === 'ALL' || stock.signal === activeFilter;
      
      return matchesSearch && matchesFilter;
    });
  }, [portfolioData, searchQuery, activeFilter]);

  // Statistics calculation for dynamic donut chart
  const buyPct = useMemo(() => {
    if (!portfolioData || !portfolioData.stats) return 0;
    const total = portfolioData.analyzed_count;
    return total ? Math.round((portfolioData.stats.buy_count / total) * 100) : 0;
  }, [portfolioData]);

  const holdPct = useMemo(() => {
    if (!portfolioData || !portfolioData.stats) return 0;
    const total = portfolioData.analyzed_count;
    return total ? Math.round((portfolioData.stats.hold_count / total) * 100) : 0;
  }, [portfolioData]);

  const sellPct = useMemo(() => {
    if (!portfolioData || !portfolioData.stats) return 0;
    const total = portfolioData.analyzed_count;
    return total ? Math.round((portfolioData.stats.sell_count / total) * 100) : 0;
  }, [portfolioData]);

  return (
    <div className="dashboard-shell" style={{ maxWidth: '1440px', margin: '0 auto', padding: '24px 20px' }}>
      {/* 1. Market Strip */}
      {marketSummary && marketSummary.length > 0 && (
        <div style={{ display: 'flex', gap: '16px', overflowX: 'auto', marginBottom: '24px', paddingBottom: '8px' }}>
          {marketSummary.map((idx: any) => (
            <div key={idx.symbol} className="glass-card" style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '12px 20px', flex: '1', minWidth: '220px' }}>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>{idx.name}</span>
                <span style={{ fontSize: '1.2rem', fontFamily: 'var(--font-heading)', fontWeight: 700 }}>
                  {(idx.price || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                </span>
              </div>
              <div style={{ 
                marginLeft: 'auto', 
                display: 'flex', 
                alignItems: 'center', 
                gap: '4px',
                color: (idx.change || 0) >= 0 ? 'var(--color-buy)' : 'var(--color-sell)',
                fontSize: '0.9rem',
                fontWeight: 600
              }}>
                {(idx.change || 0) >= 0 ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
                <span>{((idx.change_percent || 0) >= 0 ? '+' : '') + (idx.change_percent || 0).toFixed(2)}%</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 2. Top Centered Heading */}
      <div className="dashboard-hero" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', marginBottom: '36px', position: 'relative' }}>
        <h1 className="dashboard-title" style={{ 
          fontSize: '2.8rem', 
          fontWeight: 800, 
          background: 'linear-gradient(135deg, #fff 30%, var(--text-muted) 100%)', 
          WebkitBackgroundClip: 'text', 
          WebkitTextFillColor: 'transparent',
          letterSpacing: '-0.02em',
          marginBottom: '6px'
        }}>
          Portfolio Analyser by Dr KS Bhoon
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '1.05rem', maxWidth: '720px', lineHeight: '1.5' }}>
          Comprehensive Quantitative Technical & Fundamental Asset Intelligence for Indian Markets
        </p>
        
        <button 
          className="btn-secondary" 
          onClick={() => setShowSettings(!showSettings)}
          style={{ gap: '8px', padding: '10px 18px', marginTop: '16px', fontSize: '0.85rem' }}
        >
          <Settings size={16} />
          <span>Adjust Analysis Weights</span>
        </button>
      </div>

      {/* 3. Settings Drawer/Panel */}
      {showSettings && (
        <div className="glass-panel glow-active settings-panel" style={{ padding: '24px', marginBottom: '24px', borderLeft: '4px solid var(--color-primary)' }}>
          <h3 style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Settings size={20} className="text-glow-primary" />
            Adjust Portfolio Signal Weights
          </h3>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '20px' }}>
            Adjust the weights below to tailor signals to your investment methodology. (Signals recalculate automatically on next upload).
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '24px' }}>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={{ fontWeight: 600 }}>Fundamental Weight</span>
                <span style={{ color: 'var(--color-primary)', fontWeight: 700 }}>{Math.round(weightF * 100)}%</span>
              </div>
              <input 
                type="range" 
                min="0" 
                max="1" 
                step="0.05" 
                value={weightF}
                onChange={(e) => {
                  const val = parseFloat(e.target.value);
                  setWeightF(val);
                  setWeightT(1 - val);
                }}
                style={{ width: '100%', height: '6px', borderRadius: '3px', accentColor: 'var(--color-primary)' }}
              />
              <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>Long-term balance sheet health, P/E multiples, capital yield.</span>
            </div>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={{ fontWeight: 600 }}>Technical Weight</span>
                <span style={{ color: 'var(--color-primary)', fontWeight: 700 }}>{Math.round(weightT * 100)}%</span>
              </div>
              <input 
                type="range" 
                min="0" 
                max="1" 
                step="0.05" 
                value={weightT}
                onChange={(e) => {
                  const val = parseFloat(e.target.value);
                  setWeightT(val);
                  setWeightF(1 - val);
                }}
                style={{ width: '100%', height: '6px', borderRadius: '3px', accentColor: 'var(--color-primary)' }}
              />
              <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>Trend momentum (EMAs), overbought/oversold indicators (RSI), MACD velocity.</span>
            </div>
          </div>
        </div>
      )}

      {/* 4. Main Body: Uploader or Dashboard Stats */}
      {!portfolioData && !isLoading ? (
        // Initial Uploader State
        <div className="glass-panel upload-panel" style={{ padding: '60px 40px', maxWidth: '640px', margin: '40px auto' }}>
          <div 
            className={`dropzone ${dragActive ? 'active' : ''}`}
            onDragEnter={handleDrag}
            onDragOver={handleDrag}
            onDragLeave={handleDrag}
            onDrop={handleDrop}
          >
            <div style={{ background: 'rgba(59, 130, 246, 0.1)', padding: '20px', borderRadius: '50%', color: 'var(--color-primary)', marginBottom: '8px' }}>
              <Upload size={36} />
            </div>
            <h3 style={{ fontSize: '1.4rem' }}>Upload Stock Portfolio</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', maxWidth: '400px', margin: '0 auto' }}>
              Drag and drop your portfolio Excel (.xlsx, .xls) or CSV file here, or click to browse files.
            </p>
            <div className="upload-feature-list" style={{ margin: '16px 0', fontSize: '0.75rem', color: 'var(--text-dim)', display: 'flex', gap: '16px' }}>
              <span>✓ Auto ISIN Resolution</span>
              <span>✓ Technical indicators</span>
              <span>✓ Valuation scores</span>
            </div>
            
            <input 
              type="file" 
              id="file-upload" 
              accept=".xlsx,.xls,.csv" 
              onChange={handleFileInput}
              style={{ display: 'none' }}
            />
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', marginTop: '16px', flexWrap: 'wrap' }}>
              <label htmlFor="file-upload" className="btn-primary" style={{ cursor: 'pointer', margin: 0 }}>
                Select Spreadsheet
              </label>
              <button 
                onClick={downloadTemplateCSV}
                className="btn-secondary"
                style={{ gap: '6px', fontSize: '0.9rem', padding: '12px 18px', display: 'flex', alignItems: 'center' }}
              >
                <Download size={16} />
                <span>Download Template (.csv)</span>
              </button>
            </div>
          </div>
        </div>
      ) : isLoading ? (
        // Loading State
        <div className="glass-panel" style={{ padding: '80px 40px', textAlign: 'center', maxWidth: '640px', margin: '40px auto' }}>
          <div style={{ position: 'relative', width: '80px', height: '80px', margin: '0 auto 24px' }}>
            <div className="glow-active" style={{ width: '80px', height: '80px', borderRadius: '50%', border: '4px solid rgba(59, 130, 246, 0.1)', borderTopColor: 'var(--color-primary)', animation: 'spin 1.2s linear infinite' }} />
          </div>
          <h3 style={{ fontSize: '1.4rem', marginBottom: '8px' }}>Fetching Financial Intelligence...</h3>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', maxWidth: '420px', margin: '0 auto' }}>
            Downloading official NSE security structures, resolving ISIN mappings, and performing advanced quantitative analysis. This takes about 5-10 seconds.
          </p>
          <style>{`
            @keyframes spin {
              0% { transform: rotate(0deg); }
              100% { transform: rotate(360deg); }
            }
          `}</style>
        </div>
      ) : (
        // Portfolio Analysis Visual Dashboard
        <div>
          {/* Summary Metric Cards */}
          <div className="summary-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '20px', marginBottom: '32px' }}>
            <div className="glass-panel" style={{ padding: '24px', display: 'flex', alignItems: 'center', gap: '20px' }}>
              <div style={{ background: 'rgba(59, 130, 246, 0.1)', color: 'var(--color-primary)', padding: '16px', borderRadius: '12px' }}>
                <Activity size={24} />
              </div>
              <div>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 600 }}>PORTFOLIO SENTIMENT</span>
                <h3 className={
                  portfolioData.stats.sentiment === 'BULLISH' ? 'text-glow-emerald' : 
                  portfolioData.stats.sentiment === 'BEARISH' ? 'text-glow-crimson' : 'text-glow-amber'
                } style={{ fontSize: '1.6rem', fontWeight: 800, marginTop: '2px' }}>
                  <span className={`pulse-dot ${
                    portfolioData.stats.sentiment === 'BULLISH' ? 'pulse-dot-buy' : 
                    portfolioData.stats.sentiment === 'BEARISH' ? 'pulse-dot-sell' : 'pulse-dot-hold'
                  }`} />
                  {portfolioData.stats.sentiment}
                </h3>
              </div>
            </div>

            <div className="glass-panel glow-card-emerald" style={{ padding: '24px', display: 'flex', alignItems: 'center', gap: '20px' }}>
              <div style={{ background: 'var(--color-buy-trans)', color: 'var(--color-buy)', padding: '16px', borderRadius: '12px' }}>
                <TrendingUp size={24} />
              </div>
              <div>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 600 }}>BUY SIGNALS</span>
                <h3 style={{ fontSize: '2rem', fontWeight: 800, marginTop: '2px', color: 'var(--color-buy)' }}>
                  {portfolioData.stats.buy_count} <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)', fontWeight: 400 }}>({buyPct}%)</span>
                </h3>
              </div>
            </div>

            <div className="glass-panel glow-card-amber" style={{ padding: '24px', display: 'flex', alignItems: 'center', gap: '20px' }}>
              <div style={{ background: 'var(--color-hold-trans)', color: 'var(--color-hold)', padding: '16px', borderRadius: '12px' }}>
                <RefreshCw size={24} />
              </div>
              <div>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 600 }}>HOLD SIGNALS</span>
                <h3 style={{ fontSize: '2rem', fontWeight: 800, marginTop: '2px', color: 'var(--color-hold)' }}>
                  {portfolioData.stats.hold_count} <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)', fontWeight: 400 }}>({holdPct}%)</span>
                </h3>
              </div>
            </div>

            <div className="glass-panel glow-card-crimson" style={{ padding: '24px', display: 'flex', alignItems: 'center', gap: '20px' }}>
              <div style={{ background: 'var(--color-sell-trans)', color: 'var(--color-sell)', padding: '16px', borderRadius: '12px' }}>
                <TrendingDown size={24} />
              </div>
              <div>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 600 }}>SELL SIGNALS</span>
                <h3 style={{ fontSize: '2rem', fontWeight: 800, marginTop: '2px', color: 'var(--color-sell)' }}>
                  {portfolioData.stats.sell_count} <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)', fontWeight: 400 }}>({sellPct}%)</span>
                </h3>
              </div>
            </div>
          </div>

          {/* Core Grid: Donut Distribution Chart & File Upload Re-dropzone */}
          <div className="dashboard-main-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '24px', marginBottom: '32px' }}>
            {/* Donut graphic */}
            <div className="glass-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
              <h3 style={{ marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '1.1rem' }}>
                <BarChart2 size={18} style={{ color: 'var(--color-primary)' }} />
                Signal Allocation Breakdown
              </h3>
              
              <div className="signal-allocation" style={{ display: 'flex', alignItems: 'center', gap: '40px', padding: '10px' }}>
                <div style={{ position: 'relative', width: '120px', height: '120px' }}>
                  {/* Custom elegant SVG Circle Ring representing distribution */}
                  <svg width="120" height="120" viewBox="0 0 42 42" style={{ transform: 'rotate(-90deg)', width: '100%', height: '100%' }}>
                    <circle cx="21" cy="21" r="15.915" fill="transparent" stroke="rgba(255,255,255,0.03)" strokeWidth="4.5" />
                    
                    {/* Buy segment */}
                    <circle cx="21" cy="21" r="15.915" fill="transparent" stroke="var(--color-buy)" strokeWidth="4.5" 
                      strokeDasharray={`${buyPct} ${100 - buyPct}`} strokeDashoffset="0" />
                      
                    {/* Hold segment */}
                    <circle cx="21" cy="21" r="15.915" fill="transparent" stroke="var(--color-hold)" strokeWidth="4.5" 
                      strokeDasharray={`${holdPct} ${100 - holdPct}`} strokeDashoffset={-buyPct} />
                      
                    {/* Sell segment */}
                    <circle cx="21" cy="21" r="15.915" fill="transparent" stroke="var(--color-sell)" strokeWidth="4.5" 
                      strokeDasharray={`${sellPct} ${100 - sellPct}`} strokeDashoffset={-(buyPct + holdPct)} />
                  </svg>
                  <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                    <span style={{ fontSize: '1.4rem', fontWeight: 800, fontFamily: 'var(--font-heading)' }}>
                      {portfolioData.analyzed_count}
                    </span>
                    <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Assets</span>
                  </div>
                </div>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', flex: '1' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.9rem' }}>
                      <span style={{ width: '12px', height: '12px', borderRadius: '3px', background: 'var(--color-buy)' }} />
                      <span>Buy Opportunities</span>
                    </div>
                    <span style={{ fontWeight: 700 }}>{buyPct}%</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.9rem' }}>
                      <span style={{ width: '12px', height: '12px', borderRadius: '3px', background: 'var(--color-hold)' }} />
                      <span>Hold/Consolidate</span>
                    </div>
                    <span style={{ fontWeight: 700 }}>{holdPct}%</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.9rem' }}>
                      <span style={{ width: '12px', height: '12px', borderRadius: '3px', background: 'var(--color-sell)' }} />
                      <span>Risk Exits</span>
                    </div>
                    <span style={{ fontWeight: 700 }}>{sellPct}%</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Quick Upload re-zone */}
            <div className="glass-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
              <div 
                className={`dropzone ${dragActive ? 'active' : ''}`}
                onDragEnter={handleDrag}
                onDragOver={handleDrag}
                onDragLeave={handleDrag}
                onDrop={handleDrop}
                style={{ padding: '16px', background: 'transparent', height: '100%' }}
              >
                <Upload size={24} style={{ color: 'var(--color-primary)' }} />
                <span style={{ fontWeight: 600, fontSize: '0.95rem' }}>Upload different portfolio spreadsheet</span>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Analyzed file: {portfolioData.file_name}</span>
                <input 
                  type="file" 
                  id="file-upload-re" 
                  accept=".xlsx,.xls,.csv" 
                  onChange={handleFileInput}
                  style={{ display: 'none' }}
                />
                <label htmlFor="file-upload-re" className="btn-secondary" style={{ cursor: 'pointer', padding: '6px 12px', fontSize: '0.8rem', marginTop: '4px' }}>
                  Browse Files
                </label>
              </div>
            </div>
          </div>

          {/* Failed Assets Panel */}
          {portfolioData.failed && portfolioData.failed.length > 0 && (
            <div className="glass-panel glow-card-crimson" style={{ padding: '20px', marginBottom: '24px', background: 'rgba(239, 68, 68, 0.03)' }}>
              <h4 style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--color-sell)', fontWeight: 700, marginBottom: '12px' }}>
                <AlertTriangle size={18} />
                Failed Asset Mappings ({portfolioData.failed.length})
              </h4>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '12px' }}>
                The following listings from your spreadsheet could not be resolved or had temporary query timeouts.
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '12px' }}>
                {portfolioData.failed.map((item: any, idx: number) => (
                  <div key={idx} style={{ background: 'rgba(0,0,0,0.2)', padding: '10px 14px', borderRadius: '8px', border: '1px solid rgba(255, 255, 255, 0.03)', fontSize: '0.8rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 600, color: 'var(--text-main)' }}>
                      <span>Row {item.row_index}: {item.symbol || 'Unknown'}</span>
                      <span style={{ fontFamily: 'monospace', color: 'var(--text-muted)' }}>{item.isin}</span>
                    </div>
                    <div style={{ color: 'var(--color-sell)', marginTop: '4px', fontSize: '0.75rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={item.error}>
                      Error: {item.error}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 5. Rich Filterable Datagrid */}
          <div className="glass-panel" style={{ padding: '24px', overflow: 'hidden' }}>
            <div className="recommendation-controls" style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
              <h3 style={{ fontSize: '1.2rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <ShieldAlert size={20} style={{ color: 'var(--color-primary)' }} />
                Recommendations Log
              </h3>
              <button
                onClick={onClearPortfolio}
                title="Clear portfolio and upload a new file"
                style={{
                  background: 'rgba(239,68,68,0.08)',
                  border: '1px solid rgba(239,68,68,0.25)',
                  color: 'var(--color-sell)',
                  padding: '6px 14px',
                  borderRadius: '8px',
                  fontSize: '0.78rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(239,68,68,0.18)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'rgba(239,68,68,0.08)')}
              >
                ✕ Clear Portfolio
              </button>
              
              {/* Filters */}
              <div style={{ display: 'flex', background: 'rgba(255,255,255,0.03)', padding: '4px', borderRadius: '8px', border: '1px solid var(--border-glass)' }}>
                {['ALL', 'BUY', 'HOLD', 'SELL'].map((filter) => (
                  <button 
                    key={filter}
                    onClick={() => setActiveFilter(filter)}
                    style={{
                      background: activeFilter === filter ? 'var(--color-primary)' : 'transparent',
                      border: 'none',
                      color: activeFilter === filter ? 'white' : 'var(--text-muted)',
                      padding: '6px 14px',
                      borderRadius: '6px',
                      fontSize: '0.8rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      transition: 'all 0.2s ease'
                    }}
                  >
                    {filter}
                  </button>
                ))}
              </div>

              {/* Search Bar */}
              <input 
                className="recommendation-search"
                type="text" 
                placeholder="Search by symbol, company, ISIN..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid var(--border-glass)',
                  padding: '10px 16px',
                  borderRadius: '8px',
                  color: 'white',
                  width: '280px',
                  fontSize: '0.85rem'
                }}
              />
            </div>

            {/* Table */}
            <div style={{ overflowX: 'auto' }}>
              {filteredStocks.length === 0 ? (
                <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                  <AlertTriangle size={32} style={{ margin: '0 auto 12px', color: 'var(--color-hold)' }} />
                  <p>No securities found matching your filter criteria.</p>
                </div>
              ) : (
                <table className="premium-table">
                  <thead>
                    <tr>
                      <th style={{ width: '60px' }}>Row</th>
                      <th>Resolved Ticker</th>
                      <th>Company Name</th>
                      <th>ISIN</th>
                      <th style={{ textAlign: 'right' }}>Price (INR)</th>
                      <th style={{ textAlign: 'right' }}>Daily Change</th>
                      <th style={{ textAlign: 'center' }}>Tech Score</th>
                      <th style={{ textAlign: 'center' }}>Fund Score</th>
                      <th style={{ textAlign: 'center' }}>Signal</th>
                      <th style={{ textAlign: 'right' }}>Intelligence</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredStocks.map((stock: StockResult) => (
                      <tr key={stock.symbol} onClick={() => onSelectStock(stock.symbol, stock.is_etf)}>
                        <td style={{ color: 'var(--text-dim)', fontWeight: 600 }}>{stock.row_index}</td>
                        <td style={{ fontWeight: 700, letterSpacing: '0.02em', color: 'var(--text-main)' }}>
                          {stock.symbol}
                          {stock.is_etf && <span style={{ fontSize: '0.65rem', background: 'rgba(255,255,255,0.08)', padding: '2px 4px', borderRadius: '4px', marginLeft: '6px', color: 'var(--text-muted)' }}>ETF</span>}
                        </td>
                        <td style={{ maxWidth: '240px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {stock.company_name}
                        </td>
                        <td style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                          {stock.uploaded_isin}
                        </td>
                        <td style={{ textAlign: 'right', fontWeight: 700, fontFamily: 'var(--font-heading)' }}>
                          {(stock.latest_price || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                        <td style={{ 
                          textAlign: 'right', 
                          fontWeight: 600,
                          color: (stock.change || 0) >= 0 ? 'var(--color-buy)' : 'var(--color-sell)'
                        }}>
                          {((stock.change_percent || 0) >= 0 ? '+' : '') + (stock.change_percent || 0).toFixed(2)}%
                        </td>
                        <td style={{ textAlign: 'center', fontWeight: 600 }}>
                          <span style={{ 
                            color: (stock.technical_score || 0) >= 70 ? 'var(--color-buy)' : (stock.technical_score || 0) >= 40 ? 'var(--color-hold)' : 'var(--color-sell)'
                          }}>{Math.round(stock.technical_score || 0)}</span>
                        </td>
                        <td style={{ textAlign: 'center', fontWeight: 600 }}>
                          {stock.is_etf ? (
                            <span style={{ color: 'var(--text-dim)' }}>—</span>
                          ) : (
                            <span style={{ 
                              color: (stock.fundamental_score || 0) >= 70 ? 'var(--color-buy)' : (stock.fundamental_score || 0) >= 40 ? 'var(--color-hold)' : 'var(--color-sell)'
                            }}>{Math.round(stock.fundamental_score || 0)}</span>
                          )}
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <span className={`badge ${
                            stock.signal === 'BUY' ? 'badge-buy' : 
                            stock.signal === 'HOLD' ? 'badge-hold' : 'badge-sell'
                          }`}>
                            {stock.signal}
                          </span>
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <button className="btn-secondary" style={{ padding: '6px 12px', fontSize: '0.75rem' }}>
                            Inspect
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
