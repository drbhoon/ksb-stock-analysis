import React, { useState, useRef, useCallback } from 'react';
import {
  Search, Upload, TrendingUp, TrendingDown, RefreshCw,
  Download, AlertTriangle, X, BarChart2, HelpCircle
} from 'lucide-react';

interface MFResult {
  scheme_code: number;
  scheme_name: string;
  category: string;
  latest_nav: number | null;
  return_1m: number | null;
  return_3m: number | null;
  return_6m: number | null;
  return_1y: number | null;
  volatility: number | null;
  score: number;
  signal: 'BUY' | 'HOLD' | 'SELL';
  error?: string;
}

interface SearchResult {
  scheme_code: number;
  scheme_name: string;
  category: string;
}

interface Props {
  API_BASE_URL: string;
  token: string | null;
}

const SIGNAL_COLORS: Record<string, string> = {
  BUY: 'var(--color-buy)',
  HOLD: 'var(--color-hold)',
  SELL: 'var(--color-sell)',
};

const SIGNAL_BG: Record<string, string> = {
  BUY: 'var(--color-buy-trans)',
  HOLD: 'var(--color-hold-trans)',
  SELL: 'var(--color-sell-trans)',
};

const fmtReturn = (v: number | null) => {
  if (v === null || v === undefined) return '—';
  const color = v >= 0 ? 'var(--color-buy)' : 'var(--color-sell)';
  return <span style={{ color, fontWeight: 700 }}>{v >= 0 ? '+' : ''}{v.toFixed(2)}%</span>;
};

