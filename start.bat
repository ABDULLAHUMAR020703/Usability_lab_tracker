@echo off
rem Consumer Insights Hub - one-click launcher (Windows)
cd /d "%~dp0"
where node >nul 2>nul || (echo Node.js 22.13 or newer is required. Install it from https://nodejs.org & pause & exit /b 1)

rem If the code changed since the last build (e.g. after "git pull"), reinstall dependencies and rebuild the interface.
set "HEADREV="
set "STAMP="
where git >nul 2>nul && if exist ".git" for /f %%h in ('git rev-parse HEAD 2^>nul') do set "HEADREV=%%h"
if exist ".build-stamp" set /p STAMP=<".build-stamp"
set "NEEDBUILD="
if not exist "backend\node_modules" set "NEEDBUILD=1"
if not exist "frontend\dist\index.html" set "NEEDBUILD=1"
if defined HEADREV if not "%HEADREV%"=="%STAMP%" set "NEEDBUILD=1"

if defined NEEDBUILD (
  echo Installing dependencies and building the interface - first run or after an update...
  call npm run setup || (echo Install failed & pause & exit /b 1)
  call npm run build || (echo Build failed & pause & exit /b 1)
  if defined HEADREV (>".build-stamp" echo %HEADREV%)
)
if not exist ".env" copy ".env.example" ".env" >nul

echo Starting Consumer Insights Hub...
start "" "http://localhost:4000"
call npm start
pause
