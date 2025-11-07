# Run Local Development Server
# This script activates the virtual environment and runs the Flask app

Write-Host "🚀 Starting local development server..." -ForegroundColor Green

# Check if virtual environment exists
if (-not (Test-Path "venv")) {
    Write-Host "❌ Virtual environment not found!" -ForegroundColor Red
    Write-Host "💡 Run setup_local.ps1 first to set up the environment" -ForegroundColor Yellow
    exit 1
}

# Check if .env file exists
if (-not (Test-Path ".env")) {
    Write-Host "❌ .env file not found!" -ForegroundColor Red
    Write-Host "💡 Create .env file with your environment variables" -ForegroundColor Yellow
    exit 1
}

# Activate virtual environment
Write-Host "`n🔧 Activating virtual environment..." -ForegroundColor Yellow
& ".\venv\Scripts\Activate.ps1"

# Run the application
Write-Host "`n🌐 Starting Flask application on http://localhost:5000" -ForegroundColor Green
Write-Host "   Press Ctrl+C to stop the server`n" -ForegroundColor Gray

python app.py

