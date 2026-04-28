const whatsappService = require('../services/whatsapp');

/**
 * Check the status of a WhatsApp message
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function checkMessageStatus(req, res) {
  try {
    const { messageSid } = req.query;

    if (!messageSid) {
      return res.status(400).json({
        success: false,
        error: 'Missing messageSid parameter',
        message: 'Provide messageSid as query parameter: /whatsapp/status?messageSid=SM...'
      });
    }

    const result = await whatsappService.checkMessageStatus(messageSid);

    if (!result.success) {
      return res.status(500).json(result);
    }

    res.json({
      success: true,
      message: result
    });
  } catch (error) {
    console.error('Check message status error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to check message status',
      message: error.message
    });
  }
}

module.exports = {
  checkMessageStatus
};
