# 🚀 FINAL Railway Setup Guide

## ⚠️ CRITICAL: Railway Dashboard Configuration

**THIS IS THE MOST IMPORTANT STEP** - The build WILL fail if these aren't set correctly!

### Step 1: Go to Railway Dashboard
1. Open https://railway.app
2. Select your project
3. Click on your service

### Step 2: Configure Settings
Go to **Settings** tab:

#### A. Root Directory
- Find **Root Directory** field
- Set to: `backend`
- **Click Save**

#### B. Build Command  
- Find **Build Command** field
- **DELETE everything** (leave it completely empty)
- **Click Save**

#### C. Start Command (Optional)
- Find **Start Command** field  
- Set to: `gunicorn app:app --bind 0.0.0.0:$PORT --workers 2 --timeout 120`
- Or leave empty (will use Procfile)
- **Click Save**

## ✅ What We've Fixed

### 1. Image Size (Was 8.5GB → Now ~2-3GB)
- ✅ Using CPU-only PyTorch (saves 6GB)
- ✅ Excluding frontend folder
- ✅ Excluding AI model files
- ✅ Excluding documentation

### 2. Build Configuration
- ✅ `nixpacks.toml` properly configured
- ✅ `runtime.txt` specifies Python 3.11
- ✅ `Procfile` defines start command
- ✅ Using `python3 -m` for explicit execution

### 3. File Exclusions
- ✅ `.railwayignore` excludes unnecessary files
- ✅ `.dockerignore` excludes large files
- ✅ Only backend code is included

## 📋 Pre-Deployment Checklist

Before deploying, verify:

- [ ] Root Directory = `backend` in Railway dashboard
- [ ] Build Command = **EMPTY** in Railway dashboard  
- [ ] Start Command = correct (or empty to use Procfile)
- [ ] Environment variables set in Railway
- [ ] All files committed and pushed to GitHub

## 🚨 If Build Still Fails

### Check Build Logs
1. Go to Railway → Deployments
2. Click on failed deployment
3. Check **Build Logs** tab
4. Look for specific error

### Common Errors:

#### Error: "pip: command not found"
**Cause**: BuildCommand still set in dashboard
**Fix**: Remove BuildCommand, leave empty

#### Error: "Image size exceeded 4GB"  
**Cause**: Still using CUDA PyTorch or copying large files
**Fix**: Already fixed with CPU-only PyTorch

#### Error: "Build timeout"
**Cause**: Packages taking too long to install
**Fix**: 
- Build time of 10-15 minutes is normal for ML packages
- If > 15 minutes, consider using `requirements-minimal.txt`

#### Error: "Failed to import docker"
**Cause**: Build failed or image too large
**Fix**: Check build logs for root cause

## 🎯 Expected Build Times

- **Setup Phase**: 1-2 minutes (Python installation)
- **Install Phase**: 5-10 minutes (package installation)
  - torch: ~2-3 minutes
  - transformers: ~2-3 minutes  
  - Other packages: ~1-2 minutes
- **Build Phase**: 1-2 minutes (Docker image)
- **Total**: 7-14 minutes (normal!)

## 🔧 Alternative: Use Minimal Requirements

If build keeps timing out, you can use a lighter requirements file:

1. Rename `requirements.txt` to `requirements-full.txt`
2. Rename `requirements-minimal.txt` to `requirements.txt`
3. This removes optional packages (spacy, dash, plotly, etc.)
4. Build will be faster but some features may not work

## ✅ After Successful Build

1. ✅ Get Railway URL from dashboard
2. ✅ Test API: `curl https://your-app.railway.app/api/health`
3. ✅ Check deployment logs for any runtime errors
4. ✅ Set up frontend on Vercel
5. ✅ Connect frontend to Railway backend URL

## 📞 Still Having Issues?

1. **Check Railway Build Logs** - Look for specific error message
2. **Verify Dashboard Settings** - Root Directory and Build Command are critical
3. **Test Locally** - If it works locally, it should work on Railway
4. **Check File Structure** - Make sure all files are in correct locations

## 🎉 Success Indicators

✅ Build completes in < 15 minutes
✅ No "command not found" errors  
✅ No "timeout" errors
✅ Image size < 4GB
✅ Deployment starts successfully
✅ API responds to requests

---

**Remember**: The Railway dashboard settings are CRITICAL. If Build Command is set, it will override nixpacks.toml and cause failures!

