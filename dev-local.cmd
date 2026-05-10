@echo off
chcp 65001 >nul
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo No se encontró Node.js. Instálalo desde https://nodejs.org y vuelve a intentar.
  pause
  exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
  echo No se encontró npm. Reinstala Node.js desde https://nodejs.org
  pause
  exit /b 1
)

echo Carpeta del proyecto: %CD%
echo.

if not exist "node_modules\" (
  echo Primera vez: instalando dependencias ^(npm install^)...
  call npm install
  echo.
)

call npm run dev:local
echo.
if errorlevel 1 pause
