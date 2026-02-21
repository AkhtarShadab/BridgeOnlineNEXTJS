# WSL Network Access Setup Script
# Run this in PowerShell as Administrator on Windows

Write-Host "=== WSL Network Access Setup ===" -ForegroundColor Green

# Step 1: Set up port forwarding from Windows to WSL
Write-Host "`nStep 1: Setting up port forwarding..." -ForegroundColor Yellow
netsh interface portproxy add v4tov4 listenport=3000 listenaddress=0.0.0.0 connectport=3000 connectaddress=localhost

# Step 2: Allow port 3000 through Windows Firewall
Write-Host "`nStep 2: Configuring Windows Firewall..." -ForegroundColor Yellow
New-NetFirewallRule -DisplayName "WSL Dev Server Port 3000" -Direction Inbound -LocalPort 3000 -Protocol TCP -Action Allow -ErrorAction SilentlyContinue

# Step 3: Display network information
Write-Host "`nStep 3: Network Information" -ForegroundColor Yellow
Write-Host "Your Windows IP addresses:" -ForegroundColor Cyan
Get-NetIPAddress -AddressFamily IPv4 | Where-Object {$_.IPAddress -notlike "127.*" -and $_.IPAddress -notlike "169.*"} | Select-Object IPAddress, InterfaceAlias | Format-Table

Write-Host "`n=== Setup Complete! ===" -ForegroundColor Green
Write-Host "`nNext steps:" -ForegroundColor Cyan
Write-Host "1. Find your WiFi adapter's IP address above (usually starts with 192.168.x.x)" -ForegroundColor White
Write-Host "2. On your other laptop, open browser and go to: http://YOUR_WINDOWS_IP:3000" -ForegroundColor White
Write-Host "   (Replace YOUR_WINDOWS_IP with the IP from step 1)" -ForegroundColor White
Write-Host "`nExample: http://192.168.1.100:3000" -ForegroundColor Gray

Write-Host "`nPress any key to exit..." -ForegroundColor DarkGray
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
