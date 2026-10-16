@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>&1
if errorlevel 1 (
  echo Install Node.js 22 or newer, then reopen this file.
  echo See docs\Windows.md for installation instructions.
  pause
  exit /b 1
)
node scripts\launch.mjs
if errorlevel 1 (
  echo Launch failed. See the message above and docs\Windows.md.
  pause
  exit /b 1
)
