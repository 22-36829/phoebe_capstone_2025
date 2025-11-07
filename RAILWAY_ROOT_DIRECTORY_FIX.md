# 🔧 Railway Root Directory - Can't Find It? Here's How to Fix It

## 🎯 The Problem
Railway can't find the Root Directory setting in the dashboard. Here are **3 working solutions**:

---

## ✅ SOLUTION 1: Use Railway CLI (EASIEST)

### Step 1: Install Railway CLI
```bash
npm install -g @railway/cli
```

### Step 2: Login
```bash
railway login
```

### Step 3: Link Your Project
```bash
cd C:\Users\Admin\Desktop\phoebe_app
railway link
```
- Select your Railway project when prompted

### Step 4: Set Root Directory
```bash
railway variables set SERVICE_ROOT=backend
```

OR try:
```bash
railway variables set RAILWAY_SERVICE_ROOT=backend
```

### Step 5: Redeploy
```bash
railway up
```

---

## ✅ SOLUTION 2: Delete and Recreate Service (RECOMMENDED)

This is often the easiest way:

### Step 1: Delete Current Service
1. Go to Railway Dashboard
2. Click on your service
3. Go to **Settings**
4. Scroll down and click **"Delete Service"**

### Step 2: Create New Service
1. In your Railway project, click **"+ New"**
2. Select **"GitHub Repo"**
3. Select your repository
4. **IMPORTANT**: Before clicking "Deploy", look for:
   - **"Root Directory"** field
   - OR **"Source"** section with directory option
   - Set it to: `backend`
5. Click **"Deploy"**

---

## ✅ SOLUTION 3: Move Configuration Files to Root

Since Railway might be looking at the root, let's make the root look like a Python project:

### Option A: Create a wrapper script
Create `start.sh` in the root:

```bash
#!/bin/bash
cd backend
gunicorn app:app --bind 0.0.0.0:$PORT --workers 2 --timeout 120
```

### Option B: Update railway.json in root
The `railway.json` I created should help, but let's make it more explicit:

---

## 🔍 Where to Look in Railway Dashboard

The Root Directory setting might be in different places:

1. **Service Settings** → **"Source"** tab
2. **Service Settings** → **"Deploy"** section
3. **Service Settings** → **"Build"** section
4. **Service Settings** → Scroll down to **"Advanced"** section
5. When **creating a new service** → Look for **"Configure"** button before deploy

---

## 🚀 QUICKEST FIX: Use Railway CLI

If you can't find it in the UI, **use the CLI** (Solution 1 above). It's the most reliable method.

---

## 📝 After Setting Root Directory

Once set, Railway will:
- ✅ Look in `backend/` folder
- ✅ Find `requirements.txt`
- ✅ Detect Python
- ✅ Use `Procfile` for start command
- ✅ Build successfully

---

## 🆘 Still Not Working?

If none of these work:
1. Check Railway's documentation: https://docs.railway.app
2. Contact Railway support
3. Try creating a completely new project and set root directory during initial setup

