@echo off
title Cloudflare Public Tunnel for KOT Music
echo ====================================================
echo      🌐 Starting Cloudflare Public Tunnel
echo ====================================================
echo.
cd /d "%~dp0"
echo Forwarding http://localhost:3000 to public internet...
cloudflared.exe tunnel --protocol http2 --url http://localhost:3000
pause