export const MutualFundAnalysis: React.FC<Props> = ({ API_BASE_URL, token }) => {
  const [subTab, setSubTab] = useState<'SEARCH' | 'UPLOAD'>('SEARCH');

  // Search mode state
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [basket, setBasket] = useState<{ scheme_code: number; scheme_name: string; category: string }[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Upload mode state
  const [dragActive, setDragActive] = useState(false);
  const [uploadedNames, setUploadedNames] = useState<string[]>([]);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Analysis state
  const [isAnalysing, setIsAnalysing] = useState(false);
  const [results, setResults] = useState<MFResult[]>([]);
  const [errors, setErrors] = useState<any[]>([]);
  const [analysisError, setAnalysisError] = useState<string | null>(null);

  const authHeaders = useCallback((): HeadersInit => {
    return token ? { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' };
  }, [token]);

  // --- Search autocomplete ---
  const handleQueryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setQuery(val);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (val.trim().length < 2) {
      setSearchResults([]);
      setShowDropdown(false);
      return;
    }
    searchTimer.current = setTimeout(async () => {
      setSearchLoading(true);
      try {
        const res = await fetch(`${API_BASE_URL}/api/mf/search?q=${encodeURIComponent(val)}`, { headers: authHeaders() });
        if (res.ok) {
          const data = await res.json();
          setSearchResults(data);
          setShowDropdown(data.length > 0);
        }
      } catch { /* silently ignore */ }
      finally { setSearchLoading(false); }
    }, 300);
  };

  const addToBasket = (fund: SearchResult) => {
    if (!basket.find(b => b.scheme_code === fund.scheme_code)) {
      setBasket(prev => [...prev, fund]);
    }
    setQuery('');
    setSearchResults([]);
    setShowDropdown(false);
  };

  const removeFromBasket = (code: number) => setBasket(prev => prev.filter(b => b.scheme_code !== code));

  // --- Upload mode ---
  const parseUploadFile = async (file: File) => {
    setUploadError(null);
    try {
      const text = await file.text();
      let names: string[] = [];
      if (file.name.endsWith('.csv')) {
        names = text.split('\n').map(l => l.trim().replace(/^"|"$/g, '')).filter(Boolean);
        // Remove header if it looks like a header
        if (names[0] && names[0].toLowerCase().includes('fund')) names.shift();
      } else {
        setUploadError('Please upload a CSV file. Use one fund name per row.');
        return;
      }
      setUploadedNames(names.slice(0, 50)); // max 50
    } catch {
      setUploadError('Failed to read the file. Please try again.');
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    const file = e.dataTransfer.files[0];
    if (file) parseUploadFile(file);
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) parseUploadFile(file);
  };

  // --- Analyse ---
  const runAnalysis = async () => {
    if (subTab === 'SEARCH' && basket.length === 0) return;
    if (subTab === 'UPLOAD' && uploadedNames.length === 0) return;

    setIsAnalysing(true);
    setResults([]);
    setErrors([]);
    setAnalysisError(null);

    try {
      if (subTab === 'UPLOAD') {
        // Step 1: fuzzy-match names to scheme codes
        const matchRes = await fetch(`${API_BASE_URL}/api/mf/match`, {
          method: 'POST',
          headers: authHeaders(),
          body: JSON.stringify({ fund_names: uploadedNames })
        });
        if (!matchRes.ok) throw new Error('Fund matching failed.');
        const matchData = await matchRes.json();
        const matchedFunds = matchData.matched || [];
        if (matchedFunds.length === 0) throw new Error('No funds could be matched. Please check your fund names.');

        // Step 2: analyse matched funds
        const analyseRes = await fetch(`${API_BASE_URL}/api/mf/analyze`, {
          method: 'POST',
          headers: authHeaders(),
          body: JSON.stringify({ funds: matchedFunds.map((m: any) => ({ scheme_code: m.scheme_code, scheme_name: m.scheme_name })) })
        });
        if (!analyseRes.ok) throw new Error('Analysis request failed.');
        const analyseData = await analyseRes.json();
        setResults(analyseData.results || []);
        setErrors(analyseData.errors || []);
      } else {
        // Search mode: analyse basket directly
        const analyseRes = await fetch(`${API_BASE_URL}/api/mf/analyze`, {
          method: 'POST',
          headers: authHeaders(),
          body: JSON.stringify({ funds: basket.map(b => ({ scheme_code: b.scheme_code, scheme_name: b.scheme_name })) })
        });
        if (!analyseRes.ok) throw new Error('Analysis request failed.');
        const analyseData = await analyseRes.json();
        setResults(analyseData.results || []);
        setErrors(analyseData.errors || []);
      }
    } catch (err: any) {
      setAnalysisError(err.message || 'Analysis failed. Please try again.');
    } finally {
      setIsAnalysing(false);
    }
  };

  const downloadCSV = () => {
    if (!results.length) return;
    const headers = ['Fund Name', 'Category', 'Score', 'Signal', '1M Return%', '3M Return%', '6M Return%', '1Y Return%', 'Volatility', 'Latest NAV'];
    const rows = results.map(r => [
      `"${r.scheme_name}"`,
      r.category,
      r.score,
      r.signal,
      r.return_1m ?? '',
      r.return_3m ?? '',
      r.return_6m ?? '',
      r.return_1y ?? '',
      r.volatility ?? '',
      r.latest_nav ?? '',
    ]);
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'mf_analysis.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const downloadMFTemplate = () => {
    const csv = 'Fund Name\nParag Parikh Flexi Cap Fund - Growth\nQuant Small Cap Fund Regular Plan - Growth\nICICI Prudential Technology Fund - Growth';
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'mf_upload_template.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const buyCount = results.filter(r => r.signal === 'BUY').length;
  const holdCount = results.filter(r => r.signal === 'HOLD').length;
  const sellCount = results.filter(r => r.signal === 'SELL').length;

  return (
    <div className="analysis-shell mf-shell" style={{ padding: '32px 40px', maxWidth: '1400px', margin: '0 auto' }}>
      {/* Page header */}
      <div style={{ marginBottom: '28px' }}>
        <h1 className="page-title" style={{ fontSize: '1.8rem', fontWeight: 800, fontFamily: 'var(--font-heading)', marginBottom: '6px' }}>
          Mutual Fund <span style={{ color: 'var(--color-primary)' }}>Analysis</span>
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
          Evaluate Indian mutual funds using rolling NAV returns, momentum scoring and category peer ranking.
        </p>
      </div>

      {/* Sub-tab toggle */}
      <div className="segmented-control" style={{ display: 'flex', background: 'rgba(255,255,255,0.03)', padding: '4px', borderRadius: '10px', border: '1px solid var(--border-glass)', width: 'fit-content', marginBottom: '28px' }}>
        {(['SEARCH', 'UPLOAD'] as const).map(t => (
          <button
            key={t}
            onClick={() => setSubTab(t)}
            style={{
              background: subTab === t ? 'var(--color-primary)' : 'transparent',
              border: 'none',
              color: subTab === t ? 'white' : 'var(--text-muted)',
              padding: '9px 22px',
              borderRadius: '7px',
              fontSize: '0.85rem',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              fontFamily: 'var(--font-heading)',
              display: 'flex',
              alignItems: 'center',
              gap: '7px'
            }}
          >
            {t === 'SEARCH' ? <Search size={15} /> : <Upload size={15} />}
            {t === 'SEARCH' ? 'Search & Add' : 'Upload List'}
          </button>
        ))}
      </div>

      {/* Main input card */}
      <div className="glass-panel" style={{ padding: '28px', marginBottom: '28px' }}>
        {subTab === 'SEARCH' ? (
          <div>
            <h3 style={{ fontSize: '1.05rem', fontWeight: 700, marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Search size={17} style={{ color: 'var(--color-primary)' }} />
              Find & Add Funds
            </h3>
            {/* Search input */}
            <div style={{ position: 'relative', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border-glass)', borderRadius: '10px', padding: '0 14px', gap: '10px' }}>
                <Search size={17} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                <input
                  type="text"
                  placeholder="Type fund name e.g. Parag Parikh, Quant Small Cap…"
                  value={query}
                  onChange={handleQueryChange}
                  onFocus={() => searchResults.length > 0 && setShowDropdown(true)}
                  onBlur={() => setTimeout(() => setShowDropdown(false), 200)}
                  style={{
                    flex: 1,
                    background: 'transparent',
                    border: 'none',
                    outline: 'none',
                    color: 'white',
                    fontSize: '0.9rem',
                    padding: '14px 0',
                  }}
                />
                {searchLoading && <RefreshCw size={15} style={{ color: 'var(--text-muted)', animation: 'spin 1s linear infinite' }} />}
              </div>
              {/* Dropdown */}
              {showDropdown && (
                <div style={{
                  position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0,
                  background: '#0f172a', border: '1px solid var(--border-glass)',
                  borderRadius: '10px', zIndex: 100, boxShadow: '0 20px 40px rgba(0,0,0,0.5)',
                  maxHeight: '300px', overflowY: 'auto'
                }}>
                  {searchResults.map(fund => (
                    <button
                      key={fund.scheme_code}
                      onMouseDown={() => addToBasket(fund)}
                      style={{
                        display: 'block', width: '100%', textAlign: 'left',
                        padding: '12px 16px', background: 'transparent', border: 'none',
                        color: 'white', cursor: 'pointer', transition: 'background 0.15s',
                        borderBottom: '1px solid rgba(255,255,255,0.04)'
                      }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'rgba(59,130,246,0.12)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                    >
                      <div style={{ fontSize: '0.87rem', fontWeight: 600 }}>{fund.scheme_name}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--color-primary)', marginTop: '2px' }}>{fund.category} · Code: {fund.scheme_code}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Basket */}
            {basket.length > 0 && (
              <div>
                <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', fontWeight: 600, marginBottom: '10px' }}>
                  SELECTED FUNDS ({basket.length})
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '16px' }}>
                  {basket.map(b => (
                    <div key={b.scheme_code} style={{
                      background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.3)',
                      borderRadius: '20px', padding: '6px 12px', display: 'flex', alignItems: 'center',
                      gap: '8px', fontSize: '0.8rem', maxWidth: '400px'
                    }}>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }} title={b.scheme_name}>
                        {b.scheme_name.length > 45 ? b.scheme_name.slice(0, 45) + '…' : b.scheme_name}
                      </span>
                      <button onClick={() => removeFromBasket(b.scheme_code)} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '0', display: 'flex' }}>
                        <X size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <button
              onClick={runAnalysis}
              disabled={isAnalysing || basket.length === 0}
              className="btn-primary"
              style={{ opacity: basket.length === 0 ? 0.5 : 1, display: 'flex', alignItems: 'center', gap: '8px' }}
            >
              {isAnalysing ? <RefreshCw size={16} style={{ animation: 'spin 1s linear infinite' }} /> : <BarChart2 size={16} />}
              {isAnalysing ? 'Analysing…' : `Analyse ${basket.length} Fund${basket.length !== 1 ? 's' : ''}`}
            </button>
          </div>
        ) : (
          /* Upload mode */
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ fontSize: '1.05rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Upload size={17} style={{ color: 'var(--color-primary)' }} />
                Upload Fund List
              </h3>
              <button onClick={downloadMFTemplate} className="btn-secondary" style={{ fontSize: '0.8rem', padding: '8px 14px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Download size={14} /> Download Template
              </button>
            </div>

            {/* Dropzone */}
            <div
              onDragEnter={e => { e.preventDefault(); setDragActive(true); }}
              onDragOver={e => { e.preventDefault(); setDragActive(true); }}
              onDragLeave={() => setDragActive(false)}
              onDrop={handleDrop}
              style={{
                border: `2px dashed ${dragActive ? 'var(--color-primary)' : 'rgba(255,255,255,0.1)'}`,
                borderRadius: '12px', padding: '32px', textAlign: 'center',
                background: dragActive ? 'rgba(59,130,246,0.06)' : 'transparent',
                transition: 'all 0.2s ease', cursor: 'pointer', marginBottom: '16px'
              }}
            >
              <Upload size={32} style={{ color: dragActive ? 'var(--color-primary)' : 'var(--text-muted)', margin: '0 auto 10px' }} />
              <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                Drag & drop a <strong>CSV</strong> file with one fund name per row, or{' '}
                <label htmlFor="mf-file-upload" style={{ color: 'var(--color-primary)', cursor: 'pointer', textDecoration: 'underline' }}>
                  browse
                </label>
              </p>
              <input id="mf-file-upload" type="file" accept=".csv" onChange={handleFileInput} style={{ display: 'none' }} />
            </div>

            {uploadError && (
              <div style={{ color: 'var(--color-sell)', fontSize: '0.85rem', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <AlertTriangle size={15} /> {uploadError}
              </div>
            )}

            {uploadedNames.length > 0 && (
              <div style={{ marginBottom: '16px' }}>
                <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', fontWeight: 600, marginBottom: '8px' }}>
                  {uploadedNames.length} FUNDS LOADED FROM FILE
                </div>
                <div style={{ maxHeight: '180px', overflowY: 'auto', display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {uploadedNames.map((name, i) => (
                    <span key={i} style={{
                      background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
                      borderRadius: '6px', padding: '4px 10px', fontSize: '0.78rem', color: 'var(--text-muted)'
                    }}>
                      {name.length > 40 ? name.slice(0, 40) + '…' : name}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <button
              onClick={runAnalysis}
              disabled={isAnalysing || uploadedNames.length === 0}
              className="btn-primary"
              style={{ opacity: uploadedNames.length === 0 ? 0.5 : 1, display: 'flex', alignItems: 'center', gap: '8px' }}
            >
              {isAnalysing ? <RefreshCw size={16} style={{ animation: 'spin 1s linear infinite' }} /> : <BarChart2 size={16} />}
              {isAnalysing ? 'Matching & Analysing…' : `Analyse ${uploadedNames.length} Funds`}
            </button>
          </div>
        )}
      </div>

      {/* Error message */}
      {analysisError && (
        <div className="glass-panel" style={{ padding: '16px 20px', borderLeft: '4px solid var(--color-sell)', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <AlertTriangle size={20} style={{ color: 'var(--color-sell)' }} />
          <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>{analysisError}</p>
        </div>
      )}

      {/* Loading state */}
      {isAnalysing && (
        <div className="glass-panel" style={{ padding: '40px', textAlign: 'center' }}>
          <div style={{ width: '48px', height: '48px', border: '3px solid rgba(59,130,246,0.2)', borderTopColor: 'var(--color-primary)', borderRadius: '50%', animation: 'spin 1.2s linear infinite', margin: '0 auto 16px' }} />
          <p style={{ color: 'var(--text-muted)' }}>Fetching NAV data and computing scores… This may take 15–30 seconds.</p>
        </div>
      )}

      {/* Results */}
      {results.length > 0 && !isAnalysing && (
        <div>
          {/* Summary cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '24px' }}>
            {[
              { label: 'BUY', count: buyCount, color: 'var(--color-buy)', bg: 'var(--color-buy-trans)', Icon: TrendingUp },
              { label: 'HOLD', count: holdCount, color: 'var(--color-hold)', bg: 'var(--color-hold-trans)', Icon: RefreshCw },
              { label: 'SELL', count: sellCount, color: 'var(--color-sell)', bg: 'var(--color-sell-trans)', Icon: TrendingDown },
            ].map(({ label, count, color, bg, Icon }) => (
              <div key={label} className="glass-panel" style={{ padding: '20px', display: 'flex', alignItems: 'center', gap: '16px' }}>
                <div style={{ background: bg, color, padding: '14px', borderRadius: '10px' }}>
                  <Icon size={22} />
                </div>
                <div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>{label} SIGNALS</div>
                  <div style={{ fontSize: '1.8rem', fontWeight: 800, color }}>{count}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Download + Table */}
          <div className="glass-panel" style={{ padding: '24px', overflow: 'hidden' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <BarChart2 size={18} style={{ color: 'var(--color-primary)' }} />
                Fund Analysis Report
              </h3>
              <button onClick={downloadCSV} className="btn-secondary" style={{ fontSize: '0.82rem', padding: '8px 14px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Download size={14} /> Export CSV
              </button>
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table className="premium-table">
                <thead>
                  <tr>
                    <th>Fund Name</th>
                    <th>Category</th>
                    <th style={{ textAlign: 'right' }}>
                      <span className="tooltip-container" style={{ justifyContent: 'flex-end', gap: '3px' }}>
                        <span>NAV (₹)</span>
                        <HelpCircle size={11} style={{ opacity: 0.8 }} />
                        <span className="tooltip-text" style={{ bottom: '150%' }}>
                          <strong>Net Asset Value (NAV)</strong>
                          The daily close price per unit of the mutual fund scheme.
                        </span>
                      </span>
                    </th>
                    <th style={{ textAlign: 'right' }}>
                      <span className="tooltip-container" style={{ justifyContent: 'flex-end', gap: '3px' }}>
                        <span>1M</span>
                        <HelpCircle size={11} style={{ opacity: 0.8 }} />
                        <span className="tooltip-text" style={{ bottom: '150%' }}>
                          <strong>1-Month Returns</strong>
                          The fund's performance over the last 30 days.
                        </span>
                      </span>
                    </th>
                    <th style={{ textAlign: 'right' }}>
                      <span className="tooltip-container" style={{ justifyContent: 'flex-end', gap: '3px' }}>
                        <span>3M</span>
                        <HelpCircle size={11} style={{ opacity: 0.8 }} />
                        <span className="tooltip-text" style={{ bottom: '150%' }}>
                          <strong>3-Month Returns</strong>
                          The fund's performance over the last 90 days.
                        </span>
                      </span>
                    </th>
                    <th style={{ textAlign: 'right' }}>
                      <span className="tooltip-container" style={{ justifyContent: 'flex-end', gap: '3px' }}>
                        <span>6M</span>
                        <HelpCircle size={11} style={{ opacity: 0.8 }} />
                        <span className="tooltip-text" style={{ bottom: '150%' }}>
                          <strong>6-Month Returns</strong>
                          The fund's performance over the last 180 days.
                        </span>
                      </span>
                    </th>
                    <th style={{ textAlign: 'right' }}>
                      <span className="tooltip-container" style={{ justifyContent: 'flex-end', gap: '3px' }}>
                        <span>1Y</span>
                        <HelpCircle size={11} style={{ opacity: 0.8 }} />
                        <span className="tooltip-text" style={{ bottom: '150%' }}>
                          <strong>1-Year Returns</strong>
                          The fund's performance over the last 365 days.
                        </span>
                      </span>
                    </th>
                    <th style={{ textAlign: 'center' }}>
                      <span className="tooltip-container" style={{ justifyContent: 'center', gap: '3px', width: '100%' }}>
                        <span>Score</span>
                        <HelpCircle size={11} style={{ opacity: 0.8 }} />
                        <span className="tooltip-text" style={{ bottom: '150%' }}>
                          <strong>Performance Score</strong>
                          Overall rating out of 100 calculated from category peer returns rank and volatility management.
                        </span>
                      </span>
                    </th>
                    <th style={{ textAlign: 'center' }}>
                      <span className="tooltip-container" style={{ justifyContent: 'center', gap: '3px', width: '100%' }}>
                        <span>Signal</span>
                        <HelpCircle size={11} style={{ opacity: 0.8 }} />
                        <span className="tooltip-text" style={{ bottom: '150%' }}>
                          <strong>Analyser Signal</strong>
                          BUY (underpriced/top performance), HOLD (average peer profile), or SELL (lacking momentum/high risk).
                        </span>
                      </span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((r, i) => (
                    <tr key={r.scheme_code} style={{ animationDelay: `${i * 40}ms` }}>
                      <td style={{ maxWidth: '320px' }}>
                        <div style={{ fontWeight: 600, fontSize: '0.85rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.scheme_name}>
                          {r.scheme_name}
                        </div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)', marginTop: '2px' }}>
                          Code: {r.scheme_code}
                        </div>
                      </td>
                      <td>
                        <span style={{ background: 'rgba(59,130,246,0.1)', color: 'var(--color-primary)', borderRadius: '4px', padding: '2px 8px', fontSize: '0.75rem', fontWeight: 600 }}>
                          {r.category}
                        </span>
                      </td>
                      <td style={{ textAlign: 'right', fontFamily: 'monospace', fontSize: '0.85rem' }}>
                        {r.latest_nav !== null ? r.latest_nav?.toFixed(2) : '—'}
                      </td>
                      <td style={{ textAlign: 'right' }}>{fmtReturn(r.return_1m)}</td>
                      <td style={{ textAlign: 'right' }}>{fmtReturn(r.return_3m)}</td>
                      <td style={{ textAlign: 'right' }}>{fmtReturn(r.return_6m)}</td>
                      <td style={{ textAlign: 'right' }}>{fmtReturn(r.return_1y)}</td>
                      <td style={{ textAlign: 'center' }}>
                        <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: '6px', height: '6px', width: '80px', margin: '0 auto 4px', overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${r.score}%`, background: r.score >= 68 ? 'var(--color-buy)' : r.score >= 42 ? 'var(--color-hold)' : 'var(--color-sell)', borderRadius: '6px' }} />
                        </div>
                        <span style={{ fontSize: '0.82rem', fontWeight: 700 }}>{r.score}</span>
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <span style={{
                          background: SIGNAL_BG[r.signal],
                          color: SIGNAL_COLORS[r.signal],
                          border: `1px solid ${SIGNAL_COLORS[r.signal]}40`,
                          borderRadius: '6px', padding: '4px 12px',
                          fontSize: '0.78rem', fontWeight: 700, letterSpacing: '0.05em'
                        }}>
                          {r.signal}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Unmatched/errors */}
            {errors.length > 0 && (
              <div style={{ marginTop: '20px', padding: '16px', background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.15)', borderRadius: '10px' }}>
                <div style={{ fontSize: '0.82rem', color: 'var(--color-sell)', fontWeight: 700, marginBottom: '8px' }}>
                  ⚠ {errors.length} fund(s) could not be analysed
                </div>
                {errors.map((e, i) => (
                  <div key={i} style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                    • {e.scheme_name}: {e.error}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
