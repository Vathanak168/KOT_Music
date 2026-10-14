@echo off
title KOT Music Server
echo ====================================================
echo             🎵 KOT Music is Starting...
echo ====================================================
echo.
cd /d "%~dp0"
echo Opening browser...
start http://localhost:3000
echo Running server...
npm start
pause
