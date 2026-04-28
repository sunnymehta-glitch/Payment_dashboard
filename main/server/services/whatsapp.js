const twilio = require('twilio');
const dotenv = require('dotenv');

dotenv.config();

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const fromNumber = process.env.TWILIO_FROM_NUMBER;
const toNumber = process.env.TWILIO_TO_NUMBER;

// Check if Twilio credentials are available
const isTwilioConfigured = accountSid && authToken && fromNumber && toNumber;

let twilioClient = null;

if (isTwilioConfigured) {
  try {
    twilioClient = twilio(accountSid, authToken);
    console.log('✅ Twilio client initialized');
    console.log('📱 Twilio WhatsApp Configuration:', {
      from: `whatsapp:${fromNumber}`,
      to: `whatsapp:${toNumber}`,
      accountSid: accountSid.substring(0, 10) + '...' // Show partial SID for verification
    });
  } catch (error) {
    console.warn('⚠️ Failed to initialize Twilio client:', error.message);
  }
} else {
  console.warn('⚠️ Twilio credentials not found. Using mock mode.');
  console.warn('💡 To enable WhatsApp, set: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER, TWILIO_TO_NUMBER');
}

/**
 * Send WhatsApp alert for payment
 * @param {Object} paymentData - Payment information
 * @param {String} customMessage - Optional custom message (for invoices)
 * @returns {Promise<Object>} - Response from Twilio or mock response
 */
async function sendWhatsAppAlert(paymentData, customMessage = null) {
  const { payment_id, customer_name, amount, currency = 'INR' } = paymentData;

  // Use custom message if provided (for invoices), otherwise use default
  const message = customMessage || (
    `💰 Payment Alert!\n\n` +
    `Payment ID: ${payment_id}\n` +
    `Customer: ${customer_name}\n` +
    `Amount: ${currency} ${amount}\n` +
    `Time: ${new Date().toLocaleString()}\n\n` +
    `Thank you for your payment!`
  );

  // If Twilio is not configured, return mock response
  if (!isTwilioConfigured || !twilioClient) {
    console.log('📱 [MOCK] WhatsApp Alert:', {
      to: toNumber || '+1234567890',
      message: message.substring(0, 50) + '...',
      status: 'sent (mock)'
    });
    return {
      success: true,
      mock: true,
      message: 'WhatsApp alert sent (mock mode)',
      timestamp: new Date().toISOString()
    };
  }

  try {
    // Send WhatsApp message via Twilio
    const messageResponse = await twilioClient.messages.create({
      from: `whatsapp:${fromNumber}`,
      to: `whatsapp:${toNumber}`,
      body: message
    });

    // Log detailed information about the message
    console.log('📱 WhatsApp message details:', {
      sid: messageResponse.sid,
      status: messageResponse.status,
      from: `whatsapp:${fromNumber}`,
      to: `whatsapp:${toNumber}`,
      errorCode: messageResponse.errorCode || null,
      errorMessage: messageResponse.errorMessage || null,
      dateCreated: messageResponse.dateCreated
    });

    // Check if message was accepted by Twilio
    if (messageResponse.status === 'queued' || messageResponse.status === 'sent' || messageResponse.status === 'delivered') {
      console.log(`✅ WhatsApp alert sent: ${messageResponse.sid} (Status: ${messageResponse.status})`);
      
      // If status is queued, warn that delivery is pending
      if (messageResponse.status === 'queued') {
        console.log('⚠️ Message is queued. Delivery status will be updated by Twilio.');
        console.log('💡 Check Twilio dashboard for delivery status, or wait a few seconds and check message status.');
      }
    } else if (messageResponse.status === 'failed' || messageResponse.status === 'undelivered') {
      console.error(`❌ WhatsApp message failed: ${messageResponse.sid}`);
      console.error(`   Status: ${messageResponse.status}`);
      console.error(`   Error Code: ${messageResponse.errorCode || 'N/A'}`);
      console.error(`   Error Message: ${messageResponse.errorMessage || 'N/A'}`);
      throw new Error(`WhatsApp message failed: ${messageResponse.errorMessage || messageResponse.status}`);
    } else {
      console.warn(`⚠️ WhatsApp message status: ${messageResponse.status} (SID: ${messageResponse.sid})`);
    }

    return {
      success: true,
      mock: false,
      messageSid: messageResponse.sid,
      status: messageResponse.status,
      errorCode: messageResponse.errorCode || null,
      errorMessage: messageResponse.errorMessage || null,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    console.error('❌ Failed to send WhatsApp alert:', error.message);
    
    // Provide more helpful error messages
    if (error.code === 21211) {
      console.error('💡 Error: Invalid "To" phone number. Check TWILIO_TO_NUMBER format (should be +1234567890)');
    } else if (error.code === 21212) {
      console.error('💡 Error: Invalid "From" phone number. Check TWILIO_FROM_NUMBER format (should be +1234567890)');
    } else if (error.code === 21608) {
      console.error('💡 Error: Unsubscribed recipient. The recipient may need to opt-in to receive WhatsApp messages.');
    } else if (error.code === 21610) {
      console.error('💡 Error: Recipient not opted in. For paid Twilio numbers, ensure recipient has opted in or is within 24-hour window.');
    }
    
    throw new Error(`WhatsApp alert failed: ${error.message}`);
  }
}

/**
 * Check the status of a sent WhatsApp message
 * @param {String} messageSid - The message SID from Twilio
 * @returns {Promise<Object>} - Message status information
 */
async function checkMessageStatus(messageSid) {
  if (!isTwilioConfigured || !twilioClient) {
    return {
      success: false,
      error: 'Twilio not configured'
    };
  }

  try {
    const message = await twilioClient.messages(messageSid).fetch();
    return {
      success: true,
      sid: message.sid,
      status: message.status,
      errorCode: message.errorCode || null,
      errorMessage: message.errorMessage || null,
      dateCreated: message.dateCreated,
      dateSent: message.dateSent || null,
      dateUpdated: message.dateUpdated
    };
  } catch (error) {
    console.error('❌ Failed to check message status:', error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

module.exports = {
  sendWhatsAppAlert,
  checkMessageStatus,
  isTwilioConfigured
};

