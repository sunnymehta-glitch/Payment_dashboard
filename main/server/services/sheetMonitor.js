const sheetsService = require('./sheets');
const whatsappService = require('./whatsapp');

let lastProcessedRowCount = 0;
let isMonitoring = false;
let monitorInterval = null;

/**
 * Process new payments from Google Sheets
 */
async function processNewPayments() {
  try {
    if (!sheetsService.isGoogleSheetsConfigured()) {
      return; // Skip if sheets not configured
    }

    const allPayments = await sheetsService.getAllPayments();
    const currentRowCount = allPayments.length;

    // If we have new payments
    if (currentRowCount > lastProcessedRowCount) {
      const newPayments = allPayments.slice(lastProcessedRowCount);
      
      console.log(`📊 Found ${newPayments.length} new payment(s) in Google Sheet`);

      // Process each new payment
      for (const payment of newPayments) {
        // Skip if payment_id is empty or is a header
        if (!payment.payment_id || payment.payment_id === 'Payment ID') {
          continue;
        }

        // Normalize timestamp format (handle +05:30, Z, or other formats)
        let paymentTime;
        try {
          // Replace +05:30 format with Z format for better parsing
          let normalizedTimestamp = payment.timestamp;
          if (normalizedTimestamp && normalizedTimestamp.includes('+')) {
            // Convert +05:30 to Z (assuming it's already in correct timezone)
            normalizedTimestamp = normalizedTimestamp.replace(/\+05:30$/, 'Z');
            normalizedTimestamp = normalizedTimestamp.replace(/\+(\d{2}):(\d{2})$/, 'Z');
          }
          // If timestamp doesn't end with Z and doesn't have timezone, add Z
          if (normalizedTimestamp && !normalizedTimestamp.endsWith('Z') && !normalizedTimestamp.includes('+')) {
            // Add milliseconds if missing
            if (!normalizedTimestamp.includes('.')) {
              normalizedTimestamp = normalizedTimestamp.replace(/(\d{2}:\d{2}:\d{2})(.*?)$/, '$1.000Z');
            } else if (!normalizedTimestamp.endsWith('Z')) {
              normalizedTimestamp += 'Z';
            }
          }
          
          paymentTime = new Date(normalizedTimestamp);
          
          // Check if date is valid
          if (isNaN(paymentTime.getTime())) {
            console.warn(`⚠️ Invalid timestamp for ${payment.payment_id}: ${payment.timestamp}`);
            // Try parsing as-is
            paymentTime = new Date(payment.timestamp);
          }
        } catch (error) {
          console.warn(`⚠️ Error parsing timestamp for ${payment.payment_id}: ${error.message}`);
          paymentTime = new Date(payment.timestamp);
        }

        // Check timestamp - allow entries from last 2 hours (for manual entries)
        const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
        const isValidDate = !isNaN(paymentTime.getTime());
        
        // Check if status is "paid" (case-insensitive)
        const status = (payment.status || '').toString().toLowerCase().trim();
        const isPaid = status === 'paid' || status === 'process' || status === 'processed';
        
        if (!isPaid) {
          console.log(`⏭️ Skipping payment ${payment.payment_id}: Status is "${payment.status || 'empty'}" (only "paid"/"processed" triggers notification)`);
          continue; // Skip this payment
        }

        // Process if:
        // 1. Valid date and recent (within 2 hours), OR
        // 2. Invalid date but it's a new entry (likely just added)
        if (isValidDate && paymentTime > twoHoursAgo) {
          console.log(`📧 Processing new payment from sheet: ${payment.payment_id}`);
          console.log(`   Status: ${payment.status} (✅ Paid - will send notification)`);
          console.log(`   Timestamp: ${payment.timestamp} (parsed: ${paymentTime.toISOString()})`);
          console.log(`   Customer: ${payment.customer_name}, Amount: ${payment.amount} ${payment.currency}`);
          
          // Send WhatsApp notification
          try {
            await whatsappService.sendWhatsAppAlert({
              payment_id: payment.payment_id,
              customer_name: payment.customer_name,
              amount: payment.amount,
              currency: payment.currency || 'INR'
            });
            console.log(`✅ WhatsApp notification sent for manual entry: ${payment.payment_id}`);
          } catch (error) {
            console.error(`❌ Failed to send WhatsApp for ${payment.payment_id}:`, error.message);
          }
        } else if (!isValidDate) {
          // Even if date is invalid, if it's a new row with paid status, send notification
          console.log(`📧 Processing new payment with invalid timestamp: ${payment.payment_id}`);
          console.log(`   Status: ${payment.status} (✅ Paid - will send notification)`);
          console.log(`   Timestamp: ${payment.timestamp} (will use current time)`);
          
          try {
            await whatsappService.sendWhatsAppAlert({
              payment_id: payment.payment_id,
              customer_name: payment.customer_name,
              amount: payment.amount,
              currency: payment.currency || 'INR'
            });
            console.log(`✅ WhatsApp notification sent for manual entry: ${payment.payment_id}`);
          } catch (error) {
            console.error(`❌ Failed to send WhatsApp for ${payment.payment_id}:`, error.message);
          }
        } else {
          console.log(`⏭️ Skipping old payment: ${payment.payment_id} (timestamp: ${payment.timestamp}, parsed: ${paymentTime.toISOString()})`);
        }
      }

      lastProcessedRowCount = currentRowCount;
    }
  } catch (error) {
    console.error('❌ Error monitoring Google Sheets:', error.message);
  }
}

/**
 * Start monitoring Google Sheets for new entries
 * @param {number} intervalSeconds - Check interval in seconds (default: 30)
 */
function startMonitoring(intervalSeconds = 30) {
  if (isMonitoring) {
    console.log('⚠️ Sheet monitoring already running');
    return;
  }

  // Initialize last processed count
  sheetsService.getAllPayments().then(payments => {
    lastProcessedRowCount = payments.length;
    console.log(`📊 Sheet monitoring initialized. Current payments: ${lastProcessedRowCount}`);
    console.log(`💡 Monitoring will detect new entries added after this point.`);
    if (lastProcessedRowCount > 0) {
      console.log(`⚠️ Note: Existing ${lastProcessedRowCount} payment(s) will not trigger notifications.`);
      console.log(`   Only new entries added after monitoring starts will be processed.`);
    }
  }).catch(console.error);

  // Start monitoring interval
  monitorInterval = setInterval(() => {
    processNewPayments();
  }, intervalSeconds * 1000);

  isMonitoring = true;
  console.log(`✅ Started monitoring Google Sheets (checking every ${intervalSeconds} seconds)`);
}

/**
 * Stop monitoring Google Sheets
 */
function stopMonitoring() {
  if (monitorInterval) {
    clearInterval(monitorInterval);
    monitorInterval = null;
    isMonitoring = false;
    console.log('⏹️ Stopped monitoring Google Sheets');
  }
}

/**
 * Check if monitoring is active
 */
function isMonitoringActive() {
  return isMonitoring;
}

module.exports = {
  startMonitoring,
  stopMonitoring,
  isMonitoringActive,
  processNewPayments
};

