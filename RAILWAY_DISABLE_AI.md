# Disable AI Assistant on Railway (Keep Forecasting)

## Overview

This guide explains how to disable AI Assistant routes on Railway while keeping Forecasting functionality enabled.

## Solution

The code now supports an environment variable `ENABLE_AI_ROUTES` that controls whether AI Assistant routes are registered.

### How It Works

- **Forecasting routes**: Always enabled (not affected by `ENABLE_AI_ROUTES`)
- **AI Assistant routes**: Controlled by `ENABLE_AI_ROUTES` environment variable
  - `ENABLE_AI_ROUTES=true` (default): AI routes enabled
  - `ENABLE_AI_ROUTES=false`: AI routes disabled

## Steps to Disable AI on Railway

### Step 1: Add Environment Variable to Railway

1. Go to **Railway Dashboard**: https://railway.app
2. Select your **Phoebe backend service**
3. Go to **Variables** tab
4. Click **+ New Variable**
5. Add:
   - **Key**: `ENABLE_AI_ROUTES`
   - **Value**: `false`
6. Click **Add**
7. Railway will automatically redeploy

### Step 2: Verify Changes

After redeployment, check the logs:

**Expected log output:**
```
✗ AI Assistant routes disabled (ENABLE_AI_ROUTES=false)
Skipping AI services initialization (AI routes disabled)
```

**Forecasting should still work:**
- ✅ `/api/forecasting/*` endpoints available
- ✅ Forecasting models can be trained
- ✅ Forecasts can be generated
- ✅ Model comparison works

**AI Assistant will be disabled:**
- ❌ `/api/ai/*` endpoints return 404
- ❌ `/api/ai/enhanced/*` endpoints return 404
- ❌ AI services not initialized (saves memory)

## Current Setup

### Railway (AI Disabled)
- **ENABLE_AI_ROUTES**: `false`
- **Forecasting**: ✅ Enabled
- **AI Assistant**: ❌ Disabled
- **Memory Usage**: Lower (no AI models loaded)

### Render (AI Enabled)
- **ENABLE_AI_ROUTES**: `true` (default) or not set
- **Forecasting**: ✅ Enabled
- **AI Assistant**: ✅ Enabled
- **Memory Usage**: Higher (AI models loaded)

## Benefits

### On Railway:
- ✅ Reduced memory usage (no AI models loaded)
- ✅ Faster startup time
- ✅ Lower resource consumption
- ✅ Forecasting still works perfectly
- ✅ All other features work normally

### On Render:
- ✅ Full AI capabilities
- ✅ Better memory for AI workloads
- ✅ All features enabled

## Verification

### Test Forecasting (Should Work):
```bash
# Train a forecasting model
POST /api/forecasting/train

# Get forecasts
GET /api/forecasting/predictions?target_id=1&forecast_days=30

# Get models
GET /api/forecasting/models
```

### Test AI Assistant (Should Return 404):
```bash
# This should return 404 on Railway
POST /api/ai/enhanced/chat

# This should return 404 on Railway
POST /api/ai/chat
```

## Environment Variables Summary

### Railway Environment Variables:
```bash
ENABLE_AI_ROUTES=false
DATABASE_URL=your_database_url
JWT_SECRET_KEY=your_secret_key
# ... other variables
```

### Render Environment Variables:
```bash
# ENABLE_AI_ROUTES not set (defaults to true)
# OR explicitly set:
ENABLE_AI_ROUTES=true
DATABASE_URL=your_database_url
# ... other variables
```

## Code Changes Made

### backend/app.py

**Before:**
```python
# AI Assistant Routes
from routes.ai import ai_bp
from routes.ai_enhanced import ai_enhanced_bp
app.register_blueprint(ai_bp)
app.register_blueprint(ai_enhanced_bp)
```

**After:**
```python
# AI Assistant Routes (can be disabled via ENABLE_AI_ROUTES env var)
ENABLE_AI_ROUTES = os.getenv('ENABLE_AI_ROUTES', 'true').lower() in ('true', '1', 'yes', 'on')

if ENABLE_AI_ROUTES:
    try:
        from routes.ai import ai_bp
        from routes.ai_enhanced import ai_enhanced_bp
        app.register_blueprint(ai_bp)
        app.register_blueprint(ai_enhanced_bp)
        logger.info("✓ AI Assistant routes enabled")
    except Exception as e:
        logger.warning(f"Failed to register AI routes: {e}")
else:
    logger.info("✗ AI Assistant routes disabled (ENABLE_AI_ROUTES=false)")
```

**AI Services Initialization:**
```python
def initialize_ai_services():
    # Skip initialization if AI routes are disabled
    if not ENABLE_AI_ROUTES:
        logger.info("Skipping AI services initialization (AI routes disabled)")
        return
    # ... rest of initialization
```

## After Setup

1. ✅ Railway: AI routes disabled, Forecasting enabled
2. ✅ Render: All features enabled (AI + Forecasting)
3. ✅ Vercel: Points to Render for AI features
4. ✅ Both backends: Forecasting available

## Notes

- **Forecasting is independent** of AI Assistant - it uses its own models (SARIMAX, Prophet)
- **No code changes needed** for Forecasting - it continues to work normally
- **AI packages are still installed** on Railway (they're just not used)
- **Memory savings** come from not initializing AI models, not from uninstalling packages

