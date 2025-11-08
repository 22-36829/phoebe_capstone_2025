# Railway AI Services Initialization Guide

## Overview

The AI services are now configured to initialize **synchronously at startup** in Railway/Gunicorn environments. This ensures models are loaded before the server accepts requests.

## Key Changes

### 1. **Synchronous Initialization**
- Changed from background thread to **synchronous initialization**
- Models load when the Gunicorn worker process starts
- Services are ready before accepting requests
- Better for Railway's deployment model

### 2. **Gunicorn Worker Process**
- With `--workers 1`, only one worker process initializes
- Initialization happens in the worker process, not the master
- Each worker has its own copy of models (memory isolated)

### 3. **Error Handling**
- If initialization fails, falls back to minimal service
- App continues to run with limited AI functionality
- Clear error messages in Railway logs

## Expected Railway Logs

### Successful Initialization
```
============================================================
Starting AI services initialization (Railway/Gunicorn mode)...
============================================================
Initializing basic AI service...
============================================================
Initializing Basic AI Service...
============================================================
Pre-loading AI models (this may take 10-30 seconds)...
Loading AI models...
AI models loaded successfully in 15.23s
✓ Basic AI service initialized successfully in 15.45s
============================================================
Initializing enhanced AI service...
Initializing Enhanced AI Service...
Loading live database data for AI inventory cache
Loaded 691 medicines from database
✓ Enhanced AI service initialized successfully in 8.32s
============================================================
AI services initialization completed
============================================================
```

### Failed Initialization (Fallback)
```
============================================================
Starting AI services initialization (Railway/Gunicorn mode)...
============================================================
Initializing basic AI service...
✗ Failed to initialize AI service after 5.12s: [error details]
Falling back to minimal AI service (limited functionality)
============================================================
```

## Health Check Endpoint

### Check AI Services Status
```
GET /api/health/ai
```

### Response (Success)
```json
{
  "status": "ready",
  "services": {
    "basic": true,
    "enhanced": true,
    "errors": []
  },
  "ready": true
}
```

### Response (Partial/Failed)
```json
{
  "status": "partial",
  "services": {
    "basic": false,
    "enhanced": true,
    "errors": [
      "Basic AI: Using minimal fallback service"
    ]
  },
  "ready": false
}
```

## Railway Configuration

### Start Command (in Railway Dashboard)
```
gunicorn app:app --bind 0.0.0.0:$PORT --workers 1 --timeout 120 --worker-class sync
```

### Important Settings
- **Workers**: `1` (to fit in memory limits)
- **Timeout**: `120` seconds (allows time for model loading)
- **Worker Class**: `sync` (standard synchronous workers)

## Initialization Timing

### Expected Startup Time
- **Basic AI Service**: 10-30 seconds
- **Enhanced AI Service**: 5-15 seconds
- **Total Startup**: 15-45 seconds

### What Happens
1. Gunicorn master process starts
2. Worker process boots
3. Flask app imports and registers routes
4. AI services initialize synchronously
5. Models load into memory
6. Worker starts accepting requests

## Troubleshooting

### Issue: Models Not Loading
**Symptoms**: Health check shows `"basic": false`

**Check**:
1. Railway logs for initialization errors
2. Memory usage (models need ~500MB-1GB)
3. Database connection (for enhanced AI service)

**Solution**:
- Check Railway logs for specific error
- Verify database connection string
- Check available memory in Railway plan

### Issue: Slow Startup
**Symptoms**: Worker takes >60 seconds to start

**Check**:
1. Model file sizes
2. Database query performance
3. Network latency to database

**Solution**:
- Models load on first deployment (subsequent restarts are faster if models are cached)
- Database queries are optimized for startup
- Consider using connection pooling

### Issue: Out of Memory
**Symptoms**: Worker killed during initialization

**Check**:
1. Railway memory limits
2. Number of workers (should be 1)
3. Model sizes

**Solution**:
- Ensure `--workers 1` in start command
- Check Railway plan memory limits
- Models are loaded once per worker

## Monitoring

### Check Initialization Status
1. **Railway Logs**: Look for initialization messages
2. **Health Endpoint**: `GET /api/health/ai`
3. **Application Logs**: Check for ✓ or ✗ markers

### Expected Log Messages
- `✓ Basic AI service initialized successfully`
- `✓ Enhanced AI service initialized successfully`
- `AI services initialization completed`

### Warning Signs
- `✗ Failed to initialize`
- `Falling back to minimal AI service`
- `Timeout waiting for models to load`

## Local vs Railway Differences

### Local Development
- Uses Flask development server
- Initialization happens in main thread
- Can use background threads (not recommended for production)

### Railway Production
- Uses Gunicorn with worker processes
- Initialization happens in worker process
- Synchronous initialization (blocks until complete)
- Better error visibility in logs

## Best Practices

1. **Monitor Startup Logs**: Always check Railway logs after deployment
2. **Use Health Endpoint**: Check `/api/health/ai` to verify services
3. **Single Worker**: Use `--workers 1` to fit in memory
4. **Timeout Settings**: Set `--timeout 120` for model loading
5. **Error Handling**: App continues with minimal service if initialization fails

## Next Steps After Deployment

1. Check Railway logs for initialization messages
2. Test health endpoint: `curl https://your-app.railway.app/api/health/ai`
3. Test AI Assistant in the application
4. Monitor memory usage in Railway dashboard
5. Check for any initialization errors

## Support

If initialization fails:
1. Check Railway logs for specific error
2. Verify database connection
3. Check memory limits
4. Test health endpoint
5. Review error messages in logs

