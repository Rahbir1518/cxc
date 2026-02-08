# ──────────────────────────────────────────────────────────────
#  DWS — Start LocalTunnel for HTTPS access on iPhone
#
#  This exposes your backend (port 8000) via an HTTPS URL
#  so your iPhone can access camera/microphone over a secure
#  context.
#
#  Usage:
#    .\start-tunnel.ps1                  # random subdomain
#    .\start-tunnel.ps1 -subdomain dws   # custom subdomain (https://dws.loca.lt)
#
#  IMPORTANT: Make sure your backend is running first!
#    cd backend && python main.py
# ──────────────────────────────────────────────────────────────

param(
    [string]$subdomain = "",
    [int]$port = 8000
)

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  DWS — LocalTunnel HTTPS Gateway" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Backend port: $port" -ForegroundColor Gray
Write-Host ""

# Check if backend is running
try {
    $response = Invoke-WebRequest -Uri "http://localhost:$port/health" -TimeoutSec 3 -ErrorAction Stop
    Write-Host "  [OK] Backend is running on port $port" -ForegroundColor Green
} catch {
    Write-Host "  [!!] Backend not detected on port $port" -ForegroundColor Yellow
    Write-Host "       Start it first: cd backend && python main.py" -ForegroundColor Yellow
    Write-Host ""
}

Write-Host ""
Write-Host "  Starting localtunnel..." -ForegroundColor Cyan
Write-Host "  (Press Ctrl+C to stop)" -ForegroundColor Gray
Write-Host ""

if ($subdomain) {
    Write-Host "  Requesting subdomain: $subdomain" -ForegroundColor Gray
    Write-Host "  Expected URL: https://$subdomain.loca.lt" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "  ── On your iPhone, open: ──" -ForegroundColor Green
    Write-Host "  Phone:   https://$subdomain.loca.lt/static/camera_test.html" -ForegroundColor White
    Write-Host "  Glasses: https://$subdomain.loca.lt/static/glasses_feed.html" -ForegroundColor White
    Write-Host ""
    Write-Host "  NOTE: First visit will show a reminder page." -ForegroundColor Yellow
    Write-Host "        Click 'Click to Continue' to bypass it." -ForegroundColor Yellow
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host ""
    npx localtunnel --port $port --subdomain $subdomain
} else {
    Write-Host "  ── Watch the output below for your HTTPS URL ──" -ForegroundColor Green
    Write-Host "  Then open on your iPhone:" -ForegroundColor Green
    Write-Host "    <URL>/static/camera_test.html   (phone feed)" -ForegroundColor White
    Write-Host "    <URL>/static/glasses_feed.html  (meta glasses)" -ForegroundColor White
    Write-Host ""
    Write-Host "  NOTE: First visit will show a reminder page." -ForegroundColor Yellow
    Write-Host "        Click 'Click to Continue' to bypass it." -ForegroundColor Yellow
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host ""
    npx localtunnel --port $port
}
