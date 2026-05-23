import React, { useState, useEffect, useRef } from 'react';
import { Search, Loader2, ArrowRight, Trash2, Download, HelpCircle, Activity, Sparkles } from 'lucide-react';

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
  onSelectStock,
  token
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchOption[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  
  // Keep list of manually analyzed stocks as a custom portfolio collection
  const [analyzedStocks, setAnalyzedStocks] = useState<any[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  
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

  // Perform core stock analysis and append to custom list
  const handleSelectOption = async (option: SearchOption) => {
    setShowDropdown(false);
    setIsAnalyzing(true);
    setErrorMsg(null);

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
      
      // Avoid duplicate symbol entries in the manual portfolio list
      setAnalyzedStocks(prev => {
        const exists = prev.some(s => s.symbol === data.symbol);
        if (exists) {
          // Replace/Update the existing entry
          return prev.map(s => s.symbol === data.symbol ? data : s);
        } else {
          return [...prev, data];
        }
      });

      // Clear search query so the user can easily search and add another!
      setSearchQuery('');
    } catch (e: any) {
      console.error(e);
      setErrorMsg(e.message || "Failed to analyze selected security. Ensure it is actively traded on NSE.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleRemoveStock = (symbol: string) => {
    setAnalyzedStocks(prev => prev.filter(s => s.symbol !== symbol));
  };

  // Recalculate signal client-side dynamically based on weight sliders
  const recalculatedStocks = React.useMemo(() => {
    return analyzedStocks.map(stock => {
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
  }, [analyzedStocks, weightF, weightT]);

  // Exporter to download formatted CSV report client-side
  const downloadCSVReport = () => {
    if (recalculatedStocks.length === 0) return;

    const headers = [
      "Row Index",
      "Ticker Symbol",
      "Company Name",
      "Asset Type",
      "Industry/Sector",
      "Latest Price (INR)",
      "Daily Change (INR)",
      "Daily Change (%)",
      "Technical Score",
      "Fundamental Score",
      "Combined Weighted Score",
      "Recommendation Signal",
      "Confidence (%)",
      "Quantitative Summary Outlook"
    ];

    const csvRows = [headers.join(",")];

    recalculatedStocks.forEach((stock, idx) => {
      const rowData = [
        idx + 1,
        `"${stock.symbol}"`,
        `"${stock.company_name.replace(/"/g, '""')}"`,
        stock.is_etf ? "ETF" : "Equity",
        `"${(stock.industry || "N/A").replace(/"/g, '""')}"`,
        stock.latest_price.toFixed(2),
        stock.change.toFixed(2),
        stock.change_percent.toFixed(2),
        Math.round(stock.technical_score),
        stock.is_etf ? "N/A" : Math.round(stock.fundamental_score),
        stock.combined_score.toFixed(1),
        stock.signal,
        Math.round(stock.confidence),
        `"${(stock.summary || "").replace(/"/g, '""')}"`
      ];
      csvRows.push(rowData.join(","));
    });

    const csvString = csvRows.join("\n");
    const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `custom_single_stock_portfolio_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '24px 20px' }}>
      
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
          Custom Portfolio Builder
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem', maxWidth: '640px', margin: '0 auto' }}>
          Search and add securities line-by-line below to construct a custom analysis sheet. Adjust weights on the header slider to dynamically update signals.
        </p>
      </div>

      {/* 1. Autocomplete Search Bar */}
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
        <div className="glass-panel" style={{ padding: '40px', textAlign: 'center', maxWidth: '640px', margin: '0 auto 30px' }}>
          <div style={{ position: 'relative', width: '40px', height: '40px', margin: '0 auto 16px' }}>
            <div className="glow-active" style={{ width: '40px', height: '40px', borderRadius: '50%', border: '4px solid rgba(59, 130, 246, 0.1)', borderTopColor: 'var(--color-primary)', animation: 'spin 1.2s linear infinite' }} />
          </div>
          <h4 style={{ fontSize: '1.1rem' }}>Compiling Asset Metrics...</h4>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: '4px' }}>
            Downloading historical charts and scanning balance sheet ratios...
          </p>
        </div>
      )}

      {/* 3. Error Alert */}
      {errorMsg && (
        <div className="glass-panel" style={{ padding: '20px', borderLeft: '4px solid var(--color-sell)', background: 'rgba(239, 68, 68, 0.03)', maxWidth: '640px', margin: '0 auto 30px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <HelpCircle size={24} style={{ color: 'var(--color-sell)' }} />
            <div>
              <h4 style={{ fontWeight: 700 }}>Query Error</h4>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: '2px' }}>{errorMsg}</p>
            </div>
          </div>
        </div>
      )}

      {/* 4. Action Banner for Exporter (When length >= 5) */}
      {recalculatedStocks.length >= 5 && (
        <div className="glass-panel glow-card-emerald animate-pulse-card" style={{
          padding: '20px 24px',
          borderRadius: '12px',
          marginBottom: '24px',
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'linear-gradient(135deg, rgba(16,185,129,0.06), rgba(59,130,246,0.03))',
          borderLeft: '4px solid var(--color-buy)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div style={{ background: 'rgba(16,185,129,0.1)', padding: '12px', borderRadius: '50%', color: 'var(--color-buy)' }}>
              <Sparkles size={24} />
            </div>
            <div>
              <h3 style={{ fontSize: '1.15rem', fontWeight: 800, color: '#fff' }}>Portfolio Report Unlocked!</h3>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '2px' }}>
                You have compiled {recalculatedStocks.length} assets manually. Download your high-fidelity quantitative spreadsheet below.
              </p>
            </div>
          </div>
          <button 
            onClick={downloadCSVReport}
            className="btn-primary"
            style={{
              padding: '12px 24px',
              fontSize: '0.9rem',
              fontWeight: 700,
              gap: '8px',
              marginTop: '10px',
              boxShadow: '0 0 15px rgba(16,185,129,0.3)',
              background: 'var(--color-buy)',
              border: 'none'
            }}
          >
            <Download size={18} />
            <span>Download Report (.csv)</span>
          </button>
        </div>
      )}

      {/* 5. Custom Line-by-Line Datagrid Table */}
      {recalculatedStocks.length > 0 ? (
        <div className="glass-panel" style={{ padding: '24px', overflow: 'hidden' }}>
          <h3 style={{ fontSize: '1.15rem', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px' }}>
            <Activity size={18} style={{ color: 'var(--color-primary)' }} />
            Custom Portfolio Sheet ({recalculatedStocks.length} Assets)
          </h3>
          
          <div style={{ overflowX: 'auto' }}>
            <table className="premium-table">
              <thead>
                <tr>
                  <th style={{ width: '60px' }}>Row</th>
                  <th>Ticker Symbol</th>
                  <th>Company Name</th>
                  <th style={{ textAlign: 'right' }}>Price (INR)</th>
                  <th style={{ textAlign: 'right' }}>Daily Change</th>
                  <th style={{ textAlign: 'center' }}>Tech Score</th>
                  <th style={{ textAlign: 'center' }}>Fund Score</th>
                  <th style={{ textAlign: 'center' }}>Weighted Score</th>
                  <th style={{ textAlign: 'center' }}>Recommendation</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {recalculatedStocks.map((stock, idx) => (
                  <tr key={stock.symbol} style={{ animation: 'slideInRow 0.3s ease-out' }}>
                    <td style={{ color: 'var(--text-dim)', fontWeight: 600 }}>{idx + 1}</td>
                    <td style={{ fontWeight: 700, color: '#fff', letterSpacing: '0.02em' }}>
                      {stock.symbol}
                      {stock.is_etf && (
                        <span style={{ fontSize: '0.65rem', background: 'rgba(255,255,255,0.08)', padding: '2px 4px', borderRadius: '4px', marginLeft: '6px', color: 'var(--text-muted)' }}>
                          ETF
                        </span>
                      )}
                    </td>
                    <td style={{ maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {stock.company_name}
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 700, fontFamily: 'var(--font-heading)' }}>
                      ₹{stock.latest_price.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td style={{ 
                      textAlign: 'right', 
                      fontWeight: 600,
                      color: stock.change >= 0 ? 'var(--color-buy)' : 'var(--color-sell)'
                    }}>
                      {(stock.change >= 0 ? '+' : '') + stock.change_percent.toFixed(2)}%
                    </td>
                    <td style={{ textAlign: 'center', fontWeight: 600 }}>
                      <span style={{ 
                        color: stock.technical_score >= 70 ? 'var(--color-buy)' : stock.technical_score >= 40 ? 'var(--color-hold)' : 'var(--color-sell)'
                      }}>{Math.round(stock.technical_score)}</span>
                    </td>
                    <td style={{ textAlign: 'center', fontWeight: 600 }}>
                      {stock.is_etf ? (
                        <span style={{ color: 'var(--text-dim)' }}>—</span>
                      ) : (
                        <span style={{ 
                          color: stock.fundamental_score >= 70 ? 'var(--color-buy)' : stock.fundamental_score >= 40 ? 'var(--color-hold)' : 'var(--color-sell)'
                        }}>{Math.round(stock.fundamental_score)}</span>
                      )}
                    </td>
                    <td style={{ textAlign: 'center', fontWeight: 700, color: 'var(--color-primary)' }}>
                      {stock.combined_score.toFixed(1)}
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
                      <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                        <button 
                          className="btn-secondary" 
                          onClick={() => onSelectStock(stock.symbol, stock.is_etf)}
                          style={{ padding: '6px 12px', fontSize: '0.75rem' }}
                        >
                          Inspect
                        </button>
                        <button 
                          onClick={() => handleRemoveStock(stock.symbol)}
                          style={{
                            padding: '6px 10px',
                            background: 'rgba(239, 68, 68, 0.1)',
                            border: 'none',
                            color: 'var(--color-sell)',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            transition: 'all 0.2s ease',
                            display: 'flex',
                            alignItems: 'center'
                          }}
                          className="btn-delete-hover"
                          title="Remove from Custom List"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        // Initial Empty State
        <div className="glass-panel" style={{ padding: '80px 40px', textAlign: 'center', maxWidth: '640px', margin: '0 auto' }}>
          <Activity size={48} style={{ color: 'var(--color-primary)', margin: '0 auto 16px', opacity: 0.3 }} />
          <h3>Build Custom Portfolio Line-by-Line</h3>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', maxWidth: '440px', margin: '8px auto 0', lineHeight: '1.5' }}>
            Use the autocomplete search bar above to fetch and compile stock details line-by-line. Once you add **5 or more stocks**, you can export the compiled portfolio report as a structured spreadsheet!
          </p>
        </div>
      )}
      
      <style>{`
        .search-row-hover:hover {
          background: rgba(59, 130, 246, 0.08) !important;
        }
        .btn-delete-hover:hover {
          background: var(--color-sell) !important;
          color: white !important;
          box-shadow: 0 0 10px rgba(239, 68, 68, 0.3) !important;
        }
        @keyframes slideInRow {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-pulse-card {
          animation: pulseCard 2s infinite ease-in-out;
        }
        @keyframes pulseCard {
          0% { box-shadow: 0 0 10px rgba(16,185,129,0.1); }
          50% { box-shadow: 0 0 20px rgba(16,185,129,0.25); }
          100% { box-shadow: 0 0 10px rgba(16,185,129,0.1); }
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>

    </div>
  );
};
