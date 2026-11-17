@echo off
chcp 65001 >nul
title Yuhan Portfolio - local preview
cd /d "%~dp0"
set "PORT=8137"
set "URL=http://127.0.0.1:%PORT%/index.html"

rem If the port is already taken, a server is running: just open the browser.
netstat -ano | findstr /c:":%PORT% " >nul 2>nul
if %errorlevel%==0 (
  echo Server already running on port %PORT%. Opening browser...
  start "" "%URL%"
  exit /b
)

echo Starting local server on port %PORT% ...
echo The browser will open by itself in a few seconds.

rem The server runs on Windows PowerShell, so no Python install is needed.
rem -Open makes it launch the browser only after the port is really listening.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0serve.ps1" -Port %PORT% -Open

echo.
echo Server stopped. Close this window, or run this file again to restart.
pause
