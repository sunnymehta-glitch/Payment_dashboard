// Vercel Serverless entrypoint for /logs
const logsController = require('../server/controllers/logsController');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.statusCode = 200;
    return res.end();
  }

  if (req.method !== 'GET') {
    res.statusCode = 405;
    return res.end(JSON.stringify({ success: false, error: 'Method not allowed' }));
  }

  try {
    await logsController.getLogs(req, res);
  } catch (err) {
    res.statusCode = 500;
    res.end(JSON.stringify({ success: false, error: 'Internal error', message: err.message }));
  }
};

