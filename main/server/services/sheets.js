const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');
const fs = require('fs').promises;
const path = require('path');
const logger = require('../utils/logger');

const SHEET_ID = process.env.SHEET_ID;
const GOOGLE_CREDS_PATH = process.env.GOOGLE_CREDS_PATH;
// Allow both GOOGLE_CREDS_JSON and GOOGLE_CREDENTIALS_JSON
const GOOGLE_CREDS_JSON = process.env.GOOGLE_CREDS_JSON || process.env.GOOGLE_CREDENTIALS_JSON; // Optional: JSON content for serverless (Vercel)

let doc = null;
let sheet = null;
let isGoogleSheetsConfigured = false;
let lastInitError = null; // Store last init error for diagnostics

// ── Startup diagnostics (visible in Render/production logs) ──────────────────
console.log('[Sheets] 🔍 Env diagnostics at module load:');
console.log(`  SHEET_ID           : ${SHEET_ID ? SHEET_ID : '❌ NOT SET'}`);
console.log(`  GOOGLE_CREDS_PATH  : ${GOOGLE_CREDS_PATH ? GOOGLE_CREDS_PATH : '(not set)'}`);
console.log(`  GOOGLE_CREDS_JSON  : ${GOOGLE_CREDS_JSON ? `✅ SET (length=${GOOGLE_CREDS_JSON.length})` : '❌ NOT SET'}`);
console.log(`  GOOGLE_CREDENTIALS_JSON: ${process.env.GOOGLE_CREDENTIALS_JSON ? `✅ SET (length=${process.env.GOOGLE_CREDENTIALS_JSON.length})` : '(not set)'}`);
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Initialize Google Sheets connection
 */
async function initializeGoogleSheets() {
  lastInitError = null;

  if (!SHEET_ID) {
    const msg = 'SHEET_ID env var is not set — Google Sheets disabled, using CSV fallback.';
    console.warn('[Sheets] ⚠️', msg);
    lastInitError = msg;
    return false;
  }

  if (!GOOGLE_CREDS_PATH && !GOOGLE_CREDS_JSON) {
    const msg = 'Neither GOOGLE_CREDS_PATH nor GOOGLE_CREDS_JSON is set — Google Sheets disabled, using CSV fallback.';
    console.warn('[Sheets] ⚠️', msg);
    lastInitError = msg;
    return false;
  }

  console.log('[Sheets] 🔄 Starting Google Sheets initialization...');

  try {
    const credentials = await loadGoogleCredentials();
    console.log(`[Sheets] ✅ Credentials loaded. client_email=${credentials.client_email}`);
    console.log(`[Sheets]    private_key present: ${credentials.private_key ? 'YES' : '❌ NO'}`);
    console.log(`[Sheets]    private_key starts with: ${credentials.private_key ? credentials.private_key.substring(0, 40) : 'N/A'}`);

    // Initialize JWT auth
    const serviceAccountAuth = new JWT({
      email: credentials.client_email,
      key: credentials.private_key,
      scopes: ['https://www.googleapis.com/auth/spreadsheets']
    });

    // Initialize Google Spreadsheet
    console.log(`[Sheets] 🔄 Connecting to spreadsheet ID: ${SHEET_ID}`);
    doc = new GoogleSpreadsheet(SHEET_ID, serviceAccountAuth);
    await doc.loadInfo();
    console.log(`[Sheets] ✅ Spreadsheet connected: "${doc.title}"`);

    sheet = doc.sheetsByIndex[0] || (await doc.addSheet({ title: 'Payments' }));
    console.log(`[Sheets] ✅ Using sheet: "${sheet.title}"`);

    await ensureHeaders();

    isGoogleSheetsConfigured = true;
    console.log('[Sheets] ✅ Google Sheets fully initialized and ready.');
    return true;
  } catch (error) {
    lastInitError = error.message;
    console.error('[Sheets] ❌ Failed to initialize Google Sheets:');
    console.error(`  Error name   : ${error.name}`);
    console.error(`  Error message: ${error.message}`);
    if (error.stack) {
      console.error(`  Stack trace  :\n${error.stack}`);
    }
    // Log HTTP error details if present (Google API errors)
    if (error.response) {
      console.error(`  HTTP status  : ${error.response.status}`);
      console.error(`  HTTP body    : ${JSON.stringify(error.response.data)}`);
    }
    console.warn('[Sheets] ⚠️ Falling back to CSV logging.');
    return false;
  }
}

