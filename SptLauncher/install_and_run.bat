@echo off
cd /d "%~dp0"
echo Installing dependencies...
"C:\Program Files\nodejs\npm.cmd" install
echo.
echo Starting SPT Launcher in dev mode...
"C:\Program Files\nodejs\npm.cmd" run dev
pause
