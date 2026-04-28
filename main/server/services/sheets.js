/**
 * Google Sheets service — uses googleapis directly (no google-spreadsheet wrapper).
 * This avoids google-spreadsheet v4 compatibility issues with google-auth-library v9.
 */
const { google } = require('googleapis');
const fs = require('fs').promises;
const path = require('path');
const logger = require('../utils/logger');

const SHEET_ID = process.env.SHEET_ID;
const GOOGLE_CREDS_PATH = process.env.GOOGLE_CREDS_PATH;
const GOOGLE_CREDS_JSON = process.env.GOOGLE_CREDS_JSON || process.env.GOOGLE_CREDENTIALS_JSON;

let sheetsClient = null;       // Authorized google.sheets() client
let isGoogleSheetsConfigured = false;
let lastInitError = null;

const REQUIRED_HEADERS = [
  'Payment ID', 'Customer Name', 'Amount', 'Currency', 'Timestamp', 'Status',
  'Invoice ID', 'Invoice Number', 'Invoice Date', 'Source',
  'Organization ID', 'Organization Name'
];

// ── Startup diagnostics ───────────────────────────────────────────────────────
console.log('[Sheets] 🔍 Env diagnostics at module load:');
console.log(`  SHEET_ID          : ${SHEET_ID ? SHEET_ID : '❌ NOT SET'}`);
console.log(`  GOOGLE_CREDS_PATH : ${GOOGLE_CREDS_PATH || '(not set)'}`);
console.log(`  GOOGLE_CREDS_JSON : ${GOOGLE_CREDS_JSON ? `✅ SET (length=${GOOGLE_CREDS_JSON.length})` : '❌ NOT SET'}`);
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Load and parse service account credentials from env var or file.
 */
async function loadGoogleCredentials() {
  if (GOOGLE_CREDS_JSON) {
    const raw = GOOGLE_CREDS_JSON.trim();
    console.log(`[Sheets] 🔍 Parsing GOOGLE_CREDS_JSON (length=${raw.length}, starts: "${raw.substring(0, 30)}")`);

    // Attempt 1: direct JSON parse
    try {
      const parsed = JSON.parse(raw);
      console.log('[Sheets] ✅ Parsed as plain JSON.');
      return normalizeCredentials(parsed);
    } catch (e) {
      console.warn(`[Sheets] ⚠️ Direct JSON parse failed: ${e.message}`);
    }

    // Attempt 2: base64-encoded JSON
    try {
      const decoded = Buffer.from(raw, 'base64').toString('utf8');
      const parsed = JSON.parse(decoded);
      console.log('[Sheets] ✅ Parsed from base64.');
      return normalizeCredentials(parsed);
    } catch (e) {
      console.warn(`[Sheets] ⚠️ Base64 decode failed: ${e.message}`);
    }

    // Attempt 3: fall back to file
    if (GOOGLE_CREDS_PATH) {
      const content = await fs.readFile(path.resolve(GOOGLE_CREDS_PATH), 'utf8');
      console.log('[Sheets] ✅ Loaded from GOOGLE_CREDS_PATH fallback.');
      return normalizeCredentials(JSON.parse(content));
    }

    throw new Error('GOOGLE_CREDS_JSON could not be parsed (tried JSON and base64).');
  }

  if (!GOOGLE_CREDS_PATH) {
    throw new Error('No credentials: set GOOGLE_CREDS_JSON or GOOGLE_CREDS_PATH.');
  }
  const content = await fs.readFile(path.resolve(GOOGLE_CREDS_PATH), 'utf8');
  console.log('[Sheets] ✅ Loaded credentials from file.');
  return normalizeCredentials(JSON.parse(content));
}

function normalizeCredentials(creds) {
  if (!creds || typeof creds !== 'object') throw new Error('Credentials must be a JSON object.');
  if (!creds.client_email) throw new Error('Credentials missing "client_email".');
  if (!creds.private_key)  throw new Error('Credentials missing "private_key".');

  // Fix escaped newlines (common when pasted into env var UIs)
  creds.private_key = creds.private_key
    .replace(/\\\\n/g, '\n')   // double-escaped \\n
    .replace(/\\n/g, '\n');    // single-escaped \n

  console.log(`[Sheets]    client_email : ${creds.client_email}`);
  console.log(`[Sheets]    key starts   : ${creds.private_key.substring(0, 36)}`);
  return creds;
}

