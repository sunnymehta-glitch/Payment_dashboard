// Vercel Serverless entrypoint for /webhook
const webhookController = require('../server/controllers/webhookController');

module.exports = async (req, res) => {
  // CORS (optional)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Webhook-Secret');

  if (req.method === 'OPTIONS') {
    res.statusCode = 200;
    return res.end();
  }

  // For convenience, make GET return a friendly message instead of error
  if (req.method === 'GET') {
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({
      ok: true,
      route: 'webhook',
      message: 'Send a POST with JSON body from Zoho Books to trigger.'
    }));
  }

  if (req.method !== 'POST') {
    res.statusCode = 405;
    return res.end(JSON.stringify({ success: false, error: 'Method not allowed' }));
  }

  // Ensure JSON body is parsed
  if (typeof req.body === 'undefined' || req.body === null) {
    try {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const raw = Buffer.concat(chunks).toString('utf8');
      req.body = raw ? JSON.parse(raw) : {};
    } catch (e) {
      res.statusCode = 400;
      return res.end(JSON.stringify({ success: false, error: 'Invalid JSON body' }));
    }
  }

  try {
    // Reuse existing Express-style controller
    await webhookController.handleWebhook(req, res);
  } catch (err) {
    res.statusCode = 500;
    res.end(JSON.stringify({ success: false, error: 'Internal error', message: err.message }));
  }
};
