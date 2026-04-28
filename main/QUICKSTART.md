# 🚀 Quick Start Guide

Get the Financial Dashboard up and running in 5 minutes!

## Step 1: Install Dependencies

```bash
# Install all dependencies (backend + frontend)
npm run install:all

# Or install separately:
cd server && npm install
cd ../client && npm install
```

## Step 2: Configure Environment (Optional)

The system works without any configuration using mock/fallback modes!

**For production, create `server/.env`:**

```bash
cd server
cp env.example.txt .env
# Edit .env with your credentials
```

**Note**: You can skip this step for testing - the system will:
- Use mock WhatsApp mode (logs to console)
- Use CSV file logging (saved to `logs/payments.csv`)

## Step 3: Start the Backend

```bash
cd server
npm start
```

You should see:
```
🚀 Server running on port 3001
📊 Health check: http://localhost:3001/health
📥 Webhook endpoint: http://localhost:3001/webhook
📋 Logs endpoint: http://localhost:3001/logs
```

## Step 4: Start the Frontend

Open a new terminal:

```bash
cd client
npm start
```

The React app will open at `http://localhost:3000`

## Step 5: Test the Webhook

**Option 1: Using the test script**
```bash
node test-webhook.js
```

**Option 2: Using curl**
```bash
curl -X POST http://localhost:3001/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "payment_id": "INV-2304",
    "customer_name": "Riya Mehta",
    "amount": 1200,
    "currency": "INR"
  }'
```

**Option 3: Using Postman/Insomnia**
- POST to `http://localhost:3001/webhook`
- Body: JSON
```json
{
  "payment_id": "INV-2304",
  "customer_name": "Riya Mehta",
  "amount": 1200,
  "currency": "INR"
}
```

## ✅ Verify It's Working

1. Check the backend console - you should see payment logged
2. Check the dashboard at `http://localhost:3000` - payment should appear
3. Check `logs/payments.csv` - payment should be logged there

## 📱 Setting Up WhatsApp (Optional)

1. Sign up at [Twilio](https://www.twilio.com/)
2. Get a WhatsApp-enabled number
3. Add to `server/.env`:
   ```
   TWILIO_ACCOUNT_SID=your_sid
   TWILIO_AUTH_TOKEN=your_token
   TWILIO_FROM_NUMBER=+1234567890
   TWILIO_TO_NUMBER=+0987654321
   ```

## 📊 Setting Up Google Sheets (Optional)

1. Create a Google Cloud Project
2. Enable Sheets API
3. Create Service Account & download JSON
4. Share your Google Sheet with service account email
5. Add to `server/.env`:
   ```
   SHEET_ID=your_sheet_id
   GOOGLE_CREDS_PATH=./credentials/google-credentials.json
   ```

## 🎉 You're All Set!

The dashboard will auto-refresh every 5 seconds. Try sending multiple test webhooks to see the real-time updates!

