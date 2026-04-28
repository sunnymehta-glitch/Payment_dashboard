#!/usr/bin/env bash
set -euo pipefail

# Vercel setup script (bash)
# - base64-encodes local service account JSON
# - creates a Vercel secret named `google-creds`
# - attempts to add env var `GOOGLE_CREDS_JSON` referencing the secret (may require interactive CLI)
# - triggers a production deploy

ROOT_DIR=$(cd "$(dirname "$0")/.." && pwd)
CREDS_PATH="$ROOT_DIR/server/credentials/google-credentials.json"

if ! command -v vercel >/dev/null 2>&1; then
  echo "Error: vercel CLI not found. Install it with: npm i -g vercel" >&2
  exit 1
fi

if [ ! -f "$CREDS_PATH" ]; then
  echo "Error: credentials file not found at $CREDS_PATH" >&2
  echo "Place your service-account JSON at: $CREDS_PATH" >&2
  exit 1
fi

echo "Encoding credentials to base64..."
B64=$(base64 -w0 "$CREDS_PATH" 2>/dev/null || base64 "$CREDS_PATH" | tr -d '\n')

echo "Adding/verifying Vercel secret 'google-creds'..."
# Remove existing secret if exists (ignore errors)
set +e
vercel secrets rm google-creds --yes >/dev/null 2>&1
set -e

vercel secrets add google-creds "$B64"
if [ $? -ne 0 ]; then
  echo "Failed to add secret via CLI. You can add it manually in Vercel Dashboard under Project > Settings > Secrets." >&2
  exit 1
fi

echo "Attempting to add environment variable 'GOOGLE_CREDS_JSON' referencing @google-creds (production)..."
set +e
vercel env add GOOGLE_CREDS_JSON "@google-creds" production
ADD_STATUS=$?
set -e
if [ "$ADD_STATUS" -ne 0 ]; then
  echo "Could not add env var via CLI. Please open Vercel Dashboard -> Project -> Settings -> Environment Variables and add:`" >&2
  echo "  Name: GOOGLE_CREDS_JSON" >&2
  echo "  Value: @google-creds" >&2
  echo "  Environment: Production" >&2
fi

echo "Deploying to Vercel (production)..."
vercel --prod --confirm

echo "Done. Check the Vercel dashboard for logs and the deployment URL."