async function loadGoogleCredentials() {
  if (GOOGLE_CREDS_JSON) {
    const raw = GOOGLE_CREDS_JSON.trim();
    console.log(`[Sheets] 🔍 Attempting to parse GOOGLE_CREDS_JSON (length=${raw.length}, first 30 chars: "${raw.substring(0, 30)}")`);

    // Attempt 1: Direct JSON parse
    try {
      const parsed = JSON.parse(raw);
      console.log('[Sheets] ✅ GOOGLE_CREDS_JSON parsed successfully as plain JSON.');
      return normalizeServiceAccount(parsed);
    } catch (jsonError) {
      console.warn(`[Sheets] ⚠️ Direct JSON parse failed: ${jsonError.message}`);
    }

    // Attempt 2: Base64-encoded JSON
    try {
      console.log('[Sheets] 🔄 Trying base64 decode of GOOGLE_CREDS_JSON...');
      const decoded = Buffer.from(raw, 'base64').toString('utf8');
      const parsed = JSON.parse(decoded);
      console.log('[Sheets] ✅ GOOGLE_CREDS_JSON decoded from base64 successfully.');
      return normalizeServiceAccount(parsed);
    } catch (b64Error) {
      console.warn(`[Sheets] ⚠️ Base64 decode/parse failed: ${b64Error.message}`);
    }

    // Attempt 3: Fall back to file path
    if (GOOGLE_CREDS_PATH) {
      console.log(`[Sheets] 🔄 Falling back to GOOGLE_CREDS_PATH: ${GOOGLE_CREDS_PATH}`);
      try {
        const credsPath = path.resolve(GOOGLE_CREDS_PATH);
        const credsContent = await fs.readFile(credsPath, 'utf8');
        console.log('[Sheets] ✅ Credentials loaded from file path fallback.');
        return normalizeServiceAccount(JSON.parse(credsContent));
      } catch (fileErr) {
        throw new Error(`GOOGLE_CREDS_JSON invalid AND GOOGLE_CREDS_PATH file unreadable: ${fileErr.message}`);
      }
    }

    // Attempt 4: GOOGLE_APPLICATION_CREDENTIALS env var
    if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      console.log(`[Sheets] 🔄 Trying GOOGLE_APPLICATION_CREDENTIALS: ${process.env.GOOGLE_APPLICATION_CREDENTIALS}`);
      try {
        const appCredsPath = path.resolve(process.env.GOOGLE_APPLICATION_CREDENTIALS);
        const appCredsContent = await fs.readFile(appCredsPath, 'utf8');
        console.log('[Sheets] ✅ Credentials loaded from GOOGLE_APPLICATION_CREDENTIALS.');
        return normalizeServiceAccount(JSON.parse(appCredsContent));
      } catch (appFileErr) {
        throw new Error(`GOOGLE_CREDS_JSON invalid AND GOOGLE_APPLICATION_CREDENTIALS file unreadable: ${appFileErr.message}`);
      }
    }

    throw new Error(`GOOGLE_CREDS_JSON could not be parsed as JSON or base64, and no fallback file path is set.`);
  }

  // No JSON env var — try file path directly
  if (!GOOGLE_CREDS_PATH) {
    throw new Error('No credentials source available: set GOOGLE_CREDS_JSON or GOOGLE_CREDS_PATH.');
  }
  console.log(`[Sheets] 🔄 Loading credentials from file: ${GOOGLE_CREDS_PATH}`);
  const credsPath = path.resolve(GOOGLE_CREDS_PATH);
  const credsContent = await fs.readFile(credsPath, 'utf8');
  console.log('[Sheets] ✅ Credentials loaded from file.');
  return normalizeServiceAccount(JSON.parse(credsContent));
}

