# ✅ Deployment Checklist

## Pre-Deployment

### Frontend (Vercel)
- [x] `vercel.json` created
- [x] `package.json` has build script
- [x] Environment variable `REACT_APP_API_BASE` ready
- [ ] Test build locally: `cd frontend && npm run build`

### Backend (Railway)
- [x] `Procfile` created
- [x] `requirements.txt` includes `gunicorn`
- [x] `app.py` uses `PORT` environment variable
- [x] CORS configured (allows all origins)
- [ ] Environment variables ready:
  - [ ] `DATABASE_URL`
  - [ ] `JWT_SECRET_KEY` (generate strong secret)
  - [ ] `APP_SECRET_KEY` (generate strong secret)
  - [ ] `FLASK_DEBUG=0`

---

## Deployment Steps

### 1. Deploy Backend First (Railway)
- [ ] Go to https://railway.app
- [ ] Create new project
- [ ] Connect GitHub repository
- [ ] Set root directory to `backend`
- [ ] Add environment variables
- [ ] Deploy and get backend URL

### 2. Deploy Frontend (Vercel)
- [ ] Go to https://vercel.com
- [ ] Create new project
- [ ] Connect GitHub repository
- [ ] Set root directory to `frontend`
- [ ] Add `REACT_APP_API_BASE` = backend URL from Railway
- [ ] Deploy

### 3. Post-Deployment
- [ ] Test frontend URL
- [ ] Test backend API endpoints
- [ ] Test login/authentication
- [ ] Verify CORS works
- [ ] Check logs for errors

---

## Quick Commands

### Generate Secret Keys
```bash
# Generate JWT Secret
python -c "import secrets; print(secrets.token_urlsafe(32))"

# Generate App Secret
python -c "import secrets; print(secrets.token_urlsafe(32))"
```

### Test Backend Locally
```bash
cd backend
pip install -r requirements.txt
python app.py
```

### Test Frontend Build
```bash
cd frontend
npm install
npm run build
```

---

## Environment Variables Template

### Backend (Railway)
```
DATABASE_URL=postgresql+psycopg2://user:pass@host:port/db?sslmode=require
JWT_SECRET_KEY=<generate-strong-secret>
APP_SECRET_KEY=<generate-strong-secret>
FLASK_DEBUG=0
PORT=5000
```

### Frontend (Vercel)
```
REACT_APP_API_BASE=https://your-backend.railway.app
```

---

## 🚀 Ready to Deploy!

Follow the steps in `DEPLOYMENT_GUIDE.md` for detailed instructions.

