# Local Setup Script for Windows
# Run this script to set up the local development environment

Write-Host "🚀 Setting up local development environment..." -ForegroundColor Green

# Check if Python is installed
Write-Host "`n📦 Checking Python installation..." -ForegroundColor Yellow
$pythonVersion = python --version
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Python is not installed or not in PATH" -ForegroundColor Red
    exit 1
}
Write-Host "✅ Python found: $pythonVersion" -ForegroundColor Green

# Create virtual environment if it doesn't exist
if (-not (Test-Path "venv")) {
    Write-Host "`n📦 Creating virtual environment..." -ForegroundColor Yellow
    python -m venv venv
    if ($LASTEXITCODE -ne 0) {
        Write-Host "❌ Failed to create virtual environment" -ForegroundColor Red
        exit 1
    }
    Write-Host "✅ Virtual environment created" -ForegroundColor Green
} else {
    Write-Host "`n✅ Virtual environment already exists" -ForegroundColor Green
}

# Activate virtual environment
Write-Host "`n🔧 Activating virtual environment..." -ForegroundColor Yellow
& ".\venv\Scripts\Activate.ps1"
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Failed to activate virtual environment" -ForegroundColor Red
    Write-Host "💡 Try running: Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser" -ForegroundColor Yellow
    exit 1
}

# Upgrade pip
Write-Host "`n📦 Upgrading pip..." -ForegroundColor Yellow
python -m pip install --upgrade pip --quiet
Write-Host "✅ Pip upgraded" -ForegroundColor Green

# Install dependencies
Write-Host "`n📦 Installing dependencies (this may take 5-10 minutes)..." -ForegroundColor Yellow
Write-Host "   Installing CPU-only PyTorch and other ML packages..." -ForegroundColor Gray
python -m pip install --no-cache-dir --extra-index-url https://download.pytorch.org/whl/cpu -r requirements.txt
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Failed to install dependencies" -ForegroundColor Red
    exit 1
}
Write-Host "✅ Dependencies installed" -ForegroundColor Green

# Check if .env file exists
if (-not (Test-Path ".env")) {
    Write-Host "`n📝 Creating .env file..." -ForegroundColor Yellow
    Copy-Item "env_example.txt" ".env"
    Write-Host "✅ .env file created from env_example.txt" -ForegroundColor Green
    Write-Host "⚠️  Please update .env file with your actual credentials" -ForegroundColor Yellow
} else {
    Write-Host "`n✅ .env file already exists" -ForegroundColor Green
}

Write-Host "`n🎉 Setup complete!" -ForegroundColor Green
Write-Host "`n📋 Next steps:" -ForegroundColor Cyan
Write-Host "   1. Make sure .env file has correct values" -ForegroundColor White
Write-Host "   2. Run: python app.py" -ForegroundColor White
Write-Host "   3. Test: http://localhost:5000/api/health" -ForegroundColor White
Write-Host "`n💡 To activate the virtual environment manually, run:" -ForegroundColor Yellow
Write-Host "   .\venv\Scripts\Activate.ps1" -ForegroundColor White

