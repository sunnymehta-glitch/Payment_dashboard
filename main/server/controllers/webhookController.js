const whatsappService = require('../services/whatsapp');
const sheetsService = require('../services/sheets');
const zohoBooksService = require('../services/zohoBooks');

// Webhook Mutex queue to prevent duplicate rows on exact simultaneous hits
const processingLocks = new Map();
const lastSentMessages = new Map(); // Debounce map for WhatsApp messages
const delay = ms => new Promise(res => setTimeout(res, ms));

/**
 * Handle incoming webhook from Zoho Books or manual entry
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function handleWebhook(req, res) {
  try {
    const webhookPayload = req.body;
    const headers = req.headers;

    console.log('📥 Received webhook:', {
      headers: {
        'user-agent': headers['user-agent'],
        'content-type': headers['content-type']
      },
      payload: webhookPayload
    });

    let paymentData = null;
    let whatsappMessage = null;
    let source = 'manual';
    const isInvoiceCreatedEvent = webhookPayload?.event?.type === 'invoice.created';

    // Check if this is a Zoho Books webhook
    const isZohoWebhook = zohoBooksService.validateZohoWebhook(webhookPayload) ||
                         headers['user-agent']?.includes('Zoho') ||
                         webhookPayload.invoice_id ||
                         webhookPayload.invoice_number ||
                         isInvoiceCreatedEvent;

    if (isZohoWebhook) {
      console.log('🧾 Detected Zoho Books webhook');
      
      // Parse Zoho Books invoice data
      paymentData = zohoBooksService.parseZohoBooksWebhook(webhookPayload);
      
      if (!paymentData) {
        return res.status(400).json({
          success: false,
          error: 'Invalid Zoho Books webhook format',
          message: 'Could not parse invoice data from webhook payload'
        });
      }

      source = 'zoho_books';
      
      // We'll build the WhatsApp message after enriching org details below
      
      // Fallback: capture organization details from headers/query if missing
      try {
        const h = Object.fromEntries(
          Object.entries(headers || {}).map(([k, v]) => [k.toLowerCase(), v])
        );
        const q = req.query || {};

        const orgIdHeader = h['x-zoho-orgid'] || h['x-zoho-organizationid'] || h['x-organization-id'] ||
                            h['x-org-id'] || h['organization-id'] || h['org-id'] || null;
        const orgNameHeader = h['x-organization-name'] || h['x-org-name'] || h['organization-name'] ||
                              h['org-name'] || h['x-zoho-organization-name'] || null;

        const orgIdQuery = q.organization_id || q.org_id || null;
        const orgNameQuery = q.organization_name || q.org_name || null;

        if (!paymentData.organization_id) {
          paymentData.organization_id = orgIdHeader || orgIdQuery || paymentData.organization_id || null;
        }
        if (!paymentData.organization_name) {
          paymentData.organization_name = orgNameHeader || orgNameQuery || paymentData.organization_name || null;
        }

        // Final fallback: environment defaults
        if (!paymentData.organization_id) {
          paymentData.organization_id = process.env.DEFAULT_ORGANIZATION_ID ||
                                        process.env.ORGANIZATION_ID ||
                                        process.env.ORG_ID || null;
        }
        if (!paymentData.organization_name) {
          paymentData.organization_name = process.env.DEFAULT_ORGANIZATION_NAME ||
                                          process.env.ORGANIZATION_NAME ||
                                          process.env.ORG_NAME || null;
        }

        // Optional mapping: ORG_MAP_JSON or ORG_MAP ("id=name;id2=name2")
        try {
          let orgMap = {};
          if (process.env.ORG_MAP_JSON) {
            orgMap = JSON.parse(process.env.ORG_MAP_JSON);
          } else if (process.env.ORG_MAP) {
            const pairs = process.env.ORG_MAP.split(/;|\n|,/).map(s => s.trim()).filter(Boolean);
            for (const p of pairs) {
              const [id, name] = p.split(/=|:/);
              if (id && name) orgMap[id.trim()] = name.trim();
            }
          }

          // If we have ID but not name, derive from map
          if (paymentData.organization_id && !paymentData.organization_name) {
            paymentData.organization_name = orgMap[paymentData.organization_id] || paymentData.organization_name || null;
          }
          // If we have name but not ID, reverse lookup
          if (!paymentData.organization_id && paymentData.organization_name) {
            const found = Object.entries(orgMap).find(([, n]) => (n || '').toLowerCase() === paymentData.organization_name.toLowerCase());
            if (found) paymentData.organization_id = found[0];
          }
        } catch (e) {
          // ignore mapping errors
        }
      } catch (_) {}

      // Now that paymentData is enriched with org details, build message
      whatsappMessage = zohoBooksService.formatInvoiceWhatsAppMessage(paymentData);

      console.log('✅ Parsed Zoho Books invoice:', {
        invoice_id: paymentData.invoice_id,
        invoice_number: paymentData.invoice_number,
        customer: paymentData.customer_name,
        amount: paymentData.amount,
        currency: paymentData.currency,
        organization_id: paymentData.organization_id,
        organization_name: paymentData.organization_name
      });
    } else {
      // Manual webhook format (original format)
      paymentData = webhookPayload;
      source = 'manual';
      
      // Validate required fields for manual webhook
      if (!paymentData.payment_id || !paymentData.customer_name || !paymentData.amount) {
        return res.status(400).json({
          success: false,
          error: 'Missing required fields: payment_id, customer_name, amount',
          message: 'For manual webhooks, provide: payment_id, customer_name, amount'
        });
      }
    }

    // Keep provided status; do not force 'paid'. For manual payloads without status, allow fallback to 'created'.
    if (!paymentData.status && source === 'manual') {
      paymentData.status = 'created';
    }

    // Add source and timestamp
    paymentData.source = source;
    paymentData.timestamp = paymentData.timestamp || new Date().toISOString();

    console.log('📊 Processing payment:', {
      payment_id: paymentData.payment_id,
      customer: paymentData.customer_name,
      amount: paymentData.amount,
      source: source
    });

    // Decide whether to send WhatsApp alert
    // Deduplicate WhatsApp alerts permanently per phase to prevent duplicate spam (e.g. draft -> sent)
    const statusNorm = (paymentData.status || '').toString().toLowerCase();
    const isPaidPhase = statusNorm === 'paid';
    const messagePhase = isPaidPhase ? 'paid' : 'created';
    const messageDedupeKey = `${(paymentData.payment_id || '').toUpperCase()}_phase_${messagePhase}`;
    const alreadySentForThisPhase = lastSentMessages.has(messageDedupeKey);

    let whatsappResult = { success: false, skipped: true, reason: 'status_filter' };
    
    // Send only once per phase: once for creation (any unpaid status), once for paid!
    const shouldSend = !alreadySentForThisPhase;

    if (shouldSend) {
      try {
        lastSentMessages.set(messageDedupeKey, true);
        whatsappResult = await whatsappService.sendWhatsAppAlert(paymentData, whatsappMessage);
      } catch (error) {
        console.error('WhatsApp alert error:', error.message);
        whatsappResult = { success: false, error: error.message };
      }
    } else if (alreadySentForThisPhase) {
      console.log(`⏭️ Skipping WhatsApp send. Message already sent for payment_id="${paymentData.payment_id}" in phase="${messagePhase}".`);
    } else {
      console.log(`⏭️ Skipping WhatsApp send. Status="${paymentData.status}" - condition not met.`);
    }

    // Log to Google Sheets or CSV
    let sheetsResult;
    try {
      // Prevent race conditions on concurrent webhooks for the same invoice
      const lockKey = paymentData.payment_id;
      if (lockKey) {
        while (processingLocks.get(lockKey)) {
          await delay(100);
        }
        processingLocks.set(lockKey, true);
      }

      sheetsResult = await sheetsService.upsertPaymentToSheet(paymentData);

      if (lockKey) {
        processingLocks.delete(lockKey);
      }
    } catch (error) {
      if (paymentData.payment_id) {
        processingLocks.delete(paymentData.payment_id);
      }
      console.error('Sheets logging error:', error.message);
      sheetsResult = { success: false, error: error.message };
    }

    // Return success response
    res.status(200).json({
      success: true,
      message: source === 'zoho_books' ? 'Invoice processed successfully' : 'Payment processed successfully',
      source: source,
      payment_id: paymentData.payment_id,
      invoice_id: paymentData.invoice_id || paymentData.payment_id,
      invoice_number: paymentData.invoice_number || paymentData.payment_id,
      customer_name: paymentData.customer_name,
      amount: paymentData.amount,
      currency: paymentData.currency,
      whatsapp: whatsappResult,
      sheets: sheetsResult,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Webhook handler error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message
    });
  }
}

module.exports = {
  handleWebhook
};

