const sheetsService = require('../services/sheets');

const DEFAULT_CURRENCY = process.env.DEFAULT_CURRENCY || 'INR';

const PAID_STATUSES = new Set(['paid', 'processed', 'complete', 'completed', 'success', 'received']);
const OUTSTANDING_STATUSES = new Set([
  'pending',
  'unpaid',
  'overdue',
  'created',
  'draft',
  'issue',
  'risk',
  'follow up',
  'follow-up',
  'failed',
  'open',
  'partial',
  'awaiting payment'
]);

const FALLBACK_GROUP = 'General Outstanding';

const prettyStatus = (status = '') => {
  const cleaned = status
    .split(/[\s_]+/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
    .trim();
  return cleaned || 'Pending';
};

const normalizeStatus = status => {
  if (!status) return 'processed';
  return status.toString().trim().toLowerCase();
};

const isPaid = status => PAID_STATUSES.has(status);
const isOutstanding = status => OUTSTANDING_STATUSES.has(status);

const deriveGroupName = payment => {
  const org = (payment.organization_name || '').trim();
  if (org) return org;
  const source = (payment.source || '').trim();
  if (source) return source;
  const currency = (payment.currency || '').trim();
  if (currency) {
    return `${currency.toUpperCase()} Outstanding`;
  }
  return FALLBACK_GROUP;
};

const formatAccount = payment => ({
  payment_id: payment.payment_id,
  customer: payment.customer_name,
  amount: Number(payment.amount) || 0,
  currency: payment.currency || DEFAULT_CURRENCY,
  status: prettyStatus(payment.status),
  organization: payment.organization_name,
  note: payment.status_note || null
});

const sumAmounts = payments =>
  payments.reduce((total, record) => total + (Number(record.amount) || 0), 0);

const buildBreakdown = (payments, totalCollections) => {
  const map = new Map();

  payments.forEach(payment => {
    const key =
      (payment.source || payment.organization_name || payment.currency || 'Other').trim() ||
      'Other';
    const current = map.get(key) || 0;
    map.set(key, current + (Number(payment.amount) || 0));
  });

  return Array.from(map.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([label, amount]) => ({
      label,
      amount,
      percentage: totalCollections > 0 ? amount / totalCollections : 0
    }));
};

const buildOutstandingGroups = outstandingPayments => {
  const groupMap = new Map();

  outstandingPayments.forEach(payment => {
    const key = deriveGroupName(payment);
    if (!groupMap.has(key)) {
      groupMap.set(key, {
        title: key,
        total: 0,
        accounts: []
      });
    }

    const group = groupMap.get(key);
    group.total += Number(payment.amount) || 0;
    group.accounts.push({
      payment_id: payment.payment_id,
      name: payment.customer_name,
      status: prettyStatus(payment.status),
      amount: payment.amount,
      currency: payment.currency,
      note: payment.note || null
    });
  });

  return Array.from(groupMap.values())
    .map(group => ({
      ...group,
      accounts: group.accounts
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 4)
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 3);
};

const buildKeyActions = ({ outstandingSorted, riskAccounts, largestDebt, oldestOutstanding }) => {
  const actions = [];

  if (riskAccounts.length > 0) {
    const topRisk = riskAccounts[0];
    actions.push({
      title: 'High-Risk Chase (No Response)',
      description: `Immediately follow up with ${topRisk.customer} for ${topRisk.currency} ${topRisk.amount.toLocaleString('en-IN')} (${topRisk.status}).`,
      accounts: riskAccounts.slice(0, 2).map(account => ({
        customer: account.customer,
        amount: account.amount,
        currency: account.currency
      }))
    });
  }

  if (largestDebt) {
    actions.push({
      title: 'Largest Debt Focus',
      description: `Intensify follow-up efforts on ${largestDebt.customer} (${largestDebt.currency} ${largestDebt.amount.toLocaleString(
        'en-IN'
      )}).`
    });
  }

  if (oldestOutstanding) {
    actions.push({
      title: 'Finalise Old Account',
      description: `Ensure payment is secured for ${oldestOutstanding.customer} (${oldestOutstanding.currency} ${oldestOutstanding.amount.toLocaleString(
        'en-IN'
      )}) logged on ${oldestOutstanding.loggedOn}.`
    });
  }

  if (actions.length === 0 && outstandingSorted.length > 0) {
    const first = outstandingSorted[0];
    actions.push({
      title: 'Follow Up',
      description: `Reach out to ${first.customer} for ${first.currency} ${first.amount.toLocaleString('en-IN')}.`
    });
  }

  return actions.slice(0, 3);
};

async function getSummary(req, res) {
  try {
    const payments = await sheetsService.getAllPayments();
    const normalizedPayments = payments.map(payment => {
      const normalizedStatus = normalizeStatus(payment.status);
      return {
        ...payment,
        status: normalizedStatus,
        amount: Number(payment.amount) || 0,
        currency: payment.currency || DEFAULT_CURRENCY,
        timestamp: (() => { if (!payment.timestamp) return null; const d = new Date(payment.timestamp); return isNaN(d.getTime()) ? null : d.toISOString(); })(),
        customer_name: payment.customer_name || 'Unknown Customer'
      };
    });

    const paidPayments = normalizedPayments.filter(payment => isPaid(payment.status));
    const outstandingPayments = normalizedPayments.filter(payment => isOutstanding(payment.status));
    const outstandingSorted = [...outstandingPayments].sort((a, b) => b.amount - a.amount);
    const riskAccounts = outstandingPayments
      .filter(payment => payment.status.includes('risk') || payment.status.includes('issue'))
      .map(formatAccount)
      .sort((a, b) => b.amount - a.amount);
    const largestDebtPayment = outstandingSorted[0] || null;
    const oldestOutstandingPayment =
      outstandingPayments
        .filter(payment => payment.timestamp)
        .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))[0] || null;

    const totalCollections = sumAmounts(paidPayments);
    const totalOutstanding = sumAmounts(outstandingPayments);
    const netInflow = totalCollections - totalOutstanding;
    const breakdowns = buildBreakdown(paidPayments, totalCollections);
    const outstandingGroups = buildOutstandingGroups(outstandingPayments);
    const keyActions = buildKeyActions({
      outstandingSorted: outstandingSorted.map(formatAccount),
      riskAccounts,
      largestDebt: largestDebtPayment && formatAccount(largestDebtPayment),
      oldestOutstanding:
        oldestOutstandingPayment &&
        (() => {
          const loggedOnDate = new Date(oldestOutstandingPayment.timestamp);
          const loggedOn = Number.isNaN(loggedOnDate.getTime())
            ? 'Unknown date'
            : loggedOnDate.toLocaleDateString('en-IN', {
                day: 'numeric',
                month: 'short',
                year: 'numeric'
              });
          return Object.assign(formatAccount(oldestOutstandingPayment), { loggedOn });
        })()
    });

    res.json({
      success: true,
      summary: {
        generatedAt: new Date().toISOString(),
        totals: {
          totalCollections,
          totalOutstanding,
          netInflow,
          currency: normalizedPayments[0]?.currency || DEFAULT_CURRENCY,
          largestDebt: largestDebtPayment
            ? {
                customer: largestDebtPayment.customer_name,
                amount: largestDebtPayment.amount,
                currency: largestDebtPayment.currency,
                organization: largestDebtPayment.organization_name,
                status: prettyStatus(largestDebtPayment.status)
              }
            : null
        },
        counts: {
          totalInvoices: normalizedPayments.length,
          paidInvoices: paidPayments.length,
          outstandingInvoices: outstandingPayments.length
        },
        breakdowns,
        outstandingGroups,
        keyActions
      }
    });
  } catch (error) {
    console.error('Dashboard summary error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to build dashboard summary',
      message: error.message
    });
  }
}

module.exports = {
  getSummary
};
