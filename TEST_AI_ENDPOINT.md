# Testing AI Endpoint

## Test the Chat Endpoint Directly

After Railway deploys, test the endpoint directly using curl or Postman:

### Test 1: Simple Chat Request
```bash
curl -X POST https://your-railway-url.railway.app/api/ai/enhanced/chat \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Find Amlodipine",
    "user_id": "test_user",
    "pharmacy_id": 1
  }'
```

### Expected Response (Success)
```json
{
  "success": true,
  "response": {
    "message": "Found X medicines matching your request:...",
    "type": "enhanced_search_results",
    "data": [...],
    "total_matches": X,
    "enhanced_mode": true
  }
}
```

### Expected Response (Error - but still success: true)
```json
{
  "success": true,
  "response": {
    "message": "I apologize, but I encountered an error...",
    "type": "error",
    "data": [],
    "total_matches": 0,
    "enhanced_mode": false
  }
}
```

## Check Railway Logs

After making a request, check Railway logs for:
1. `[BEFORE_REQUEST] Enhanced AI: POST /api/ai/enhanced/chat`
2. `Enhanced AI chat endpoint CALLED`
3. Any error messages

## Common Issues

### Issue: Request not reaching server
**Symptoms**: No logs in Railway
**Check**: 
- API URL is correct in frontend
- Network tab in browser shows request
- CORS is configured correctly

### Issue: Service not available
**Symptoms**: Logs show "Enhanced AI service not available"
**Check**:
- Health endpoint: `/api/health/ai`
- Service initialization logs

### Issue: Database connection error
**Symptoms**: Error in `search_medicines` or `generate_chat_response`
**Check**:
- Database connection string in Railway
- Database is accessible from Railway

### Issue: Response format error
**Symptoms**: Frontend shows error even though backend returns 200
**Check**:
- Response has `success: true`
- Response has `response` field
- Response format matches frontend expectations

