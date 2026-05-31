import React, { useState, useEffect } from 'react';
import { Users, Search, RefreshCw, Clock, Calendar, ShieldCheck, Mail } from 'lucide-react';

interface UserRecord {
  id: string;
  email: string;
  name: string;
  picture?: string;
  created_at: string;
  last_login: string;
}

interface AdminPanelProps {
  API_BASE_URL: string;
  token: string | null;
}

export const AdminPanel: React.FC<AdminPanelProps> = ({ API_BASE_URL, token }) => {
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
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
    } catch (err: any) {
      setError(err.message || 'An error occurred while loading user records.');
    } finally {
      setIsLoading(false);
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
