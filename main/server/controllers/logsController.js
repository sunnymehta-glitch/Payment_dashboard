const sheetsService = require('../services/sheets');

/**
 * Get all payment logs
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function getLogs(req, res) {
  try {
    const payments = await sheetsService.getAllPayments();

    // Sort by timestamp (newest first)
    payments.sort((a, b) => {
      const timeA = new Date(a.timestamp || 0).getTime();
      const timeB = new Date(b.timestamp || 0).getTime();
      return timeB - timeA;
    });

    res.json({
      success: true,
      count: payments.length,
      payments: payments,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Get logs error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve logs',
      message: error.message
    });
  }
}

module.exports = {
  getLogs
};

