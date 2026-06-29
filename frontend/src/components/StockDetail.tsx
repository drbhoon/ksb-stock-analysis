import React, { useState } from 'react';
import { X, TrendingUp, TrendingDown, RefreshCw, BarChart2, CheckCircle2, AlertTriangle, ShieldCheck, HelpCircle, FileText, Check, Activity } from 'lucide-react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip } from 'recharts';

interface StockDetailProps {
  stockDetail: any;
  onClose: () => void;
  isLoading: boolean;
  onRefresh: (symbol: string, isEtf: boolean) => void;
}

export const StockDetail: React.FC<StockDetailProps> = ({
  stockDetail,
  onClose,
  isLoading,
  onRefresh
}) => {
  const [activeOverlay, setActiveOverlay] = useState<'NONE' | 'EMAS' | 'BB'>('NONE');

  if (isLoading) {
    return (
      <div className="glass-panel stock-detail-drawer stock-detail-loading" style={{ position: 'fixed', top: 0, right: 0, width: '600px', height: '100vh', zIndex: 100, padding: '40px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <div className="glow-active" style={{ width: '60px', height: '60px', borderRadius: '50%', border: '4px solid rgba(59, 130, 246, 0.1)', borderTopColor: 'var(--color-primary)', animation: 'spin 1.2s linear infinite' }} />
        <h3 style={{ marginTop: '20px' }}>Loading Quantitative Analytics...</h3>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Fetching full history data and indicator arrays...</p>
      </div>
    );
  }

  if (!stockDetail) return null;

  const {
    symbol,
    company_name,
    is_etf,
    latest_price,
    change,
    change_percent,
    technical_score,
    fundamental_score,
    signal,
    confidence,
    summary,
    technical_details,
    fundamental_details,
    chart_history,
    industry
  } = stockDetail;

  // Custom styling based on signal
  const colorMap = {
    BUY: 'var(--color-buy)',
    HOLD: 'var(--color-hold)',
    SELL: 'var(--color-sell)'
  };
  const themeColor = colorMap[signal as 'BUY'|'HOLD'|'SELL'] || 'var(--color-primary)';

  // Calculate dynamic rotation angle for RSI Gauge needle
  // RSI ranges from 0 to 100. Let's map it from -90 deg (RSI=0) to +90 deg (RSI=100)
  const rsiVal = technical_details?.metrics?.rsi || 50;
  const rsiAngle = ((rsiVal / 100) * 180) - 90;

  return (
    <div className="glass-panel glow-active stock-detail-drawer" style={{
      position: 'fixed',
      top: 0,
      right: 0,
      width: '640px',
      height: '100vh',
      zIndex: 100,
      display: 'flex',
      flexDirection: 'column',
      borderLeft: `2px solid ${themeColor}`,
      borderRadius: '24px 0 0 24px',
      boxShadow: '-10px 0 40px rgba(0,0,0,0.5)',
      overflowY: 'auto'
    }}>
      {/* 1. Drawer Header */}
      <div className="stock-detail-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '24px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div>
          <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', fontWeight: 700 }}>
            {is_etf ? 'Exchange Traded Fund (ETF)' : `${industry || 'Equity'}`}
          </span>
          <h2 className="stock-detail-title" style={{ fontSize: '1.6rem', fontWeight: 800, marginTop: '2px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            {symbol}
            <span style={{ fontSize: '1rem', color: 'var(--text-muted)', fontWeight: 400 }}>| {company_name}</span>
          </h2>
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button 
            className="btn-secondary" 
            onClick={() => onRefresh(symbol, is_etf)}
            style={{ padding: '8px 12px' }}
            title="Refresh Live Data"
            aria-label="Refresh live stock data"
          >
            <RefreshCw size={16} />
          </button>
          <button 
            className="btn-secondary" 
            onClick={onClose}
            style={{ padding: '8px 12px' }}
            title="Close stock details"
            aria-label="Close stock details"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {/* 2. Banner Signal Panel */}
      <div className="stock-signal-panel" style={{ padding: '24px', display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '20px', background: 'rgba(255,255,255,0.01)', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>RECOMMENDATION OUTLOOK</span>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '12px', marginTop: '6px' }}>
            <h1 style={{ fontSize: '3rem', fontWeight: 900, color: themeColor, textShadow: `0 0 15px ${themeColor}33` }}>
              {signal}
            </h1>
            <span style={{ fontSize: '1.2rem', fontWeight: 600, color: 'var(--text-muted)' }}>
              ({confidence.toFixed(0)}% Confidence)
            </span>
          </div>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-main)', marginTop: '8px', lineHeight: '1.4' }}>
            {summary}
          </p>
        </div>

        {/* Big Price Tag */}
        <div className="stock-price-panel" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', justifyContent: 'center', borderLeft: '1px solid rgba(255,255,255,0.06)', paddingLeft: '20px' }}>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>LAST TRADING PRICE</span>
          <h2 style={{ fontSize: '2.2rem', fontWeight: 800, marginTop: '4px', fontFamily: 'var(--font-heading)' }}>
            ₹{latest_price.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </h2>
          <span style={{ 
            fontSize: '1rem', 
            fontWeight: 700, 
            marginTop: '2px', 
            display: 'flex', 
            alignItems: 'center',
            gap: '4px',
            color: change >= 0 ? 'var(--color-buy)' : 'var(--color-sell)'
          }}>
            {change >= 0 ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
            {change >= 0 ? '+' : ''}{change.toFixed(2)} ({change_percent >= 0 ? '+' : ''}{change_percent.toFixed(2)}%)
          </span>
        </div>
      </div>

      {/* 3. Interactive Price Chart */}
      <div style={{ padding: '24px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="chart-toolbar" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
          <h3 style={{ fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <BarChart2 size={16} style={{ color: 'var(--color-primary)' }} />
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
                  padding: '4px 10px',
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

        {/* Recharts Component */}
        <div style={{ width: '100%', height: '240px', background: 'rgba(0,0,0,0.1)', borderRadius: '12px', padding: '10px 0' }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chart_history} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="colorPrice" cx="0" cy="0" r="1">
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
              
              {/* Main Price Area */}
              <Area type="monotone" dataKey="close" stroke={themeColor} strokeWidth={2.5} fillOpacity={1} fill="url(#colorPrice)" name="Close Price" />
              
              {/* EMAs Overlay */}
              {activeOverlay === 'EMAS' && (
                <>
                  <Area type="monotone" dataKey="ema20" stroke="#3b82f6" strokeWidth={1.2} fill="transparent" name="EMA 20" strokeDasharray="3 3" />
                  <Area type="monotone" dataKey="ema50" stroke="#f59e0b" strokeWidth={1.2} fill="transparent" name="EMA 50" strokeDasharray="4 4" />
                  <Area type="monotone" dataKey="ema200" stroke="#8b5cf6" strokeWidth={1.5} fill="transparent" name="EMA 200" />
                </>
              )}

              {/* Bollinger Bands Overlay */}
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

      {/* 4. Analysis Breakdown Grid */}
      <div className="stock-breakdown-grid" style={{ padding: '24px', display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: '24px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        {/* Technical Gauge Panel */}
        <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <h4 style={{ fontSize: '0.9rem', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '6px', width: '100%' }}>
            <Activity size={16} style={{ color: 'var(--color-primary)' }} />
            <span>Momentum Gauge (RSI)</span>
            <span className="tooltip-container">
              <HelpCircle size={12} style={{ color: 'var(--text-dim)', cursor: 'help' }} />
              <span className="tooltip-text">
                <strong>Relative Strength Index (RSI)</strong>
                A momentum oscillator that measures the speed and change of price movements. Values above 70 indicate overbought conditions (potential pullback), while values below 30 indicate oversold conditions (potential rebound).
              </span>
            </span>
          </h4>
          
          <div className="gauge-container">
            {/* Elegant SVG gauge background arc */}
            <svg width="180" height="90" viewBox="0 0 100 50" style={{ transform: 'rotate(0deg)' }}>
              <path d="M 10 50 A 40 40 0 0 1 90 50" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="8" strokeLinecap="round" />
              {/* Oversold area (green) */}
              <path d="M 10 50 A 40 40 0 0 1 34 26" fill="none" stroke="var(--color-buy)" strokeWidth="8" opacity="0.3" />
              {/* Overbought area (red) */}
              <path d="M 66 26 A 40 40 0 0 1 90 50" fill="none" stroke="var(--color-sell)" strokeWidth="8" opacity="0.3" />
            </svg>
            <div className="gauge-needle" style={{ transform: `rotate(${rsiAngle}deg)` }} />
            <div className="gauge-center" />
          </div>
          
          <div className="gauge-value" style={{ 
            color: rsiVal > 70 ? 'var(--color-sell)' : rsiVal < 30 ? 'var(--color-buy)' : 'var(--text-main)'
          }}>
            {rsiVal.toFixed(1)}
          </div>
          
          <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            {rsiVal > 70 ? 'Overbought (Sell Alert)' : rsiVal < 30 ? 'Oversold (Buy Alert)' : 'Neutral Momentum'}
          </span>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)', textAlign: 'center', marginTop: '6px' }}>
            Score: <span style={{ color: 'white', fontWeight: 600 }}>{Math.round(technical_score)}/100</span>
          </div>
        </div>

        {/* Key Indicators Checklist */}
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <h4 style={{ fontSize: '0.9rem', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <ShieldCheck size={16} style={{ color: 'var(--color-primary)' }} />
            <span>Fundamental Scorecard</span>
            <span className="tooltip-container">
              <HelpCircle size={12} style={{ color: 'var(--text-dim)', cursor: 'help' }} />
              <span className="tooltip-text">
                <strong>Fundamental Scorecard</strong>
                Evaluates a company's financial health, debt leverage, operational efficiency, and pricing valuation based on balance sheet and income statement ratios.
              </span>
            </span>
          </h4>
          
          {is_etf ? (
            <div className="glass-panel" style={{ padding: '20px', textAlign: 'center', color: 'var(--text-dim)', fontSize: '0.85rem' }}>
              <HelpCircle size={24} style={{ margin: '0 auto 8px', color: 'var(--text-muted)' }} />
              Fundamentals are omitted because Exchange Traded Funds (ETFs) represent a basket of assets rather than individual capital.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {/* Metric Row P/E */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: 'rgba(255,255,255,0.02)', borderRadius: '6px' }}>
                <span className="tooltip-container" style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                  <span>P/E Ratio</span>
                  <HelpCircle size={11} style={{ color: 'var(--text-dim)', opacity: 0.8 }} />
                  <span className="tooltip-text" style={{ bottom: '150%' }}>
                    <strong>Price-to-Earnings (P/E) Ratio</strong>
                    Compares a stock's price to its annual earnings per share. A lower ratio suggests it may be undervalued or a bargain, whereas a high ratio suggests higher growth expectations or overvaluation.
                  </span>
                </span>
                <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>
                  {fundamental_details.metrics.pe ? fundamental_details.metrics.pe.toFixed(1) : 'N/A (Loss)'}
                </span>
              </div>
              
              {/* Metric Row P/B */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: 'rgba(255,255,255,0.02)', borderRadius: '6px' }}>
                <span className="tooltip-container" style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                  <span>P/B Ratio</span>
                  <HelpCircle size={11} style={{ color: 'var(--text-dim)', opacity: 0.8 }} />
                  <span className="tooltip-text" style={{ bottom: '150%' }}>
                    <strong>Price-to-Book (P/B) Ratio</strong>
                    Compares the market value of a stock to its book value (net assets). Excellent for grading banks, financials, or asset-heavy firms.
                  </span>
                </span>
                <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>
                  {fundamental_details.metrics.pb ? `${fundamental_details.metrics.pb.toFixed(2)}x` : 'N/A'}
                </span>
              </div>

              {/* Metric Row ROE */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: 'rgba(255,255,255,0.02)', borderRadius: '6px' }}>
                <span className="tooltip-container" style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                  <span>Return on Equity (ROE)</span>
                  <HelpCircle size={11} style={{ color: 'var(--text-dim)', opacity: 0.8 }} />
                  <span className="tooltip-text" style={{ bottom: '150%' }}>
                    <strong>Return on Equity (ROE)</strong>
                    Measures how efficiently a company generates profits using the cash invested by its shareholders. A ratio above 15% is generally considered high quality.
                  </span>
                </span>
                <span style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--color-buy)' }}>
                  {fundamental_details.metrics.roe_percent ? `${fundamental_details.metrics.roe_percent.toFixed(1)}%` : 'N/A'}
                </span>
              </div>

              {/* Metric Row Debt to Equity */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: 'rgba(255,255,255,0.02)', borderRadius: '6px' }}>
                <span className="tooltip-container" style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                  <span>Debt-to-Equity</span>
                  <HelpCircle size={11} style={{ color: 'var(--text-dim)', opacity: 0.8 }} />
                  <span className="tooltip-text" style={{ bottom: '150%' }}>
                    <strong>Debt-to-Equity Ratio</strong>
                    Measures financial leverage and solvency risk. A lower D/E indicates a lower debt burden. Financial companies (banks) are exempt from penalty here.
                  </span>
                </span>
                <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>
                  {fundamental_details.metrics.is_financial ? 'Exempt (Bank)' : 
                   fundamental_details.metrics.de_ratio ? fundamental_details.metrics.de_ratio.toFixed(2) : 'N/A'}
                </span>
              </div>

              {/* Metric Row Current Ratio */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: 'rgba(255,255,255,0.02)', borderRadius: '6px' }}>
                <span className="tooltip-container" style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                  <span>Current Ratio</span>
                  <HelpCircle size={11} style={{ color: 'var(--text-dim)', opacity: 0.8 }} />
                  <span className="tooltip-text" style={{ bottom: '150%' }}>
                    <strong>Current Ratio</strong>
                    Measures a firm's ability to cover its short-term debt obligations with short-term assets. A ratio above 1.2x indicates healthy near-term liquidity.
                  </span>
                </span>
                <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>
                  {fundamental_details.metrics.is_financial ? 'Exempt (Bank)' : 
                   fundamental_details.metrics.current_ratio ? `${fundamental_details.metrics.current_ratio.toFixed(2)}x` : 'N/A'}
                </span>
              </div>
            </div>
          )}
          {!is_etf && (
            <div style={{ marginTop: '12px', fontSize: '0.7rem', color: 'var(--text-dim)', textAlign: 'right' }}>
              Score: <span style={{ color: 'white', fontWeight: 600 }}>{Math.round(fundamental_score)}/100</span>
            </div>
          )}
        </div>
      </div>

      {/* 5. Detailed Justification List */}
      <div style={{ padding: '24px', flex: '1' }}>
        <h3 style={{ fontSize: '1.1rem', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <FileText size={18} style={{ color: 'var(--color-primary)' }} />
          Quantitative Justification Log
        </h3>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {/* Technical Reasons */}
          {technical_details?.reasoning?.map((reason: string, idx: number) => (
            <div key={`tech-${idx}`} style={{ display: 'flex', gap: '12px', fontSize: '0.85rem', padding: '10px 14px', background: 'rgba(59, 130, 246, 0.03)', borderLeft: '3px solid var(--color-primary)', borderRadius: '0 8px 8px 0' }}>
              <Check size={16} style={{ color: 'var(--color-primary)', flexShrink: 0, marginTop: '2px' }} />
              <span>{reason}</span>
            </div>
          ))}

          {/* Fundamental Reasons */}
          {!is_etf && fundamental_details?.reasoning?.map((reason: string, idx: number) => {
            const isCritical = reason.includes('negative') || reason.includes('elevated') || reason.includes('Weak');
            return (
              <div 
                key={`fund-${idx}`} 
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
  );
};
