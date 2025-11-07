# Railway Build Command Fix

## Problem
Railway is trying to run a buildCommand before Python is installed, causing "pip: command not found" error.

## Root Cause
Railway dashboard has a **buildCommand** configured that overrides `nixpacks.toml`. This buildCommand runs in a Dockerfile before Nixpacks setup phases execute.

## Solution

### Step 1: Remove buildCommand from Railway Dashboard

1. Go to your Railway project dashboard
2. Select your service
3. Go to **Settings** tab
4. Scroll to **Build & Deploy** section
5. **DELETE or CLEAR** the `Build Command` field (leave it empty)
6. **Save** the settings

### Step 2: Set Root Directory (Optional but Recommended)

1. In the same **Settings** tab
2. Find **Root Directory** field
3. Set it to: `backend`
4. **Save** the settings

### Step 3: Verify Configuration Files

Make sure these files exist in your repository:

- ✅ `nixpacks.toml` (at root) - Configures Nixpacks build phases
- ✅ `runtime.txt` (at root) - Specifies Python version
- ✅ `Procfile` (at root) - Defines start command
- ✅ `backend/requirements.txt` - Python dependencies

### Step 4: Redeploy

After clearing the buildCommand:
1. Go to **Deployments** tab
2. Click **Redeploy** or push a new commit
3. Railway will now use `nixpacks.toml` properly

## What Should Happen

With the buildCommand removed, Railway will:
1. ✅ Detect `nixpacks.toml`
2. ✅ Run **setup phase**: Install Python 3.11
3. ✅ Run **install phase**: Install pip packages (CPU-only PyTorch)
4. ✅ Run **start phase**: Start Gunicorn server

## Important Notes

- **DO NOT** set a buildCommand in Railway dashboard
- Let Nixpacks handle everything through `nixpacks.toml`
- The buildCommand shown in Railway logs is from dashboard settings, not from code

## Current Configuration

- **Python Version**: 3.11
- **PyTorch**: CPU-only version (reduces image size from 8.5GB to ~2-3GB)
- **Build Tool**: Nixpacks
- **Start Command**: Gunicorn with 2 workers

