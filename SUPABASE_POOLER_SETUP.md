# ✅ Use Supabase Connection Pooler (RECOMMENDED)

## Why Use Connection Pooler?

✅ **Better for Railway deployments**
✅ **Handles network restrictions automatically**
✅ **More efficient connection management**
✅ **Designed for cloud/serverless apps**

---

## 🔧 Setup Instructions

### Step 1: Get Your Connection Pooler URL

You already have it:
```
postgresql://postgres.xybuirzvlfuwmtcokkwm:[YOUR-PASSWORD]@aws-1-ap-southeast-1.pooler.supabase.com:6543/postgres
```

### Step 2: Replace `[YOUR-PASSWORD]` with Your Actual Password

Your password is: `PhoebeDrugStore01`

So the full URL should be:
```
postgresql://postgres.xybuirzvlfuwmtcokkwm:PhoebeDrugStore01@aws-1-ap-southeast-1.pooler.supabase.com:6543/postgres
```

### Step 3: Format for psycopg2 (Python)

For Python/SQLAlchemy, use this format:
```
postgresql+psycopg2://postgres.xybuirzvlfuwmtcokkwm:PhoebeDrugStore01@aws-1-ap-southeast-1.pooler.supabase.com:6543/postgres?pgbouncer=true
```

**Important differences:**
- ✅ `postgresql+psycopg2://` (for Python psycopg2 driver)
- ✅ Port `6543` (connection pooler port)
- ✅ `?pgbouncer=true` (pooler indicator - automatically removed by application code)

### Step 4: Update Railway Environment Variable

1. Go to **Railway Dashboard**: https://railway.app
2. Select your **backend service**
3. Go to **Variables** tab
4. Find `DATABASE_URL` variable
5. **Update** it with the new pooler URL:
   ```
   postgresql+psycopg2://postgres.xybuirzvlfuwmtcokkwm:PhoebeDrugStore01@aws-1-ap-southeast-1.pooler.supabase.com:6543/postgres?pgbouncer=true
   ```
6. Click **Save** or **Update**

### Step 5: Railway Will Auto-Redeploy

After saving the variable, Railway will automatically:
- ✅ Restart your service
- ✅ Use the new DATABASE_URL
- ✅ Connect through the pooler

---

## ✅ Test Connection

### After Railway redeploys:

1. **Test root endpoint:**
   ```
   https://web-production-95ddb.up.railway.app/
   ```
   Should show API info.

2. **Test health endpoint:**
   ```
   https://web-production-95ddb.up.railway.app/api/health
   ```
   Should show:
   ```json
   {
     "status": "ok",
     "database": "connected"
   }
   ```

3. **Check Railway logs:**
   - No more "Network is unreachable" errors
   - Database connection successful
   - Tables initialized properly

---

## 📝 Quick Reference

### Old URL (Direct Connection - Port 5432):
```
postgresql+psycopg2://postgres:PhoebeDrugStore01@db.xybuirzvlfuwmtcokkwm.supabase.co:5432/postgres?sslmode=require
```

### New URL (Connection Pooler - Port 6543):
```
postgresql+psycopg2://postgres.xybuirzvlfuwmtcokkwm:PhoebeDrugStore01@aws-1-ap-southeast-1.pooler.supabase.com:6543/postgres?pgbouncer=true
```

**Key Changes:**
- `postgres` → `postgres.xybuirzvlfuwmtcokkwm` (pooler user)
- `db.xybuirzvlfuwmtcokkwm.supabase.co` → `aws-1-ap-southeast-1.pooler.supabase.com` (pooler host)
- Port `5432` → `6543` (pooler port)
- `?sslmode=require` → `?pgbouncer=true` (pooler parameter)

---

## 🎯 Why This Should Fix Your Issue

1. **Network Restrictions**: Connection pooler handles IP restrictions automatically
2. **Better Performance**: Pools connections efficiently
3. **Cloud-Optimized**: Designed for serverless/cloud deployments
4. **Auto-Scaling**: Handles connection spikes better

---

## ✅ Next Steps

1. ✅ Update `DATABASE_URL` in Railway with pooler URL
2. ✅ Wait for Railway to redeploy (~30 seconds)
3. ✅ Test `/api/health` endpoint
4. ✅ Verify database connection in logs
5. ✅ Deploy frontend to Vercel

**Your Railway URL**: `https://web-production-95ddb.up.railway.app`

