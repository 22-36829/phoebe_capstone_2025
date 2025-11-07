# Railway Build Success Checklist

## ✅ CRITICAL: Railway Dashboard Settings

Before deploying, you MUST configure Railway dashboard:

### 1. Root Directory
- [ ] Go to Railway Dashboard → Service → Settings
- [ ] Set **Root Directory** to: `backend`
- [ ] Save

### 2. Build Command
- [ ] Go to **Build & Deploy** section
- [ ] **DELETE/CLEAR** the `Build Command` field
- [ ] Leave it **EMPTY** (let Nixpacks handle it)
- [ ] Save

### 3. Start Command
- [ ] Go to **Build & Deploy** section  
- [ ] Set **Start Command** to: `gunicorn app:app --bind 0.0.0.0:$PORT --workers 2 --timeout 120`
- [ ] Or leave empty if using Procfile
- [ ] Save

## ✅ Configuration Files Verification

Make sure these files exist:

### Root Directory:
- [ ] `nixpacks.toml` (if Root Directory is NOT set)
- [ ] `runtime.txt` 
- [ ] `Procfile`
- [ ] `.railwayignore`
- [ ] `.dockerignore`

### Backend Directory (if Root Directory = `backend`):
- [ ] `backend/nixpacks.toml` ✅
- [ ] `backend/requirements.txt` ✅
- [ ] `backend/runtime.txt` ✅
- [ ] `backend/Procfile` ✅
- [ ] `backend/app.py` ✅

## ✅ Build Optimization

### Image Size (< 4GB limit):
- [x] Using CPU-only PyTorch (saves ~6GB)
- [x] Excluding frontend folder
- [x] Excluding AI model files (auto-generated)
- [x] Using `.railwayignore` and `.dockerignore`

### Build Time (< 15 min limit):
- [x] Using `--no-cache-dir` flag
- [x] Excluding unnecessary files
- [x] Using CPU-only packages

## ✅ Environment Variables

Make sure these are set in Railway:

- [ ] `DATABASE_URL` - PostgreSQL connection string
- [ ] `JWT_SECRET_KEY` - JWT signing key
- [ ] `APP_SECRET_KEY` - Flask secret key
- [ ] `FLASK_DEBUG` - Set to `0` for production
- [ ] `PORT` - Railway sets this automatically

## 🚨 Common Build Failures & Fixes

### Failure: "pip: command not found"
**Cause**: BuildCommand set in dashboard, Python not installed yet
**Fix**: Remove BuildCommand from Railway dashboard

### Failure: "Image size exceeded 4GB"
**Cause**: Using CUDA PyTorch or copying large files
**Fix**: Using CPU-only PyTorch (already done)

### Failure: "Build timeout"
**Cause**: Installing too many packages or large dependencies
**Fix**: 
- Already using `--no-cache-dir`
- Excluding frontend and model files
- If still failing, consider removing optional packages

### Failure: "Failed to import docker"
**Cause**: Image too large or build failed
**Fix**: Check build logs for specific error

## ✅ Pre-Deployment Test

Before deploying, test locally:

```bash
cd backend
python3 -m venv venv
source venv/bin/activate  # or `venv\Scripts\activate` on Windows
pip install -r requirements.txt
python app.py
```

If this works locally, Railway should work too.

## 🎯 Expected Build Time

- **Setup phase**: 1-2 minutes (Python installation)
- **Install phase**: 5-10 minutes (package installation)
- **Build phase**: 1-2 minutes (image creation)
- **Total**: 7-14 minutes (normal for ML packages)

## 📊 Build Success Indicators

✅ Build completes in < 15 minutes
✅ Image size < 4GB
✅ No "command not found" errors
✅ No "timeout" errors
✅ Deployment starts successfully

## 🔧 If Build Still Fails

1. **Check Railway Build Logs**:
   - Look for specific error messages
   - Check which phase failed (setup/install/build)

2. **Verify Dashboard Settings**:
   - Root Directory = `backend`
   - Build Command = EMPTY
   - Start Command = correct or empty

3. **Check File Structure**:
   - All required files exist
   - No typos in file names
   - Correct paths in configs

4. **Try Minimal Test**:
   - Temporarily remove heavy packages (torch, transformers)
   - Test if basic Flask app builds
   - Add packages back one by one

## 📝 Next Steps After Successful Build

1. ✅ Get Railway URL (e.g., `https://your-app.railway.app`)
2. ✅ Test API endpoints
3. ✅ Deploy frontend to Vercel
4. ✅ Connect frontend to Railway backend URL
5. ✅ Test full application

