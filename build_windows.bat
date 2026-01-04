@echo off
setlocal enabledelayedexpansion

echo ================================
echo Salon Inventory - Build Installer (Windows)
echo ================================
echo.

REM --- Check Node is installed ---
for /f "tokens=1 delims=." %%a in ('node -p "process.versions.node" 2^>nul') do set NODEMAJOR=%%a

if "%NODEMAJOR%"=="" (
  echo ERROR: Node.js is not installed or not in PATH.
  echo Install Node.js 20 LTS from https://nodejs.org/en/download
  pause
  exit /b 1
)

REM --- Enforce Node 20/22 (avoid Node 23+) ---
if %NODEMAJOR% GEQ 23 (
  echo ERROR: Your Node.js version is too new: %NODEMAJOR%.
  echo Install Node.js 20 LTS (recommended) or Node 22.
  pause
  exit /b 1
)

echo Using Node major version: %NODEMAJOR%
echo.

echo Moving build folder to a safe path is recommended:
echo   C:\SalonInventoryBuild\
echo.

REM --- Clean ---
echo Cleaning old installs...
if exist node_modules rmdir /s /q node_modules
if exist package-lock.json del /q package-lock.json
if exist dist rmdir /s /q dist
if exist dist_electron rmdir /s /q dist_electron

echo.
echo 1) Installing dependencies...
call npm install
if errorlevel 1 goto :err

echo.
echo 2) Packaging installer...
call npm run dist
if errorlevel 1 goto :err

echo.
echo DONE.
echo Look in: dist_electron\
pause
exit /b 0

:err
echo.
echo Build failed.
echo Fixes:
echo  - Move folder to C:\SalonInventoryBuild\ (avoid Downloads/OneDrive)
echo  - Temporarily disable antivirus if you see EPERM permission errors
pause
exit /b 1
