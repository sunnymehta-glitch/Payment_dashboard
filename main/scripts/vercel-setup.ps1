<#
PowerShell Vercel setup script
- Encodes the service account JSON to base64
- Adds a Vercel secret named 'google-creds'
- Attempts to add env var `GOOGLE_CREDS_JSON` referencing the secret (may require interactive CLI)
- Triggers a production deploy
#>

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$root = Resolve-Path "$(Split-Path -Parent $MyInvocation.MyCommand.Definition)/.."
$credsPath = Join-Path $root 'server\credentials\google-credentials.json'

if (-not (Get-Command vercel -ErrorAction SilentlyContinue)) {
    Write-Error "vercel CLI not found. Install with: npm i -g vercel"
    exit 1
}

if (-not (Test-Path $credsPath)) {
    Write-Error "Credentials file not found at $credsPath. Place your service account JSON there."
    exit 1
}

Write-Host "Encoding credentials to base64..."
$raw = Get-Content $credsPath -Raw
$b64 = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($raw))

Write-Host "Removing existing secret (if any)..."
try { vercel secrets rm google-creds --yes } catch { }

Write-Host "Adding secret 'google-creds'..."
vercel secrets add google-creds $b64

Write-Host "Attempting to add environment variable 'GOOGLE_CREDS_JSON' referencing @google-creds (production)..."
try {
    vercel env add GOOGLE_CREDS_JSON "@google-creds" production
} catch {
    Write-Warning "Failed to add env var via CLI. Add manually in Vercel Dashboard: Name=GOOGLE_CREDS_JSON, Value=@google-creds, Environment=Production"
}

Write-Host "Deploying to Vercel (production)..."
vercel --prod --confirm

Write-Host "Done. Check Vercel for deployment URL and logs."
