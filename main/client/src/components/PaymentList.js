import React, { useState } from 'react';
import './PaymentList.css';

const statusConfig = {
  processed: { bg: 'var(--color-success-light)', color: 'var(--color-success-dark)', dot: 'var(--color-success)' },
  paid:      { bg: 'var(--color-success-light)', color: 'var(--color-success-dark)', dot: 'var(--color-success)' },
  completed: { bg: 'var(--color-success-light)', color: 'var(--color-success-dark)', dot: 'var(--color-success)' },
  pending:   { bg: 'var(--color-warning-light)', color: 'var(--color-warning-dark)', dot: 'var(--color-warning)' },
  overdue:   { bg: 'var(--color-danger-light)',  color: 'var(--color-danger-dark)',  dot: 'var(--color-danger)' },
  failed:    { bg: 'var(--color-danger-light)',  color: 'var(--color-danger-dark)',  dot: 'var(--color-danger)' },
  issue:     { bg: 'var(--color-danger-light)',  color: 'var(--color-danger-dark)',  dot: 'var(--color-danger)' },
};

const defaultStatus = { bg: 'var(--color-primary-light)', color: 'var(--color-primary-dark)', dot: 'var(--color-primary)' };

const formatCurrency = (amount, currency = 'INR') => {
  if (amount === null || amount === undefined) return '—';
  const n = Number(amount) || 0;
  try {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency, maximumFractionDigits: 0 }).format(n);
  } catch {
    return `${currency} ${n.toLocaleString('en-IN')}`;
  }
};

const formatDate = ts => {
  if (!ts) return '—';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
};

function PaymentList({ payments, loading, error, onRefresh }) {
  const [search, setSearch] = useState('');
  const [selectedOrg, setSelectedOrg] = useState('');
  const hasPayments = payments && payments.length > 0;

  const uniqueOrgs = hasPayments
    ? Array.from(new Set(payments.map(p => p.organization_name).filter(Boolean))).sort()
    : [];

  const filtered = hasPayments
    ? payments.filter(p => {
        if (selectedOrg && p.organization_name !== selectedOrg) return false;
        
        if (!search.trim()) return true;
        const q = search.toLowerCase();
        return (
          (p.customer_name || '').toLowerCase().includes(q) ||
          (p.payment_id || '').toLowerCase().includes(q) ||
          (p.invoice_number || '').toLowerCase().includes(q) ||
          (p.source || '').toLowerCase().includes(q)
        );
      })
    : [];

  return (
    <section className="payment-list">
      {/* Search bar & Filters */}
      <div className="pl-toolbar">
        <div style={{ display: 'flex', gap: '12px', flex: 1, maxWidth: '600px', flexWrap: 'wrap' }}>
          <div className="pl-search">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="text"
              placeholder="Search by customer, invoice, or source..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          {uniqueOrgs.length > 0 && (
            <select 
              className="pl-org-select" 
              value={selectedOrg} 
              onChange={e => setSelectedOrg(e.target.value)}
            >
              <option value="">All Organizations</option>
              {uniqueOrgs.map(org => (
                <option key={org} value={org}>{org}</option>
              ))}
            </select>
          )}
        </div>
        <span className="pl-count">
          {hasPayments ? `${filtered.length} of ${payments.length} records` : '0 records'}
        </span>
      </div>

      {/* Error state */}
      {error && (
        <div className="pl-state pl-error">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="15" y1="9" x2="9" y2="15" />
            <line x1="9" y1="9" x2="15" y2="15" />
          </svg>
          <span>{error}</span>
          <button onClick={onRefresh} className="pl-retry">Retry</button>
        </div>
      )}

      {/* Loading state */}
      {!error && loading && !hasPayments && (
        <div className="pl-state">
          <div className="pl-loader" />
          <span>Loading payments...</span>
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && !hasPayments && (
        <div className="pl-state">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-muted)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="5" width="20" height="14" rx="2" />
            <line x1="2" y1="10" x2="22" y2="10" />
          </svg>
          <p className="pl-empty-title">No payments yet</p>
          <p className="pl-empty-desc">Entries from webhooks or manual sheets sync will appear here.</p>
        </div>
      )}

      {/* Table */}
      {!error && hasPayments && (
        <div className="pl-table-wrap">
          <table className="pl-table">
            <thead>
              <tr>
                <th>Invoice</th>
                <th>Customer</th>
                <th>Amount</th>
                <th>Source</th>
                <th>Time</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p, i) => {
                const key = (p.status || 'processed').toLowerCase();
                const st = statusConfig[key] || defaultStatus;
                return (
                  <tr key={p.payment_id || i} className={i === 0 ? 'row-latest' : ''}>
                    <td className="td-invoice">
                      <span className="invoice-id">{p.payment_id || p.invoice_number}</span>
                      {p.invoice_number && p.invoice_number !== p.payment_id && (
                        <span className="invoice-sub">{p.invoice_number}</span>
                      )}
                    </td>
                    <td className="td-customer">
                      <span className="cust-name">{p.customer_name || 'Unknown Customer'}</span>
                      {p.organization_name && (
                        <span className="cust-org">{p.organization_name}</span>
                      )}
                    </td>
                    <td className="td-amount">{formatCurrency(p.amount, p.currency)}</td>
                    <td className="td-source">
                      <span className="source-chip">{p.source || 'N/A'}</span>
                    </td>
                    <td className="td-time">{formatDate(p.timestamp)}</td>
                    <td>
                      <span
                        className="status-badge"
                        style={{ background: st.bg, color: st.color, '--dot': st.dot }}
                      >
                        <span className="status-dot" />
                        {p.status || 'Processed'}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {filtered.length === 0 && search && (
            <div className="pl-state pl-no-results">
              No results for "{search}"
            </div>
          )}
        </div>
      )}
    </section>
  );
}

export default PaymentList;