function normalizeServiceAccount(credentials) {
  if (!credentials || typeof credentials !== 'object') {
    throw new Error('Service account credentials must be an object');
  }

  if (!credentials.client_email) {
    throw new Error('Service account JSON is missing "client_email" field.');
  }
  if (!credentials.private_key) {
    throw new Error('Service account JSON is missing "private_key" field.');
  }

  if (typeof credentials.private_key === 'string') {
    // Handle escaped newlines — Render / other hosts sometimes double-escape them.
    // Replace literal '\n' sequences (both single and double escaped) with actual newlines.
    credentials.private_key = credentials.private_key
      .replace(/\\\\n/g, '\n')  // handle \\n (double-escaped)
      .replace(/\\n/g, '\n');   // handle \n (single-escaped)
  }

  return credentials;
}

/**
 * Ensure sheet has proper headers
 */
async function ensureHeaders() {
  if (!sheet) return;

  const requiredHeaders = [
    'Payment ID', 'Customer Name', 'Amount', 'Currency', 'Timestamp', 'Status',
    'Invoice ID', 'Invoice Number', 'Invoice Date', 'Source',
    'Organization ID', 'Organization Name'
  ];
  
  try {
    // Try to load existing header row
    await sheet.loadHeaderRow();
    const existingHeaders = sheet.headerValues || [];
    
    // Check if all required headers exist
    const hasAllHeaders = requiredHeaders.every(h => existingHeaders.includes(h));
    
    if (hasAllHeaders) {
      console.log('✅ Headers already exist in Google Sheet');
      return;
    } else {
      console.log('⚠️ Headers are incomplete, will update...');
    }
  } catch (error) {
    // No headers exist yet, we'll create them
    console.log('📝 No headers found, creating new headers...');
  }

  // Set headers using setHeaderRow (this writes to row 1)
  try {
    await sheet.setHeaderRow(requiredHeaders);
    console.log('✅ Headers created in Google Sheet');
  } catch (setError) {
    console.warn('⚠️ setHeaderRow failed, trying alternative method...', setError.message);
    
    // Alternative: Directly write to row 1 using cells
    try {
      await sheet.loadCells('A1:F1');
      
      const headerValues = requiredHeaders;
      for (let i = 0; i < headerValues.length; i++) {
        const cell = sheet.getCell(0, i); // Row 0 (first row), Column i
        cell.value = headerValues[i];
      }
      
      await sheet.saveUpdatedCells();
      console.log('✅ Headers created using direct cell method');
    } catch (cellError) {
      console.warn('⚠️ Direct cell method failed, trying addRow fallback...', cellError.message);
      
      // Final fallback: Add header row as data (less ideal but works)
      try {
        // Check if first row is empty
        const rows = await sheet.getRows({ limit: 1 });
        if (rows.length === 0) {
          await sheet.addRow({
            'Payment ID': 'Payment ID',
            'Customer Name': 'Customer Name',
            'Amount': 'Amount',
            'Currency': 'Currency',
            'Timestamp': 'Timestamp',
            'Status': 'Status'
          });
          console.log('✅ Headers added as first row (fallback method)');
        }
      } catch (addError) {
        console.error('❌ Could not set headers:', addError.message);
        throw addError;
      }
    }
  }
}

/**
 * Log payment to Google Sheets
 * @param {Object} paymentData - Payment information
 * @returns {Promise<Object>} - Result of logging
 */
/**
 * Upsert payment to Google Sheets — updates existing row if invoice already exists, else inserts.
 * @param {Object} paymentData - Payment information
 */
