@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Please install Node.js 22+ first: https://nodejs.org/
  pause
  exit /b 1
)
if not exist node_modules\wrangler\bin\wrangler.js (
  call npm ci --include=dev
  if errorlevel 1 exit /b 1
)
node scripts\cloud-setup.mjs
if errorlevel 1 pause
