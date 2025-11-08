# Fix Railway Worker Count Issue

## Problem
Railway is starting 2 workers (pid 2 and 3) even though we set `--workers 1` in the configuration.

## Solution

### Step 1: Check Railway Dashboard
1. Go to Railway Dashboard: https://railway.app
2. Select your **backend service**
3. Go to **Settings** tab
4. Scroll to **Deploy** section
5. Check **Start Command**

### Step 2: Fix Start Command
**Current (should be):**
```
cd backend && gunicorn app:app --bind 0.0.0.0:$PORT --workers 1 --timeout 120 --worker-class sync
```

**If it shows `--workers 2` or no `--workers`:**
1. Click **Edit** on Start Command
2. Change to:
```
cd backend && gunicorn app:app --bind 0.0.0.0:$PORT --workers 1 --timeout 120 --worker-class sync
```
3. Click **Save**

### Step 3: Verify
After redeploy, check logs - you should see only **1 worker** (pid 2):
```
[2025-11-08 01:44:01 +0000] [1] [INFO] Starting gunicorn 21.2.0
[2025-11-08 01:44:01 +0000] [2] [INFO] Booting worker with pid: 2
```

**NOT:**
```
[2025-11-08 01:44:01 +0000] [2] [INFO] Booting worker with pid: 2
[2025-11-08 01:44:01 +0000] [3] [INFO] Booting worker with pid: 3  ← This shouldn't be here
```

## Why This Matters
- **Memory**: 2 workers = 2× memory usage (AI models loaded twice)
- **Consistency**: Requests might hit different workers with different initialization states
- **Performance**: Unnecessary overhead

## After Fixing
1. Railway will automatically redeploy
2. Check logs - should see only 1 worker
3. Test AI Assistant again
4. Check logs for request handling