async function upsertPaymentToSheet(paymentData) {
  if (!isGoogleSheetsConfigured) {
    await logger.logToCSV(paymentData);
    return { success: true, method: 'csv', message: 'Payment logged to CSV file' };
  }

  try {
    await sheet.loadHeaderRow();
    const rows = await sheet.getRows();

    // Find existing row by Invoice ID/Number + Organization (to handle same invoice numbers across orgs)
    const incomingOrg = (paymentData.organization_name || '').toString().trim().toLowerCase();
    const existingRow = rows.find(row => {
      const rowInvoiceId  = (row.get('Invoice ID') || '').toString().trim();
      const rowPaymentId  = (row.get('Payment ID') || '').toString().trim();
      const rowInvoiceNum = (row.get('Invoice Number') || '').toString().trim();
      const rowOrg        = (row.get('Organization Name') || '').toString().trim().toLowerCase();

      const incoming = [
        paymentData.invoice_id,
        paymentData.invoice_number,
        paymentData.payment_id
      ].map(v => (v || '').toString().trim()).filter(Boolean);

      const invoiceMatches = incoming.some(v => v && (v === rowInvoiceId || v === rowPaymentId || v === rowInvoiceNum));
      if (!invoiceMatches) return false;

      // If both sides have an org name, they must match — prevents cross-org collision
      if (incomingOrg && rowOrg && incomingOrg !== rowOrg) return false;

      return true;
    });

    if (existingRow) {
      const oldStatus = (existingRow.get('Status') || '').toLowerCase();
      const newStatus = (paymentData.status || '').toLowerCase();
      const isNewStatusPaid = newStatus === 'paid' || newStatus === 'processed';
      const isOldStatusPaid = oldStatus === 'paid' || oldStatus === 'processed';

      // CRITICAL FIX: If existing row is already paid and incoming is NOT a paid event,
      // skip the ENTIRE update — don't touch any field at all. This prevents data corruption
      // where a mismatched/re-used invoice ID overwrites a legitimate paid entry.
      if (isOldStatusPaid && !isNewStatusPaid) {
        console.log(`🛡️ Fully skipping update for ${paymentData.payment_id} — row is already [${oldStatus}], incoming status [${newStatus}] would corrupt data.`);
        return { success: true, method: 'google_sheets_skipped', message: `Row skipped — paid status protected from [${newStatus}]` };
      }

      // Safe to update — either progressing to paid, or updating a non-paid row
      const headers = sheet.headerValues || [];
      existingRow.set('Status', paymentData.status || oldStatus);
      existingRow.set('Timestamp', new Date().toISOString());
      if (paymentData.amount != null && headers.includes('Amount'))            existingRow.set('Amount', paymentData.amount);
      if (paymentData.currency && headers.includes('Currency'))                existingRow.set('Currency', paymentData.currency);
      if (paymentData.source && headers.includes('Source'))                    existingRow.set('Source', paymentData.source);
      if (paymentData.customer_name && headers.includes('Customer Name'))      existingRow.set('Customer Name', paymentData.customer_name);
      if (paymentData.invoice_date && headers.includes('Invoice Date'))        existingRow.set('Invoice Date', paymentData.invoice_date);
      if (paymentData.organization_name && headers.includes('Organization Name')) existingRow.set('Organization Name', paymentData.organization_name);
      
      await existingRow.save();
      console.log(`✅ Updated existing row in Google Sheets: ${paymentData.payment_id} → status: ${paymentData.status}`);
      return { success: true, method: 'google_sheets_update', message: `Row updated in Google Sheets (status: ${paymentData.status})` };
    }

    // No existing row — fall through to normal insert
    return await logPaymentToSheet(paymentData);
  } catch (error) {
    console.error('❌ Failed to upsert to Google Sheets:', error.message);
    await logger.logToCSV(paymentData);
    return { success: true, method: 'csv_fallback', message: 'Payment logged to CSV (Google Sheets upsert failed)', error: error.message };
  }
}

