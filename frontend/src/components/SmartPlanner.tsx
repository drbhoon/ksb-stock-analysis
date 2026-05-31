import React, { useState } from 'react';
import {
  Zap, RefreshCw, ShieldCheck,
  Flame, Download, BarChart2, Info
} from 'lucide-react';

interface Allocation {
  symbol: string;
  name: string;
  sector: string;
  cap: string;
  technical_score: number;
  fundamental_score: number;
  combined_score: number;
  latest_price: number | null;
  change_percent: number | null;
  weight_pct: number;
  allocated_amount: number;
  shares: number | null;
  signal: 'BUY' | 'HOLD' | 'SELL';
}

interface PlanResult {
  risk_profile: string;
  profile_description: string;
  total_amount: number;
  stock_count: number;
  avg_score: number;
  buy_count: number;
  hold_count: number;
  allocation: Allocation[];
}

interface Props {
  API_BASE_URL: string;
  token: string | null;
  onSelectStock: (symbol: string, isEtf: boolean) => void;
}

type RiskProfile = 'conservative' | 'moderate' | 'aggressive';

const PROFILE_META: Record<RiskProfile, { label: string; icon: React.ReactNode; color: string; description: string; caps: string }> = {
  conservative: {
    label: 'Conservative',
    icon: <ShieldCheck size={24} />,
    color: '#10b981',
    description: 'Capital preservation. Large-cap blue-chips only. Low volatility.',
    caps: 'Large Cap'
  },
  moderate: {
    label: 'Moderate',
    icon: <BarChart2 size={24} />,
    color: '#3b82f6',
    description: 'Balanced growth. Large + mid-cap quality stocks. Moderate risk.',
    caps: 'Large + Mid Cap'
  },
  aggressive: {
    label: 'Aggressive',
    icon: <Flame size={24} />,
    color: '#f59e0b',
    description: 'High growth potential. Full spectrum including small-caps. Higher risk.',
    caps: 'Large + Mid + Small Cap'
  }
};

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

const SECTOR_COLORS = [
  '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444',
  '#06b6d4', '#ec4899', '#84cc16', '#f97316', '#14b8a6',
];

function formatINR(n: number): string {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n);
}

// Simple SVG donut chart
function DonutChart({ data }: { data: { label: string; pct: number; color: string }[] }) {
  const size = 200;
  const r = 80;
  const cx = size / 2;
  const cy = size / 2;
  let cumulative = 0;

  const slices = data.map((d, i) => {
    const startAngle = (cumulative / 100) * 2 * Math.PI - Math.PI / 2;
    cumulative += d.pct;
    const endAngle = (cumulative / 100) * 2 * Math.PI - Math.PI / 2;
    const x1 = cx + r * Math.cos(startAngle);
    const y1 = cy + r * Math.sin(startAngle);
    const x2 = cx + r * Math.cos(endAngle);
    const y2 = cy + r * Math.sin(endAngle);
    const largeArc = d.pct > 50 ? 1 : 0;
    const innerR = 50;
    const ix1 = cx + innerR * Math.cos(startAngle);
    const iy1 = cy + innerR * Math.sin(startAngle);
    const ix2 = cx + innerR * Math.cos(endAngle);
    const iy2 = cy + innerR * Math.sin(endAngle);
    const path = d.pct >= 100
      ? `M${cx - r},${cy} A${r},${r},0,1,1,${cx + r - 0.01},${cy} Z`
      : `M${x1},${y1} A${r},${r},0,${largeArc},1,${x2},${y2} L${ix2},${iy2} A${innerR},${innerR},0,${largeArc},0,${ix1},${iy1} Z`;
    return <path key={i} d={path} fill={d.color} opacity={0.9} />;
  });

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {slices}
      <circle cx={cx} cy={cy} r={45} fill="#0a0f1e" />
    </svg>
  );
}

