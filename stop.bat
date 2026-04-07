@echo off
title Finance App - Parando

echo ========================================
echo         Finance App - Parando
echo ========================================
echo.

echo Encerrando processos do backend (uvicorn)...
taskkill /F /IM uvicorn.exe >nul 2>&1
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":8000" ^| findstr "LISTENING"') do (
    taskkill /F /PID %%a >nul 2>&1
)

echo Encerrando processos do frontend (node/vite)...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":5173" ^| findstr "LISTENING"') do (
    taskkill /F /PID %%a >nul 2>&1
)

echo.
echo ========================================
echo  Todos os servidores foram encerrados.
echo ========================================
echo.
pause