async function logPaymentToSheet(paymentData) {
  const { payment_id, customer_name, amount, currency = 'INR' } = paymentData;
  const timestamp = new Date().toISOString();

  // If Google Sheets is not configured, use CSV logger
  if (!isGoogleSheetsConfigured) {
    await logger.logToCSV(paymentData);
    return {
      success: true,
      method: 'csv',
      message: 'Payment logged to CSV file'
    };
  }

  try {
    // Ensure headers are loaded before adding row
    try {
      await sheet.loadHeaderRow();
    } catch (headerError) {
      // Headers might not exist, create them
      console.log('⚠️ Headers not found when adding row, creating them...');
      await ensureHeaders();
      await sheet.loadHeaderRow();
    }

    // Add row to Google Sheet with additional fields if available
    const rowData = {
      'Payment ID': payment_id,
      'Customer Name': customer_name,
      'Amount': amount,
      'Currency': currency,
      'Timestamp': timestamp,
      'Status': paymentData.status || 'Processed'
    };

    // Add invoice fields if available (for Zoho Books)
    if (paymentData.invoice_id) {
      rowData['Invoice ID'] = paymentData.invoice_id;
    }
    if (paymentData.invoice_number) {
      rowData['Invoice Number'] = paymentData.invoice_number;
    }
    if (paymentData.invoice_date) {
      rowData['Invoice Date'] = paymentData.invoice_date;
    }
    if (paymentData.source) {
      rowData['Source'] = paymentData.source;
    }

    // Organization fields if available
    if (paymentData.organization_id) {
      rowData['Organization ID'] = paymentData.organization_id;
    }
    if (paymentData.organization_name) {
      rowData['Organization Name'] = paymentData.organization_name;
    }

    await sheet.addRow(rowData);

    console.log('✅ Payment logged to Google Sheets:', payment_id);
    return {
      success: true,
      method: 'google_sheets',
      message: 'Payment logged to Google Sheets'
    };
  } catch (error) {
    console.error('❌ Failed to log to Google Sheets:', error.message);
    // Fallback to CSV
    await logger.logToCSV(paymentData);
    return {
      success: true,
      method: 'csv_fallback',
      message: 'Payment logged to CSV (Google Sheets failed)',
      error: error.message
    };
  }
}

/**
 * Get all payments from Google Sheets
 * @returns {Promise<Array>} - Array of payment records
 */
async function getAllPayments() {
  // If Google Sheets not configured, read from CSV
  if (!isGoogleSheetsConfigured) {
    return await logger.readFromCSV();
  }

  try {
    // Load header row first to enable column name access
    try {
      await sheet.loadHeaderRow();
    } catch (headerError) {
      console.warn('⚠️ Could not load header row:', headerError.message);
      // If headers don't exist, ensure they're created
      await ensureHeaders();
      await sheet.loadHeaderRow();
    }

    const rows = await sheet.getRows();
    
    // Filter out header rows and empty rows, then map to objects
    const payments = rows
      .filter(row => {
        // Skip rows where Payment ID is actually a header or empty
        const paymentId = row.get('Payment ID');
        return paymentId && 
               paymentId !== 'Payment ID' && 
               paymentId.toString().trim() !== '';
      })
      .map(row => {
        const paymentId = row.get('Payment ID');
        return {
          payment_id: paymentId,
          invoice_id: row.get('Invoice ID') || paymentId,
          invoice_number: row.get('Invoice Number') || paymentId,
          customer_name: row.get('Customer Name'),
          amount: parseFloat(row.get('Amount')) || 0,
          currency: row.get('Currency') || 'INR',
          timestamp: row.get('Timestamp'),
          invoice_date: row.get('Invoice Date') || row.get('Timestamp'),
          status: row.get('Status'),
          source: row.get('Source') || 'manual',
          organization_id: row.get('Organization ID') || null,
          organization_name: row.get('Organization Name') || null
        };
      });

    return payments;
  } catch (error) {
    console.error('❌ Failed to read from Google Sheets:', error.message);
    // Fallback to CSV
    return await logger.readFromCSV();
  }
}

// Initialize on module load
initializeGoogleSheets().catch((err) => {
  console.error('[Sheets] ❌ Unhandled error during initializeGoogleSheets():', err);
});

module.exports = {
  logPaymentToSheet,
  upsertPaymentToSheet,
  getAllPayments,
  initializeGoogleSheets,
  isGoogleSheetsConfigured: () => isGoogleSheetsConfigured,
  getLastInitError: () => lastInitError,
  getDoc: () => doc,
  getSheet: () => sheet,
};
