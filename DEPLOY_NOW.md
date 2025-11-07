# 🚀 Deploy to Railway - Step by Step

## ✅ Pre-Deployment Checklist

- [x] App runs locally ✅
- [x] Configuration files ready ✅
- [x] Dependencies optimized ✅
- [ ] All changes committed to git
- [ ] Pushed to GitHub
- [ ] Railway dashboard configured

## 📋 Step-by-Step Deployment

### Step 1: Commit and Push to GitHub

```powershell
cd C:\Users\Admin\Desktop\phoebe_app
git add .
git commit -m "Ready for Railway deployment"
git push origin main
```

### Step 2: Configure Railway Dashboard

**CRITICAL - Do this first!**

1. **Go to Railway Dashboard**
   - Open https://railway.app
   - Login to your account
   - Select your project (or create new one)

2. **Create/Select Service**
   - If new: Click "New Service" → "GitHub Repo" → Select your repo
   - If existing: Click on your service

3. **Configure Settings** (MOST IMPORTANT!)
   - Click **Settings** tab
   - **Root Directory**: Set to `backend`
   - **Build Command**: **DELETE everything** (leave empty!)
   - **Start Command**: Leave empty (uses Procfile) OR set to:
     ```
     gunicorn app:app --bind 0.0.0.0:$PORT --workers 2 --timeout 120
     ```
   - **Click Save** after each change

### Step 3: Set Environment Variables

In Railway Dashboard → **Variables** tab, add:

```
DATABASE_URL=postgresql+psycopg2://postgres:PhoebeDrugStore01@db.xybuirzvlfuwmtcokkwm.supabase.co:5432/postgres?sslmode=require
JWT_SECRET_KEY=69kdsyb6CUVLdTsUsQ0dsqK-DiTPSvhrbqtTucGpVA0
APP_SECRET_KEY=XO5neDCr5RG9OLHuY2zjHGujZ1ypCf15xjUqXDlamBQ
FLASK_DEBUG=0
PORT=5000
```

### Step 4: Deploy

1. Railway will auto-detect your push to GitHub
2. Go to **Deployments** tab
3. Click **Redeploy** (or wait for auto-deploy)
4. Watch the build logs

### Step 5: Monitor Build

**Expected Build Time**: 10-15 minutes

**What to watch for:**
- ✅ Setup phase: Installing Python (1-2 min)
- ✅ Install phase: Installing packages (5-10 min)
- ✅ Build phase: Creating Docker image (1-2 min)
- ✅ Deploy phase: Starting application

**Success indicators:**
- ✅ "Build completed successfully"
- ✅ "Deployment started"
- ✅ No errors in logs

### Step 6: Get Your URL

1. Go to **Settings** → **Domains**
2. Railway provides a URL like: `https://your-app.up.railway.app`
3. Test it: `https://your-app.up.railway.app/api/health`

## 🚨 Common Issues & Fixes

### Issue: "Build Command" error
**Fix**: Make sure Build Command is **EMPTY** in Railway dashboard

### Issue: "pip: command not found"
**Fix**: Root Directory must be set to `backend`

### Issue: Build timeout
**Fix**: Normal for ML packages. Wait 10-15 minutes.

### Issue: Image size exceeded
**Fix**: Already fixed with CPU-only PyTorch

## ✅ After Successful Deployment

1. ✅ Test API: `https://your-app.railway.app/api/health`
2. ✅ Check logs for any runtime errors
3. ✅ Update frontend to use Railway URL
4. ✅ Deploy frontend to Vercel

## 📝 Quick Reference

**Railway Dashboard Settings:**
- Root Directory: `backend`
- Build Command: (empty)
- Start Command: (empty or use Procfile)

**Environment Variables:**
- DATABASE_URL
- JWT_SECRET_KEY
- APP_SECRET_KEY
- FLASK_DEBUG=0
- PORT=5000

**Expected Build Time:** 10-15 minutes

---

**Ready?** Follow the steps above and your app will be live! 🎉

