# Vercel Environment Variables Checklist

## Required Environment Variable

### For AI Assistant to Work in Production

**Variable Name:** `REACT_APP_API_BASE`

**Value:** `https://web-production-95ddb.up.railway.app`

**Important:** 
- ✅ NO trailing slash
- ✅ Must include `https://`
- ✅ Must be set for **Production** environment
- ✅ Should also be set for **Preview** environment

## How to Set in Vercel

1. Go to **Vercel Dashboard**: https://vercel.com
2. Select your **project**
3. Go to **Settings** → **Environment Variables**
4. Click **Add New**
5. Set:
   - **Key**: `REACT_APP_API_BASE`
   - **Value**: `https://web-production-95ddb.up.railway.app`
   - **Environment**: Select **Production** (and **Preview** if you want)
6. Click **Save**

## After Setting

1. **Redeploy** your frontend:
   - Go to **Deployments** tab
   - Click **...** (three dots) on latest deployment
   - Click **Redeploy**
   - Or push a new commit to trigger automatic redeploy

2. **Verify**:
   - Open browser console (F12)
   - Go to Network tab
   - Use AI Assistant
   - Check the request URL - should be `https://web-production-95ddb.up.railway.app/api/ai/enhanced/chat`

## Troubleshooting

### Issue: Still using relative URL
**Solution**: 
- Check if environment variable is set correctly
- Redeploy frontend (environment variables are baked in at build time)
- Check browser console for logged API URL

### Issue: CORS errors
**Solution**:
- Check Railway CORS settings
- Verify Railway URL is correct
- Check browser console for CORS error details

### Issue: 404 Not Found
**Solution**:
- Verify Railway URL is correct
- Check if Railway service is running
- Test Railway URL directly: `https://web-production-95ddb.up.railway.app/api/health`

### Issue: Network error
**Solution**:
- Check if Railway service is running
- Verify Railway URL is accessible
- Check browser Network tab for error details

## Testing

### Test 1: Check Environment Variable
In browser console after deployment:
```javascript
console.log('API Base:', process.env.REACT_APP_API_BASE);
```

### Test 2: Check Network Request
1. Open DevTools → Network tab
2. Use AI Assistant
3. Look for request to `/api/ai/enhanced/chat`
4. Check the full URL in request details
5. Should be: `https://web-production-95ddb.up.railway.app/api/ai/enhanced/chat`

### Test 3: Direct API Test
```bash
curl -X POST https://web-production-95ddb.up.railway.app/api/ai/enhanced/chat \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Find Amlodipine",
    "user_id": "test",
    "pharmacy_id": 1
  }'
```

