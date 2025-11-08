# Render Deployment Guide for Phoebe Pharmacy Management System

## Overview
This guide covers deploying the Phoebe backend to Render instead of Railway. Render offers better memory limits and more predictable performance for ML workloads.

## Render vs Railway Comparison

### Railway (Current)
- ❌ Limited memory (512MB - 8GB depending on plan)
- ❌ Worker timeout issues with ML models
- ❌ Memory spikes cause worker crashes
- ✅ Easy deployment from GitHub
- ✅ Free tier available

### Render
- ✅ Better memory limits (512MB - 16GB+)
- ✅ More stable for ML workloads
- ✅ Better CPU performance
- ✅ No worker timeout issues
- ✅ Free tier available
- ✅ More predictable pricing

## Prerequisites
1. Render account: https://render.com
2. GitHub repository connected to Render
3. Environment variables ready

## Deployment Steps

### 1. Create Web Service on Render

1. Go to Render Dashboard: https://dashboard.render.com
2. Click "New +" → "Web Service"
3. Connect your GitHub repository
4. Select the repository: `22-36829/phoebe_capstone_2025`

### 2. Configure Build Settings

**Option A: Using render.yaml (Recommended)**
The `render.yaml` file is already configured with the correct settings. Make sure it's committed to your repository.

**Option B: Manual Dashboard Configuration**

**Root Directory:** Set to `backend` in Render Dashboard → Settings

**Build Command:**
```bash
pip install --upgrade pip && pip install --no-cache-dir --extra-index-url https://download.pytorch.org/whl/cpu -r requirements.txt
```
*Note: Use `requirements.txt` (not `backend/requirements.txt`) when Root Directory is set to `backend`*

**Start Command:**
```bash
gunicorn app:app --bind 0.0.0.0:$PORT --workers 1 --timeout 300 --worker-class sync --preload
```

**Environment:** `Python 3.11` or `Python 3.13`

**Important:** If Root Directory is set to `backend`, the build command should reference `requirements.txt` directly, not `backend/requirements.txt`

### 3. Environment Variables

Add these in Render Dashboard → Environment:

```bash
# Database
DATABASE_URL=postgresql+psycopg2://postgres.xybuirzvlfuwmtcokkwm:PhoebeDrugStore01@aws-1-ap-southeast-1.pooler.supabase.com:6543/postgres?pgbouncer=true

# Flask
FLASK_APP=app.py
FLASK_ENV=production
SECRET_KEY=your-secret-key-here

# AI/ML
AI_INVENTORY_REFRESH_SECONDS=300
AI_EMBEDDING_MODEL=sentence-transformers/all-MiniLM-L6-v2

# NLTK
NLTK_DATA=/tmp/nltk_data

# Port (Render sets this automatically)
PORT=10000
```

### 4. Instance Type

**Free Tier:**
- RAM: 512MB
- CPU: 0.1-0.5 CPU
- ⚠️ May still have memory issues with ML models

**Starter Plan ($7/month):**
- RAM: 512MB
- CPU: 0.5 CPU
- Better performance

**Standard Plan ($25/month):**
- RAM: 2GB
- CPU: 1 CPU
- ✅ Recommended for ML workloads

**Pro Plan ($85/month):**
- RAM: 4GB
- CPU: 2 CPU
- ✅ Best for production ML workloads

### 5. Build Configuration Files

Create `render.yaml` in the root directory:

```yaml
services:
  - type: web
    name: phoebe-backend
    env: python
    buildCommand: pip install --upgrade pip && pip install --no-cache-dir --extra-index-url https://download.pytorch.org/whl/cpu -r backend/requirements.txt
    startCommand: cd backend && gunicorn app:app --bind 0.0.0.0:$PORT --workers 1 --timeout 300 --worker-class sync --preload
    envVars:
      - key: DATABASE_URL
        sync: false
      - key: FLASK_APP
        value: app.py
      - key: FLASK_ENV
        value: production
      - key: SECRET_KEY
        generateValue: true
      - key: NLTK_DATA
        value: /tmp/nltk_data
      - key: AI_INVENTORY_REFRESH_SECONDS
        value: "300"
      - key: AI_EMBEDDING_MODEL
        value: sentence-transformers/all-MiniLM-L6-v2
    healthCheckPath: /api/health
    plan: starter  # or standard, pro
```

### 6. Update Vercel Environment Variable

After deployment, update Vercel to point to Render URL:

**Vercel Dashboard → Settings → Environment Variables:**

```bash
REACT_APP_API_BASE=https://phoebe-backend.onrender.com
```

Replace `phoebe-backend.onrender.com` with your actual Render service URL.

## Advantages of Render

1. **Better Memory Management:**
   - More predictable memory limits
   - Better for ML model loading
   - Less worker crashes

2. **Stable Performance:**
   - No worker timeout issues
   - Better CPU allocation
   - More reliable for production

3. **Easier Configuration:**
   - Simple YAML configuration
   - Better dashboard
   - More control over resources

## Migration Steps from Railway

1. **Deploy to Render** (follow steps above)
2. **Test the deployment** (check health endpoint)
3. **Update Vercel** environment variable
4. **Test AI Assistant** in production
5. **Monitor logs** for any issues
6. **Switch DNS** (if using custom domain)
7. **Decommission Railway** deployment (optional)

## Troubleshooting

### Issue: Memory errors
**Solution:** Upgrade to Standard or Pro plan (more RAM)

### Issue: Slow startup
**Solution:** Use `--preload` flag in gunicorn (already in start command)

### Issue: Model loading timeout
**Solution:** Increase timeout to 300 seconds (already configured)

### Issue: Database connection errors
**Solution:** Use connection pooler URL (already in env vars)

## Cost Comparison

### Railway
- Free: Limited resources
- Hobby: $5/month (512MB RAM)
- Pro: $20/month (1GB RAM)

### Render
- Free: 512MB RAM (sleeps after inactivity)
- Starter: $7/month (512MB RAM, always on)
- Standard: $25/month (2GB RAM, always on) ✅ Recommended
- Pro: $85/month (4GB RAM, always on)

## Recommendation

For ML workloads with SentenceTransformer:
- **Minimum:** Render Standard Plan ($25/month)
- **Recommended:** Render Pro Plan ($85/month) for production
- **Free tier:** Only for testing, not production

## Next Steps

1. Create Render account
2. Follow deployment steps above
3. Update Vercel environment variable
4. Test AI Assistant
5. Monitor performance

