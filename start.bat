@echo off
title Finance App - Launcher

echo ========================================
echo         Finance App - Iniciando
echo ========================================
echo.

echo [1/2] Iniciando Backend (FastAPI)...
start "Finance App - Backend" cmd /k "cd /d %~dp0backend && call venv\Scripts\activate && uvicorn app.main:app --reload"

echo [2/2] Iniciando Frontend (Vite)...
start "Finance App - Frontend" cmd /k "cd /d %~dp0frontend && npm run dev"

echo.
echo ========================================
echo  Backend:  http://localhost:8000
echo  Frontend: http://localhost:5173
echo ========================================
echo.
echo Dois terminais foram abertos.
echo Feche-os para parar os servidores.
echo.
pause
