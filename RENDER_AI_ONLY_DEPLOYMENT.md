# Render Deployment - AI Assistant Service Only

## Overview
This guide deploys **only the AI Assistant functionality** to Render, keeping the main backend on Railway or elsewhere.

## Architecture

```
┌─────────────────┐         ┌──────────────────┐
│   Vercel        │         │   Railway         │
│   (Frontend)    │────────▶│   (Main Backend)  │
└─────────────────┘         └──────────────────┘
                                      │
                                      │ (AI requests)
                                      ▼
                             ┌──────────────────┐
                             │   Render         │
                             │   (AI Service)   │
                             └──────────────────┘
```

## Files Needed for AI Service

### Core AI Files:
- `backend/ai_service_app.py` - Minimal Flask app for AI only
- `backend/routes/ai.py` - Basic AI routes
- `backend/routes/ai_enhanced.py` - Enhanced AI routes
- `backend/services/enhanced_ai_service.py` - Enhanced AI service
- `backend/services/semantic_embeddings.py` - Semantic search
- `backend/services/ai_metrics.py` - AI metrics (if used)
- `backend/services/ultra_advanced_ai.py` - Advanced AI (if used)
- `backend/services/ai_inventory_classifier.py` - Classifier (if used)

### Dependencies:
- `backend/requirements.txt` - Python packages
- `backend/utils/helpers.py` - Database helpers
- `backend/config/` - Configuration files (if any)

## Deployment Steps

### 1. Create Render Service

1. Go to https://dashboard.render.com
2. Click "New +" → "Web Service"
3. Connect GitHub repository: `22-36829/phoebe_capstone_2025`

### 2. Configure Service

**Name:** `phoebe-ai-assistant`

**Build Command:**
```bash
pip install --upgrade pip && pip install --no-cache-dir --extra-index-url https://download.pytorch.org/whl/cpu -r backend/requirements.txt
```

**Start Command:**
```bash
cd backend && gunicorn ai_service_app:app --bind 0.0.0.0:$PORT --workers 1 --timeout 300 --worker-class sync --preload
```

**Environment:** `Python 3.11`

**Root Directory:** Leave empty (builds from root)

### 3. Environment Variables

Add these in Render Dashboard:

```bash
# Database (same as main backend)
DATABASE_URL=postgresql+psycopg2://postgres.xybuirzvlfuwmtcokkwm:PhoebeDrugStore01@aws-1-ap-southeast-1.pooler.supabase.com:6543/postgres?pgbouncer=true

# Flask
FLASK_APP=ai_service_app.py
FLASK_ENV=production
SECRET_KEY=your-secret-key-here

# AI/ML
AI_INVENTORY_REFRESH_SECONDS=300
AI_EMBEDDING_MODEL=sentence-transformers/all-MiniLM-L6-v2

# NLTK
NLTK_DATA=/tmp/nltk_data

# Port (auto-set by Render)
PORT=10000
```

### 4. Instance Type

**Recommended:** Standard Plan ($25/month)
- 2GB RAM - sufficient for SentenceTransformer
- 1 CPU - good performance
- Always on

**Minimum:** Starter Plan ($7/month)
- 512MB RAM - may have memory issues
- 0.5 CPU - slower

**Best:** Pro Plan ($85/month)
- 4GB RAM - plenty of headroom
- 2 CPU - fast

### 5. Update Frontend

Update Vercel to use Render for AI endpoints:

**Option A: Proxy through Main Backend**
Keep main backend on Railway, add proxy endpoint:

```python
# In main backend (Railway)
@app.route('/api/ai/enhanced/chat', methods=['POST'])
def proxy_ai_chat():
    import requests
    ai_service_url = os.getenv('AI_SERVICE_URL', 'https://phoebe-ai-assistant.onrender.com')
    response = requests.post(
        f'{ai_service_url}/api/ai/enhanced/chat',
        json=request.json,
        headers={'Content-Type': 'application/json'},
        timeout=60
    )
    return response.json(), response.status_code
```

**Option B: Direct to Render**
Update Vercel environment variable:

```bash
REACT_APP_AI_SERVICE_URL=https://phoebe-ai-assistant.onrender.com
```

Then update frontend to use this URL for AI requests.

## File Structure

```
backend/
├── ai_service_app.py          # NEW: Minimal AI-only app
├── routes/
│   ├── ai.py                  # Basic AI routes
│   └── ai_enhanced.py         # Enhanced AI routes
├── services/
│   ├── enhanced_ai_service.py # Enhanced AI service
│   ├── semantic_embeddings.py # Semantic search
│   ├── ai_metrics.py          # Metrics
│   ├── ultra_advanced_ai.py    # Advanced AI
│   └── ai_inventory_classifier.py # Classifier
├── utils/
│   └── helpers.py             # Database helpers
└── requirements.txt            # Dependencies
```

## Testing

### 1. Health Check
```bash
curl https://phoebe-ai-assistant.onrender.com/api/health
```

### 2. Test AI Endpoint
```bash
curl -X POST https://phoebe-ai-assistant.onrender.com/api/ai/enhanced/chat \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Find Amlodipine",
    "user_id": "test",
    "pharmacy_id": 1
  }'
```

### 3. Test Basic AI
```bash
curl -X POST https://phoebe-ai-assistant.onrender.com/api/ai/chat \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Find Amlodipine",
    "pharmacy_id": 1
  }'
```

## Advantages

1. **Isolated AI Service**
   - Can scale independently
   - Better resource allocation
   - Easier to debug AI issues

2. **Better Memory Management**
   - Render Standard/Pro plans have more RAM
   - No interference from other backend code
   - Dedicated resources for ML models

3. **Cost Optimization**
   - Only pay for AI service resources
   - Main backend can stay on cheaper Railway plan
   - Scale AI service independently

4. **Easier Updates**
   - Update AI service without affecting main backend
   - Faster deployments
   - Independent versioning

## Disadvantages

1. **Additional Service**
   - Need to manage two services
   - More complex architecture
   - Potential latency (if proxying)

2. **CORS Configuration**
   - Need to configure CORS properly
   - May need proxy through main backend

3. **Database Connections**
   - Both services connect to same database
   - Need to manage connection pooling

## Recommended Setup

1. **Main Backend (Railway):**
   - All non-AI endpoints
   - Authentication
   - Main business logic
   - Smaller instance (512MB-1GB RAM)

2. **AI Service (Render):**
   - Only AI endpoints
   - ML model loading
   - Semantic search
   - Standard/Pro plan (2GB-4GB RAM)

3. **Frontend (Vercel):**
   - Points to main backend for most requests
   - Points to AI service for AI requests (or proxy through main backend)

## Next Steps

1. ✅ Create `backend/ai_service_app.py`
2. ✅ Create `render-ai-only.yaml`
3. Deploy to Render
4. Test AI endpoints
5. Update frontend to use AI service
6. Monitor performance

