@echo off
rem Consumer Insights Hub - one-click launcher (Windows)
cd /d "%~dp0"
where node >nul 2>nul || (echo Node.js 22.13 or newer is required. Install it from https://nodejs.org & pause & exit /b 1)

if not exist "backend\node_modules" (
  echo Installing dependencies - first run only...
  call npm run setup || (echo Install failed & pause & exit /b 1)
)
if not exist "frontend\dist\index.html" (
  echo Building the interface - first run only...
  call npm run build || (echo Build failed & pause & exit /b 1)
)
if not exist ".env" copy ".env.example" ".env" >nul

echo Starting Consumer Insights Hub...
start "" "http://localhost:4000"
call npm start
pause
