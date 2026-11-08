import React, { useState, useEffect, useRef } from 'react';
import {
  Bot, Play, CheckCircle2, Clock,
  Loader2, FileText, Users, ShieldAlert, TrendingUp,
  History, ChevronDown, ChevronUp, Sparkles, Terminal
} from 'lucide-react';

interface Props {
  API_BASE_URL: string;
  token: string | null;
}





interface AgentReports {
  market_report?: string;
  sentiment_report?: string;
  news_report?: string;
  fundamentals_report?: string;
  investment_debate_state?: {
    bull_history?: string;
    bear_history?: string;
    history?: string;
    current_response?: string;
  };
  investment_plan?: string;
  trader_investment_plan?: string;
  risk_debate_state?: {
    aggressive_history?: string;
    conservative_history?: string;
    neutral_history?: string;
    history?: string;
  };
  final_trade_decision?: string;
}

interface LogEntry {
  timestamp: string;
  type: string;
  content: string;
}

interface SavedRun {
  id: string;
  ticker: string;
  trade_date: string;
  final_rating: string;
  timestamp: string;
  data: any;
}

const TEAM_GROUPS = [
  {
    team: 'Analyst Team',
    color: '#3b82f6',
    agents: ['Market Analyst', 'Sentiment Analyst', 'News Analyst', 'Fundamentals Analyst'],
  },
  {
    team: 'Research & Debate Team',
    color: '#8b5cf6',
    agents: ['Bull Researcher', 'Bear Researcher', 'Research Manager'],
  },
  {
    team: 'Trading Desk',
    color: '#f59e0b',
    agents: ['Trader'],
  },
  {
    team: 'Risk Management Team',
    color: '#ec4899',
    agents: ['Aggressive Analyst', 'Neutral Analyst', 'Conservative Analyst'],
  },
  {
    team: 'Executive Execution',
    color: '#10b981',
    agents: ['Portfolio Manager'],
  },
];

const QUICK_TICKERS = ['ICICIBANK.NS', 'RELIANCE.NS', 'TCS.NS', 'HDFCBANK.NS', 'INFY.NS', 'SBIN.NS', 'NVDA', 'AAPL'];

const STAGE_TILES = [
  {
    pill: 'STAGE 1',
    letter: 'S',
    cover: '#1f3a8a',
    title: 'Specialist Analysts',
    description:
      'Pulls live price trends, RSI, MACD & moving averages plus company balance sheets, cash flow, P/E & ROE.',
  },
  {
    pill: 'STAGE 2',
    letter: 'B',
    cover: '#0f766e',
    title: 'Bull vs. Bear Debate',
    description:
      'A Bull Researcher argues why to buy while a Bear Researcher challenges the thesis with valuation & downside risks.',
  },
  {
    pill: 'STAGE 3',
    letter: 'T',
    cover: '#7c3aed',
    title: 'Trader & Risk Review',
    description:
      'A Trader drafts an action plan, and Aggressive, Neutral & Conservative Risk Analysts debate drawdown exposure.',
  },
  {
    pill: 'STAGE 4',
    letter: 'P',
    cover: '#b45309',
    title: 'Portfolio Manager Verdict',
    description:
      'The Portfolio Manager weighs every team’s report and issues a final BUY / HOLD / SELL signal with full transcripts.',
  },
];

