@echo off
setlocal
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start-docform-server.ps1"
exit /b %ERRORLEVEL%
