# 🚀 Phoebe Drugstore - Deployment Guide

## Overview
This guide will help you deploy:
- **Frontend** → Vercel (FREE)
- **Backend** → Railway (FREE tier available)

---

## 📋 Prerequisites

1. **GitHub Account** (for connecting repositories)
2. **Vercel Account** (sign up at https://vercel.com)
3. **Railway Account** (sign up at https://railway.app)
4. **Database URL** (Supabase PostgreSQL connection string)

---

## 🎨 FRONTEND DEPLOYMENT (Vercel)

### Step 1: Prepare Frontend

1. **Environment Variables** - Create `.env.production` in `frontend/` folder:
   ```
   REACT_APP_API_BASE=https://your-backend-url.railway.app
   ```

2. **Build Command**: Already configured in `package.json`:
   ```json
   "build": "react-scripts build"
   ```

3. **Output Directory**: `build` (default for Create React App)

### Step 2: Deploy to Vercel

#### Option A: Via Vercel Dashboard (Recommended)

1. Go to https://vercel.com/dashboard
2. Click **"Add New Project"**
3. Import your GitHub repository
4. **Configure Project**:
   - **Framework Preset**: Create React App
   - **Root Directory**: `frontend`
   - **Build Command**: `npm run build` (or `yarn build`)
   - **Output Directory**: `build`
   - **Install Command**: `npm install` (or `yarn install`)

5. **Environment Variables**:
   - Add `REACT_APP_API_BASE` = `https://your-backend-url.railway.app`
   - (You'll get this URL after deploying backend)

6. Click **"Deploy"**

#### Option B: Via Vercel CLI

```bash
cd frontend
npm install -g vercel
vercel login
vercel --prod
```

### Step 3: Update Backend URL

After getting your Vercel URL, update backend CORS settings (see backend section).

---

## ⚙️ BACKEND DEPLOYMENT (Railway)

### Step 1: Prepare Backend

1. **Port Configuration**: Railway provides `PORT` environment variable automatically
2. **Requirements**: `requirements.txt` is already configured
3. **Procfile**: Created for Railway deployment

### Step 2: Deploy to Railway

#### Option A: Via Railway Dashboard (Recommended)

1. Go to https://railway.app/dashboard
2. Click **"New Project"**
3. Select **"Deploy from GitHub repo"**
4. Choose your repository
5. **Configure Service**:
   - **Root Directory**: `backend`
   - **Build Command**: `pip install -r requirements.txt`
   - **Start Command**: (Railway will use Procfile automatically)

6. **Environment Variables** (Add in Railway Dashboard):
   ```
   DATABASE_URL=postgresql+psycopg2://user:pass@host:port/db?sslmode=require
   JWT_SECRET_KEY=your-super-secret-jwt-key-change-this
   APP_SECRET_KEY=your-app-secret-key-change-this
   FLASK_DEBUG=0
   PORT=5000
   ```

7. **Deploy**: Railway will automatically detect Python and deploy

#### Option B: Via Railway CLI

```bash
cd backend
npm install -g @railway/cli
railway login
railway init
railway up
```

### Step 3: Get Backend URL

After deployment, Railway will provide a URL like:
- `https://your-app-name.railway.app`

**Update this in**:
1. Frontend `.env.production` or Vercel environment variables
2. Backend CORS settings (if needed)

---

## 🔧 Environment Variables Reference

### Frontend (Vercel)
```
REACT_APP_API_BASE=https://your-backend.railway.app
```

### Backend (Railway)
```
DATABASE_URL=postgresql+psycopg2://...
JWT_SECRET_KEY=your-secret-key-here
APP_SECRET_KEY=your-app-secret-here
FLASK_DEBUG=0
PORT=5000
```

---

## 🔒 Security Checklist

- [ ] Change `JWT_SECRET_KEY` to a strong random string
- [ ] Change `APP_SECRET_KEY` to a strong random string
- [ ] Update CORS origins to your Vercel domain (optional, currently allows all)
- [ ] Ensure `FLASK_DEBUG=0` in production
- [ ] Verify database connection uses SSL (`sslmode=require`)

---

## 🐛 Troubleshooting

### Frontend Issues

**Build Fails:**
- Check Node.js version (Vercel uses Node 18+ by default)
- Verify all dependencies in `package.json`
- Check build logs in Vercel dashboard

**API Calls Fail:**
- Verify `REACT_APP_API_BASE` is set correctly
- Check CORS settings in backend
- Verify backend URL is accessible

### Backend Issues

**Deployment Fails:**
- Check `requirements.txt` for all dependencies
- Verify Python version (Railway uses Python 3.11+)
- Check build logs in Railway dashboard

**Database Connection Fails:**
- Verify `DATABASE_URL` is correct
- Check SSL mode (`sslmode=require`)
- Verify database is accessible from Railway

**Port Issues:**
- Railway automatically sets `PORT` environment variable
- Backend should use `$PORT` or `os.getenv('PORT', '5000')`

---

## 📝 Post-Deployment Steps

1. **Test Frontend**: Visit your Vercel URL
2. **Test Backend**: Visit `https://your-backend.railway.app/api/health` (if you have a health endpoint)
3. **Update CORS**: If needed, update CORS origins in `backend/app.py`
4. **Monitor Logs**: Check both Vercel and Railway logs for errors
5. **Test Authentication**: Try logging in to verify JWT works

---

## 🎉 Success!

Once deployed:
- Frontend: `https://your-app.vercel.app`
- Backend: `https://your-app.railway.app`

Both services are now live and connected!

---

## 📞 Support

If you encounter issues:
1. Check deployment logs in Vercel/Railway dashboards
2. Verify all environment variables are set
3. Test API endpoints directly
4. Check browser console for frontend errors

