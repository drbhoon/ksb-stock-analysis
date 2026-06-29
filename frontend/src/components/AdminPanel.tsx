import React, { useState, useEffect } from 'react';
import { Users, Search, RefreshCw, Clock, Calendar, ShieldCheck, Mail, RotateCcw, Check, X } from 'lucide-react';

interface UserRecord {
  id: string;
  email: string;
  name: string;
  picture?: string;
  created_at: string;
  last_login: string;
}

interface ResetRequest {
  id: number;
  user_id: string;
  portfolio_id: number | null;
  season: number;
  status: string;
  requested_at: string;
  reviewed_at?: string | null;
  reviewed_by_email?: string | null;
  reviewed_by_name?: string | null;
  admin_note?: string | null;
  email?: string;
  name?: string;
  cash?: number;
  loan_principal?: number;
  accrued_interest?: number;
}

interface AdminPanelProps {
  API_BASE_URL: string;
  token: string | null;
}

export const AdminPanel: React.FC<AdminPanelProps> = ({ API_BASE_URL, token }) => {
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [resetRequests, setResetRequests] = useState<ResetRequest[]>([]);
  const [reviewingRequestId, setReviewingRequestId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');

  const fetchUsers = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/users`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (!res.ok) {
        if (res.status === 403) {
          throw new Error('Access denied. You must be logged in as an administrator to view this panel.');
        }
        throw new Error('Failed to load user directory.');
      }
      const data = await res.json();
      setUsers(data.users || []);

      const resetRes = await fetch(`${API_BASE_URL}/api/admin/game/reset-requests?status=ALL`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (resetRes.ok) {
        const resetData = await resetRes.json();
        setResetRequests(resetData.requests || []);
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred while loading user records.');
    } finally {
      setIsLoading(false);
    }
  };

  const reviewResetRequest = async (requestId: number, approve: boolean) => {
    setReviewingRequestId(requestId);
    setError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/game/reset-requests/${requestId}/review`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          approve,
          admin_note: approve ? 'Approved from admin panel.' : 'Denied from admin panel.'
        })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || 'Failed to review reset request.');
      }
      await fetchUsers();
    } catch (err: any) {
      setError(err.message || 'Failed to review reset request.');
    } finally {
      setReviewingRequestId(null);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, [token]);

  const formatDate = (isoStr: string) => {
    if (!isoStr) return '—';
    try {
      // Append 'Z' to SQLite UTC datetime if not present, to ensure local translation
      const cleanStr = isoStr.includes(' ') ? isoStr.replace(' ', 'T') : isoStr;
      const date = new Date(cleanStr + (cleanStr.endsWith('Z') ? '' : 'Z'));
      return date.toLocaleString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
      });
    } catch {
      return isoStr;
    }
  };

  // Filtered users based on search
  const filteredUsers = users.filter(user => {
    const query = searchQuery.toLowerCase().trim();
    if (!query) return true;
    return (
      (user.name || '').toLowerCase().includes(query) ||
      (user.email || '').toLowerCase().includes(query) ||
      (user.id || '').toLowerCase().includes(query)
    );
  });

  // Simple statistics
  const totalUsers = users.length;
  const pendingResetRequests = resetRequests.filter(req => req.status === 'PENDING');
  const reviewedResetRequests = resetRequests.filter(req => req.status !== 'PENDING');
  
  const getActiveToday = () => {
    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
    return users.filter(u => {
      if (!u.last_login) return false;
      const cleanStr = u.last_login.replace(' ', 'T');
      const time = new Date(cleanStr + 'Z').getTime();
      return time > oneDayAgo;
    }).length;
  };

  const getNewThisWeek = () => {
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    return users.filter(u => {
      if (!u.created_at) return false;
      const cleanStr = u.created_at.replace(' ', 'T');
      const time = new Date(cleanStr + 'Z').getTime();
      return time > sevenDaysAgo;
    }).length;
  };

  return (
    <div style={{ padding: '32px 40px', maxWidth: '1400px', margin: '0 auto' }}>
      
      {/* Page Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '28px', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h1 style={{ fontSize: '1.8rem', fontWeight: 800, fontFamily: 'var(--font-heading)', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Users size={28} style={{ color: 'var(--color-primary)' }} />
            Admin <span style={{ color: 'var(--color-primary)' }}>Dashboard</span>
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
            Monitor application registration logs and active usage stats securely without viewing private portfolios.
          </p>
        </div>
        <button 
          onClick={fetchUsers} 
          disabled={isLoading}
          className="btn-secondary" 
          style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 16px' }}
        >
          <RefreshCw size={15} style={{ animation: isLoading ? 'spin 1s linear infinite' : 'none' }} />
          Refresh Registry
        </button>
      </div>

      {error ? (
        <div className="glass-panel" style={{ padding: '24px 32px', borderLeft: '4px solid var(--color-sell)', display: 'flex', alignItems: 'center', gap: '16px' }}>
          <span style={{ fontSize: '2rem' }}>⚠️</span>
          <div>
            <h4 style={{ fontWeight: 700, fontSize: '1.05rem' }}>Administration Access Alert</h4>
            <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginTop: '4px' }}>{error}</p>
          </div>
        </div>
      ) : (
        <>
          {/* Metrics Overview */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '20px', marginBottom: '28px' }}>
            {[
              { label: 'TOTAL REGISTERED USERS', value: totalUsers, color: 'var(--color-primary)', bg: 'rgba(59,130,246,0.06)', Icon: Users },
              { label: 'ACTIVE (LAST 24 HOURS)', value: getActiveToday(), color: '#10b981', bg: 'rgba(16,185,129,0.06)', Icon: Clock },
              { label: 'NEW THIS WEEK', value: getNewThisWeek(), color: '#a855f7', bg: 'rgba(168,85,247,0.06)', Icon: Calendar },
            ].map(({ label, value, color, bg, Icon }) => (
              <div key={label} className="glass-panel" style={{ padding: '24px', display: 'flex', alignItems: 'center', gap: '20px', position: 'relative', overflow: 'hidden' }}>
                <div style={{
                  position: 'absolute', top: 0, right: 0, width: '80px', height: '80px',
                  background: `radial-gradient(circle, ${color}10 0%, transparent 70%)`,
                  pointerEvents: 'none'
                }} />
                <div style={{ background: bg, color, padding: '16px', borderRadius: '12px', display: 'flex' }}>
                  <Icon size={24} />
                </div>
                <div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)', fontWeight: 600, letterSpacing: '0.05em' }}>{label}</div>
                  <div style={{ fontSize: '2rem', fontWeight: 800, color: 'white', marginTop: '4px', lineHeight: 1 }}>{isLoading ? '…' : value}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Reset Requests */}
          {resetRequests.length > 0 && (
            <div className="glass-panel" style={{ padding: '28px', marginBottom: '28px', borderLeft: '4px solid var(--color-hold)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', gap: '12px', flexWrap: 'wrap' }}>
                <h3 style={{ fontSize: '1.05rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <RotateCcw size={18} style={{ color: 'var(--color-hold)' }} />
                  Game Reset Requests
                </h3>
                <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                  {pendingResetRequests.length} pending · {reviewedResetRequests.length} reviewed
                </span>
              </div>

              {pendingResetRequests.length > 0 && (
                <div style={{ overflowX: 'auto', marginBottom: '24px' }}>
                  <table className="premium-table">
                    <thead>
                      <tr>
                        <th>User</th>
                        <th>Season</th>
                        <th>Requested</th>
                        <th style={{ textAlign: 'right' }}>Trading Cash</th>
                        <th style={{ textAlign: 'right' }}>Active Loan</th>
                        <th style={{ textAlign: 'center' }}>Decision</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pendingResetRequests.map((req) => (
                        <tr key={req.id}>
                          <td>
                            <div style={{ fontWeight: 700, color: 'white', fontSize: '0.88rem' }}>
                              {req.name || 'Unknown User'}
                            </div>
                            <div style={{ color: 'var(--text-muted)', fontSize: '0.74rem', marginTop: '2px' }}>
                              {req.email || req.user_id}
                            </div>
                          </td>
                          <td style={{ fontWeight: 700 }}>Season {req.season}</td>
                          <td style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>{formatDate(req.requested_at)}</td>
                          <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>
                            ₹{(req.cash || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                          </td>
                          <td style={{ textAlign: 'right', fontFamily: 'monospace', color: (req.loan_principal || 0) > 0 ? 'var(--color-hold)' : 'var(--text-muted)' }}>
                            ₹{(req.loan_principal || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                          </td>
                          <td>
                            <div style={{ display: 'flex', justifyContent: 'center', gap: '8px' }}>
                              <button
                                onClick={() => reviewResetRequest(req.id, true)}
                                disabled={reviewingRequestId === req.id}
                                className="btn-secondary"
                                style={{ padding: '7px 10px', color: 'var(--color-buy)', border: '1px solid rgba(16,185,129,0.25)' }}
                                title="Approve reset request"
                                aria-label="Approve reset request"
                              >
                                <Check size={14} />
                              </button>
                              <button
                                onClick={() => reviewResetRequest(req.id, false)}
                                disabled={reviewingRequestId === req.id}
                                className="btn-secondary"
                                style={{ padding: '7px 10px', color: 'var(--color-sell)', border: '1px solid rgba(239,68,68,0.25)' }}
                                title="Deny reset request"
                                aria-label="Deny reset request"
                              >
                                <X size={14} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {reviewedResetRequests.length > 0 && (
                <div style={{ overflowX: 'auto' }}>
                  <h4 style={{ fontSize: '0.9rem', fontWeight: 800, marginBottom: '12px', color: 'var(--text-muted)' }}>Decision History</h4>
                  <table className="premium-table">
                    <thead>
                      <tr>
                        <th>User</th>
                        <th>Season</th>
                        <th>Requested</th>
                        <th>Reviewed</th>
                        <th>Status</th>
                        <th>Reviewer</th>
                        <th>Note</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reviewedResetRequests.map((req) => {
                        const approved = req.status === 'APPROVED';
                        return (
                          <tr key={req.id}>
                            <td>
                              <div style={{ fontWeight: 700, color: 'white', fontSize: '0.88rem' }}>{req.name || 'Unknown User'}</div>
                              <div style={{ color: 'var(--text-muted)', fontSize: '0.74rem', marginTop: '2px' }}>{req.email || req.user_id}</div>
                            </td>
                            <td style={{ fontWeight: 700 }}>Season {req.season}</td>
                            <td style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>{formatDate(req.requested_at)}</td>
                            <td style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>{formatDate(req.reviewed_at || '')}</td>
                            <td>
                              <span style={{
                                color: approved ? 'var(--color-buy)' : 'var(--color-sell)',
                                background: approved ? 'var(--color-buy-trans)' : 'var(--color-sell-trans)',
                                border: `1px solid ${approved ? 'rgba(16,185,129,0.25)' : 'rgba(239,68,68,0.25)'}`,
                                borderRadius: '6px',
                                padding: '4px 8px',
                                fontSize: '0.72rem',
                                fontWeight: 800
                              }}>
                                {req.status}
                              </span>
                            </td>
                            <td style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>{req.reviewed_by_name || req.reviewed_by_email || '—'}</td>
                            <td style={{ color: 'var(--text-muted)', fontSize: '0.82rem', maxWidth: '240px' }}>{req.admin_note || '—'}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* User Directory Table Card */}
          <div className="glass-panel" style={{ padding: '28px' }}>
            
            {/* Search Bar */}
            <div style={{ display: 'flex', alignItems: 'center', background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border-glass)', borderRadius: '10px', padding: '0 14px', gap: '10px', maxWidth: '440px', marginBottom: '24px' }}>
              <Search size={16} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
              <input
                type="text"
                placeholder="Search registered users by name or email..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                style={{
                  flex: 1,
                  background: 'transparent',
                  border: 'none',
                  outline: 'none',
                  color: 'white',
                  fontSize: '0.85rem',
                  padding: '12px 0',
                }}
              />
            </div>

            {isLoading ? (
              <div style={{ textAlign: 'center', padding: '60px 0' }}>
                <div style={{ width: '40px', height: '40px', border: '3px solid rgba(59,130,246,0.1)', borderTopColor: 'var(--color-primary)', borderRadius: '50%', animation: 'spin 1.2s linear infinite', margin: '0 auto 16px' }} />
                <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem' }}>Loading user registry logs...</p>
              </div>
            ) : filteredUsers.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-dim)' }}>
                <Users size={40} style={{ color: 'var(--text-dim)', marginBottom: '12px', opacity: 0.5 }} />
                <p style={{ fontSize: '0.9rem' }}>No matching user logs found.</p>
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table className="premium-table">
                  <thead>
                    <tr>
                      <th>User Info</th>
                      <th>Account ID / ID Type</th>
                      <th>Registration Date (Local)</th>
                      <th>Last Active Time (Local)</th>
                      <th style={{ textAlign: 'center' }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredUsers.map((user, i) => {
                      const isGoogleUser = !user.id.startsWith('admin-');
                      return (
                        <tr key={user.id} style={{ animationDelay: `${i * 30}ms` }}>
                          
                          {/* User Avatar + Name + Email */}
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                              {user.picture ? (
                                <img 
                                  src={user.picture} 
                                  alt={user.name} 
                                  style={{ width: '32px', height: '32px', borderRadius: '50%', border: '1px solid rgba(255,255,255,0.1)' }}
                                  referrerPolicy="no-referrer"
                                />
                              ) : (
                                <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'var(--color-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', color: 'white', fontWeight: 700 }}>
                                  {user.name ? user.name[0].toUpperCase() : 'U'}
                                </div>
                              )}
                              <div style={{ display: 'flex', flexDirection: 'column' }}>
                                <span style={{ fontWeight: 700, fontSize: '0.88rem', color: 'white' }}>{user.name || 'Anonymous User'}</span>
                                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px', marginTop: '2px' }}>
                                  <Mail size={12} /> {user.email}
                                </span>
                              </div>
                            </div>
                          </td>

                          {/* ID and Platform */}
                          <td style={{ fontFamily: 'monospace', fontSize: '0.78rem' }}>
                            <div style={{ color: 'white', fontWeight: 600 }}>{user.id.slice(0, 15)}...</div>
                            <span style={{
                              fontSize: '0.68rem',
                              color: isGoogleUser ? 'var(--color-primary)' : 'var(--color-accent)',
                              background: isGoogleUser ? 'rgba(59,130,246,0.08)' : 'rgba(168,85,247,0.08)',
                              padding: '2px 6px',
                              borderRadius: '4px',
                              fontWeight: 700,
                              marginTop: '4px',
                              display: 'inline-block'
                            }}>
                              {isGoogleUser ? 'Google OAuth' : 'Admin Bypass'}
                            </span>
                          </td>

                          {/* Created at */}
                          <td style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                            {formatDate(user.created_at)}
                          </td>

                          {/* Last active time */}
                          <td style={{ fontSize: '0.82rem', color: 'white', fontWeight: 600 }}>
                            {formatDate(user.last_login)}
                          </td>

                          {/* Status */}
                          <td style={{ textAlign: 'center' }}>
                            <span style={{
                              background: 'rgba(16,185,129,0.08)',
                              color: '#10b981',
                              border: '1px solid rgba(16,185,129,0.2)',
                              borderRadius: '6px',
                              padding: '4px 10px',
                              fontSize: '0.72rem',
                              fontWeight: 700,
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px'
                            }}>
                              <ShieldCheck size={12} />
                              Active
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
};
