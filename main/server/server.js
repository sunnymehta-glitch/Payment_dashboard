const dotenv = require('dotenv');
dotenv.config(); // ⚠️ Must be FIRST — before any other require() that reads process.env

const express = require('express');
const cors = require('cors');
const webhookController = require('./controllers/webhookController');
const logsController = require('./controllers/logsController');
const dashboardController = require('./controllers/dashboardController');
const whatsappController = require('./controllers/whatsappController');
const sheetMonitor = require('./services/sheetMonitor');


const app = express();
const PORT = process.env.PORT || 3001;
const MONITOR_INTERVAL = parseInt(process.env.SHEET_MONITOR_INTERVAL, 10) || 30; // Check every 30 seconds
const isServerless = Boolean(process.env.VERCEL || process.env.SERVERLESS);

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.post('/webhook', webhookController.handleWebhook);
app.get('/logs', logsController.getLogs);
app.get('/dashboard', dashboardController.getSummary);
app.get('/whatsapp/status', whatsappController.checkMessageStatus);
app.get('/health', (req, res) => {
  // Determine the server base URL. Prefer explicit env var, otherwise derive from request.
  const explicitBase = process.env.SERVER_BASE_URL && process.env.SERVER_BASE_URL.trim();
  const derivedBase = `${req.protocol}://${req.get('host')}`;
  const baseUrl = explicitBase || derivedBase;

  res.json({ status: 'ok', timestamp: new Date().toISOString(), baseUrl });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({ error: 'Internal server error', message: err.message });
});

function startSheetMonitor() {
  if (isServerless) {
    console.log('�s���? Sheet monitoring disabled in serverless environments.');
    return;
  }

  // Start monitoring Google Sheets for manual entries (after a delay to ensure sheets are initialized)
  setTimeout(() => {
    if (process.env.ENABLE_SHEET_MONITORING !== 'false') {
      sheetMonitor.startMonitoring(MONITOR_INTERVAL);
      console.log(`�Y"S Sheet monitoring enabled (checking every ${MONITOR_INTERVAL} seconds)`);
      console.log('�Y\'� Manual sheet entries will trigger WhatsApp notifications!');
    } else {
      console.log('�s���? Sheet monitoring disabled (set ENABLE_SHEET_MONITORING=false to disable)');
    }
  }, 5000); // Wait 5 seconds for sheets to initialize
}

function startSheetMonitorIfNeeded() {
  if (!isServerless) {
    startSheetMonitor();
  }
}

function tryListen(startPort, maxAttempts = 5) {
  let attempt = 0;

  function listenOn(port) {
    attempt += 1;
    const server = app.listen(port);

    server.on('listening', () => {
      const addr = server.address();
      const usedPort = typeof addr === 'string' ? addr : addr.port;
      const baseUrl = process.env.SERVER_BASE_URL || `http://localhost:${usedPort}`;
      console.log(`\u001b[32m✅ Server running on port ${usedPort}\u001b[0m`);
      console.log(`Health check: ${baseUrl}/health`);
      console.log(`Webhook endpoint: ${baseUrl}/webhook`);
      console.log(`Logs endpoint: ${baseUrl}/logs`);
      console.log(`WhatsApp status: ${baseUrl}/whatsapp/status?messageSid=SM...`);
      // Only start monitor after server successfully starts
      startSheetMonitorIfNeeded();
    });

    server.on('error', (err) => {
      if (err && err.code === 'EADDRINUSE') {
        console.warn(`⚠️ Port ${port} is already in use.`);
        if (attempt < maxAttempts) {
          const nextPort = port + 1;
          console.log(`Trying next port: ${nextPort} (attempt ${attempt + 1}/${maxAttempts})`);
          // Small delay before retrying
          setTimeout(() => listenOn(nextPort), 300);
        } else {
          console.error(`❌ All ${maxAttempts} attempts failed. Port ${startPort}..${port} are in use. Exiting.`);
          process.exit(1);
        }
      } else {
        console.error('Server error:', err);
        process.exit(1);
      }
    });
  }

  listenOn(startPort);
}

if (require.main === module) {
  tryListen(PORT, 5);
} else {
  // When required as a module (e.g., in serverless), don't start a listening server here.
  // But if running in a traditional environment where VERCEL isn't set, start monitor.
  startSheetMonitorIfNeeded();
}

module.exports = app;
