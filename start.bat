@echo off
echo Starting Trust Intelligence Platform...
start cmd /k "venv\Scripts\activate && uvicorn backend.main:app --reload"
timeout /t 3
start cmd /k "venv\Scripts\activate && streamlit run dashboard/app.py"
echo Both services starting. API: http://127.0.0.1:8000/docs
echo Dashboard: http://localhost:8501