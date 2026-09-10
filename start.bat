@echo off
title mdictfe dev server
cd /d "%~dp0"

netstat -ano 2>nul | findstr /r ":7777.*LISTENING" >nul
if errorlevel 1 goto start

echo mdictfe already running: http://localhost:7777
echo.
set /p act=Choose [Enter]=open browser / [r]=restart / [q]=quit :
if /i "%act%"=="q" exit /b 0
if /i "%act%"=="r" goto restart
start "" http://localhost:7777
exit /b 0

:restart
for /f "tokens=5" %%a in ('netstat -ano ^| findstr /r ":7777.*LISTENING"') do (
    taskkill /pid %%a /f >nul 2>&1
)
echo Old process stopped, starting again...
timeout /t 1 /nobreak >nul

:start
start "" /min powershell -NoProfile -Command "for($i=0;$i -lt 60;$i++){ if((Get-NetTCPConnection -LocalPort 7777 -State Listen -ErrorAction SilentlyContinue)){ Start-Process 'http://localhost:7777'; break }; Start-Sleep 1 }"
npm run dev
