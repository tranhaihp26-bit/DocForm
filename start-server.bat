@echo off
cd /d "%~dp0"
set PORT=%1
if "%PORT%"=="" set PORT=3000

echo ===================================================================
echo   DOCFORM 30 STUDIO - CHUAN THE THUC ND 30 & HD 05
echo   Dang khoi dong tai cong: http://localhost:%PORT%
echo ===================================================================
echo Nhan Ctrl+C de dung server.
echo.

call npm run dev -- --port %PORT%
pause
