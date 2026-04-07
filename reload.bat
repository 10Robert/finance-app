@echo off
title Finance App - Reload

echo ========================================
echo       Finance App - Reload
echo ========================================
echo.

echo [1/4] Parando servidores...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":8000" ^| findstr "LISTENING"') do (
    taskkill /F /PID %%a >nul 2>&1
)
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":5173" ^| findstr "LISTENING"') do (
    taskkill /F /PID %%a >nul 2>&1
)
timeout /t 2 /nobreak >nul

echo [2/4] Atualizando dependencias do backend...
cd /d %~dp0backend
call venv\Scripts\activate
pip install -r requirements.txt --quiet

echo [3/4] Atualizando dependencias do frontend...
cd /d %~dp0frontend
call npm install --silent

echo [4/4] Reiniciando servidores...
cd /d %~dp0backend
start "Finance App - Backend" cmd /k "call venv\Scripts\activate && uvicorn app.main:app --reload"

cd /d %~dp0frontend
start "Finance App - Frontend" cmd /k "npm run dev"

echo.
echo ========================================
echo  Reload completo!
echo  Backend:  http://localhost:8000
echo  Frontend: http://localhost:5173
echo ========================================
echo.
pause
