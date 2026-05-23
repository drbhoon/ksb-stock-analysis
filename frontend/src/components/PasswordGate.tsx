import React, { useState } from 'react';
import { Lock, ShieldAlert, Loader2, ArrowRight } from 'lucide-react';

interface PasswordGateProps {
  onVerify: (password: string) => Promise<boolean>;
}

export const PasswordGate: React.FC<PasswordGateProps> = ({ onVerify }) => {
  const [password, setPassword] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim()) return;

    setIsVerifying(true);
    setErrorMsg(null);

    try {
      const success = await onVerify(password);
      if (!success) {
        setErrorMsg("Incorrect access password. Please try again.");
      }
    } catch (e: any) {
      console.error(e);
      setErrorMsg(e.message || "Failed to verify password due to network connection issues.");
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'radial-gradient(circle at center, #0f172a 0%, #020617 100%)',
      padding: '20px'
    }}>
      <div className="glass-panel glow-active" style={{
        padding: '40px 32px',
        maxWidth: '440px',
        width: '100%',
        textAlign: 'center',
        borderRadius: '20px',
        boxShadow: '0 20px 50px rgba(0, 0, 0, 0.4)',
        animation: 'fadeInLock 0.6s ease-out'
      }}>
        {/* Animated Key Lock Icon */}
        <div style={{ position: 'relative', width: '72px', height: '72px', margin: '0 auto 24px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{
            position: 'absolute',
            width: '100%',
            height: '100%',
            borderRadius: '50%',
            background: 'rgba(59, 130, 246, 0.1)',
            animation: 'pulseLock 2s infinite ease-in-out'
          }} />
          <div style={{
            background: 'linear-gradient(135deg, var(--color-primary), var(--color-accent))',
            color: 'white',
            padding: '16px',
            borderRadius: '50%',
            boxShadow: '0 0 20px rgba(59, 130, 246, 0.4)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 2
          }}>
            <Lock size={28} />
          </div>
        </div>

        <h2 style={{ fontSize: '1.6rem', fontWeight: 800, background: 'linear-gradient(135deg, #fff, var(--text-muted))', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', marginBottom: '8px' }}>
          Restricted Quantitative Intel
        </h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', lineHeight: '1.5', marginBottom: '28px', maxWidth: '320px', margin: '0 auto 28px' }}>
          This terminal is private and password-protected by Dr KS Bhoon. Enter your access credentials to unlock the dashboard.
        </p>

        {/* Password Form */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <input 
              type="password"
              placeholder="Enter Access Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={isVerifying}
              style={{
                width: '100%',
                background: 'rgba(255, 255, 255, 0.02)',
                border: '1px solid var(--border-glass)',
                padding: '14px 44px 14px 16px',
                borderRadius: '8px',
                color: 'white',
                fontSize: '0.95rem',
                outline: 'none',
                transition: 'all 0.3s ease',
                fontFamily: 'var(--font-body)',
                textAlign: 'center',
                letterSpacing: '0.1em'
              }}
            />
            {isVerifying && (
              <Loader2 size={18} className="animate-spin" style={{ position: 'absolute', right: '16px', color: 'var(--color-primary)' }} />
            )}
          </div>

          {errorMsg && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              color: 'var(--color-sell)',
              fontSize: '0.8rem',
              background: 'rgba(239, 68, 68, 0.05)',
              padding: '10px 14px',
              borderRadius: '6px',
              textAlign: 'left',
              borderLeft: '3px solid var(--color-sell)'
            }}>
              <ShieldAlert size={14} style={{ flexShrink: 0 }} />
              <span>{errorMsg}</span>
            </div>
          )}

          <button 
            type="submit" 
            className="btn-primary" 
            disabled={isVerifying || !password.trim()}
            style={{
              padding: '14px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              fontSize: '0.95rem',
              fontWeight: 700,
              borderRadius: '8px',
              cursor: 'pointer',
              boxShadow: '0 4px 12px rgba(59, 130, 246, 0.2)'
            }}
          >
            <span>Unlock Terminal</span>
            <ArrowRight size={16} />
          </button>
        </form>
      </div>

      <style>{`
        @keyframes fadeInLock {
          from { opacity: 0; transform: scale(0.95); }
          to { opacity: 1; transform: scale(1); }
        }
        @keyframes pulseLock {
          0% { transform: scale(1); opacity: 0.3; }
          50% { transform: scale(1.15); opacity: 0.1; }
          100% { transform: scale(1); opacity: 0.3; }
        }
        .animate-spin {
          animation: spin 1s linear infinite;
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};
