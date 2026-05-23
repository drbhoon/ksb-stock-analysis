import React, { useState, useEffect, useRef } from 'react';
import { Search, Loader2, ArrowRight, TrendingUp, TrendingDown, Activity, ShieldCheck, FileText, Check, AlertTriangle, CheckCircle2, HelpCircle } from 'lucide-react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip } from 'recharts';

interface SearchOption {
  symbol: string;
  name: string;
  is_etf: boolean;
  isin: string;
}

interface SingleStockAnalysisProps {
  API_BASE_URL: string;
  weightF: number;
  weightT: number;
  onSelectStock: (symbol: string, isEtf: boolean) => void;
  token: string | null;
}

export const SingleStockAnalysis: React.FC<SingleStockAnalysisProps> = ({
  API_BASE_URL,
  weightF,
  weightT,
  token
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchOption[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  
  const [analyzedData, setAnalyzedData] = useState<any>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  
  const [activeOverlay, setActiveOverlay] = useState<'NONE' | 'EMAS' | 'BB'>('NONE');
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close search dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Fetch search results on query change
  useEffect(() => {
    if (searchQuery.trim().length < 2) {
      setSearchResults([]);
      return;
    }

    const delayDebounce = setTimeout(async () => {
      setIsSearching(true);
      try {
        const headers: HeadersInit = {};
        if (token) {
          headers['Authorization'] = `Bearer ${token}`;
        }
        
        const res = await fetch(
          `${API_BASE_URL}/api/search?q=${encodeURIComponent(searchQuery)}`,
          { headers }
        );
        if (res.ok) {
          const data = await res.json();
          setSearchResults(data);
          setShowDropdown(true);
        }
      } catch (e) {
        console.error("Search failed:", e);
      } finally {
        setIsSearching(false);
      }
    }, 300);

    return () => clearTimeout(delayDebounce);
  }, [searchQuery, API_BASE_URL, token]);

  // Perform core stock analysis
  const handleSelectOption = async (option: SearchOption) => {
    setSearchQuery(`${option.symbol} - ${option.name}`);
    setShowDropdown(false);
    setIsAnalyzing(true);
    setErrorMsg(null);
    setAnalyzedData(null);

    try {
      const headers: HeadersInit = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const res = await fetch(
        `${API_BASE_URL}/api/analyze/${encodeURIComponent(option.symbol)}?is_etf=${option.is_etf}&fundamental_weight=${weightF}&technical_weight=${weightT}`,
        { headers }
      );

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || `Analysis failed for ${option.symbol}`);
      }

      const data = await res.json();
      setAnalyzedData(data);
    } catch (e: any) {
      console.error(e);
      setErrorMsg(e.message || "Failed to analyze selected security. Ensure it is actively traded on NSE.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Recalculate signal client-side dynamically based on weight sliders
  const recalculatedData = React.useMemo(() => {
    if (!analyzedData) return null;

    const stock = analyzedData;
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
  }, [analyzedData, weightF, weightT]);

  // Color Mapping
  const themeColor = recalculatedData 
    ? (recalculatedData.signal === 'BUY' ? 'var(--color-buy)' 
       : recalculatedData.signal === 'SELL' ? 'var(--color-sell)' : 'var(--color-hold)')
    : 'var(--color-primary)';

  const rsiVal = recalculatedData?.technical_details?.metrics?.rsi || 50;
  const rsiAngle = ((rsiVal / 100) * 180) - 90;

  return (
    <div style={{ maxWidth: '1000px', margin: '0 auto', padding: '24px 20px' }}>
      
      {/* Centered Heading */}
      <div style={{ textAlign: 'center', marginBottom: '32px' }}>
        <h1 style={{ 
          fontSize: '2.5rem', 
          fontWeight: 800, 
          background: 'linear-gradient(135deg, #fff 30%, var(--text-muted) 100%)', 
          WebkitBackgroundClip: 'text', 
          WebkitTextFillColor: 'transparent',
          letterSpacing: '-0.02em',
          marginBottom: '6px'
        }}>
          Single Stock Deep Analysis
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem' }}>
          Query any Indian equity or ETF by symbol or name to retrieve institutional-grade quantitative charts and scoring.
        </p>
      </div>

      {/* 1. Instant Autocomplete Search Engine */}
      <div ref={dropdownRef} style={{ position: 'relative', maxWidth: '640px', margin: '0 auto 40px', zIndex: 40 }}>
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
          <Search size={20} style={{ position: 'absolute', left: '16px', color: 'var(--text-muted)' }} />
          <input 
            type="text"
            placeholder="Type approximate name or symbol e.g., Tata, Elecon, VBL..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setShowDropdown(true);
            }}
            style={{
              width: '100%',
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid var(--border-glass)',
              padding: '16px 20px 16px 48px',
              borderRadius: '12px',
              color: 'white',
              fontSize: '1rem',
              outline: 'none',
              boxShadow: '0 4px 20px rgba(0,0,0,0.2)',
              transition: 'all 0.3s ease',
              fontFamily: 'var(--font-body)'
            }}
          />
          {isSearching && (
            <Loader2 size={18} className="animate-spin" style={{ position: 'absolute', right: '16px', color: 'var(--color-primary)' }} />
          )}
        </div>

        {/* Autocomplete Dropdown list */}
        {showDropdown && searchResults.length > 0 && (
          <div className="glass-panel" style={{
            position: 'absolute',
            top: 'calc(100% + 8px)',
            left: 0,
            width: '100%',
            maxHeight: '320px',
            overflowY: 'auto',
            borderRadius: '12px',
            border: '1px solid var(--border-glass)',
            boxShadow: '0 10px 40px rgba(0,0,0,0.6)',
            padding: '8px 0',
            zIndex: 100
          }}>
            {searchResults.map((option) => (
              <div 
                key={option.symbol}
                onClick={() => handleSelectOption(option)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '12px 20px',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  borderBottom: '1px solid rgba(255,255,255,0.02)'
                }}
                className="search-row-hover"
              >
                <div>
                  <div style={{ fontWeight: 700, color: '#fff', fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {option.symbol}
                    {option.is_etf && (
                      <span style={{ fontSize: '0.65rem', background: 'rgba(255,255,255,0.08)', padding: '2px 4px', borderRadius: '4px', color: 'var(--text-muted)' }}>
                        ETF
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                    {option.name}
                  </div>
                </div>
                <ArrowRight size={16} style={{ color: 'var(--text-dim)' }} />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 2. Loading State */}
      {isAnalyzing && (
        <div className="glass-panel" style={{ padding: '60px 40px', textAlign: 'center', maxWidth: '640px', margin: '0 auto' }}>
          <div style={{ position: 'relative', width: '60px', height: '60px', margin: '0 auto 20px' }}>
            <div className="glow-active" style={{ width: '60px', height: '60px', borderRadius: '50%', border: '4px solid rgba(59, 130, 246, 0.1)', borderTopColor: 'var(--color-primary)', animation: 'spin 1.2s linear infinite' }} />
          </div>
          <h3>Performing Advanced Technical & Fundamental Assessment...</h3>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '6px' }}>
            Resolving live market feeds, compiling moving average overlays, and evaluating balance sheet leverage...
          </p>
        </div>
      )}

      {/* 3. Error Alert */}
      {errorMsg && (
        <div className="glass-panel" style={{ padding: '24px', borderLeft: '4px solid var(--color-sell)', background: 'rgba(239, 68, 68, 0.03)', maxWidth: '640px', margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <AlertTriangle size={24} style={{ color: 'var(--color-sell)' }} />
            <div>
              <h4 style={{ fontWeight: 700 }}>Query Error</h4>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '2px' }}>{errorMsg}</p>
            </div>
          </div>
        </div>
      )}

      {/* 4. Display Results Inline (Direct Page Rendering!) */}
      {recalculatedData && (
        <div className="glass-panel glow-active" style={{
          padding: '32px',
          borderRadius: '16px',
          borderTop: `4px solid ${themeColor}`,
          animation: 'fadeIn 0.5s ease-out'
        }}>
          
          {/* Header & Meta */}
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: '20px', marginBottom: '24px' }}>
            <div>
              <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', fontWeight: 700 }}>
                {recalculatedData.is_etf ? 'Exchange Traded Fund (ETF)' : `${recalculatedData.industry || 'Equity'}`}
              </span>
              <h2 style={{ fontSize: '1.8rem', fontWeight: 800, marginTop: '2px', color: '#fff' }}>
                {recalculatedData.symbol}
                <span style={{ fontSize: '1.1rem', color: 'var(--text-muted)', fontWeight: 400 }}> | {recalculatedData.company_name}</span>
              </h2>
            </div>
            
            {/* Big Price Tag */}
            <div style={{ textAlign: 'right' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>LAST TRADING PRICE</span>
              <h2 style={{ fontSize: '2.4rem', fontWeight: 800, fontFamily: 'var(--font-heading)', marginTop: '2px' }}>
                ₹{recalculatedData.latest_price.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </h2>
              <span style={{ 
                fontSize: '1rem', 
                fontWeight: 700, 
                display: 'flex', 
                alignItems: 'center',
                justifyContent: 'flex-end',
                gap: '4px',
                color: recalculatedData.change >= 0 ? 'var(--color-buy)' : 'var(--color-sell)'
              }}>
                {recalculatedData.change >= 0 ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
                {recalculatedData.change >= 0 ? '+' : ''}{recalculatedData.change.toFixed(2)} ({recalculatedData.change_percent >= 0 ? '+' : ''}{recalculatedData.change_percent.toFixed(2)}%)
              </span>
            </div>
          </div>

          {/* Banner Signal Box */}
          <div className="glass-panel" style={{ padding: '24px', marginBottom: '24px', background: 'rgba(255,255,255,0.01)', borderLeft: `4px solid ${themeColor}`, display: 'flex', flexWrap: 'wrap', gap: '24px', alignItems: 'center' }}>
            <div style={{ flex: '1', minWidth: '280px' }}>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>RECOMMENDATION OUTLOOK</span>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '12px', marginTop: '4px' }}>
                <h1 style={{ fontSize: '3rem', fontWeight: 900, color: themeColor, textShadow: `0 0 15px ${themeColor}33` }}>
                  {recalculatedData.signal}
                </h1>
                <span style={{ fontSize: '1.2rem', fontWeight: 600, color: 'var(--text-muted)' }}>
                  ({recalculatedData.confidence.toFixed(0)}% Confidence)
                </span>
              </div>
              <p style={{ fontSize: '0.9rem', color: 'var(--text-main)', marginTop: '8px', lineHeight: '1.5' }}>
                {recalculatedData.summary}
              </p>
            </div>
          </div>

          {/* Price curve Chart */}
          <div style={{ marginBottom: '32px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <h3 style={{ fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Activity size={18} style={{ color: 'var(--color-primary)' }} />
                1-Year Technical Performance Chart
              </h3>
              
              {/* Chart Overlay Controls */}
              <div style={{ display: 'flex', gap: '8px', background: 'rgba(255,255,255,0.03)', padding: '2px', borderRadius: '6px', border: '1px solid var(--border-glass)' }}>
                {['NONE', 'EMAS', 'BB'].map((overlay) => (
                  <button
                    key={overlay}
                    onClick={() => setActiveOverlay(overlay as any)}
                    style={{
                      background: activeOverlay === overlay ? 'var(--color-primary)' : 'transparent',
                      border: 'none',
                      color: activeOverlay === overlay ? 'white' : 'var(--text-muted)',
                      padding: '4px 12px',
                      borderRadius: '4px',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                  >
                    {overlay === 'NONE' ? 'Price Only' : overlay === 'EMAS' ? 'EMAs' : 'B-Bands'}
                  </button>
                ))}
              </div>
            </div>

            {/* Recharts Container */}
            <div style={{ width: '100%', height: '280px', background: 'rgba(0,0,0,0.15)', borderRadius: '12px', padding: '12px 0' }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={recalculatedData.chart_history} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorPriceSingle" cx="0" cy="0" r="1">
                      <stop offset="5%" stopColor={themeColor} stopOpacity={0.25}/>
                      <stop offset="95%" stopColor={themeColor} stopOpacity={0.0}/>
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="date" tickLine={false} axisLine={false} tick={{ fill: 'var(--text-dim)', fontSize: 10 }} />
                  <YAxis domain={['auto', 'auto']} tickLine={false} axisLine={false} tick={{ fill: 'var(--text-dim)', fontSize: 10 }} />
                  <Tooltip 
                    contentStyle={{ background: '#0e1428', border: '1px solid var(--border-glass)', borderRadius: '8px', color: '#fff', fontSize: '0.8rem' }}
                    labelStyle={{ fontWeight: 600 }}
                  />
                  <Area type="monotone" dataKey="close" stroke={themeColor} strokeWidth={2.5} fillOpacity={1} fill="url(#colorPriceSingle)" name="Close Price" />
                  
                  {activeOverlay === 'EMAS' && (
                    <>
                      <Area type="monotone" dataKey="ema20" stroke="#3b82f6" strokeWidth={1.2} fill="transparent" name="EMA 20" strokeDasharray="3 3" />
                      <Area type="monotone" dataKey="ema50" stroke="#f59e0b" strokeWidth={1.2} fill="transparent" name="EMA 50" strokeDasharray="4 4" />
                      <Area type="monotone" dataKey="ema200" stroke="#8b5cf6" strokeWidth={1.5} fill="transparent" name="EMA 200" />
                    </>
                  )}

                  {activeOverlay === 'BB' && (
                    <>
                      <Area type="monotone" dataKey="bb_upper" stroke="rgba(255,255,255,0.2)" strokeWidth={1} fill="transparent" name="BB Upper" />
                      <Area type="monotone" dataKey="bb_lower" stroke="rgba(255,255,255,0.2)" strokeWidth={1} fill="transparent" name="BB Lower" />
                    </>
                  )}
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Grid Indicators: Speedometer and Scorecard */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '24px', marginBottom: '32px' }}>
            
            {/* RSI speed gauge */}
            <div className="glass-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
              <h4 style={{ fontSize: '0.9rem', alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '16px' }}>
                <Activity size={16} style={{ color: 'var(--color-primary)' }} />
                Momentum Gauge (RSI)
              </h4>
              
              <div className="gauge-container" style={{ margin: '15px 0' }}>
                <svg width="180" height="90" viewBox="0 0 100 50">
                  <path d="M 10 50 A 40 40 0 0 1 90 50" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="8" strokeLinecap="round" />
                  <path d="M 10 50 A 40 40 0 0 1 34 26" fill="none" stroke="var(--color-buy)" strokeWidth="8" opacity="0.3" />
                  <path d="M 66 26 A 40 40 0 0 1 90 50" fill="none" stroke="var(--color-sell)" strokeWidth="8" opacity="0.3" />
                </svg>
                <div className="gauge-needle" style={{ transform: `rotate(${rsiAngle}deg)` }} />
                <div className="gauge-center" />
                <div className="gauge-value" style={{ 
                  color: rsiVal > 70 ? 'var(--color-sell)' : rsiVal < 30 ? 'var(--color-buy)' : 'var(--text-main)'
                }}>
                  {rsiVal.toFixed(1)}
                </div>
              </div>
              
              <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {rsiVal > 70 ? 'Overbought (Sell Alert)' : rsiVal < 30 ? 'Oversold (Buy Alert)' : 'Neutral Momentum'}
              </span>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)', textAlign: 'center', marginTop: '6px' }}>
                Score: <span style={{ color: 'white', fontWeight: 600 }}>{Math.round(recalculatedData.technical_score)}/100</span>
              </div>
            </div>

            {/* Fundamental scorecard */}
            <div className="glass-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
              <h4 style={{ fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '12px' }}>
                <ShieldCheck size={16} style={{ color: 'var(--color-primary)' }} />
                Fundamental Scorecard
              </h4>
              
              {recalculatedData.is_etf ? (
                <div className="glass-panel" style={{ padding: '20px', textAlign: 'center', color: 'var(--text-dim)', fontSize: '0.85rem' }}>
                  <HelpCircle size={24} style={{ margin: '0 auto 8px', color: 'var(--text-muted)' }} />
                  Fundamentals omitted: Exchange Traded Funds (ETFs) represent a basket of assets rather than individual company equity structures.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: 'rgba(255,255,255,0.02)', borderRadius: '6px' }}>
                    <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>P/E Ratio</span>
                    <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>
                      {recalculatedData.fundamental_details?.metrics?.pe ? recalculatedData.fundamental_details.metrics.pe.toFixed(1) : 'N/A (Loss)'}
                    </span>
                  </div>
                  
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: 'rgba(255,255,255,0.02)', borderRadius: '6px' }}>
                    <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>P/B Ratio</span>
                    <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>
                      {recalculatedData.fundamental_details?.metrics?.pb ? `${recalculatedData.fundamental_details.metrics.pb.toFixed(2)}x` : 'N/A'}
                    </span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: 'rgba(255,255,255,0.02)', borderRadius: '6px' }}>
                    <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Return on Equity (ROE)</span>
                    <span style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--color-buy)' }}>
                      {recalculatedData.fundamental_details?.metrics?.roe_percent ? `${recalculatedData.fundamental_details.metrics.roe_percent.toFixed(1)}%` : 'N/A'}
                    </span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: 'rgba(255,255,255,0.02)', borderRadius: '6px' }}>
                    <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Debt-to-Equity</span>
                    <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>
                      {recalculatedData.fundamental_details?.metrics?.is_financial ? 'Exempt (Bank)' : 
                       recalculatedData.fundamental_details?.metrics?.de_ratio ? recalculatedData.fundamental_details.metrics.de_ratio.toFixed(2) : 'N/A'}
                    </span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: 'rgba(255,255,255,0.02)', borderRadius: '6px' }}>
                    <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Current Ratio</span>
                    <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>
                      {recalculatedData.fundamental_details?.metrics?.is_financial ? 'Exempt (Bank)' : 
                       recalculatedData.fundamental_details?.metrics?.current_ratio ? `${recalculatedData.fundamental_details.metrics.current_ratio.toFixed(2)}x` : 'N/A'}
                    </span>
                  </div>
                </div>
              )}
              {!recalculatedData.is_etf && (
                <div style={{ marginTop: '12px', fontSize: '0.7rem', color: 'var(--text-dim)', textAlign: 'right' }}>
                  Score: <span style={{ color: 'white', fontWeight: 600 }}>{Math.round(recalculatedData.fundamental_score)}/100</span>
                </div>
              )}
            </div>
          </div>

          {/* Quantitative Justifications Log */}
          <div>
            <h3 style={{ fontSize: '1.1rem', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <FileText size={18} style={{ color: 'var(--color-primary)' }} />
              Quantitative Justification Log
            </h3>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {recalculatedData.technical_details?.reasoning?.map((reason: string, idx: number) => (
                <div key={`single-tech-${idx}`} style={{ display: 'flex', gap: '12px', fontSize: '0.85rem', padding: '10px 14px', background: 'rgba(59, 130, 246, 0.03)', borderLeft: '3px solid var(--color-primary)', borderRadius: '0 8px 8px 0' }}>
                  <Check size={16} style={{ color: 'var(--color-primary)', flexShrink: 0, marginTop: '2px' }} />
                  <span>{reason}</span>
                </div>
              ))}

              {!recalculatedData.is_etf && recalculatedData.fundamental_details?.reasoning?.map((reason: string, idx: number) => {
                const isCritical = reason.includes('negative') || reason.includes('elevated') || reason.includes('Weak');
                return (
                  <div 
                    key={`single-fund-${idx}`} 
                    style={{ 
                      display: 'flex', 
                      gap: '12px', 
                      fontSize: '0.85rem', 
                      padding: '10px 14px', 
                      background: isCritical ? 'var(--color-sell-trans)' : 'var(--color-buy-trans)', 
                      borderLeft: `3px solid ${isCritical ? 'var(--color-sell)' : 'var(--color-buy)'}`, 
                      borderRadius: '0 8px 8px 0' 
                    }}
                  >
                    {isCritical ? (
                      <AlertTriangle size={16} style={{ color: 'var(--color-sell)', flexShrink: 0, marginTop: '2px' }} />
                    ) : (
                      <CheckCircle2 size={16} style={{ color: 'var(--color-buy)', flexShrink: 0, marginTop: '2px' }} />
                    )}
                    <span>{reason}</span>
                  </div>
                );
              })}
            </div>
          </div>

        </div>
      )}

      {/* 5. Placeholder state */}
      {!recalculatedData && !isAnalyzing && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '80px 20px', color: 'var(--text-dim)', textAlign: 'center' }}>
          <Activity size={48} style={{ color: 'rgba(255,255,255,0.05)', marginBottom: '16px' }} />
          <h4 style={{ color: 'var(--text-muted)', fontWeight: 600 }}>No Security Selected</h4>
          <p style={{ fontSize: '0.8rem', maxWidth: '320px', marginTop: '4px' }}>
            Use the autocomplete search bar above to fetch indicators, ratings, and closing price logs for individual assets.
          </p>
        </div>
      )}
      
      <style>{`
        .search-row-hover:hover {
          background: rgba(59, 130, 246, 0.08) !important;
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>

    </div>
  );
};