/**
 * Ensure the first row contains all required headers.
 * Reads row 1; if missing or incomplete, writes headers.
 */
async function ensureHeaders() {
  const res = await sheetsClient.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: '1:1',
  });

  const existingRow = (res.data.values || [])[0] || [];
  const hasAll = REQUIRED_HEADERS.every(h => existingRow.includes(h));

  if (hasAll) {
    console.log('[Sheets] ✅ Headers already correct.');
    return;
  }

  console.log('[Sheets] 📝 Writing headers to row 1...');
  await sheetsClient.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: 'A1',
    valueInputOption: 'RAW',
    requestBody: { values: [REQUIRED_HEADERS] },
  });
  console.log('[Sheets] ✅ Headers written.');
}

/**
 * Initialize the Google Sheets API client.
 */
async function initializeGoogleSheets() {
  lastInitError = null;

  if (!SHEET_ID) {
    const msg = 'SHEET_ID not set — using CSV fallback.';
    console.warn('[Sheets] ⚠️', msg);
    lastInitError = msg;
    return false;
  }
  if (!GOOGLE_CREDS_PATH && !GOOGLE_CREDS_JSON) {
    const msg = 'No credentials set — using CSV fallback.';
    console.warn('[Sheets] ⚠️', msg);
    lastInitError = msg;
    return false;
  }

  console.log('[Sheets] 🔄 Initializing Google Sheets (googleapis)...');

  try {
    const creds = await loadGoogleCredentials();

    // Log private_key details to diagnose any corruption
    const pk = creds.private_key;
    console.log(`[Sheets] 🔍 private_key: length=${pk.length}`);
    console.log(`[Sheets]    first 27 chars : "${pk.substring(0, 27)}"`);
    console.log(`[Sheets]    last  25 chars : "${pk.substring(pk.length - 25)}"`);
    console.log(`[Sheets]    has actual \\n  : ${pk.includes('\n')}`);
    console.log(`[Sheets]    has literal \\\\n : ${pk.includes('\\n')}`);
    console.log(`[Sheets]    has \\r         : ${pk.includes('\r')}`);

    // Use GoogleAuth with full credentials — handles JWT signing internally
    // This avoids any manual key-passing that can corrupt RSA signatures.
    const auth = new google.auth.GoogleAuth({
      credentials: {
        type:            creds.type || 'service_account',
        client_email:    creds.client_email,
        private_key:     creds.private_key,
        private_key_id:  creds.private_key_id,
        project_id:      creds.project_id,
        client_id:       creds.client_id,
      },
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    console.log('[Sheets] 🔄 Getting auth client...');
    const authClient = await auth.getClient();
    console.log('[Sheets] ✅ Auth client obtained.');

    // Verify access by fetching spreadsheet metadata
    console.log(`[Sheets] 🔄 Verifying spreadsheet access (ID: ${SHEET_ID})...`);
    sheetsClient = google.sheets({ version: 'v4', auth: authClient });
    const meta = await sheetsClient.spreadsheets.get({ spreadsheetId: SHEET_ID });
    console.log(`[Sheets] ✅ Spreadsheet found: "${meta.data.properties.title}"`);

    await ensureHeaders();

    isGoogleSheetsConfigured = true;
    console.log('[Sheets] ✅ Google Sheets fully initialized and ready.');
    return true;

  } catch (error) {
    lastInitError = error.message;
    console.error('[Sheets] ❌ Initialization failed:');
    console.error(`  name   : ${error.name}`);
    console.error(`  message: ${error.message}`);
    if (error.code)   console.error(`  code   : ${error.code}`);
    if (error.status) console.error(`  status : ${error.status}`);
    if (error.response?.data) console.error(`  body   : ${JSON.stringify(error.response.data)}`);
    if (error.stack)  console.error(`  stack  :\n${error.stack}`);
    console.warn('[Sheets] ⚠️ Falling back to CSV logging.');
    return false;
  }
}

/**
 * Find an existing row by invoice/payment ID. Returns the row index (1-based) or -1.
 */
async function findExistingRowIndex(paymentData) {
  const res = await sheetsClient.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: 'A:L',
  });

  const rows = res.data.values || [];
  if (rows.length < 2) return -1;

  const headers = rows[0];
  const idxInvoiceId  = headers.indexOf('Invoice ID');
  const idxPaymentId  = headers.indexOf('Payment ID');
  const idxInvoiceNum = headers.indexOf('Invoice Number');
  const idxOrgName    = headers.indexOf('Organization Name');

  const incomingOrg = (paymentData.organization_name || '').toString().trim().toLowerCase();
  const incoming = [paymentData.invoice_id, paymentData.invoice_number, paymentData.payment_id]
    .map(v => (v || '').toString().trim())
    .filter(Boolean);

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const rowInvoiceId  = (row[idxInvoiceId]  || '').trim();
    const rowPaymentId  = (row[idxPaymentId]  || '').trim();
    const rowInvoiceNum = (row[idxInvoiceNum] || '').trim();
    const rowOrg        = (row[idxOrgName]    || '').trim().toLowerCase();

    const idMatch = incoming.some(v => v && (v === rowInvoiceId || v === rowPaymentId || v === rowInvoiceNum));
    if (!idMatch) continue;
    if (incomingOrg && rowOrg && incomingOrg !== rowOrg) continue;

    return i + 1; // 1-based sheet row (headers are row 1, data starts at row 2)
  }
  return -1;
}

