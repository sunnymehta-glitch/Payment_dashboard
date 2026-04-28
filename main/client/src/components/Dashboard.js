import React from 'react';
import './Dashboard.css';

const formatCurrency = (amount, currency = 'INR') => {
  if (amount === null || amount === undefined || Number.isNaN(amount)) return '—';
  try {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency,
      maximumFractionDigits: amount >= 1000 ? 0 : 2,
    }).format(amount);
  } catch {
    return `${currency} ${Number(amount).toLocaleString('en-IN')}`;
  }
};

const formatDateTime = value => {
  if (!value) return 'Not yet captured';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not yet captured';
  return date.toLocaleString('en-GB', {
    weekday: 'short', day: 'numeric', month: 'short',
    year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
};

const Icon = ({ type }) => {
  const map = {
    collections: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
      </svg>
    ),
    outstanding: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <path d="M12 6v6l4 2" />
      </svg>
    ),
    debt: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
        <line x1="12" y1="9" x2="12" y2="13" />
        <line x1="12" y1="17" x2="12.01" y2="17" />
      </svg>
    ),
    breakdown: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21.21 15.89A10 10 0 1 1 8 2.83" />
        <path d="M22 12A10 10 0 0 0 12 2v10z" />
      </svg>
    ),
    alert: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M7.86 2h8.28L22 7.86v8.28L16.14 22H7.86L2 16.14V7.86L7.86 2z" />
        <line x1="12" y1="8" x2="12" y2="12" />
        <line x1="12" y1="16" x2="12.01" y2="16" />
      </svg>
    ),
    check: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="20 6 9 17 4 12" />
      </svg>
    ),
  };
  return map[type] || null;
};

