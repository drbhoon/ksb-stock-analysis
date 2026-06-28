import React, { useState } from 'react';
import { BookOpen, Award, TrendingUp, ShieldCheck, Activity, Users } from 'lucide-react';

interface TermItem {
  name: string;
  badge?: string;
  definition: string;
  appUse: string;
  analogy: string;
}

export const LearnGuide: React.FC = () => {
  const [activeSection, setActiveSection] = useState<'SCORES' | 'FUNDAMENTALS' | 'TECHNICALS' | 'MF' | 'PLANNER'>('SCORES');

  const content: Record<string, { title: string; desc: string; icon: any; terms: TermItem[] }> = {
    SCORES: {
      title: '1. Scoring & Sentiment Concepts',
      desc: 'Understand how the app evaluates your portfolio and gives quantitative signals.',
      icon: Award,
      terms: [
        {
          name: 'Combined Score',
          badge: 'Overall Rating',
          definition: 'A composite score out of 100 that blends both underlying fundamental health and technical momentum to give a clear verdict.',
          appUse: 'For normal stocks, the app weights it as 60% Fundamental and 40% Technical by default (adjustable in settings). For ETFs, the score is 100% technical-based.',
          analogy: 'Imagine grading a student based 60% on their year-round homework quality (fundamentals) and 40% on their final exam performance (technical momentum).'
        },
        {
          name: 'Fundamental Score',
          badge: 'Quality Grade',
          definition: 'A rating representing the financial solidity, profit efficiency, debt burden, and valuation buffer of a company.',
          appUse: 'Determined using valuation ratios (P/E, P/B) and operating metrics (ROE, Current Ratio, Debt-to-Equity). Banks/financials are graded with adjusted rules.',
          analogy: 'Like buying a house: the Fundamental Score represents the foundation, plumbing, neighborhood value, and overall structural integrity.'
        },
        {
          name: 'Technical Score',
          badge: 'Momentum Grade',
          definition: 'A rating representing the demand, price trend strength, and short-term buying/selling pressure on a stock.',
          appUse: 'Derived from indicators calculated from the past 1 year of daily price movements (RSI, EMA crossovers, Bollinger Bands, and MACD).',
          analogy: 'Like watching the speed and wind direction of a moving car to predict where it will be in the next few seconds.'
        },
        {
          name: 'Portfolio Sentiment',
          badge: 'Overall Mood',
          definition: 'The general bullish or bearish tone of your entire holdings list, representing the average score across all mapped assets.',
          appUse: 'Displays "Bullish" if the average score is above 70, "Bearish" if below 40, and "Neutral" in between.',
          analogy: 'Similar to a weather report: it tells you if you are in a sunny season (market rally), a rainy season (downtrend), or general overcast conditions.'
        }
      ]
    },
    FUNDAMENTALS: {
      title: '2. Fundamental Ratios & Valuation',
      desc: 'Ratios used to inspect a company\'s financial statements and understand if it is overpriced or underpriced.',
      icon: ShieldCheck,
      terms: [
        {
          name: 'P/E Ratio (Price-to-Earnings)',
          badge: 'Valuation metric',
          definition: 'Measures how much investors are willing to pay for every rupee of a company\'s annual net profit. Calculated as Stock Price ÷ Earnings Per Share.',
          appUse: 'Used to grade valuation. A lower P/E (relative to sector peers) indicates undervaluation or bargain prices, while a high P/E suggests high growth expectations or overvaluation.',
          analogy: 'If a coffee shop makes ₹10,000 profit a year, and the owner sells it to you for ₹1,00,000, you bought it at a P/E of 10. It will take 10 years to earn your investment back.'
        },
        {
          name: 'P/B Ratio (Price-to-Book)',
          badge: 'Net Asset metric',
          definition: 'Compares a company\'s market value to its net assets (total assets minus total liabilities). Calculated as Stock Price ÷ Book Value Per Share.',
          appUse: 'Highly useful for asset-heavy businesses like banks and manufacturers. A low P/B indicates you are buying the actual hard assets at a discount.',
          analogy: 'If a company owns land and cash worth ₹100 per share (after paying debts), and the stock trades at ₹120, the P/B is 1.2x. You are paying a 20% premium for the business.'
        },
        {
          name: 'Return on Equity (ROE)',
          badge: 'Efficiency metric',
          definition: 'Measures how much profit a company generates with the money shareholders have invested. Calculated as Net Profit ÷ Shareholders\' Equity.',
          appUse: 'A crucial measure of business quality. The app rewards companies that maintain an ROE above 15% to 20%, indicating high profitability and efficient management.',
          analogy: 'If you give two farmers ₹1,000 each, and Farmer A grows ₹200 worth of crops (20% ROE) while Farmer B grows ₹50 worth (5% ROE), Farmer A is far more efficient.'
        },
        {
          name: 'Debt-to-Equity (D/E)',
          badge: 'Solvency metric',
          definition: 'Compares the amount of capital a company has borrowed (debt) to the amount contributed by shareholders (equity).',
          appUse: 'Measures bankruptcy risk. A D/E ratio below 1.5 is healthy. The app automatically exempts banks and financial institutions, as borrow-and-lend is their core business.',
          analogy: 'If you buy a house for ₹10 Lakhs, putting in ₹3 Lakhs of your own cash and borrowing ₹7 Lakhs as a loan, your Debt-to-Equity is 2.33. High debt means higher risk if income dips.'
        },
        {
          name: 'Current Ratio',
          badge: 'Liquidity metric',
          definition: 'Compares a company\'s short-term assets (cash, inventory) to its short-term liabilities (bills due within a year).',
          appUse: 'Indicates short-term survival capacity. A Current Ratio above 1.2x means the company has enough cash runway to pay its immediate bills.',
          analogy: 'If you have ₹1,500 cash in your wallet (current assets) and credit card bills of ₹1,000 due this month (current liabilities), your Current Ratio is 1.5x. You are safe.'
        }
      ]
    },
    TECHNICALS: {
      title: '3. Technical Indicators & Price Trends',
      desc: 'Mathematical indicators calculated from historical prices to determine entry and exit points.',
      icon: Activity,
      terms: [
        {
          name: 'RSI (Relative Strength Index)',
          badge: 'Momentum indicator',
          definition: 'A momentum oscillator ranging from 0 to 100 that measures the speed and change of recent price changes.',
          appUse: 'Identifies overextended price trends. RSI above 70 is "Overbought" (prices are running too hot, potential pullback). RSI below 30 is "Oversold" (heavily dumped, bargain entry opportunity).',
          analogy: 'Like stretching a rubber band: pull it too far in one direction (overbought/oversold) and it is highly likely to snap back to the center.'
        },
        {
          name: 'EMA (Exponential Moving Average)',
          badge: 'Trend line',
          definition: 'A moving average that places a greater weight and significance on the most recent data points to spot changing trends quickly.',
          appUse: 'The app plots 20-day (short momentum), 50-day (medium direction), and 200-day (long-term macro trend) EMAs. A price above the 200-day EMA indicates a healthy long-term bull market.',
          analogy: 'Similar to tracking a student\'s grades: looking at their average grade over the last 3 weeks (EMA 20) shows their current form better than their average over the entire year (EMA 200).'
        },
        {
          name: 'Bollinger Bands',
          badge: 'Volatility indicator',
          definition: 'A set of three trendlines plotted to represent volatility: a middle simple moving average flanked by two standard deviation bands.',
          appUse: 'Bands expand during high volatility and contract during low volatility. Touching the upper band suggests the price is relatively high; touching the lower band suggests it is low.',
          analogy: 'Like driving on a highway with soft barriers on both sides. The car (price) usually bounces within the lanes, but hitting the outer wall signals a deviation.'
        },
        {
          name: 'MACD (Moving Average Convergence Divergence)',
          badge: 'Trend-following momentum',
          definition: 'A trend-following momentum indicator that shows the relationship between two exponential moving averages (typically 12-day and 26-day).',
          appUse: 'Spots trend reversals. A crossing of the MACD line above its signal line triggers a bullish indicator (positive momentum crossover).',
          analogy: 'Like watching two runners on a track. When the faster runner (short-term average) overtakes the slower runner (long-term average), it indicates they have gained serious speed.'
        }
      ]
    },
    MF: {
      title: '4. Mutual Funds Definitions',
      desc: 'Understand rolling performance, standard deviations, and fund evaluation criteria.',
      icon: TrendingUp,
      terms: [
        {
          name: 'NAV (Net Asset Value)',
          badge: 'Fund Price',
          definition: 'The market value of a single unit of a mutual fund scheme, calculated daily at the close of trading.',
          appUse: 'Similar to a stock price, it is the price at which you buy or sell mutual fund units.',
          analogy: 'If a basket of 10 different fruits costs ₹100, and it is divided into 10 equal bowls, each bowl has a Net Asset Value of ₹10.'
        },
        {
          name: 'Rolling Returns',
          badge: 'Performance metric',
          definition: 'The returns generated by the mutual fund calculated over specific continuous periods (e.g. past 1 month, 3 months, 6 months, and 1 year).',
          appUse: 'Helps bypass short-term market noise. The app ranks funds by comparing their rolling returns against peer funds in the exact same category.',
          analogy: 'Evaluating an athlete by their average performance across multiple tournaments rather than just looking at their score in the single match they played yesterday.'
        },
        {
          name: 'Volatility (Standard Deviation)',
          badge: 'Risk metric',
          definition: 'A statistical measure of how much the fund\'s NAV fluctuates compared to its average return over time.',
          appUse: 'Indicates risk. A higher volatility score means the fund\'s value swings wildly up and down, which is typical for small-caps or sector-specific funds.',
          analogy: 'If Route A takes exactly 20 minutes every day, and Route B takes between 5 minutes and 50 minutes depending on traffic, Route B has much higher volatility.'
        }
      ]
    },
    PLANNER: {
      title: '5. Risk Profiles & Capital Allocation',
      desc: 'Definitions relating to the Smart Planner, risk management, and diversifying capital.',
      icon: Users,
      terms: [
        {
          name: 'Conservative Risk Profile',
          badge: 'Capital Preservation',
          definition: 'An investment approach focusing on preserving your initial capital, keeping volatility low, and accepting stable, moderate growth.',
          appUse: 'The app responds by allocating larger weights to stable large-cap stocks, index ETFs, and cash/gold to minimize downward swings.',
          analogy: 'Putting your savings in high-quality government bonds and major established banks—very low chance of losing money, but slower growth.'
        },
        {
          name: 'Medium Risk Profile',
          badge: 'Balanced Growth',
          definition: 'A balanced investment approach seeking a compromise between capital growth and safety. Accepts moderate short-term fluctuations.',
          appUse: 'The app splits capital between steady large-caps and growth-oriented mid-caps/balanced funds to maximize gains while retaining a safety buffer.',
          analogy: 'Driving at a steady speed limit—moving fast enough to make good progress but keeping a safe distance from other cars in case of sudden brakes.'
        },
        {
          name: 'High Risk Profile',
          badge: 'Maximum Growth',
          definition: 'An aggressive investment approach prioritizing maximum long-term wealth compounding, fully accepting large price swings and potential losses.',
          appUse: 'The app distributes capital into high-momentum equities, small-caps, and sector-specific growth funds with high technical scores.',
          analogy: 'Riding a rollercoaster: there will be massive drops that make your stomach sink, but the goal is to reach a much higher summit at the end.'
        },
        {
          name: 'Capital Diversification',
          badge: 'Risk Mitigation',
          definition: 'The practice of spreading your investment money across multiple different stocks, sectors, and asset classes to reduce overall risk.',
          appUse: 'The Smart Planner automatically caps the maximum money allocated to any single stock (typically 12% to 15%) so that one failing stock doesn\'t ruin your portfolio.',
          analogy: 'Not putting all your eggs in one basket. If the basket drops, all eggs break. If you spread them across 8 baskets, a drop only affects one.'
        }
      ]
    }
  };

  const activeData = content[activeSection];
  const IconComponent = activeData.icon;

  return (
    <div style={{ padding: '32px 40px', maxWidth: '1400px', margin: '0 auto' }}>
      
      {/* Page Header */}
      <div style={{ marginBottom: '28px' }}>
        <h1 style={{ fontSize: '1.8rem', fontWeight: 800, fontFamily: 'var(--font-heading)', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <BookOpen size={28} style={{ color: 'var(--color-primary)' }} />
          Beginners Guide <span style={{ color: 'var(--color-primary)' }}>to the Market</span>
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
          Learn the core financial metrics and technical indicators used in the analyser with simple analogies and explanations.
        </p>
      </div>

      <div style={{
        display: 'flex',
        flexDirection: 'row',
        gap: '30px',
        alignItems: 'flex-start',
        flexWrap: 'wrap'
      }}>
        
        {/* Navigation Sidebar */}
        <div style={{
          flex: '1',
          minWidth: '260px',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px'
        }}>
          {Object.keys(content).map((key) => {
            const sec = content[key];
            const SecIcon = sec.icon;
            const isActive = activeSection === key;
            return (
              <button
                key={key}
                onClick={() => setActiveSection(key as any)}
                className="glass-panel"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  padding: '16px 20px',
                  width: '100%',
                  textAlign: 'left',
                  border: isActive ? '1px solid var(--color-primary)' : '1px solid var(--border-glass)',
                  background: isActive ? 'var(--color-primary-glow)' : 'var(--bg-surface)',
                  cursor: 'pointer',
                  borderRadius: '12px',
                  color: isActive ? 'white' : 'var(--text-muted)',
                  fontWeight: isActive ? 700 : 500,
                  fontSize: '0.86rem',
                  fontFamily: 'var(--font-heading)',
                  transition: 'all 0.25s ease'
                }}
                onMouseEnter={e => {
                  if (!isActive) e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)';
                }}
                onMouseLeave={e => {
                  if (!isActive) e.currentTarget.style.borderColor = 'var(--border-glass)';
                }}
              >
                <SecIcon size={18} style={{ color: isActive ? 'var(--color-primary)' : 'var(--text-dim)' }} />
                {sec.title.substring(3)}
              </button>
            );
          })}
        </div>

        {/* Content Panel */}
        <div style={{
          flex: '3',
          minWidth: '320px',
          display: 'flex',
          flexDirection: 'column',
          gap: '24px'
        }}>
          {/* Section banner */}
          <div className="glass-panel" style={{ padding: '24px 28px', borderLeft: '4px solid var(--color-primary)', display: 'flex', gap: '20px', alignItems: 'center' }}>
            <div style={{
              background: 'var(--color-primary-glow)',
              color: 'var(--color-primary)',
              padding: '16px',
              borderRadius: '14px',
              display: 'flex'
            }}>
              <IconComponent size={28} />
            </div>
            <div>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'white' }}>{activeData.title}</h2>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '4px', lineHeight: 1.4 }}>{activeData.desc}</p>
            </div>
          </div>

          {/* Cards checklist */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {activeData.terms.map((term, idx) => (
              <div key={idx} className="glass-panel" style={{ padding: '24px 28px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '8px', marginBottom: '14px' }}>
                  <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: 'white' }}>{term.name}</h3>
                  {term.badge && (
                    <span style={{
                      fontSize: '0.68rem',
                      background: 'rgba(255,255,255,0.03)',
                      border: '1px solid var(--border-glass)',
                      padding: '3px 8px',
                      borderRadius: '6px',
                      color: 'var(--text-muted)',
                      fontWeight: 600,
                      letterSpacing: '0.04em'
                    }}>
                      {term.badge}
                    </span>
                  )}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  
                  {/* Definition */}
                  <div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: '4px' }}>
                      Simple Definition
                    </div>
                    <p style={{ fontSize: '0.86rem', color: 'var(--text-main)', lineHeight: 1.5 }}>
                      {term.definition}
                    </p>
                  </div>

                  {/* How it is used in App */}
                  <div style={{ borderLeft: '3px solid var(--color-primary-glow)', paddingLeft: '14px' }}>
                    <div style={{ fontSize: '0.72rem', color: 'var(--color-primary)', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: '4px' }}>
                      How the App Uses It
                    </div>
                    <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                      {term.appUse}
                    </p>
                  </div>

                  {/* Analogy */}
                  <div style={{ background: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.03)', padding: '12px 16px', borderRadius: '8px' }}>
                    <div style={{ fontSize: '0.72rem', color: 'var(--color-hold)', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: '4px' }}>
                      💡 Everyday Analogy
                    </div>
                    <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', lineHeight: 1.5, fontStyle: 'italic' }}>
                      {term.analogy}
                    </p>
                  </div>

                </div>
              </div>
            ))}
          </div>

        </div>

      </div>
    </div>
  );
};
