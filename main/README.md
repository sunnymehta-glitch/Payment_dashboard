# 💰 Payment Broadcast (Financial Dashboard)

A full-stack webhook + dashboard app that receives Zoho Books invoice events or manual payment payloads, sends WhatsApp alerts, and logs results to Google Sheets (with CSV fallback). The React dashboard shows totals and outstanding invoices with auto-refresh.

## ✅ What’s In This Repo

```
payment-broadcast/
├── api/                     # Serverless entry (Vercel)
├── client/                  # React dashboard (frontend)
├── server/                  # Express API (backend)
├── logs/                    # CSV logs (auto-generated fallback)
├── scripts/                 # Vercel helper scripts
├── *.md                     # Setup guides
└── README.md
```

## 🔧 Prerequisites

- Node.js 16+ and npm
- Optional: Twilio WhatsApp account
- Optional: Google Sheets API credentials

## 🛠️ Local Setup

### 1) Install dependencies

```bash
cd /Users/ajeet/Aivox/payment-broadcast/server
npm install

cd /Users/ajeet/Aivox/payment-broadcast/client
npm install
```

### 2) Configure environment (optional but recommended)

Create `server/.env` from the template:

```bash
cd /Users/ajeet/Aivox/payment-broadcast/server
cp env.example.txt .env
```

Key variables (see the full list in `server/env.example.txt`):

```env
PORT=3001
TWILIO_ACCOUNT_SID=...
TWILIO_AUTH_TOKEN=...
TWILIO_FROM_NUMBER=+14155238886
TWILIO_TO_NUMBER=+1234567890
DEFAULT_CURRENCY=INR

SHEET_ID=...
GOOGLE_CREDS_PATH=./credentials/google-credentials.json
# or: GOOGLE_CREDS_JSON / GOOGLE_CREDENTIALS_JSON (raw JSON or base64)

ENABLE_SHEET_MONITORING=true
SHEET_MONITOR_INTERVAL=30
```

If Twilio or Google Sheets credentials are missing:
- WhatsApp sends run in mock mode (logs only).
- Payments are logged to `logs/payments.csv`.

### 3) Frontend API base (local)

The React app defaults to `/api`. For local dev (Express runs on `http://localhost:3001`), add:

```
REACT_APP_API_BASE=http://localhost:3001
```

Save it in `client/.env.local`, then restart the React dev server.

## ▶️ Run Locally

### Start backend (Express)

```bash
cd /Users/ajeet/Aivox/payment-broadcast/server
npm start
```

### Start frontend (React)

```bash
cd /Users/ajeet/Aivox/payment-broadcast/client
npm start
```

Open `http://localhost:3000` for the dashboard.

## 🧪 Test the Webhook

Option 1: use the included script

```bash
node /Users/ajeet/Aivox/payment-broadcast/test-webhook.js
```

Option 2: curl

```bash
curl -X POST http://localhost:3001/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "payment_id": "INV-2304",
    "customer_name": "Riya Mehta",
    "amount": 1200,
    "currency": "INR",
    "status": "created"
  }'
```

## 📡 API Endpoints (Express)

- `POST /webhook` — accept Zoho Books or manual payloads
- `GET /logs` — list all payments
- `GET /dashboard` — aggregated dashboard summary
- `GET /health` — health check (returns base URL too)

## 📨 Webhook Payloads

### Manual (simple JSON)

```json
{
  "payment_id": "INV-2304",
  "customer_name": "Riya Mehta",
  "amount": 1200,
  "currency": "INR",
  "status": "created"
}
```

Manual payloads require `payment_id`, `customer_name`, and `amount`.

### Zoho Books

The server recognizes Zoho payloads automatically. For the `invoice.created` event, it formats and sends an invoice summary message even if payment status is not yet paid.

## 🔔 WhatsApp Send Rules

- A WhatsApp alert is sent when the Zoho event is `invoice.created`.
- For manual payloads, WhatsApp is sent when `status` is `created` (case-insensitive).

## 📄 CSV Logging Fallback

If Google Sheets is not configured, the backend writes to `logs/payments.csv`.

## 📎 Useful Guides

- `QUICKSTART.md`
- `GOOGLE_SHEETS_SETUP.md`
- `ZOHO_BOOKS_SETUP.md`
- `MANUAL_ENTRY_GUIDE.md`
- `TESTING_GUIDE.md`
- `TROUBLESHOOTING_WHATSAPP.md`

## 🚀 Deployment Notes (Vercel)

- `api/index.js` exposes the Express app for serverless usage.
- Use the helper scripts in `scripts/` to set `GOOGLE_CREDS_JSON` on Vercel.
- In production, set `REACT_APP_API_BASE=/api` (or a full URL).
- Background sheet monitoring is disabled on serverless platforms.