export const SmartPlanner: React.FC<Props> = ({ API_BASE_URL, token, onSelectStock }) => {
  const [amount, setAmount] = useState('');
  const [profile, setProfile] = useState<RiskProfile>('moderate');
  const [isLoading, setIsLoading] = useState(false);
  const [plan, setPlan] = useState<PlanResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const authHeaders = (): HeadersInit =>
    token ? { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' };

  const handleGenerate = async () => {
    const numAmount = parseFloat(amount.replace(/,/g, ''));
    if (!numAmount || numAmount < 1000) {
      setError('Please enter a valid investment amount (minimum ₹1,000).');
      return;
    }
    setIsLoading(true);
    setError(null);
    setPlan(null);
    try {
      const res = await fetch(`${API_BASE_URL}/api/planner/recommend`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ amount: numAmount, risk_profile: profile })
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Planning failed.');
      }
      const data = await res.json();
      setPlan(data);
    } catch (err: any) {
      setError(err.message || 'Failed to generate plan. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const downloadCSV = () => {
    if (!plan) return;
    const headers = ['Symbol', 'Company', 'Sector', 'Cap', 'Score', 'Signal', 'Weight %', 'Allocated (INR)', 'Shares', 'Price (INR)'];
    const rows = plan.allocation.map(a => [
      a.symbol.replace('.NS', ''),
      `"${a.name}"`,
      a.sector,
      a.cap,
      a.combined_score,
      a.signal,
      a.weight_pct,
      a.allocated_amount,
      a.shares ?? '',
      a.latest_price ?? ''
    ]);
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `smart_planner_${profile}_${Date.now()}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  // Build sector breakdown for donut
  const sectorData = plan ? (() => {
    const sectors: Record<string, number> = {};
    plan.allocation.forEach(a => { sectors[a.sector] = (sectors[a.sector] || 0) + a.weight_pct; });
    return Object.entries(sectors).map(([label, pct], i) => ({
      label,
      pct: Math.round(pct * 10) / 10,
      color: SECTOR_COLORS[i % SECTOR_COLORS.length]
    }));
  })() : [];

  return (
    <div style={{ padding: '32px 40px', maxWidth: '1400px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: '28px' }}>
        <h1 style={{ fontSize: '1.8rem', fontWeight: 800, fontFamily: 'var(--font-heading)', marginBottom: '6px' }}>
          Smart <span style={{ color: 'var(--color-primary)' }}>Investment Planner</span>
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
          Enter your investment amount and risk appetite. We'll scan our curated NSE universe and recommend a diversified portfolio.
        </p>
      </div>

      {/* Input card */}
      <div className="glass-panel" style={{ padding: '32px', marginBottom: '28px' }}>
        {/* Amount */}
        <div style={{ marginBottom: '28px' }}>
          <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '10px', letterSpacing: '0.05em' }}>
            INVESTMENT AMOUNT (₹)
          </label>
          <div style={{ display: 'flex', alignItems: 'center', background: 'rgba(255,255,255,0.04)', border: '2px solid var(--border-glass)', borderRadius: '12px', padding: '0 18px', gap: '12px', maxWidth: '400px' }}>
            <span style={{ fontSize: '1.4rem', color: 'var(--color-primary)', fontWeight: 700 }}>₹</span>
            <input
              type="text"
              placeholder="1,00,000"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleGenerate()}
              style={{
                flex: 1, background: 'transparent', border: 'none', outline: 'none',
                color: 'white', fontSize: '1.3rem', fontWeight: 700, padding: '16px 0',
                fontFamily: 'var(--font-heading)'
              }}
            />
          </div>
          <p style={{ fontSize: '0.78rem', color: 'var(--text-dim)', marginTop: '6px' }}>
            Minimum ₹1,000 · Supports any amount up to ₹10 crore
          </p>
        </div>

        {/* Risk profile selector */}
        <div style={{ marginBottom: '28px' }}>
          <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '14px', letterSpacing: '0.05em' }}>
            RISK PROFILE
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px' }}>
            {(Object.entries(PROFILE_META) as [RiskProfile, typeof PROFILE_META[RiskProfile]][]).map(([key, meta]) => (
              <button
                key={key}
                onClick={() => setProfile(key)}
                style={{
                  background: profile === key ? `${meta.color}1a` : 'rgba(255,255,255,0.02)',
                  border: `2px solid ${profile === key ? meta.color : 'rgba(255,255,255,0.08)'}`,
                  borderRadius: '14px',
                  padding: '20px',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'all 0.2s ease',
                  color: 'white'
                }}
              >
                <div style={{ color: profile === key ? meta.color : 'var(--text-muted)', marginBottom: '10px' }}>
                  {meta.icon}
                </div>
                <div style={{ fontWeight: 800, fontSize: '1rem', fontFamily: 'var(--font-heading)', color: profile === key ? meta.color : 'var(--text-main)', marginBottom: '6px' }}>
                  {meta.label}
                </div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', lineHeight: 1.5, marginBottom: '8px' }}>
                  {meta.description}
                </div>
                <div style={{ fontSize: '0.72rem', background: profile === key ? `${meta.color}20` : 'rgba(255,255,255,0.04)', color: meta.color, borderRadius: '4px', padding: '3px 8px', display: 'inline-block', fontWeight: 600 }}>
                  {meta.caps}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Generate button */}
        <button
          onClick={handleGenerate}
          disabled={isLoading || !amount}
          className="btn-primary"
          style={{ opacity: !amount ? 0.5 : 1, display: 'flex', alignItems: 'center', gap: '10px', fontSize: '1rem', padding: '14px 28px' }}
        >
          {isLoading ? <RefreshCw size={18} style={{ animation: 'spin 1.2s linear infinite' }} /> : <Zap size={18} />}
          {isLoading ? 'Generating Plan…' : 'Generate Portfolio Plan'}
        </button>

        {/* Disclaimer */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', marginTop: '16px', padding: '12px 16px', background: 'rgba(59,130,246,0.05)', borderRadius: '8px', border: '1px solid rgba(59,130,246,0.12)' }}>
          <Info size={14} style={{ color: 'var(--color-primary)', flexShrink: 0, marginTop: '1px' }} />
          <p style={{ fontSize: '0.75rem', color: 'var(--text-dim)', lineHeight: 1.6 }}>
            Recommendations are based on mathematical models (fundamental + technical scores). This is not financial advice. Analysis may take 30–60 seconds depending on market data availability.
          </p>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="glass-panel" style={{ padding: '16px 20px', borderLeft: '4px solid var(--color-sell)', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ color: 'var(--color-sell)', fontSize: '0.9rem' }}>⚠ {error}</span>
        </div>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="glass-panel" style={{ padding: '60px', textAlign: 'center' }}>
          <div style={{ width: '60px', height: '60px', border: '4px solid rgba(59,130,246,0.15)', borderTopColor: 'var(--color-primary)', borderRadius: '50%', animation: 'spin 1.2s linear infinite', margin: '0 auto 20px' }} />
          <p style={{ color: 'var(--text-muted)', fontSize: '1rem', fontWeight: 600 }}>
            Scanning NSE universe and computing allocations…
          </p>
          <p style={{ color: 'var(--text-dim)', fontSize: '0.82rem', marginTop: '8px' }}>
            This takes 30–60 seconds as we analyse each stock in real-time.
          </p>
        </div>
      )}

      {/* Results */}
      {plan && !isLoading && (
        <div>
          {/* Summary ribbon */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px', marginBottom: '24px' }}>
            {[
              { label: 'TOTAL AMOUNT', value: formatINR(plan.total_amount), color: 'var(--color-primary)' },
              { label: 'STOCKS SELECTED', value: plan.stock_count, color: 'white' },
              { label: 'AVG SCORE', value: `${plan.avg_score}/100`, color: plan.avg_score >= 70 ? 'var(--color-buy)' : plan.avg_score >= 40 ? 'var(--color-hold)' : 'var(--color-sell)' },
              { label: 'BUY SIGNALS', value: plan.buy_count, color: 'var(--color-buy)' },
              { label: 'HOLD SIGNALS', value: plan.hold_count, color: 'var(--color-hold)' },
            ].map(({ label, value, color }) => (
              <div key={label} className="glass-panel" style={{ padding: '18px 20px' }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 700, letterSpacing: '0.05em', marginBottom: '6px' }}>{label}</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 800, color, fontFamily: 'var(--font-heading)' }}>{value}</div>
              </div>
            ))}
          </div>

          {/* Profile note */}
          <div style={{ background: `${PROFILE_META[plan.risk_profile as RiskProfile]?.color ?? '#3b82f6'}12`, border: `1px solid ${PROFILE_META[plan.risk_profile as RiskProfile]?.color ?? '#3b82f6'}30`, borderRadius: '10px', padding: '14px 20px', marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ color: PROFILE_META[plan.risk_profile as RiskProfile]?.color ?? '#3b82f6' }}>
              {PROFILE_META[plan.risk_profile as RiskProfile]?.icon}
            </span>
            <div>
              <strong style={{ fontWeight: 700, textTransform: 'capitalize' }}>{plan.risk_profile} Profile</strong>
              <span style={{ color: 'var(--text-muted)', fontSize: '0.87rem', marginLeft: '12px' }}>{plan.profile_description}</span>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '24px', marginBottom: '24px', alignItems: 'start' }}>
            {/* Table */}
            <div className="glass-panel" style={{ padding: '24px', overflow: 'hidden' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Zap size={18} style={{ color: 'var(--color-primary)' }} />
                  Recommended Allocation
                </h3>
                <button onClick={downloadCSV} className="btn-secondary" style={{ fontSize: '0.82rem', padding: '8px 14px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Download size={14} /> Export CSV
                </button>
              </div>

              <div style={{ overflowX: 'auto' }}>
                <table className="premium-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Ticker</th>
                      <th>Company</th>
                      <th>Sector</th>
                      <th style={{ textAlign: 'center' }}>Score</th>
                      <th style={{ textAlign: 'center' }}>Signal</th>
                      <th style={{ textAlign: 'right' }}>Weight</th>
                      <th style={{ textAlign: 'right' }}>Amount (₹)</th>
                      <th style={{ textAlign: 'right' }}>Price (₹)</th>
                      <th style={{ textAlign: 'right' }}>~Shares</th>
                    </tr>
                  </thead>
                  <tbody>
                    {plan.allocation.map((a, i) => (
                      <tr
                        key={a.symbol}
                        onClick={() => onSelectStock(a.symbol, false)}
                        style={{ cursor: 'pointer', animationDelay: `${i * 40}ms` }}
                        title={`Click to view detailed analysis for ${a.name}`}
                      >
                        <td style={{ color: 'var(--text-dim)', fontWeight: 600 }}>{i + 1}</td>
                        <td>
                          <span style={{ fontFamily: 'monospace', fontWeight: 700, color: 'var(--color-primary)', fontSize: '0.87rem' }}>
                            {a.symbol.replace('.NS', '')}
                          </span>
                          <span style={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-dim)', textTransform: 'capitalize' }}>{a.cap} cap</span>
                        </td>
                        <td style={{ fontWeight: 600, fontSize: '0.85rem' }}>{a.name}</td>
                        <td>
                          <span style={{ background: 'rgba(59,130,246,0.1)', color: 'var(--color-primary)', borderRadius: '4px', padding: '2px 8px', fontSize: '0.75rem', fontWeight: 600 }}>
                            {a.sector}
                          </span>
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: '6px', height: '6px', width: '70px', margin: '0 auto 4px', overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${a.combined_score}%`, background: a.combined_score >= 70 ? 'var(--color-buy)' : a.combined_score >= 40 ? 'var(--color-hold)' : 'var(--color-sell)', borderRadius: '6px' }} />
                          </div>
                          <span style={{ fontSize: '0.82rem', fontWeight: 700 }}>{a.combined_score}</span>
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <span style={{
                            background: SIGNAL_BG[a.signal], color: SIGNAL_COLORS[a.signal],
                            border: `1px solid ${SIGNAL_COLORS[a.signal]}40`,
                            borderRadius: '6px', padding: '3px 10px', fontSize: '0.75rem', fontWeight: 700
                          }}>
                            {a.signal}
                          </span>
                        </td>
                        <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--color-primary)' }}>
                          {a.weight_pct}%
                        </td>
                        <td style={{ textAlign: 'right', fontFamily: 'monospace', fontWeight: 700 }}>
                          {formatINR(a.allocated_amount)}
                        </td>
                        <td style={{ textAlign: 'right', fontFamily: 'monospace', fontSize: '0.85rem' }}>
                          {a.latest_price !== null ? `₹${a.latest_price.toFixed(2)}` : '—'}
                        </td>
                        <td style={{ textAlign: 'right', fontFamily: 'monospace', fontWeight: 600 }}>
                          {a.shares !== null ? a.shares : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Sector donut */}
            <div className="glass-panel" style={{ padding: '24px', minWidth: '240px' }}>
              <h4 style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <BarChart2 size={16} style={{ color: 'var(--color-primary)' }} />
                Sector Mix
              </h4>
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '20px' }}>
                <DonutChart data={sectorData} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {sectorData.map(s => (
                  <div key={s.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.8rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div style={{ width: '10px', height: '10px', borderRadius: '2px', background: s.color, flexShrink: 0 }} />
                      <span style={{ color: 'var(--text-muted)' }}>{s.label}</span>
                    </div>
                    <span style={{ fontWeight: 700 }}>{s.pct}%</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Methodology note */}
          <div className="glass-panel" style={{ padding: '16px 20px', display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
            <Info size={16} style={{ color: 'var(--color-primary)', flexShrink: 0, marginTop: '2px' }} />
            <p style={{ fontSize: '0.78rem', color: 'var(--text-dim)', lineHeight: 1.7 }}>
              <strong style={{ color: 'var(--text-muted)' }}>Methodology:</strong> The planner evaluates stocks from our curated NSE universe (60% Fundamental + 40% Technical scoring),
              filters by risk-appropriate market cap, ranks by combined score, and applies sector diversification caps (no sector &gt;{' '}
              {profile === 'conservative' ? '30%' : profile === 'moderate' ? '28%' : '25%'} of total).
              Equal-weight allocation is applied across selected stocks. Click any row to open the full stock analysis.
            </p>
          </div>
        </div>
      )}
    </div>
  );
};