function SimpleMarkdown({ text }: { text: string }) {
  if (!text || !text.trim()) {
    return (
      <div style={{ padding: '10px 4px 16px' }}>
        {/* Main Status Notice */}
        <div
          style={{
            padding: '14px 18px',
            borderRadius: '12px',
            background: 'rgba(59, 130, 246, 0.1)',
            border: '1px solid rgba(59, 130, 246, 0.3)',
            color: '#93c5fd',
            fontWeight: 700,
            fontSize: '0.96rem',
            marginBottom: '16px',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
          }}
        >
          <Sparkles size={18} style={{ color: '#60a5fa', flexShrink: 0 }} />
          <span>Your Report will Appear here after Agents complete their task.</span>
        </div>

        {/* Two-line How to Run the Simulator + Brief Overview */}
        <div
          style={{
            padding: '14px 18px',
            borderRadius: '12px',
            background: 'rgba(15, 23, 42, 0.65)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            marginBottom: '18px',
            fontSize: '0.84rem',
            lineHeight: 1.65,
            color: '#e2e8f0',
          }}
        >
          <div style={{ marginBottom: '6px' }}>
            <strong style={{ color: '#60a5fa' }}>How to Run the Simulator:</strong>{' '}
            <strong>a.</strong> Select a stock on the left by typing a few letters (or keep default <strong>ICICI Bank</strong>) &nbsp;→&nbsp;{' '}
            <strong>b.</strong> Click <strong>Deploy Trading Agents</strong> &nbsp;→&nbsp;{' '}
            <strong>c.</strong> See live progress &amp; full reports across the tabs above.
          </div>
          <div style={{ color: 'var(--text-muted)', fontSize: '0.81rem' }}>
            <strong style={{ color: '#cbd5e1' }}>What this simulator does:</strong> Instead of asking a single AI chatbot for an opinion, it runs a{' '}
            <strong>4-stage virtual investment committee</strong> where 12 specialized AI agents research, debate, stress-test, and vote on your chosen stock:
          </div>
        </div>

        {/* Signature 4-Stage Tiles (Compact Cover + White Card Body) */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '14px',
          }}
        >
          {STAGE_TILES.map(tile => (
            <div
              key={tile.pill}
              style={{
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
                borderRadius: '14px',
                border: '1px solid #e3e8f0',
                background: '#ffffff',
                boxShadow: '0 1px 2px rgba(18, 35, 63, 0.05), 0 2px 10px rgba(18, 35, 63, 0.04)',
              }}
            >
              <div
                style={{
                  position: 'relative',
                  height: '52px',
                  overflow: 'hidden',
                  padding: '10px 14px',
                  background: tile.cover,
                  color: '#ffffff',
                }}
              >
                <span
                  aria-hidden="true"
                  style={{
                    position: 'absolute',
                    bottom: '-12px',
                    right: '10px',
                    fontSize: '3.9rem',
                    fontWeight: 900,
                    lineHeight: 1,
                    opacity: 0.18,
                    userSelect: 'none',
                  }}
                >
                  {tile.letter}
                </span>
                <span
                  style={{
                    position: 'relative',
                    zIndex: 1,
                    display: 'inline-block',
                    borderRadius: '9999px',
                    background: 'rgba(255, 255, 255, 0.16)',
                    padding: '2px 10px',
                    fontSize: '0.68rem',
                    fontWeight: 700,
                    letterSpacing: '0.04em',
                  }}
                >
                  {tile.pill}
                </span>
              </div>
              <div style={{ padding: '12px 14px 14px' }}>
                <h4
                  style={{
                    margin: '0 0 4px',
                    fontSize: '0.96rem',
                    fontWeight: 700,
                    lineHeight: 1.3,
                    color: '#12233f',
                  }}
                >
                  {tile.title}
                </h4>
                <p
                  style={{
                    margin: 0,
                    fontSize: '0.8rem',
                    lineHeight: 1.42,
                    color: '#637083',
                  }}
                >
                  {tile.description}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  const lines = text.split('\n');
  return (
    <div style={{ lineHeight: 1.7, fontSize: '0.9rem', color: '#e2e8f0' }}>
      {lines.map((line, idx) => {
        const trimmed = line.trim();
        if (!trimmed) return <div key={idx} style={{ height: '10px' }} />;

        if (trimmed.startsWith('#### ')) {
          return (
            <h4 key={idx} style={{ color: '#93c5fd', fontWeight: 700, fontSize: '0.98rem', marginTop: '14px', marginBottom: '6px' }}>
              {trimmed.slice(5)}
            </h4>
          );
        }
        if (trimmed.startsWith('### ')) {
          return (
            <h3 key={idx} style={{ color: '#60a5fa', fontWeight: 800, fontSize: '1.08rem', marginTop: '18px', marginBottom: '8px', borderBottom: '1px solid rgba(255,255,255,0.07)', paddingBottom: '4px' }}>
              {trimmed.slice(4)}
            </h3>
          );
        }
        if (trimmed.startsWith('## ')) {
          return (
            <h2 key={idx} style={{ color: '#38bdf8', fontWeight: 800, fontSize: '1.2rem', marginTop: '20px', marginBottom: '8px' }}>
              {trimmed.slice(3)}
            </h2>
          );
        }
        if (trimmed.startsWith('# ')) {
          return (
            <h1 key={idx} style={{ color: '#fff', fontWeight: 800, fontSize: '1.3rem', marginTop: '22px', marginBottom: '10px' }}>
              {trimmed.slice(2)}
            </h1>
          );
        }
        if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
          return (
            <div key={idx} style={{ display: 'flex', gap: '8px', paddingLeft: '12px', marginBottom: '4px' }}>
              <span style={{ color: 'var(--color-primary)' }}>•</span>
              <span dangerouslySetInnerHTML={{ __html: formatInline(trimmed.slice(2)) }} />
            </div>
          );
        }
        if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
          if (trimmed.replace(/[|\-\s:]/g, '') === '') return null;
          const cells = trimmed.split('|').slice(1, -1).map(c => c.trim());
          return (
            <div
              key={idx}
              style={{
                display: 'grid',
                gridTemplateColumns: `repeat(${cells.length}, minmax(80px, 1fr))`,
                gap: '8px',
                padding: '6px 10px',
                background: 'rgba(15, 23, 42, 0.55)',
                borderBottom: '1px solid rgba(255,255,255,0.06)',
                fontSize: '0.82rem',
              }}
            >
              {cells.map((c, ci) => (
                <div key={ci} dangerouslySetInnerHTML={{ __html: formatInline(c) }} />
              ))}
            </div>
          );
        }
        return (
          <p key={idx} style={{ marginBottom: '6px' }} dangerouslySetInnerHTML={{ __html: formatInline(line) }} />
        );
      })}
    </div>
  );
}

function formatInline(str: string): string {
  const escaped = str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  return escaped
    .replace(/\*\*(.+?)\*\*/g, '<strong style="color:#fff;font-weight:700">$1</strong>')
    .replace(/`([^`]+)`/g, '<code style="background:rgba(59,130,246,0.15);color:#93c5fd;padding:1px 5px;border-radius:4px;font-size:0.84em">$1</code>');
}

export const TradingAgent: React.FC<Props> = ({ API_BASE_URL }) => {
  
  
  const TRADING_AGENT_URL = window.location.origin.includes('localhost:5173') ? 'http://localhost:8001' : API_BASE_URL;
  const [serverOnline, setServerOnline] = useState<boolean>(false);

  const [ticker, setTicker] = useState<string>('ICICIBANK.NS');
  const [tradeDate, setTradeDate] = useState<string>(() => new Date().toISOString().split('T')[0]);
  const [assetType, setAssetType] = useState<'stock' | 'crypto'>('stock');
  const [selectedAnalysts, setSelectedAnalysts] = useState<string[]>(['market', 'fundamentals']);
  const [researchDepth, setResearchDepth] = useState<number>(1);
  const [quickModel, setQuickModel] = useState<string>('gemini-3.5-flash-lite');
  const [deepModel, setDeepModel] = useState<string>('gemini-2.5-flash');
  const [availableModels, setAvailableModels] = useState<{ id: string; label: string }[]>([
    { id: 'gemini-3.5-flash-lite', label: 'Gemini 3.5 Flash Lite (Fastest - Default Quick-Think)' },
    { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash (Recommended Deep-Think)' },
    { id: 'gemini-3.8-flash', label: 'Gemini 3.8 Flash (Latest Flagship Flash)' },
    { id: 'gemini-3.5-flash', label: 'Gemini 3.5 Flash (Balanced Reasoning)' },
    { id: 'gemini-3.1-flash-lite', label: 'Gemini 3.1 Flash Lite (Ultra-Lightweight)' },
    { id: 'gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro Preview (Deepest Reasoning)' },
  ]);

  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [agentStatus, setAgentStatus] = useState<Record<string, string>>({});
  const [reports, setReports] = useState<AgentReports>({});
  const [finalRating, setFinalRating] = useState<string | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState<number | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [activeReportTab, setActiveReportTab] = useState<string>('final_trade_decision');
  const [historyRuns, setHistoryRuns] = useState<SavedRun[]>([]);
  const [showHistory, setShowHistory] = useState<boolean>(false);
  const [searchResults, setSearchResults] = useState<{ symbol: string; name: string; exchange: string; is_etf?: boolean }[]>([]);
  const [showSearchDropdown, setShowSearchDropdown] = useState<boolean>(false);
  const [selectedCompanyName, setSelectedCompanyName] = useState<string>('ICICI Bank Limited');

  const logEndRef = useRef<HTMLDivElement>(null);
  const searchBoxRef = useRef<HTMLDivElement>(null);

  const checkServerStatus = async () => {
    try {
      const res = await fetch(`${TRADING_AGENT_URL}/api/trading-agent/status`);
      if (res.ok) {
        const data = await res.json();
        setServerOnline(true);
        if (data.models?.length) {
          setAvailableModels(data.models);
        }
      } else {
        setServerOnline(false);
      }
    } catch {
      setServerOnline(false);
    }
  };

  const fetchHistory = async () => {
    try {
      const res = await fetch(`${TRADING_AGENT_URL}/api/trading-agent/history`);
      if (res.ok) {
        const data = await res.json();
        setHistoryRuns(data.runs || []);
      }
    } catch {}
  };

  useEffect(() => {
    checkServerStatus();
    fetchHistory();
    const interval = setInterval(checkServerStatus, 10000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchBoxRef.current && !searchBoxRef.current.contains(e.target as Node)) {
        setShowSearchDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleTickerChange = (val: string) => {
    setTicker(val.toUpperCase());
    setSelectedCompanyName('');
    if (val.trim().length < 2) {
      setSearchResults([]);
      setShowSearchDropdown(false);
      return;
    }
    fetch(`${TRADING_AGENT_URL}/api/trading-agent/search?q=${encodeURIComponent(val.trim())}`)
      .then(r => (r.ok ? r.json() : []))
      .then(data => {
        if (Array.isArray(data) && data.length > 0) {
          setSearchResults(data);
          setShowSearchDropdown(true);
        } else {
          setSearchResults([]);
          setShowSearchDropdown(false);
        }
      })
      .catch(() => {});
  };

  const toggleAnalyst = (key: string) => {
    setSelectedAnalysts(prev => {
      if (prev.includes(key)) {
        return prev.length > 1 ? prev.filter(a => a !== key) : prev;
      }
      return [...prev, key];
    });
  };

  const handleRunAnalysis = async () => {
    if (!ticker.trim()) {
      setErrorMsg('Please enter a valid stock or crypto ticker.');
      return;
    }
    setIsRunning(true);
    setErrorMsg(null);
    setFinalRating(null);
    setElapsedSeconds(null);
    setReports({});
    setLogs([]);
    setActiveReportTab('market_report');

    try {
      const res = await fetch(`${TRADING_AGENT_URL}/api/trading-agent/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ticker: ticker.trim().toUpperCase(),
          trade_date: tradeDate,
          asset_type: assetType,
          selected_analysts: selectedAnalysts,
          research_depth: researchDepth,
          quick_think_llm: quickModel,
          deep_think_llm: deepModel,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: 'Failed to start Trading Agent analysis.' }));
        throw new Error(err.detail || 'Failed to start analysis.');
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error('Stream reader unavailable.');

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split('\n\n');
        buffer = parts.pop() || '';

        for (const part of parts) {
          const line = part.trim();
          if (!line.startsWith('data: ')) continue;
          const jsonStr = line.slice(6);
          try {
            const evt = JSON.parse(jsonStr);
            const { event, data } = evt;
            if (event === 'log') {
              setLogs(prev => [...prev.slice(-150), data]);
            } else if (event === 'status') {
              setAgentStatus(data.agent_status || {});
            } else if (event === 'state_update') {
              if (data.agent_status) setAgentStatus(data.agent_status);
              if (data.reports) {
                setReports(data.reports);
                if (data.reports.final_trade_decision) {
                  setActiveReportTab('final_trade_decision');
                } else if (data.reports.trader_investment_plan) {
                  setActiveReportTab('trader_investment_plan');
                } else if (data.reports.investment_plan) {
                  setActiveReportTab('investment_plan');
                }
              }
            } else if (event === 'complete') {
              setAgentStatus(data.agent_status || {});
              setReports(data.reports || {});
              setFinalRating(data.final_rating || 'REVIEW');
              setElapsedSeconds(data.elapsed_seconds || null);
              setActiveReportTab('final_trade_decision');
              fetchHistory();
            } else if (event === 'error') {
              setErrorMsg(data.detail || 'An error occurred during multi-agent simulation.');
            }
          } catch {}
        }
      }
    } catch (e: any) {
      setErrorMsg(e.message || 'Connection to Trading Agent service on port 8001 failed.');
    } finally {
      setIsRunning(false);
    }
  };

  const loadHistoricalRun = (run: SavedRun) => {
    setTicker(run.ticker);
    setTradeDate(run.trade_date);
    setFinalRating(run.final_rating);
    setReports({
      market_report: run.data.market_report || '',
      sentiment_report: run.data.sentiment_report || '',
      news_report: run.data.news_report || '',
      fundamentals_report: run.data.fundamentals_report || '',
      investment_debate_state: run.data.investment_debate_state || {},
      investment_plan: run.data.investment_plan || '',
      trader_investment_plan: run.data.trader_investment_plan || '',
      risk_debate_state: run.data.risk_debate_state || {},
      final_trade_decision: run.data.final_trade_decision || '',
    });
    setActiveReportTab('final_trade_decision');
    setShowHistory(false);
  };

  const getRatingBadgeStyle = (rating: string | null) => {
    const r = (rating || '').toUpperCase();
    if (r.includes('BUY') || r.includes('OVERWEIGHT')) {
      return { bg: 'rgba(16, 185, 129, 0.15)', color: '#10b981', border: 'rgba(16, 185, 129, 0.4)' };
    }
    if (r.includes('SELL') || r.includes('UNDERWEIGHT')) {
      return { bg: 'rgba(239, 68, 68, 0.15)', color: '#ef4444', border: 'rgba(239, 68, 68, 0.4)' };
    }
    return { bg: 'rgba(245, 158, 11, 0.15)', color: '#f59e0b', border: 'rgba(245, 158, 11, 0.4)' };
  };

  return (
    <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '28px 24px' }}>
      {/* Header Banner */}
      <div
        className="glass-panel"
        style={{
          padding: '24px 28px',
          marginBottom: '24px',
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '16px',
          background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.9), rgba(30, 41, 59, 0.75))',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div
            style={{
              width: '52px',
              height: '52px',
              borderRadius: '14px',
              background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff',
              boxShadow: '0 8px 20px rgba(59, 130, 246, 0.3)',
            }}
          >
            <Bot size={28} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              <h2 style={{ fontSize: '1.45rem', fontWeight: 800, margin: 0 }}>
                AI Powered Multi-Agent Stock Simulator
              </h2>
              <span
                style={{
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  padding: '3px 10px',
                  borderRadius: '20px',
                  background: 'rgba(139, 92, 246, 0.2)',
                  color: '#c4b5fd',
                  border: '1px solid rgba(139, 92, 246, 0.35)',
                }}
              >
                TauricResearch / TradingAgents • Gemini Powered
              </span>
            </div>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.86rem', marginTop: '4px', marginBottom: 0 }}>
              Simulates an institutional investment firm where specialist AI analysts, Bull & Bear researchers, traders, and risk managers debate a stock before issuing a final verdict.
            </p>
          </div>
        </div>

        {/* Service Status & Saved Runs */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '8px 14px',
              borderRadius: '10px',
              background: serverOnline ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
              border: `1px solid ${serverOnline ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
              fontSize: '0.8rem',
              fontWeight: 600,
              color: serverOnline ? '#10b981' : '#ef4444',
            }}
          >
            <span
              style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                background: serverOnline ? '#10b981' : '#ef4444',
              }}
            />
            {serverOnline ? 'AI Agents Online' : 'AI Agents Offline'}
          </div>

          <button
            onClick={() => {
              fetchHistory();
              setShowHistory(!showHistory);
            }}
            className="btn-secondary"
            style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px', fontSize: '0.8rem' }}
          >
            <History size={14} />
            <span>Saved Runs ({historyRuns.length})</span>
            {showHistory ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
        </div>
      </div>

      {/* Collapsible Saved Runs History */}
      {showHistory && (
        <div className="glass-panel" style={{ padding: '20px 24px', marginBottom: '24px' }}>
          <h4 style={{ margin: '0 0 12px', fontSize: '0.95rem', fontWeight: 700 }}>
            Previous Multi-Agent Simulation Runs
          </h4>
          {historyRuns.length === 0 ? (
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: 0 }}>
              No saved runs yet. Launch an analysis below to record full multi-agent state logs.
            </p>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '12px' }}>
              {historyRuns.map(run => {
                const badge = getRatingBadgeStyle(run.final_rating);
                return (
                  <div
                    key={run.id}
                    onClick={() => loadHistoricalRun(run)}
                    style={{
                      padding: '12px 16px',
                      borderRadius: '10px',
                      background: 'rgba(15, 23, 42, 0.65)',
                      border: '1px solid var(--border-glass)',
                      cursor: 'pointer',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 800, fontSize: '0.95rem', color: '#fff' }}>{run.ticker}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        Date: {run.trade_date} • {run.timestamp.split(' ')[0]}
                      </div>
                    </div>
                    <span
                      style={{
                        padding: '4px 10px',
                        borderRadius: '6px',
                        fontSize: '0.75rem',
                        fontWeight: 700,
                        background: badge.bg,
                        color: badge.color,
                        border: `1px solid ${badge.border}`,
                      }}
                    >
                      {run.final_rating}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Error Alert */}
      {errorMsg && (
        <div
          className="glass-panel"
          style={{
            padding: '14px 20px',
            marginBottom: '24px',
            borderLeft: '4px solid #ef4444',
            background: 'rgba(239, 68, 68, 0.08)',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
          }}
        >
          <ShieldAlert size={20} style={{ color: '#ef4444', flexShrink: 0 }} />
          <div style={{ flex: 1, fontSize: '0.85rem', color: '#fca5a5' }}>{errorMsg}</div>
          <button
            onClick={() => setErrorMsg(null)}
            style={{ background: 'transparent', border: 'none', color: '#fff', cursor: 'pointer', fontWeight: 700 }}
          >
            ×
          </button>
        </div>
      )}

      {/* Main Grid: Left Configuration & Pipeline Status, Right Live Reports */}
      <div style={{ display: 'grid', gridTemplateColumns: '380px 1fr', gap: '24px', alignItems: 'start' }}>
        {/* Left Column: Controls + Agent Team Status */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Configuration Card */}
          <div className="glass-panel" style={{ padding: '22px' }}>
            <h3 style={{ fontSize: '1.05rem', fontWeight: 700, margin: '0 0 16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Sparkles size={18} style={{ color: 'var(--color-primary)' }} />
              Simulation Parameters
            </h3>

            {/* Ticker Input with Live NSE & Global Search Dropdown */}
            <div style={{ marginBottom: '14px', position: 'relative' }} ref={searchBoxRef}>
              <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '6px' }}>
                SEARCH STOCK OR TICKER (NSE INDIA / US / CRYPTO)
              </label>
              <input
                type="text"
                value={ticker}
                onChange={e => handleTickerChange(e.target.value)}
                onFocus={() => {
                  if (searchResults.length > 0) setShowSearchDropdown(true);
                }}
                placeholder="Type company name or symbol (e.g. Tata, SBIN, NVDA)"
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: '8px',
                  border: '1px solid var(--border-glass)',
                  background: 'rgba(15, 23, 42, 0.8)',
                  color: '#fff',
                  fontWeight: 700,
                  fontSize: '0.95rem',
                }}
              />
              {selectedCompanyName && (
                <div style={{ fontSize: '0.74rem', color: '#60a5fa', marginTop: '4px', fontWeight: 600 }}>
                  Selected: {selectedCompanyName} ({ticker})
                </div>
              )}

              {/* Autocomplete Dropdown */}
              {showSearchDropdown && searchResults.length > 0 && (
                <div
                  style={{
                    position: 'absolute',
                    top: '68px',
                    left: 0,
                    right: 0,
                    zIndex: 100,
                    maxHeight: '260px',
                    overflowY: 'auto',
                    background: '#0f172a',
                    border: '1px solid rgba(59, 130, 246, 0.45)',
                    borderRadius: '10px',
                    boxShadow: '0 12px 32px rgba(0,0,0,0.65)',
                  }}
                >
                  {searchResults.map(item => (
                    <div
                      key={item.symbol}
                      onClick={() => {
                        setTicker(item.symbol);
                        setSelectedCompanyName(item.name);
                        setAssetType(item.symbol.includes('-USD') ? 'crypto' : 'stock');
                        setShowSearchDropdown(false);
                      }}
                      style={{
                        padding: '9px 12px',
                        borderBottom: '1px solid rgba(255,255,255,0.06)',
                        cursor: 'pointer',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: '8px',
                      }}
                    >
                      <div style={{ overflow: 'hidden' }}>
                        <div style={{ fontWeight: 700, fontSize: '0.84rem', color: '#fff' }}>{item.symbol}</div>
                        <div style={{ fontSize: '0.73rem', color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {item.name}
                        </div>
                      </div>
                      <span
                        style={{
                          fontSize: '0.68rem',
                          fontWeight: 700,
                          padding: '2px 7px',
                          borderRadius: '6px',
                          background: 'rgba(59, 130, 246, 0.18)',
                          color: '#93c5fd',
                          flexShrink: 0,
                        }}
                      >
                        {item.exchange}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '8px' }}>
                {QUICK_TICKERS.map(qt => (
                  <button
                    key={qt}
                    type="button"
                    onClick={() => {
                      setTicker(qt);
                      setSelectedCompanyName('');
                      setAssetType(qt.includes('-USD') ? 'crypto' : 'stock');
                      setShowSearchDropdown(false);
                    }}
                    style={{
                      padding: '3px 8px',
                      borderRadius: '6px',
                      fontSize: '0.7rem',
                      fontWeight: 600,
                      border: ticker === qt ? '1px solid var(--color-primary)' : '1px solid rgba(255,255,255,0.08)',
                      background: ticker === qt ? 'rgba(59, 130, 246, 0.2)' : 'rgba(255,255,255,0.03)',
                      color: ticker === qt ? '#93c5fd' : 'var(--text-muted)',
                      cursor: 'pointer',
                    }}
                  >
                    {qt}
                  </button>
                ))}
              </div>
            </div>

            {/* Analysis Date & Asset Type */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '6px' }}>
                  ANALYSIS DATE
                </label>
                <input
                  type="date"
                  value={tradeDate}
                  onChange={e => setTradeDate(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    borderRadius: '8px',
                    border: '1px solid var(--border-glass)',
                    background: 'rgba(15, 23, 42, 0.8)',
                    color: '#fff',
                    fontSize: '0.82rem',
                  }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '6px' }}>
                  ASSET CLASS
                </label>
                <select
                  value={assetType}
                  onChange={e => setAssetType(e.target.value as 'stock' | 'crypto')}
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    borderRadius: '8px',
                    border: '1px solid var(--border-glass)',
                    background: 'rgba(15, 23, 42, 0.8)',
                    color: '#fff',
                    fontSize: '0.82rem',
                  }}
                >
                  <option value="stock">Stock / Equity</option>
                  <option value="crypto">Crypto</option>
                </select>
              </div>
            </div>

            {/* Gemini Models Selection */}
            <div style={{ marginBottom: '14px' }}>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '6px' }}>
                QUICK-THINKING GEMINI MODEL (ANALYSTS & DEBATERS)
              </label>
              <select
                value={quickModel}
                onChange={e => setQuickModel(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 10px',
                  borderRadius: '8px',
                  border: '1px solid var(--border-glass)',
                  background: 'rgba(15, 23, 42, 0.8)',
                  color: '#fff',
                  fontSize: '0.82rem',
                }}
              >
                {availableModels.map(m => (
                  <option key={m.id} value={m.id}>{m.label}</option>
                ))}
              </select>
            </div>

            <div style={{ marginBottom: '14px' }}>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '6px' }}>
                DEEP-THINKING GEMINI MODEL (MANAGERS & JUDGES)
              </label>
              <select
                value={deepModel}
                onChange={e => setDeepModel(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 10px',
                  borderRadius: '8px',
                  border: '1px solid var(--border-glass)',
                  background: 'rgba(15, 23, 42, 0.8)',
                  color: '#fff',
                  fontSize: '0.82rem',
                }}
              >
                {availableModels.map(m => (
                  <option key={m.id} value={m.id}>{m.label}</option>
                ))}
              </select>
            </div>

            {/* Analyst Selection */}
            <div style={{ marginBottom: '14px' }}>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '6px' }}>
                ACTIVE ANALYST AGENTS
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                {[
                  { key: 'market', label: 'Market / Tech' },
                  { key: 'fundamentals', label: 'Fundamentals' },
                  { key: 'news', label: 'Macro & News' },
                  { key: 'social', label: 'Sentiment' },
                ].map(item => {
                  const active = selectedAnalysts.includes(item.key);
                  return (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => toggleAnalyst(item.key)}
                      style={{
                        padding: '8px 10px',
                        borderRadius: '8px',
                        fontSize: '0.78rem',
                        fontWeight: 600,
                        textAlign: 'left',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        border: active ? '1px solid #3b82f6' : '1px solid rgba(255,255,255,0.08)',
                        background: active ? 'rgba(59, 130, 246, 0.18)' : 'rgba(15, 23, 42, 0.5)',
                        color: active ? '#fff' : 'var(--text-muted)',
                        cursor: 'pointer',
                      }}
                    >
                      <CheckCircle2 size={14} style={{ color: active ? '#3b82f6' : 'rgba(255,255,255,0.2)' }} />
                      {item.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Debate Rounds */}
            <div style={{ marginBottom: '18px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '6px' }}>
                <span>DEBATE & RISK ROUNDS</span>
                <span style={{ color: '#93c5fd' }}>
                  {researchDepth === 1 ? '1 Round (Shallow / Fast)' : researchDepth === 2 ? '2 Rounds (Medium)' : '3 Rounds (Deep Research)'}
                </span>
              </div>
              <input
                type="range"
                min={1}
                max={3}
                value={researchDepth}
                onChange={e => setResearchDepth(Number(e.target.value))}
                style={{ width: '100%' }}
              />
            </div>

            {/* Launch Button */}
            <button
              onClick={handleRunAnalysis}
              disabled={isRunning || !serverOnline}
              style={{
                width: '100%',
                padding: '12px 16px',
                borderRadius: '10px',
                border: 'none',
                background: isRunning
                  ? 'rgba(59, 130, 246, 0.4)'
                  : 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
                color: '#fff',
                fontWeight: 800,
                fontSize: '0.92rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '10px',
                cursor: isRunning || !serverOnline ? 'not-allowed' : 'pointer',
                boxShadow: '0 6px 20px rgba(59, 130, 246, 0.3)',
              }}
            >
              {isRunning ? (
                <>
                  <Loader2 size={18} className="spin" />
                  <span>Running Multi-Agent Simulation...</span>
                </>
              ) : (
                <>
                  <Play size={18} />
                  <span>Deploy Trading Agents</span>
                </>
              )}
            </button>
          </div>

          {/* Agent Pipeline Status Card */}
          <div className="glass-panel" style={{ padding: '20px' }}>
            <h3 style={{ fontSize: '0.98rem', fontWeight: 700, margin: '0 0 14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Users size={16} style={{ color: '#8b5cf6' }} />
              Agent Pipeline Status
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {TEAM_GROUPS.map(group => (
                <div
                  key={group.team}
                  style={{
                    padding: '10px 12px',
                    borderRadius: '8px',
                    background: 'rgba(15, 23, 42, 0.55)',
                    borderLeft: `3px solid ${group.color}`,
                  }}
                >
                  <div style={{ fontSize: '0.72rem', fontWeight: 700, color: group.color, textTransform: 'uppercase', marginBottom: '6px' }}>
                    {group.team}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                    {group.agents.map(agentName => {
                      const analystKeyMap: Record<string, string> = {
                        'Market Analyst': 'market',
                        'Sentiment Analyst': 'social',
                        'News Analyst': 'news',
                        'Fundamentals Analyst': 'fundamentals',
                      };
                      const aKey = analystKeyMap[agentName];
                      const isSkipped = aKey && !selectedAnalysts.includes(aKey);
                      const st = isSkipped ? 'skipped' : (agentStatus[agentName] || 'pending');
                      return (
                        <div key={agentName} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.8rem' }}>
                          <span style={{ color: st === 'pending' || st === 'skipped' ? 'var(--text-dim)' : '#fff', textDecoration: st === 'skipped' ? 'line-through' : 'none' }}>{agentName}</span>
                          {st === 'completed' && (
                            <span style={{ color: '#10b981', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.74rem', fontWeight: 700 }}>
                              <CheckCircle2 size={13} /> Done
                            </span>
                          )}
                          {st === 'in_progress' && (
                            <span style={{ color: '#60a5fa', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.74rem', fontWeight: 700 }}>
                              <Loader2 size={13} /> Active
                            </span>
                          )}
                          {st === 'pending' && (
                            <span style={{ color: 'var(--text-dim)', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.74rem' }}>
                              <Clock size={12} /> Queued
                            </span>
                          )}
                          {st === 'skipped' && (
                            <span style={{ color: '#64748b', fontSize: '0.72rem', fontStyle: 'italic' }}>
                              Skipped (Fast Mode)
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Column: Final Verdict Banner + Tabbed Agent Reports + Live Telemetry */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Verdict Summary Banner (when available) */}
          {finalRating && (
            <div
              className="glass-panel"
              style={{
                padding: '20px 24px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.1), rgba(59, 130, 246, 0.1))',
                border: '1px solid rgba(59, 130, 246, 0.3)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                <TrendingUp size={28} style={{ color: getRatingBadgeStyle(finalRating).color }} />
                <div>
                  <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                    PORTFOLIO MANAGER CONSENSUS DECISION • {ticker} ({tradeDate})
                  </div>
                  <div style={{ fontSize: '1.3rem', fontWeight: 800, color: '#fff', marginTop: '2px' }}>
                    Final Signal:{' '}
                    <span style={{ color: getRatingBadgeStyle(finalRating).color }}>{finalRating}</span>
                  </div>
                </div>
              </div>
              {elapsedSeconds && (
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  Completed in <strong>{elapsedSeconds}s</strong>
                </div>
              )}
            </div>
          )}

          {/* Tabbed Report Viewer */}
          <div className="glass-panel" style={{ padding: '22px', minHeight: '460px' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '14px', marginBottom: '18px' }}>
              {[
                { id: 'final_trade_decision', label: 'Portfolio Manager Decision' },
                { id: 'trader_investment_plan', label: 'Trader Plan' },
                { id: 'investment_plan', label: 'Bull vs. Bear Debate' },
                { id: 'market_report', label: 'Market / Technical' },
                { id: 'fundamentals_report', label: 'Fundamentals' },
                { id: 'news_report', label: 'Macro & News' },
                { id: 'sentiment_report', label: 'Social Sentiment' },
              ].map(tab => {
                const isActive = activeReportTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveReportTab(tab.id)}
                    style={{
                      padding: '8px 14px',
                      borderRadius: '8px',
                      border: isActive ? '1px solid var(--color-primary)' : '1px solid rgba(255,255,255,0.07)',
                      background: isActive ? 'var(--color-primary)' : 'rgba(15, 23, 42, 0.6)',
                      color: isActive ? '#fff' : 'var(--text-muted)',
                      fontSize: '0.8rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                    }}
                  >
                    <FileText size={14} />
                    {tab.label}
                  </button>
                );
              })}
            </div>

            {/* Active Report Body */}
            <div style={{ maxHeight: '560px', overflowY: 'auto', paddingRight: '8px' }}>
              {activeReportTab === 'final_trade_decision' && (
                <div>
                  <SimpleMarkdown text={reports.final_trade_decision || ''} />
                  {reports.risk_debate_state &&
                    (reports.risk_debate_state.aggressive_history ||
                      reports.risk_debate_state.conservative_history ||
                      reports.risk_debate_state.neutral_history) && (
                      <div style={{ marginTop: '24px', borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '16px' }}>
                        <h3 style={{ color: '#f472b6', fontSize: '1.05rem', fontWeight: 800 }}>
                          Risk Management Committee Transcript
                        </h3>
                        {reports.risk_debate_state.aggressive_history && (
                          <SimpleMarkdown text={`#### Aggressive Risk Analyst\n${reports.risk_debate_state.aggressive_history}`} />
                        )}
                        {reports.risk_debate_state.neutral_history && (
                          <SimpleMarkdown text={`#### Neutral Risk Analyst\n${reports.risk_debate_state.neutral_history}`} />
                        )}
                        {reports.risk_debate_state.conservative_history && (
                          <SimpleMarkdown text={`#### Conservative Risk Analyst\n${reports.risk_debate_state.conservative_history}`} />
                        )}
                      </div>
                    )}
                </div>
              )}

              {activeReportTab === 'trader_investment_plan' && (
                <SimpleMarkdown text={reports.trader_investment_plan || ''} />
              )}

              {activeReportTab === 'investment_plan' && (
                <div>
                  <SimpleMarkdown text={reports.investment_plan || ''} />
                  {reports.investment_debate_state &&
                    (reports.investment_debate_state.bull_history || reports.investment_debate_state.bear_history) && (
                      <div style={{ marginTop: '24px', borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '16px' }}>
                        <h3 style={{ color: '#a78bfa', fontSize: '1.05rem', fontWeight: 800 }}>
                          Bull vs. Bear Researcher Debate Transcript
                        </h3>
                        {reports.investment_debate_state.bull_history && (
                          <SimpleMarkdown text={`#### Bull Researcher Arguments\n${reports.investment_debate_state.bull_history}`} />
                        )}
                        {reports.investment_debate_state.bear_history && (
                          <SimpleMarkdown text={`#### Bear Researcher Arguments\n${reports.investment_debate_state.bear_history}`} />
                        )}
                      </div>
                    )}
                </div>
              )}

              {activeReportTab === 'market_report' && <SimpleMarkdown text={reports.market_report || ''} />}
              {activeReportTab === 'fundamentals_report' && <SimpleMarkdown text={reports.fundamentals_report || ''} />}
              {activeReportTab === 'news_report' && <SimpleMarkdown text={reports.news_report || ''} />}
              {activeReportTab === 'sentiment_report' && <SimpleMarkdown text={reports.sentiment_report || ''} />}
            </div>
          </div>

          {/* Live Agent Telemetry & Tool Call Stream */}
          <div className="glass-panel" style={{ padding: '18px 22px' }}>
            <h4 style={{ margin: '0 0 10px', fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Terminal size={15} style={{ color: '#38bdf8' }} />
              LIVE AGENT TELEMETRY & TOOL CALLS ({logs.length})
            </h4>
            <div
              style={{
                height: '180px',
                overflowY: 'auto',
                background: 'rgba(2, 6, 23, 0.75)',
                borderRadius: '8px',
                padding: '12px',
                fontFamily: 'monospace',
                fontSize: '0.78rem',
                border: '1px solid rgba(255,255,255,0.06)',
              }}
            >
              {logs.length === 0 ? (
                <div style={{ color: 'var(--text-dim)' }}>
                  Waiting for simulation start... Tool calls (yfinance, SEC EDGAR, technical indicators) and agent messages will stream here live.
                </div>
              ) : (
                logs.map((log, i) => (
                  <div key={i} style={{ marginBottom: '6px', lineHeight: 1.45 }}>
                    <span style={{ color: '#64748b' }}>[{log.timestamp}]</span>{' '}
                    <span
                      style={{
                        fontWeight: 700,
                        color:
                          log.type === 'Tool Call'
                            ? '#f59e0b'
                            : log.type === 'System'
                            ? '#38bdf8'
                            : '#a78bfa',
                      }}
                    >
                      [{log.type}]
                    </span>{' '}
                    <span style={{ color: '#cbd5e1' }}>{log.content}</span>
                  </div>
                ))
              )}
              <div ref={logEndRef} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
