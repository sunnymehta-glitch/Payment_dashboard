import React, { useState, useEffect, useCallback } from 'react';
import './App.css';
import Dashboard from './components/Dashboard';
import PaymentList from './components/PaymentList';

const NAV_ITEMS = [
  { id: 'dashboard', label: 'Dashboard', icon: 'grid' },
  { id: 'payments', label: 'Payments', icon: 'list' },
];

const NavIcon = ({ type }) => {
  const icons = {
    grid: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
      </svg>
    ),
    list: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
      </svg>
    ),
  };
  return icons[type] || null;
};

const SunIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="5" />
    <line x1="12" y1="1" x2="12" y2="3" />
    <line x1="12" y1="21" x2="12" y2="23" />
    <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
    <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
    <line x1="1" y1="12" x2="3" y2="12" />
    <line x1="21" y1="12" x2="23" y2="12" />
    <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
    <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
  </svg>
);

const MoonIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
  </svg>
);

function App() {
  const [payments, setPayments] = useState([]);
  const [paymentsError, setPaymentsError] = useState(null);
  const [paymentsLoading, setPaymentsLoading] = useState(true);

  const [summary, setSummary] = useState(null);
  const [summaryError, setSummaryError] = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(true);

  const [lastUpdate, setLastUpdate] = useState(null);
  const [activeView, setActiveView] = useState('dashboard');

  const [theme, setTheme] = useState(() => {
    return localStorage.getItem('pb-theme') || 'dark';
  });

  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    return localStorage.getItem('pb-sidebar') === 'collapsed';
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('pb-theme', theme);
  }, [theme]);

  useEffect(() => {
    localStorage.setItem('pb-sidebar', sidebarCollapsed ? 'collapsed' : 'expanded');
  }, [sidebarCollapsed]);

  const toggleTheme = () => setTheme(prev => prev === 'light' ? 'dark' : 'light');
  const toggleSidebar = () => setSidebarCollapsed(prev => !prev);

  const API_BASE = process.env.REACT_APP_API_BASE || '/api';

  const fetchPayments = useCallback(async () => {
    setPaymentsLoading(true);
    try {
      const response = await fetch(`${API_BASE}/logs`);
      if (!response.ok) throw new Error(`Logs request failed (${response.status})`);
      const data = await response.json();
      if (data.success) {
        setPayments(data.payments || []);
        setPaymentsError(null);
      } else {
        throw new Error(data.error || 'Failed to fetch payments');
      }
    } catch (err) {
      console.error('Error fetching payments:', err);
      setPaymentsError(err.message || 'Failed to connect to server');
    } finally {
      setPaymentsLoading(false);
    }
  }, [API_BASE]);

  const fetchSummary = useCallback(async () => {
    setSummaryLoading(true);
    try {
      const response = await fetch(`${API_BASE}/dashboard`);
      if (!response.ok) throw new Error(`Dashboard request failed (${response.status})`);
      const data = await response.json();
      if (data.success) {
        setSummary(data.summary || null);
        setSummaryError(null);
      } else {
        throw new Error(data.error || 'Failed to build dashboard summary');
      }
    } catch (err) {
      console.error('Error fetching dashboard summary:', err);
      setSummaryError(err.message || 'Failed to connect to server');
    } finally {
      setSummaryLoading(false);
    }
  }, [API_BASE]);

  const refreshAll = useCallback(async () => {
    await Promise.allSettled([fetchSummary(), fetchPayments()]);
    setLastUpdate(new Date());
  }, [fetchSummary, fetchPayments]);

  useEffect(() => {
    refreshAll();
    const interval = setInterval(refreshAll, 45000);
    return () => clearInterval(interval);
  }, [refreshAll]);

  const isLoading = summaryLoading || paymentsLoading;

  return (
    <div className={`app ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
      {/* ── Desktop Sidebar ── */}
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="brand-icon">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2L2 7l10 5 10-5-10-5z" />
              <path d="M2 17l10 5 10-5" />
              <path d="M2 12l10 5 10-5" />
            </svg>
          </div>
          <span className="brand-name">PayBroadcast</span>
        </div>

        <nav className="sidebar-nav">
          {NAV_ITEMS.map(item => (
            <button
              key={item.id}
              className={`nav-item ${activeView === item.id ? 'active' : ''}`}
              onClick={() => setActiveView(item.id)}
              title={item.label}
            >
              <NavIcon type={item.icon} />
              <span>{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="sidebar-footer">
          <button className="sidebar-btn theme-toggle" onClick={toggleTheme} title={theme === 'light' ? 'Switch to Dark' : 'Switch to Light'}>
            {theme === 'light' ? <MoonIcon /> : <SunIcon />}
            <span>{theme === 'light' ? 'Dark Mode' : 'Light Mode'}</span>
          </button>

          <div className={`connection-status ${isLoading ? 'syncing' : 'live'}`}>
            <span className="status-dot" />
            <span>{isLoading ? 'Syncing...' : 'Connected'}</span>
          </div>

          <button className="sidebar-btn collapse-toggle" onClick={toggleSidebar} title={sidebarCollapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`collapse-icon ${sidebarCollapsed ? 'flipped' : ''}`}>
              <polyline points="11 17 6 12 11 7" />
              <polyline points="18 17 13 12 18 7" />
            </svg>
            <span>Collapse</span>
          </button>
        </div>
      </aside>

      {/* ── Main Content ── */}
      <main className="main-content">
        <header className="top-bar">
          <div className="top-bar-left">
            <h1 className="page-title">
              {activeView === 'dashboard' ? 'Financial Overview' : 'Payment Activity'}
            </h1>
            <p className="page-subtitle">
              {activeView === 'dashboard'
                ? 'Real-time summary of collections and outstanding debts'
                : 'Live feed of all payment transactions'}
            </p>
          </div>
          <div className="top-bar-right">
            {lastUpdate && (
              <span className="last-updated">
                Updated {lastUpdate.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
            <button className="btn-theme-topbar" onClick={toggleTheme} title={theme === 'light' ? 'Dark Mode' : 'Light Mode'}>
              {theme === 'light' ? <MoonIcon /> : <SunIcon />}
            </button>
            <button className="btn-refresh" onClick={refreshAll} disabled={isLoading}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={isLoading ? 'spin' : ''}>
                <path d="M21 2v6h-6" />
                <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
                <path d="M3 22v-6h6" />
                <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
              </svg>
              <span>{isLoading ? 'Refreshing' : 'Refresh'}</span>
            </button>
          </div>
        </header>

        <div className="content-area">
          {activeView === 'dashboard' ? (
            <Dashboard
              summary={summary}
              loading={summaryLoading}
              error={summaryError}
              lastUpdate={lastUpdate}
              onRefresh={refreshAll}
            />
          ) : (
            <PaymentList
              payments={payments}
              loading={paymentsLoading}
              error={paymentsError}
              onRefresh={refreshAll}
            />
          )}
        </div>
      </main>

      {/* ── Mobile Bottom Nav ── */}
      <nav className="mobile-nav">
        {NAV_ITEMS.map(item => (
          <button
            key={item.id}
            className={`mobile-nav-item ${activeView === item.id ? 'active' : ''}`}
            onClick={() => setActiveView(item.id)}
          >
            <NavIcon type={item.icon} />
            <span>{item.label}</span>
          </button>
        ))}
        <button className="mobile-nav-item" onClick={toggleTheme}>
          {theme === 'light' ? <MoonIcon /> : <SunIcon />}
          <span>Theme</span>
        </button>
      </nav>
    </div>
  );
}

export default App;
