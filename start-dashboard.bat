@echo off
REM Double-click to start the Malpani Warehouse Dashboard
cd /d "%~dp0"
echo Starting dashboard... open http://localhost:5173 in your browser
"C:\Program Files\nodejs\node.exe" "node_modules\vite\bin\vite.js" --port 5173 --host
pause
