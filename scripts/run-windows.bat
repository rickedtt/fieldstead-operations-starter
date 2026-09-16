@echo off
setlocal
cd /d "%~dp0.."

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 22.13 or newer is required. See README-windows.md.
  exit /b 1
)

if not exist "node_modules" (
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0setup-windows.ps1"
  if errorlevel 1 exit /b 1
)

echo Building Fieldstead Systems Operations Starter...
call npm run build
if errorlevel 1 exit /b 1

echo Starting the local production server. Press Ctrl+C to stop.
call npm run start
endlocal
