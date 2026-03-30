@echo off
:: Astra-AI Windows Launcher
:: Starts the Python backend in a separate window, then launches the CLI

title Astra-AI Launcher

echo.
echo  ======================================
echo   Astra-AI — Windows Launcher
echo  ======================================
echo.

:: Check Python
python --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Python not found. Please install Python 3.10+
    pause
    exit /b 1
)

:: Check Node
node --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Node.js not found. Please install Node.js 18+
    pause
    exit /b 1
)

:: Copy .env if not exists
if not exist "server\.env" (
    echo [SETUP] Copying .env.example to .env ...
    copy "server\.env.example" "server\.env"
    echo [SETUP] Please edit server\.env and add your GEMINI_API_KEY
    notepad "server\.env"
    pause
)

:: Install Python deps
echo [SETUP] Installing Python dependencies...
cd server
pip install -r requirements.txt --quiet
cd ..

:: Install Node deps
echo [SETUP] Installing Node.js dependencies...
cd cli
npm install --silent
cd ..

:: Start Python server in a new window
echo [START] Launching Python engine in background...
start "Astra-AI Engine" cmd /k "cd server && python main.py"

:: Wait for server to be ready
echo [WAIT] Waiting for engine to start (5s)...
timeout /t 5 /nobreak >nul

:: Launch CLI
echo [START] Launching Astra-AI CLI...
cd cli
node agent.js init
cd ..