function Dashboard({ summary, loading, error, lastUpdate }) {
  const totals = summary?.totals || {};
  const counts = summary?.counts || {};
  const breakdowns = summary?.breakdowns || [];
  const outstandingGroups = summary?.outstandingGroups || [];
  const keyActions = summary?.keyActions || [];
  const currency = totals.currency || 'INR';

  const cards = [
    {
      key: 'collections',
      icon: 'collections',
      title: 'Total Collections',
      amount: totals.totalCollections,
      subtitle: `${counts.paidInvoices || 0} invoices collected`,
      meta: { label: 'Net Inflow', value: totals.netInflow, format: 'currency' },
      accent: 'success',
    },
    {
      key: 'outstanding',
      icon: 'outstanding',
      title: 'Outstanding Debt',
      amount: totals.totalOutstanding,
      subtitle: `${counts.outstandingInvoices || 0} invoices pending`,
      meta: { label: 'Open Items', value: counts.outstandingInvoices, format: 'count' },
      accent: 'danger',
    },
    {
      key: 'largest',
      icon: 'debt',
      title: 'Largest Single Debt',
      amount: totals.largestDebt?.amount,
      subtitle: totals.largestDebt?.customer || 'No outstanding invoices',
      meta: {
        label: totals.largestDebt?.organization || 'Status',
        value: totals.largestDebt?.status || 'All clear',
        format: 'text',
      },
      accent: 'warning',
    },
  ];

  const fmtMeta = (value, cur, format) => {
    if (value === null || value === undefined) return '—';
    if (format === 'currency' && typeof value === 'number') return formatCurrency(value, cur);
    return value;
  };

  return (
    <section className="dashboard">
      {/* Stat counters row */}
      <div className="stat-row">
        <div className="stat-chip">
          <span className="stat-number">{loading ? '—' : counts.totalInvoices || 0}</span>
          <span className="stat-label">Total Invoices</span>
        </div>
        <div className="stat-chip">
          <span className="stat-number accent-success">{loading ? '—' : counts.paidInvoices || 0}</span>
          <span className="stat-label">Collected</span>
        </div>
        <div className="stat-chip">
          <span className="stat-number accent-danger">{loading ? '—' : counts.outstandingInvoices || 0}</span>
          <span className="stat-label">Outstanding</span>
        </div>
        <div className="stat-chip">
          <span className="stat-timestamp">
            {formatDateTime(lastUpdate || summary?.generatedAt)}
          </span>
          <span className="stat-label">Last Snapshot</span>
        </div>
      </div>

      {/* Summary cards */}
      <div className="summary-grid">
        {cards.map(card => (
          <div key={card.key} className={`summary-card ${card.accent}`}>
            <div className="sc-header">
              <div className={`sc-icon ${card.accent}`}>
                <Icon type={card.icon} />
              </div>
              <span className="sc-title">{card.title}</span>
            </div>
            <p className="sc-amount">{loading ? '...' : formatCurrency(card.amount, currency)}</p>
            <p className="sc-subtitle">{card.subtitle}</p>
            {card.meta && (
              <div className="sc-meta">
                <span className="sc-meta-label">{card.meta.label}</span>
                <span className="sc-meta-value">
                  {loading ? '...' : fmtMeta(card.meta.value, currency, card.meta.format)}
                </span>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Breakdown */}
      <div className="card-section">
        <div className="cs-header">
          <div className="cs-title-group">
            <Icon type="breakdown" />
            <h2>Collections Breakdown</h2>
          </div>
          <span className="badge">Top Sources</span>
        </div>
        {loading ? (
          <div className="empty-state">Building breakdown...</div>
        ) : breakdowns.length > 0 ? (
          <div className="breakdown-grid">
            {breakdowns.map(item => (
              <div key={item.label} className="breakdown-item">
                <div className="bi-bar" style={{ '--pct': `${(item.percentage * 100).toFixed(0)}%` }} />
                <p className="bi-label">{item.label}</p>
                <p className="bi-value">{formatCurrency(item.amount, currency)}</p>
                <p className="bi-pct">{(item.percentage * 100).toFixed(1)}%</p>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty-state">No breakdown data yet.</div>
        )}
      </div>

      {/* Outstanding accounts */}
      {(loading || outstandingGroups.length > 0) && (
        <div className="outstanding-grid">
          {loading && outstandingGroups.length === 0 ? (
            <div className="card-section">
              <div className="empty-state">Loading outstanding accounts...</div>
            </div>
          ) : (
            outstandingGroups.map(group => (
              <div key={group.title} className="card-section outstanding-card">
                <div className="cs-header">
                  <h3>{group.title}</h3>
                  <span className="os-total">{formatCurrency(group.total, currency)}</span>
                </div>
                <ul className="os-list">
                  {group.accounts.map(account => (
                    <li
                      key={`${group.title}-${account.payment_id || account.name}`}
                      className="os-item"
                    >
                      <div className="os-info">
                        <span className="os-name">{account.name}</span>
                        <span className={`os-status st-${account.status?.toLowerCase().replace(/\s+/g, '-')}`}>
                          {account.status}
                        </span>
                      </div>
                      <span className="os-amount">
                        {formatCurrency(account.amount, account.currency || currency)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))
          )}
        </div>
      )}

      {/* Key actions */}
      <div className="card-section actions-section">
        <div className="cs-header">
          <div className="cs-title-group">
            <Icon type="alert" />
            <h2>Key Actions</h2>
          </div>
          <span className="badge badge-danger">Urgent</span>
        </div>
        {loading ? (
          <div className="empty-state">Updating priorities...</div>
        ) : keyActions.length > 0 ? (
          <div className="actions-list">
            {keyActions.map((action, i) => (
              <div key={action.title} className="action-item">
                <div className="action-number">{i + 1}</div>
                <div>
                  <p className="action-title">{action.title}</p>
                  <p className="action-desc">{action.description}</p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty-state done-state">
            <Icon type="check" />
            <span>All caught up for now.</span>
          </div>
        )}
      </div>

      {error && (
        <div className="error-banner">
          <Icon type="alert" />
          <span>Unable to refresh dashboard: {error}</span>
        </div>
      )}
    </section>
  );
}

export default Dashboard;
