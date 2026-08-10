@echo off
title mdictfe dev server
cd /d "%~dp0"

netstat -ano 2>nul | findstr /r ":3000.*LISTENING" >nul
if errorlevel 1 goto start

echo mdictfe already running: http://localhost:3000
echo.
set /p act=Choose [Enter]=open browser / [r]=restart / [q]=quit :
if /i "%act%"=="q" exit /b 0
if /i "%act%"=="r" goto restart
start "" http://localhost:3000
exit /b 0

:restart
for /f "tokens=5" %%a in ('netstat -ano ^| findstr /r ":3000.*LISTENING"') do (
    taskkill /pid %%a /f >nul 2>&1
)
echo Old process stopped, starting again...
timeout /t 1 /nobreak >nul

:start
start "" /min powershell -NoProfile -Command "for($i=0;$i -lt 60;$i++){ if((Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue)){ Start-Process 'http://localhost:3000'; break }; Start-Sleep 1 }"
npm run dev