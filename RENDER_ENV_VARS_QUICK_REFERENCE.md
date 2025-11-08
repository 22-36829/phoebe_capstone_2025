# Render Environment Variables - Quick Reference

## ⚠️ IMPORTANT: Exact Values to Copy/Paste

### Required Variables (Add all 7):

| Key | Value |
|-----|-------|
| `DATABASE_URL` | `postgresql+psycopg2://postgres.xybuirzvlfuwmtcokkwm:PhoebeDrugStore01@aws-1-ap-southeast-1.pooler.supabase.com:6543/postgres?pgbouncer=true` |
| `FLASK_APP` | `ai_service_app.py` |
| `FLASK_ENV` | `production` |
| `SECRET_KEY` | `YOUR_RANDOM_SECRET_KEY_HERE` (see below) |
| `AI_INVENTORY_REFRESH_SECONDS` | `300` |
| `AI_EMBEDDING_MODEL` | `sentence-transformers/all-MiniLM-L6-v2` |
| `NLTK_DATA` | `/tmp/nltk_data` |

## Generate SECRET_KEY

### Option 1: Python Command
```bash
python -c "import secrets; print(secrets.token_hex(32))"
```

### Option 2: Online Generator
Visit: https://randomkeygen.com/
- Use "CodeIgniter Encryption Keys"
- Copy a 32+ character key

### Option 3: Quick Random String
```bash
# Linux/Mac
openssl rand -hex 32

# Windows PowerShell
-join ((48..57) + (65..90) + (97..122) | Get-Random -Count 32 | ForEach-Object {[char]$_})
```

## Step-by-Step: Adding Variables in Render

1. **Go to Render Dashboard**
   - https://dashboard.render.com
   - Select your service: `phoebe-ai-assistant`

2. **Open Environment Tab**
   - Click "Environment" in left sidebar
   - Or go to: Settings → Environment

3. **Add Each Variable**
   - Click "Add Environment Variable"
   - **Key:** `DATABASE_URL`
   - **Value:** `postgresql+psycopg2://postgres.xybuirzvlfuwmtcokkwm:PhoebeDrugStore01@aws-1-ap-southeast-1.pooler.supabase.com:6543/postgres?pgbouncer=true`
   - Click "Save"
   - Repeat for each variable

4. **Complete List to Add:**
   ```
   DATABASE_URL = postgresql+psycopg2://postgres.xybuirzvlfuwmtcokkwm:PhoebeDrugStore01@aws-1-ap-southeast-1.pooler.supabase.com:6543/postgres?pgbouncer=true
   FLASK_APP = ai_service_app.py
   FLASK_ENV = production
   SECRET_KEY = [GENERATE YOUR OWN - see above]
   AI_INVENTORY_REFRESH_SECONDS = 300
   AI_EMBEDDING_MODEL = sentence-transformers/all-MiniLM-L6-v2
   NLTK_DATA = /tmp/nltk_data
   ```

5. **Save Changes**
   - Review all variables
   - Click "Save Changes"
   - Service will restart automatically

## Root Directory Setting

**⚠️ IMPORTANT:** In Render Dashboard → Settings:
- **Root Directory:** Set to `backend`
- This tells Render to build from the `backend` folder

## Build & Start Commands (with Root Directory = backend)

**Build Command:**
```bash
pip install --upgrade pip && pip install --no-cache-dir --extra-index-url https://download.pytorch.org/whl/cpu -r requirements.txt
```

**Start Command:**
```bash
gunicorn ai_service_app:app --bind 0.0.0.0:$PORT --workers 1 --timeout 300 --worker-class sync --preload
```

## Verification Checklist

After deployment, verify:

- [ ] All 7 environment variables are set
- [ ] SECRET_KEY is a random string (not the example)
- [ ] Root Directory is set to `backend`
- [ ] Build command uses `requirements.txt` (not `backend/requirements.txt`)
- [ ] Start command doesn't have `cd backend`
- [ ] Service builds successfully
- [ ] Health check works: `https://your-service.onrender.com/api/health`

## Common Mistakes

❌ **Wrong:** Root Directory = empty, Build Command = `pip install -r backend/requirements.txt`
✅ **Correct:** Root Directory = `backend`, Build Command = `pip install -r requirements.txt`

❌ **Wrong:** Start Command = `cd backend && gunicorn ai_service_app:app ...`
✅ **Correct:** Start Command = `gunicorn ai_service_app:app ...`

❌ **Wrong:** SECRET_KEY = `CHANGE_THIS_TO_A_RANDOM_STRING`
✅ **Correct:** SECRET_KEY = `a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6` (your generated key)

## Testing

After deployment, test with:

```bash
# Health check
curl https://your-service.onrender.com/api/health

# Test AI endpoint
curl -X POST https://your-service.onrender.com/api/ai/enhanced/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "Find Amlodipine", "user_id": "test", "pharmacy_id": 1}'
```

## Need Help?

- Check logs in Render Dashboard → Logs tab
- Verify all environment variables are set correctly
- Ensure Root Directory is `backend`
- Check build and start commands are correct

