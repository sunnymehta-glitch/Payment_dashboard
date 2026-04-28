/**
 * Zoho Books Webhook Service
 * Handles invoice creation webhooks from Zoho Books
 */

/**
 * Parse Zoho Books invoice webhook payload
 * @param {Object} webhookPayload - Raw webhook payload from Zoho Books
 * @returns {Object} - Normalized payment data
 */
function parseZohoBooksWebhook(webhookPayload) {
  try {
    // Zoho Books webhook structure varies, handle different formats
    let invoiceData = null;

    // Format 1: Direct invoice object
    if (webhookPayload.invoice) {
      invoiceData = webhookPayload.invoice;
    }
    // Format 2: Data.invoice
    else if (webhookPayload.data && webhookPayload.data.invoice) {
      invoiceData = webhookPayload.data.invoice;
    }
    // Format 3: Payload.invoice
    else if (webhookPayload.payload && webhookPayload.payload.invoice) {
      invoiceData = webhookPayload.payload.invoice;
    }
    // Format 4: Direct properties (flat structure)
    else if (webhookPayload.invoice_id || webhookPayload.invoice_number) {
      invoiceData = webhookPayload;
    }
    // Format 5: Event data
    else if (webhookPayload.event && webhookPayload.event.data) {
      invoiceData = webhookPayload.event.data;
    }

    if (!invoiceData) {
      console.warn(
        "⚠️ Could not find invoice data in webhook payload:",
        JSON.stringify(webhookPayload),
      );
      return null;
    }

    // Extract invoice details
    // Try to capture organization info from common locations
    const orgId =
      webhookPayload.organization_id ||
      webhookPayload.org_id ||
      webhookPayload.organization?.id ||
      invoiceData.organization_id ||
      invoiceData.org_id ||
      invoiceData.organization?.id ||
      webhookPayload.event?.organization_id ||
      webhookPayload.event?.org_id ||
      webhookPayload.event?.data?.organization_id ||
      webhookPayload.event?.data?.org_id ||
      webhookPayload.payload?.organization_id ||
      webhookPayload.payload?.org_id ||
      null;

    const orgName =
      webhookPayload.organization_name ||
      webhookPayload.org_name ||
      webhookPayload.organization?.name ||
      invoiceData.organization_name ||
      invoiceData.org_name ||
      invoiceData.organization?.name ||
      webhookPayload.event?.organization_name ||
      webhookPayload.event?.org_name ||
      webhookPayload.event?.data?.organization_name ||
      webhookPayload.event?.data?.org_name ||
      webhookPayload.payload?.organization_name ||
      webhookPayload.payload?.org_name ||
      webhookPayload.company_name ||
      null;
    const invoiceId =
      invoiceData.invoice_id ||
      invoiceData.invoice_number ||
      invoiceData.id ||
      invoiceData.invoiceId ||
      `INV-${Date.now()}`;

    const invoiceNumber =
      invoiceData.invoice_number ||
      invoiceData.invoiceNumber ||
      invoiceData.invoice_id ||
      invoiceId;

    const customerName =
      invoiceData.customer_name ||
      invoiceData.customerName ||
      (invoiceData.customer && invoiceData.customer.customer_name) ||
      (invoiceData.customer && invoiceData.customer.name) ||
      invoiceData.customer_name ||
      "Unknown Customer";

    const amount = parseFloat(
      invoiceData.total ||
        invoiceData.grand_total ||
        invoiceData.amount ||
        invoiceData.invoice_amount ||
        0,
    );

    const currency =
      invoiceData.currency_code ||
      invoiceData.currencyCode ||
      invoiceData.currency ||
      "INR";

    const invoiceDate =
      invoiceData.invoice_date ||
      invoiceData.date ||
      invoiceData.created_time ||
      invoiceData.created_at ||
      new Date().toISOString();

    let paymentStatus = invoiceData.payment_status || invoiceData.status;

    // Smart fallback: Check the Zoho Event Type if status is missing
    const eventType = webhookPayload?.event?.type || "";
    if (!paymentStatus) {
      if (eventType.includes("payment") || eventType.includes("paid")) {
        paymentStatus = "paid";
      } else {
        paymentStatus = "created";
      }
    }

    // Normalize the data
    const rawStatus = (paymentStatus || "").toString().toLowerCase();
    const normalizedStatus =
      rawStatus === "paid" ||
      rawStatus === "payment_made" ||
      rawStatus === "payment_received" ||
      rawStatus === "fully_paid"
        ? "paid"
        : rawStatus || "created";
    const paymentData = {
      payment_id: invoiceNumber || invoiceId,
      invoice_id: invoiceId,
      invoice_number: invoiceNumber,
      customer_name: customerName,
      amount: amount,
      currency: currency,
      invoice_date: invoiceDate,
      status: normalizedStatus,
      source: "zoho_books",
      timestamp: new Date().toISOString(),
      organization_id: orgId,
      organization_name: orgName,
    };

    console.log("✅ Parsed Zoho Books invoice:", paymentData);
    return paymentData;
  } catch (error) {
    console.error("❌ Error parsing Zoho Books webhook:", error.message);
    console.error("Webhook payload:", JSON.stringify(webhookPayload));
    return null;
  }
}

