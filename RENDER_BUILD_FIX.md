# Render Build Fix - requirements.txt Not Found

## Problem
```
ERROR: Could not open requirements file: [Errno 2] No such file or directory: 'backend/requirements.txt'
```

## Solution

### Option 1: Set Root Directory in Render Dashboard (Recommended)

1. Go to Render Dashboard → Your Service → Settings
2. Find **Root Directory** field
3. Set it to: `backend`
4. Save settings

Then update the build command in dashboard to:
```bash
pip install --upgrade pip && pip install --no-cache-dir --extra-index-url https://download.pytorch.org/whl/cpu -r requirements.txt
```

And start command:
```bash
gunicorn app:app --bind 0.0.0.0:$PORT --workers 1 --timeout 300 --worker-class sync --preload
```

### Option 2: Keep Root Directory Empty (Use Full Path)

If Root Directory is empty (default), use:

**Build Command:**
```bash
pip install --upgrade pip && pip install --no-cache-dir --extra-index-url https://download.pytorch.org/whl/cpu -r backend/requirements.txt
```

**Start Command:**
```bash
cd backend && gunicorn app:app --bind 0.0.0.0:$PORT --workers 1 --timeout 300 --worker-class sync --preload
```

### Option 3: Update render.yaml

The `render.yaml` file has been updated. However, Render may not support `rootDir` in YAML. 

**If using render.yaml doesn't work:**
1. Remove or comment out the `rootDir: backend` line
2. Set Root Directory manually in Render Dashboard (Option 1)
3. OR use the build command from Option 2

## Verify File Exists

Make sure `backend/requirements.txt` exists in your repository:

```bash
# Check if file exists
ls -la backend/requirements.txt

# If it doesn't exist, check what files are in backend
ls -la backend/
```

## After Fixing

1. Commit and push the changes (if using render.yaml)
2. Go to Render Dashboard → Deployments
3. Click **Manual Deploy** → **Clear build cache & deploy**
4. Monitor the build logs

## Current Configuration

**File:** `render.yaml`
- ✅ Root Directory: Set to `backend` (may need to be set in dashboard)
- ✅ Build Command: Uses `requirements.txt` (relative to backend directory)
- ✅ Start Command: Simplified (no `cd backend` needed)

**Note:** If `rootDir` is not supported in render.yaml, you MUST set Root Directory to `backend` in the Render Dashboard manually.

