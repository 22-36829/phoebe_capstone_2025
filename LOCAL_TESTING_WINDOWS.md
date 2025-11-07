# 🖥️ Local Testing Guide (Windows)

## Prerequisites

- ✅ Python 3.11+ installed (you have 3.12.6)
- ✅ Git installed
- ✅ PostgreSQL database (Supabase)

## Step 1: Create Virtual Environment

Open PowerShell in the `backend` directory:

```powershell
cd C:\Users\Admin\Desktop\phoebe_app\backend
python -m venv venv
```

## Step 2: Activate Virtual Environment

```powershell
.\venv\Scripts\Activate.ps1
```

**Note**: If you get an execution policy error, run:
```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

Then try activating again.

## Step 3: Install Dependencies

```powershell
python -m pip install --upgrade pip
python -m pip install --no-cache-dir --extra-index-url https://download.pytorch.org/whl/cpu -r requirements.txt
```

**Note**: This will take 5-10 minutes as it installs ML packages.

## Step 4: Set Environment Variables

Create a `.env` file in the `backend` directory:

```env
DATABASE_URL=postgresql+psycopg2://postgres:PhoebeDrugStore01@db.xybuirzvlfuwmtcokkwm.supabase.co:5432/postgres?sslmode=require
JWT_SECRET_KEY=69kdsyb6CUVLdTsUsQ0dsqK-DiTPSvhrbqtTucGpVA0
APP_SECRET_KEY=XO5neDCr5RG9OLHuY2zjHGujZ1ypCf15xjUqXDlamBQ
FLASK_DEBUG=1
PORT=5000
```

## Step 5: Run the Application

```powershell
python app.py
```

Or using Gunicorn (production-like):

```powershell
python -m gunicorn app:app --bind 0.0.0.0:5000 --workers 2 --timeout 120
```

## Step 6: Test the API

Open another PowerShell window and test:

```powershell
# Health check
curl http://localhost:5000/api/health

# Or use browser
# Open: http://localhost:5000/api/health
```

## Common Issues

### Issue: "python3: command not found"
**Solution**: On Windows, use `python` not `python3`

### Issue: "Execution Policy" error when activating venv
**Solution**: 
```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

### Issue: "Module not found" errors
**Solution**: Make sure virtual environment is activated and dependencies are installed

### Issue: "Database connection" errors
**Solution**: Check DATABASE_URL in `.env` file is correct

### Issue: "Port already in use"
**Solution**: 
```powershell
# Find process using port 5000
netstat -ano | findstr :5000
# Kill process (replace PID with actual process ID)
taskkill /PID <PID> /F
```

## Testing Checklist

Before deploying to Railway, verify:

- [ ] Virtual environment created and activated
- [ ] All dependencies installed successfully
- [ ] `.env` file created with correct variables
- [ ] Application starts without errors
- [ ] API responds to requests (test `/api/health`)
- [ ] Database connection works
- [ ] No import errors in logs

## What This Tests

✅ Python version compatibility
✅ All dependencies can be installed
✅ Application starts correctly
✅ Database connection works
✅ API endpoints respond

**If it works locally, it should work on Railway!**

## Next Steps

Once local testing passes:
1. ✅ Commit all changes
2. ✅ Push to GitHub
3. ✅ Configure Railway dashboard (see `FINAL_RAILWAY_SETUP.md`)
4. ✅ Deploy to Railway
5. ✅ Test deployed API

## Quick Commands Reference

```powershell
# Navigate to backend
cd C:\Users\Admin\Desktop\phoebe_app\backend

# Create virtual environment
python -m venv venv

# Activate virtual environment
.\venv\Scripts\Activate.ps1

# Install dependencies
python -m pip install --upgrade pip
python -m pip install --no-cache-dir --extra-index-url https://download.pytorch.org/whl/cpu -r requirements.txt

# Run application
python app.py

# Deactivate virtual environment (when done)
deactivate
```

