# 🔧 Railway Deployment Fix

## Problem
Railway's Railpack is detecting both `backend/` and `frontend/` directories and can't determine which one to build.

## Solution

### Option 1: Set Root Directory in Railway Dashboard (RECOMMENDED)

1. Go to your Railway project dashboard
2. Click on your service
3. Go to **Settings** tab
4. Find **Root Directory** setting
5. Set it to: `backend`
6. Save and redeploy

This tells Railway to only look in the `backend/` folder for the Python project.

---

### Option 2: Use Railway CLI

If you prefer using the CLI:

```bash
railway service
railway variables set RAILWAY_SERVICE_ROOT=backend
```

---

### Option 3: Create Separate Services

You can also create two separate services:
1. One service for backend (root: `backend`)
2. One service for frontend (root: `frontend`) - though frontend should go to Vercel

---

## After Setting Root Directory

Once you set the root directory to `backend`, Railway will:
- ✅ Detect Python automatically
- ✅ Find `requirements.txt`
- ✅ Use `Procfile` for start command
- ✅ Build and deploy successfully

---

## Environment Variables

Make sure you've added all environment variables in Railway:
- `DATABASE_URL`
- `JWT_SECRET_KEY`
- `APP_SECRET_KEY`
- `FLASK_DEBUG=0`
- `PORT=5000` (Railway sets this automatically, but you can set it)

---

## Quick Fix Steps

1. **Railway Dashboard** → Your Service → **Settings**
2. **Root Directory**: Change from `/` to `backend`
3. **Save**
4. **Redeploy** (or push a new commit)

That's it! Railway will now build from the `backend/` directory.

