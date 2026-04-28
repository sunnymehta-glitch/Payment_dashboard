# 📊 Google Sheets Setup Guide (Demo के लिए)

## 🎯 Google Sheet में क्या-क्या Fill करना है?

### Option 1: Automatic Setup (Recommended) ✅

**आपको कुछ भी manually fill करने की जरूरत नहीं है!**

जब आप पहली बार server start करते हैं, system automatically:
- Headers create करेगा
- Column structure setup करेगा

**बस ये steps follow करें:**

1. **Google Sheet बनाएं:**
   - [Google Sheets](https://sheets.google.com) पर जाएं
   - नया sheet बनाएं (या existing sheet use करें)
   - Sheet का नाम कुछ भी रख सकते हैं (जैसे: "Payment Logs")

2. **Service Account को Access दें:**
   - Sheet को `shet-bot@payment-477508.iam.gserviceaccount.com` email के साथ share करें
   - Permission: **Editor** दें

3. **Sheet ID निकालें:**
   - Sheet के URL से ID copy करें
   - Example: `https://docs.google.com/spreadsheets/d/YOUR_SHEET_ID_HERE/edit`
   - `YOUR_SHEET_ID_HERE` part को copy करें

4. **Server में Configure करें:**
   - `server/.env` file में add करें:
   ```
   SHEET_ID=YOUR_SHEET_ID_HERE
   GOOGLE_CREDS_PATH=./credentials/google-credentials.json
   ```

5. **Server Start करें:**
   ```bash
   cd server
   npm start
   ```

System automatically headers create कर देगा! 🎉

---

### Option 2: Manual Setup (अगर चाहें तो)

अगर आप manually headers add करना चाहते हैं, तो:

**Google Sheet में ये Columns बनाएं (Row 1 में):**

| Payment ID | Customer Name | Amount | Currency | Timestamp | Status |
|------------|---------------|--------|----------|-----------|--------|
|            |               |        |          |           |        |

**Column Names (exactly ये ही names use करें):**
- Column A: `Payment ID`
- Column B: `Customer Name`
- Column C: `Amount`
- Column D: `Currency`
- Column E: `Timestamp`
- Column F: `Status`

---

## 📝 Demo के लिए Sample Data

Webhook test करने के बाद, automatically ये data fill होगा:

| Payment ID | Customer Name | Amount | Currency | Timestamp | Status |
|------------|---------------|--------|----------|-----------|--------|
| INV-2304 | Riya Mehta | 1200 | INR | 2024-01-01T12:00:00.000Z | Processed |

**Example Webhook Request:**
```json
{
  "payment_id": "INV-2304",
  "customer_name": "Riya Mehta",
  "amount": 1200,
  "currency": "INR"
}
```

---

## ✅ Verification Steps

1. **Server Start करने के बाद check करें:**
   ```
   ✅ Google Sheets initialized: Your Sheet Name
   ```

2. **Webhook Test करें:**
   ```bash
   node test-webhook.js
   ```

3. **Google Sheet में Check करें:**
   - Sheet automatically refresh होगा
   - नया payment row automatically add होगा

4. **Dashboard में Check करें:**
   - `http://localhost:3000` पर जाएं
   - Payment list में नया payment दिखेगा

---

## 🔧 Troubleshooting

### Problem: "Google Sheets credentials not found"
**Solution:** 
- Check करें कि `server/.env` file में `SHEET_ID` और `GOOGLE_CREDS_PATH` properly set हैं
- `google-credentials.json` file का path सही है या नहीं

### Problem: "Failed to initialize Google Sheets"
**Solution:**
- Service Account email को sheet share करें
- Permission **Editor** दें (Viewer नहीं)
- Sheet ID सही है या नहीं check करें

### Problem: Data नहीं दिख रहा
**Solution:**
- Sheet में manually headers add करें (ऊपर देखें)
- Server restart करें
- Webhook फिर से test करें

---

## 📌 Quick Checklist

- [ ] Google Sheet बनाया
- [ ] Service Account को Editor permission दी
- [ ] Sheet ID copy किया
- [ ] `server/.env` में `SHEET_ID` और `GOOGLE_CREDS_PATH` set किया
- [ ] Server start किया
- [ ] "Google Sheets initialized" message देखा
- [ ] Webhook test किया
- [ ] Sheet में data verify किया

---

## 💡 Important Notes

1. **Headers Automatic:** System automatically headers create करता है, manually करने की जरूरत नहीं
2. **Data Format:** Amount numbers में होना चाहिए, Currency text (INR, USD, etc.)
3. **Timestamp:** Automatically ISO format में add होता है
4. **Status:** Automatically "Processed" set होता है

**Demo के लिए बस server start करें और webhook test करें - बाकी automatically हो जाएगा! 🚀**