/**
 * Format WhatsApp message for Zoho Books invoice
 * @param {Object} paymentData - Payment data from invoice
 * @returns {String} - Formatted WhatsApp message
 */
// function formatInvoiceWhatsAppMessage(paymentData) {
//   const { invoice_id, invoice_number, customer_name, amount, currency, invoice_date } = paymentData;

//   // Format date
//   let formattedDate = invoice_date;
//   try {
//     const date = new Date(invoice_date);
//     formattedDate = date.toLocaleDateString('en-IN', {
//       year: 'numeric',
//       month: 'short',
//       day: 'numeric'
//     });
//   } catch (e) {
//     // Use original date if parsing fails
//   }

//   const invoiceNumber = invoice_number || invoice_id || paymentData.payment_id;

//   // Optional organization details
//   const orgId = paymentData.organization_id;
//   const orgName = paymentData.organization_name;
//   let orgLines = '';
//   if (orgName && orgId) {
//     orgLines = `Organization: ${orgName} (${orgId})\n`;
//   } else if (orgName) {
//     orgLines = `Organization: ${orgName}\n`;
//   } else if (orgId) {
//     orgLines = `Organization ID: ${orgId}\n`;
//   }

//   const message = `🧾 New Invoice Created!\n\n` +
//     `Invoice ID: ${invoiceNumber}\n` +
//     `Customer: ${customer_name}\n` +
//     (orgLines ? orgLines : '') +
//     `Amount: ${currency} ${amount.toLocaleString('en-IN')}\n` +
//     `Date: ${formattedDate}\n` +
//     `Time: ${new Date().toLocaleString('en-IN')}\n\n` +
//     `Invoice has been created in Zoho Books!`;

//   return message;
// }
/**
 * Format WhatsApp message for Zoho Books invoice
 * @param {Object} paymentData - Payment data from invoice
 * @returns {String} - Formatted WhatsApp message
 */
function formatInvoiceWhatsAppMessage(paymentData) {
  const {
    invoice_id,
    invoice_number,
    customer_name,
    amount,
    currency,
    invoice_date,
    organization_id,
    organization_name,
  } = paymentData;

  // Safe fallbacks
  const invNum =
    invoice_number || invoice_id || paymentData.payment_id || "N/A";
  const custName = customer_name || "Unknown Customer";
  const orgName = organization_name || "N/A";
  const orgId = organization_id || "N/A";
  const curr = currency || "INR";
  const amt = (
    Number.isFinite(Number(amount)) ? Number(amount) : 0
  ).toLocaleString("en-IN");

  // Format date
  let formattedDate = invoice_date;
  try {
    const date = new Date(invoice_date);
    if (!isNaN(date.getTime())) {
      formattedDate = date.toLocaleDateString("en-IN", {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
    }
  } catch (_) {
    // keep original
  }

  const nowTime = new Date().toLocaleString("en-IN");

  // Dynamic text based on status
  const isPaid = (paymentData.status || '').toLowerCase() === 'paid';
  const headerText = isPaid ? `💰 *Payment Received*` : `🧾 *New Invoice Created*`;
  const footerText = isPaid ? `✅ Payment successfully recorded in Zoho Books.` : `✅ Invoice has been created in Zoho Books.`;

  // Message (org info ALWAYS included)
  const message =
    `${headerText}\n` +
    `• *Organization*: ${orgName} (ID: ${orgId})\n` +
    `• *Invoice No*: ${invNum}\n` +
    `• *Customer*: ${custName}\n` +
    `• *Amount*: ${curr} ${amt}\n` +
    `• *Date*: ${formattedDate}\n` +
    `• *Time*: ${nowTime}\n\n` +
    `${footerText}`;

  return message;
}

/**
 * Validate Zoho Books webhook (optional - for security)
 * @param {Object} webhookPayload - Webhook payload
 * @param {String} secret - Webhook secret (if configured)
 * @returns {Boolean} - True if valid
 */
function validateZohoWebhook(webhookPayload, secret = null) {
  // Add webhook validation logic here if needed
  // For example, verify signature, check headers, etc.

  // For now, just check if payload has invoice data
  if (!webhookPayload) {
    return false;
  }

  // Basic validation - check if it looks like a Zoho Books webhook
  const hasInvoiceData =
    webhookPayload.invoice ||
    webhookPayload.data?.invoice ||
    webhookPayload.invoice_id ||
    webhookPayload.invoice_number;

  return hasInvoiceData;
}

module.exports = {
  parseZohoBooksWebhook,
  formatInvoiceWhatsAppMessage,
  validateZohoWebhook,
};
