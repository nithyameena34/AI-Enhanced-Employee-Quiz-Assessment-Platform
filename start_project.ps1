$ErrorActionPreference = 'Stop'

if (-not (Test-Path '.venv')) {
    Write-Host 'Creating Python virtual environment...'
    py -3.10 -m venv .venv
}

Write-Host 'Activating virtual environment...'
. .\.venv\Scripts\Activate.ps1

if (-not (Test-Path '.env')) {
    Copy-Item '.env.example' '.env'
    Write-Host 'Created .env from .env.example. Edit it if you need Groq or Admin self-registration.'
}

Write-Host 'Installing/checking Python dependencies...'
python -m pip install --upgrade pip
python -m pip install -r requirements.txt

Write-Host 'Starting AssessAI at http://127.0.0.1:8000 ...'
python -m uvicorn backend.app.main:app --reload
