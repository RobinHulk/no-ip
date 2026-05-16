@echo off
setlocal

cd /d "%~dp0"
npm run confirm

echo.
echo Presiona una tecla para cerrar esta ventana...
pause >nul
