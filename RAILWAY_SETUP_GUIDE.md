# 🚂 Railway Setup - Step by Step

## ✅ Where to Set Root Directory

### Step 1: Go to Your Service Settings
1. In Railway Dashboard, click on your **service** (not the project)
2. Click on the **Settings** tab (gear icon or "Settings" in the menu)

### Step 2: Find "Root Directory"
Look for a setting called:
- **"Root Directory"** or
- **"Working Directory"** or  
- **"Source Directory"**

### Step 3: Set the Value
- **Current value**: `/` or empty
- **Change to**: `backend`
- Click **Save**

---

## 📍 About "Watch Paths"

**Watch Paths** is DIFFERENT from Root Directory:
- **Watch Paths**: Controls which file changes trigger a redeployment
- **Root Directory**: Tells Railway WHERE to build your app

### Optional: Set Watch Paths
If you want to only redeploy when backend files change, you can add:
```
backend/**
```

This means: "Only redeploy if files in the `backend/` folder change"

---

## 🎯 What You Need to Set

### Required:
1. **Root Directory** = `backend` ← **THIS IS THE MAIN ONE!**

### Optional but Recommended:
2. **Watch Paths** = `backend/**` (only redeploy on backend changes)

---

## 🔍 Can't Find Root Directory?

If you don't see "Root Directory" in Settings:

### Option A: Use Railway CLI
```bash
railway service
railway variables set RAILWAY_SERVICE_ROOT=backend
```

### Option B: Check Service Configuration
1. Go to your service
2. Click **"Deploy"** or **"Settings"**
3. Look for **"Source"** or **"Build"** section
4. There should be a **"Root Directory"** field

### Option C: Delete and Recreate Service
1. Delete the current service
2. Create new service
3. When connecting GitHub repo, look for **"Root Directory"** option
4. Set it to `backend` before first deploy

---

## ✅ After Setting Root Directory

Railway will:
- ✅ Look for `requirements.txt` in `backend/`
- ✅ Find `Procfile` in `backend/`
- ✅ Detect Python automatically
- ✅ Build and deploy successfully

---

## 🆘 Still Having Issues?

If Railway still can't detect Python:
1. Make sure `backend/requirements.txt` exists
2. Make sure `backend/Procfile` exists
3. Check that `backend/nixpacks.toml` is in the repo
4. Try pushing a new commit after setting root directory

---

## 📝 Summary

**Main Setting**: Root Directory = `backend`  
**Optional**: Watch Paths = `backend/**`

Set Root Directory first - that's the critical one!

