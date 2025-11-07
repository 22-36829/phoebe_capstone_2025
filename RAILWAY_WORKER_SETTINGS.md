# ⚠️ IMPORTANT: Check Railway Dashboard Worker Settings

## Problem

Even though we set `--workers 1` in the config files, Railway might be overriding this in the dashboard settings, causing multiple workers to start and memory issues.

## Solution

### Step 1: Check Railway Dashboard Settings

1. Go to **Railway Dashboard**: https://railway.app
2. Select your **backend service**
3. Go to **Settings** tab
4. Scroll to **Deploy** section
5. Check **Start Command**:

**Current (should be):**
```
gunicorn app:app --bind 0.0.0.0:$PORT --workers 1 --timeout 120 --worker-class sync
```

**If it shows `--workers 2` or `--workers 3`, change it to `--workers 1`**

### Step 2: Verify Settings

Make sure:
- ✅ **Start Command**: `gunicorn app:app --bind 0.0.0.0:$PORT --workers 1 --timeout 120 --worker-class sync`
- ✅ **Root Directory**: `backend` (if deploying from root)
- ✅ **Build Command**: (should be empty or auto-detected)

### Step 3: Save and Redeploy

1. Click **Save**
2. Railway will automatically redeploy
3. Check logs - should see only **1 worker** starting

## Why This Matters

- **Multiple workers** = Multiple instances of AI models loaded
- **Memory usage** = Workers × Model size
- **With 2 workers** = 2× memory usage = Out of memory errors
- **With 1 worker** = 1× memory usage = Should fit in Railway's memory limit

## Expected Log Output

**Correct (1 worker):**
```
[2025-11-07 21:15:47 +0000] [1] [INFO] Starting gunicorn 21.2.0
[2025-11-07 21:15:47 +0000] [1] [INFO] Using worker: sync
[2025-11-07 21:15:47 +0000] [1] [INFO] Listening at: http://0.0.0.0:5000 (1)
[2025-11-07 21:15:47 +0000] [2] [INFO] Booting worker with pid: 2
```

**Wrong (multiple workers):**
```
[2025-11-07 21:15:47 +0000] [2] [INFO] Booting worker with pid: 2
[2025-11-07 21:15:47 +0000] [3] [INFO] Booting worker with pid: 3
[2025-11-07 21:15:47 +0000] [4] [INFO] Booting worker with pid: 4
```

Note: Even with `--workers 1`, you'll see worker pid 2 (the actual worker process). But you should NOT see pid 3, 4, etc.

---

## After Fixing

1. ✅ Only 1 worker starts
2. ✅ Memory usage reduced
3. ✅ No more SIGKILL errors
4. ✅ Login works faster
5. ✅ AI models load on first use (lazy loading)

---

**Check your Railway dashboard now and fix the worker count!** 🚀

