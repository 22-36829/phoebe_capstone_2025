# ⚡ Quick Start - Local Testing

## 🚀 Automated Setup (Easiest)

### Step 1: Run Setup Script

Open PowerShell in the `backend` directory:

```powershell
cd C:\Users\Admin\Desktop\phoebe_app\backend
.\setup_local.ps1
```

This will:
- ✅ Check Python installation
- ✅ Create virtual environment (if needed)
- ✅ Install all dependencies
- ✅ Create .env file from template

### Step 2: Update .env File

Edit `backend/.env` file with your actual credentials:

```env
DATABASE_URL=postgresql+psycopg2://postgres:PhoebeDrugStore01@db.xybuirzvlfuwmtcokkwm.supabase.co:5432/postgres?sslmode=require
JWT_SECRET_KEY=69kdsyb6CUVLdTsUsQ0dsqK-DiTPSvhrbqtTucGpVA0
APP_SECRET_KEY=XO5neDCr5RG9OLHuY2zjHGujZ1ypCf15xjUqXDlamBQ
FLASK_DEBUG=1
PORT=5000
```

### Step 3: Run the Application

```powershell
.\run_local.ps1
```

Or manually:
```powershell
.\venv\Scripts\Activate.ps1
python app.py
```

### Step 4: Test the API

Open browser: http://localhost:5000/api/health

Or use PowerShell:
```powershell
curl http://localhost:5000/api/health
```

---

## 📋 Manual Setup (If Scripts Don't Work)

### 1. Create Virtual Environment
```powershell
python -m venv venv
```

### 2. Activate Virtual Environment
```powershell
.\venv\Scripts\Activate.ps1
```

If you get execution policy error:
```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

### 3. Install Dependencies
```powershell
python -m pip install --upgrade pip
python -m pip install --no-cache-dir --extra-index-url https://download.pytorch.org/whl/cpu -r requirements.txt
```

### 4. Create .env File
Copy `env_example.txt` to `.env` and update values:
```powershell
Copy-Item env_example.txt .env
# Then edit .env with your actual credentials
```

### 5. Run Application
```powershell
python app.py
```

---

## ✅ Success Checklist

- [ ] Virtual environment created
- [ ] Dependencies installed (no errors)
- [ ] .env file created with correct values
- [ ] Application starts without errors
- [ ] API responds at http://localhost:5000/api/health
- [ ] No import errors in console

---

## 🐛 Troubleshooting

### "Execution Policy" Error
```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

### "Python not found"
- Make sure Python is installed
- Use `python` not `python3` on Windows
- Check: `python --version`

### "Module not found"
- Make sure virtual environment is activated
- Reinstall: `pip install -r requirements.txt`

### "Port already in use"
```powershell
# Find process using port 5000
netstat -ano | findstr :5000
# Kill process (replace PID)
taskkill /PID <PID> /F
```

### "Database connection error"
- Check DATABASE_URL in .env file
- Verify Supabase database is accessible
- Check network connection

---

## 🎯 Next Steps

Once local testing works:
1. ✅ Commit all changes
2. ✅ Push to GitHub
3. ✅ Configure Railway (see `FINAL_RAILWAY_SETUP.md`)
4. ✅ Deploy to Railway
5. ✅ Test deployed API

---

## 💡 Pro Tips

- **Keep venv activated** while working: `.\venv\Scripts\Activate.ps1`
- **Use separate terminals**: One for server, one for testing
- **Check logs**: Application logs show errors and requests
- **Test endpoints**: Use browser or Postman to test API

---

**Ready to deploy?** See `FINAL_RAILWAY_SETUP.md` for Railway deployment guide!