/**
 * Upsert (update existing or insert new) a payment row.
 */
async function upsertPaymentToSheet(paymentData) {
  if (!isGoogleSheetsConfigured) {
    await logger.logToCSV(paymentData);
    return { success: true, method: 'csv', message: 'Logged to CSV (Sheets not configured)' };
  }

  try {
    const rowIndex = await findExistingRowIndex(paymentData);

    if (rowIndex !== -1) {
      // ── Existing row — check status before updating ──────────────────────
      const res = await sheetsClient.spreadsheets.values.get({
        spreadsheetId: SHEET_ID,
        range: `A${rowIndex}:L${rowIndex}`,
      });
      const existingRow = (res.data.values || [])[0] || [];

      // Get headers to find Status column index
      const headerRes = await sheetsClient.spreadsheets.values.get({
        spreadsheetId: SHEET_ID, range: '1:1',
      });
      const headers = (headerRes.data.values || [])[0] || [];
      const statusIdx = headers.indexOf('Status');
      const oldStatus = ((existingRow[statusIdx] || '')).toLowerCase();
      const newStatus = (paymentData.status || '').toLowerCase();
      const isPaid = s => s === 'paid' || s === 'processed';

      if (isPaid(oldStatus) && !isPaid(newStatus)) {
        console.log(`[Sheets] 🛡️ Skipping update — existing status [${oldStatus}] protected from [${newStatus}]`);
        return { success: true, method: 'google_sheets_skipped', message: `Skipped — paid status protected` };
      }

      // Build updated row using existing values + overrides
      const updatedRow = [...existingRow];
      const set = (col, val) => { const i = headers.indexOf(col); if (i >= 0 && val != null) updatedRow[i] = val; };
      set('Status',            paymentData.status);
      set('Timestamp',         new Date().toISOString());
      set('Amount',            paymentData.amount);
      set('Currency',          paymentData.currency);
      set('Source',            paymentData.source);
      set('Customer Name',     paymentData.customer_name);
      set('Invoice Date',      paymentData.invoice_date);
      set('Organization Name', paymentData.organization_name);

      await sheetsClient.spreadsheets.values.update({
        spreadsheetId: SHEET_ID,
        range: `A${rowIndex}`,
        valueInputOption: 'RAW',
        requestBody: { values: [updatedRow] },
      });

      console.log(`[Sheets] ✅ Updated row ${rowIndex}: ${paymentData.payment_id} → ${paymentData.status}`);
      return { success: true, method: 'google_sheets_update', message: `Row updated (status: ${paymentData.status})` };
    }

    // ── New row — append ────────────────────────────────────────────────────
    return await logPaymentToSheet(paymentData);

  } catch (error) {
    console.error('[Sheets] ❌ Upsert failed:', error.message);
    if (error.response?.data) console.error('  API body:', JSON.stringify(error.response.data));
    await logger.logToCSV(paymentData);
    return { success: true, method: 'csv_fallback', message: 'Logged to CSV (Sheets upsert failed)', error: error.message };
  }
}

