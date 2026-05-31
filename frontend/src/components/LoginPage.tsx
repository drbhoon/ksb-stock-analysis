import React, { useState } from 'react';
import { TrendingUp, ShieldCheck, Loader2 } from 'lucide-react';

interface LoginPageProps {
  API_BASE_URL: string;
  onAdminLogin: (password: string) => Promise<boolean>;
  showAdminBypass: boolean;
  authError?: string | null;
}

export const LoginPage: React.FC<LoginPageProps> = ({
  API_BASE_URL,
  onAdminLogin,
  showAdminBypass,
  authError
}) => {
  const [showAdmin, setShowAdmin] = useState(false);
  const [adminPass, setAdminPass] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGoogleLogin = () => {
    window.location.href = `${API_BASE_URL}/api/auth/google`;
  };

  const handleAdminSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminPass.trim()) return;
    setIsLoading(true);
    setError(null);
    try {
      const ok = await onAdminLogin(adminPass);
      if (!ok) setError('Incorrect admin password.');
    } catch {
      setError('Connection error. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  // Human-readable error messages from OAuth callback errors
  const oauthErrorMessages: Record<string, string> = {
    google_denied:         'Google sign-in was cancelled. Please try again.',
    csrf_mismatch:         'Security check failed. Please try again.',
    token_exchange_failed: 'Could not complete sign-in with Google. Please retry.',
    userinfo_failed:       'Could not retrieve your Google profile. Please retry.',
    not_allowed:           'Your Google account is not on the access list. Please contact Dr KS Bhoon.',
  };
  const errorToShow = authError
    ? (oauthErrorMessages[authError] ?? `Sign-in error: ${authError}`)
    : error;

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'radial-gradient(ellipse at 50% 0%, rgba(59,130,246,0.12) 0%, #020617 60%)',
      padding: '20px',
      fontFamily: 'var(--font-body)',
    }}>
      {/* Subtle grid lines */}
      <div style={{
        position: 'fixed', inset: 0, pointerEvents: 'none',
        backgroundImage: 'linear-gradient(rgba(255,255,255,0.015) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.015) 1px, transparent 1px)',
        backgroundSize: '60px 60px',
      }} />

      <div style={{ position: 'relative', width: '100%', maxWidth: '440px' }}>
        {/* Glow blob */}
        <div style={{
          position: 'absolute', top: '-80px', left: '50%', transform: 'translateX(-50%)',
          width: '300px', height: '300px',
          background: 'radial-gradient(circle, rgba(59,130,246,0.18) 0%, transparent 70%)',
          pointerEvents: 'none',
        }} />

        <div className="glass-panel" style={{
          padding: '44px 36px',
          borderRadius: '24px',
          textAlign: 'center',
          boxShadow: '0 24px 64px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.06)',
          position: 'relative',
        }}>
          {/* Logo */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            gap: '10px', marginBottom: '28px'
          }}>
            <div style={{
              background: 'linear-gradient(135deg, var(--color-primary), var(--color-accent))',
              padding: '12px', borderRadius: '14px',
              display: 'flex', color: '#fff',
              boxShadow: '0 0 24px rgba(59,130,246,0.4)',
            }}>
              <TrendingUp size={24} />
            </div>
            <div style={{ textAlign: 'left' }}>
              <div style={{
                fontSize: '1.35rem', fontWeight: 800,
                fontFamily: 'var(--font-heading)', letterSpacing: '-0.02em',
              }}>
                PORTFOLIO <span style={{ color: 'var(--color-primary)' }}>ANALYSER</span>
              </div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)', fontWeight: 600, letterSpacing: '0.06em' }}>
                BY DR KS BHOON
              </div>
            </div>
          </div>

          <h2 style={{
            fontSize: '1.5rem', fontWeight: 800,
            fontFamily: 'var(--font-heading)',
            marginBottom: '8px',
          }}>
            Welcome Back
          </h2>
          <p style={{
            color: 'var(--text-muted)', fontSize: '0.875rem',
            lineHeight: 1.6, marginBottom: '32px',
          }}>
            Sign in with your Google account to access your personal portfolio, mutual fund analysis and investment planner.
          </p>

          {/* Error banner */}
          {errorToShow && (
            <div style={{
              background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)',
              borderRadius: '10px', padding: '12px 16px', marginBottom: '20px',
              color: 'var(--color-sell)', fontSize: '0.83rem', display: 'flex',
              alignItems: 'center', gap: '8px', textAlign: 'left',
            }}>
              <span style={{ flexShrink: 0 }}>⚠</span>
              <span>{errorToShow}</span>
            </div>
          )}

          {/* Google Sign-In button */}
          <button
            onClick={handleGoogleLogin}
            id="google-signin-btn"
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '12px',
              padding: '14px 20px',
              background: '#fff',
              border: 'none',
              borderRadius: '12px',
              cursor: 'pointer',
              fontSize: '0.95rem',
              fontWeight: 600,
              color: '#1f2937',
              boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
              transition: 'all 0.2s ease',
              fontFamily: 'var(--font-body)',
              marginBottom: '20px',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.4)';
              e.currentTarget.style.transform = 'translateY(-1px)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.3)';
              e.currentTarget.style.transform = 'translateY(0)';
            }}
          >
            {/* Official Google "G" SVG */}
            <svg width="20" height="20" viewBox="0 0 48 48" style={{ flexShrink: 0 }}>
              <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
              <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
              <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
              <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
              <path fill="none" d="M0 0h48v48H0z"/>
            </svg>
            Continue with Google
          </button>

          {/* Security note */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            gap: '6px', color: 'var(--text-dim)', fontSize: '0.75rem', marginBottom: '24px',
          }}>
            <ShieldCheck size={13} style={{ color: 'var(--color-buy)' }} />
            Secured by Google OAuth 2.0 · No passwords stored
          </div>

          {/* Divider */}
          {showAdminBypass && (
            <div>
              <div style={{
                display: 'flex', alignItems: 'center', gap: '12px',
                margin: '4px 0 20px', color: 'var(--text-dim)', fontSize: '0.75rem',
              }}>
                <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.06)' }} />
                or
                <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.06)' }} />
              </div>

              {!showAdmin ? (
                <button
                  onClick={() => setShowAdmin(true)}
                  style={{
                    background: 'transparent', border: 'none',
                    color: 'var(--text-dim)', fontSize: '0.78rem',
                    cursor: 'pointer', textDecoration: 'underline',
                  }}
                >
                  Admin access
                </button>
              ) : (
                <form onSubmit={handleAdminSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <input
                    type="password"
                    placeholder="Admin password"
                    value={adminPass}
                    onChange={e => setAdminPass(e.target.value)}
                    disabled={isLoading}
                    style={{
                      background: 'rgba(255,255,255,0.03)',
                      border: '1px solid var(--border-glass)',
                      borderRadius: '8px', padding: '11px 14px',
                      color: 'white', fontSize: '0.87rem',
                      outline: 'none', textAlign: 'center',
                      letterSpacing: '0.12em',
                    }}
                  />
                  <button
                    type="submit"
                    disabled={isLoading || !adminPass.trim()}
                    className="btn-secondary"
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', opacity: !adminPass.trim() ? 0.5 : 1 }}
                  >
                    {isLoading && <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />}
                    {isLoading ? 'Verifying…' : 'Sign In as Admin'}
                  </button>
                </form>
              )}
            </div>
          )}
        </div>

        <p style={{
          textAlign: 'center', marginTop: '20px',
          color: 'var(--text-dim)', fontSize: '0.72rem', lineHeight: 1.6,
        }}>
          © {new Date().getFullYear()} Portfolio Analyser by Dr KS Bhoon.
          <br />By signing in you agree this tool provides mathematical analysis, not financial advice.
        </p>
      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
};
