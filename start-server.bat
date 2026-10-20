@echo off
cd /d "%~dp0"
set NODE=node
set TSX=node_modules\tsx\dist\cli.mjs

set PORT=%1
if "%PORT%"=="" set PORT=3000

echo ===================================================================
echo   DOCFORM 30 STUDIO - CHUAN THE THUC ND 30 & HD 05
echo   Dang khoi dong tai cong: http://localhost:%PORT%
echo ===================================================================
echo Nhan Ctrl+C de dung server.
echo.

%NODE% "%TSX%" server.ts --port %PORT%
pause

