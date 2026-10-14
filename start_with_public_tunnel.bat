@echo off
title KOT Music Server + Public Cloudflare Tunnel
echo ====================================================
echo      🎵 KOT Music Server + 🌐 Public Internet Link
echo ====================================================
echo.
cd /d "%~dp0"

echo [1/2] Starting Local Server on Port 3000...
start "KOT Music Server" cmd /k "node server.js"

timeout /t 2 /nobreak >nul

echo [2/2] Starting Cloudflare Public Tunnel (Free HTTPS)...
start "Cloudflare Tunnel" cmd /k "cloudflared.exe tunnel --protocol http2 --url http://localhost:3000"

echo.
echo ====================================================
echo  ✅ Server and Cloudflare Tunnel are now active!
echo  👉 Check the Cloudflare window to see your
echo     https://xxxx.trycloudflare.com link.
echo ====================================================
echo.
pause