/**
 * Append a new payment row.
 */
async function logPaymentToSheet(paymentData) {
  if (!isGoogleSheetsConfigured) {
    await logger.logToCSV(paymentData);
    return { success: true, method: 'csv', message: 'Logged to CSV (Sheets not configured)' };
  }

  try {
    const row = [
      paymentData.payment_id    || '',
      paymentData.customer_name || '',
      paymentData.amount        != null ? paymentData.amount : '',
      paymentData.currency      || 'INR',
      new Date().toISOString(),
      paymentData.status        || 'Processed',
      paymentData.invoice_id    || '',
      paymentData.invoice_number|| '',
      paymentData.invoice_date  || '',
      paymentData.source        || '',
      paymentData.organization_id   || '',
      paymentData.organization_name || '',
    ];

    await sheetsClient.spreadsheets.values.append({
      spreadsheetId: SHEET_ID,
      range: 'A1',
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: [row] },
    });

    console.log(`[Sheets] ✅ Appended new row: ${paymentData.payment_id}`);
    return { success: true, method: 'google_sheets', message: 'Payment logged to Google Sheets' };

  } catch (error) {
    console.error('[Sheets] ❌ Append failed:', error.message);
    if (error.response?.data) console.error('  API body:', JSON.stringify(error.response.data));
    await logger.logToCSV(paymentData);
    return { success: true, method: 'csv_fallback', message: 'Logged to CSV (Sheets append failed)', error: error.message };
  }
}

/**
 * Read all payment rows from the sheet.
 */
async function getAllPayments() {
  if (!isGoogleSheetsConfigured) {
    return await logger.readFromCSV();
  }

  try {
    const res = await sheetsClient.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: 'A:L',
    });

    const rows = res.data.values || [];
    if (rows.length < 2) return [];

    const headers = rows[0];
    const idx = col => headers.indexOf(col);

    return rows.slice(1)
      .filter(row => {
        const pid = row[idx('Payment ID')];
        return pid && pid !== 'Payment ID' && pid.trim() !== '';
      })
      .map(row => ({
        payment_id:        row[idx('Payment ID')]        || '',
        invoice_id:        row[idx('Invoice ID')]        || row[idx('Payment ID')] || '',
        invoice_number:    row[idx('Invoice Number')]    || '',
        customer_name:     row[idx('Customer Name')]     || '',
        amount:            parseFloat(row[idx('Amount')]) || 0,
        currency:          row[idx('Currency')]          || 'INR',
        timestamp:         row[idx('Timestamp')]         || '',
        invoice_date:      row[idx('Invoice Date')]      || '',
        status:            row[idx('Status')]            || '',
        source:            row[idx('Source')]            || 'manual',
        organization_id:   row[idx('Organization ID')]  || null,
        organization_name: row[idx('Organization Name')]|| null,
      }));

  } catch (error) {
    console.error('[Sheets] ❌ getAllPayments failed:', error.message);
    return await logger.readFromCSV();
  }
}

// Initialize on module load
initializeGoogleSheets().catch(err => {
  console.error('[Sheets] ❌ Unhandled init error:', err.message);
});

module.exports = {
  logPaymentToSheet,
  upsertPaymentToSheet,
  getAllPayments,
  initializeGoogleSheets,
  isGoogleSheetsConfigured: () => isGoogleSheetsConfigured,
  getLastInitError: () => lastInitError,
};
