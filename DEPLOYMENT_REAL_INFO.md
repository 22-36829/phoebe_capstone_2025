# 🚀 DEPLOYMENT - ALL REAL INFORMATION

## 📋 YOUR ACTUAL CONFIGURATION

### Database Connection (Supabase)
```
DATABASE_URL=postgresql+psycopg2://postgres:PhoebeDrugStore01@db.xybuirzvlfuwmtcokkwm.supabase.co:5432/postgres?sslmode=require
```

### Current Default Values
- **JWT_SECRET_KEY**: `dev-secret` (⚠️ CHANGE THIS!)
- **APP_SECRET_KEY**: `dev-app-secret` (⚠️ CHANGE THIS!)
- **FLASK_DEBUG**: `1` (⚠️ SET TO `0` IN PRODUCTION!)
- **Frontend API Base**: `http://localhost:5000` (will be updated after backend deployment)

---

## 🎯 STEP-BY-STEP DEPLOYMENT

### STEP 1: DEPLOY BACKEND (Railway) ⚙️

#### 1.1 Go to Railway
- Visit: https://railway.app
- Sign up/Login (use GitHub)

#### 1.2 Create New Project
1. Click **"New Project"**
2. Select **"Deploy from GitHub repo"**
3. Authorize Railway to access your GitHub
4. Select your repository: `phoebe_app` (or your repo name)

#### 1.3 Configure Service
1. Railway will auto-detect Python
2. **Settings** → **Root Directory**: Set to `backend`
3. **Settings** → **Build Command**: `pip install -r requirements.txt`
4. **Settings** → **Start Command**: (Leave empty - Railway uses Procfile automatically)

#### 1.4 Add Environment Variables
Go to **Variables** tab and add these EXACT values:

```
DATABASE_URL=postgresql+psycopg2://postgres:PhoebeDrugStore01@db.xybuirzvlfuwmtcokkwm.supabase.co:5432/postgres?sslmode=require
```

**Use these ready-generated secrets** (already created for you):

```
JWT_SECRET_KEY=69kdsyb6CUVLdTsUsQ0dsqK-DiTPSvhrbqtTucGpVA0
APP_SECRET_KEY=XO5neDCr5RG9OLHuY2zjHGujZ1ypCf15xjUqXDlamBQ
FLASK_DEBUG=0
PORT=5000
```

⚠️ **Copy these EXACT values into Railway environment variables**

#### 1.5 Deploy
- Railway will automatically start building
- Wait for deployment to complete (2-5 minutes)
- **Copy your Railway URL** (e.g., `https://phoebe-backend-production.up.railway.app`)

---

### STEP 2: DEPLOY FRONTEND (Vercel) 🎨

#### 2.1 Go to Vercel
- Visit: https://vercel.com
- Sign up/Login (use GitHub)

#### 2.2 Create New Project
1. Click **"Add New Project"**
2. Import your GitHub repository
3. Select your repository: `phoebe_app` (or your repo name)

#### 2.3 Configure Project
**Framework Preset**: Create React App

**Root Directory**: `frontend`

**Build Settings**:
- **Build Command**: `npm run build`
- **Output Directory**: `build`
- **Install Command**: `npm install`

#### 2.4 Add Environment Variable
In **Environment Variables** section, add:

```
REACT_APP_API_BASE=https://your-railway-url.railway.app
```

⚠️ **Replace `your-railway-url.railway.app` with your ACTUAL Railway URL from Step 1.5**

#### 2.5 Deploy
- Click **"Deploy"**
- Wait for build to complete (2-3 minutes)
- **Copy your Vercel URL** (e.g., `https://phoebe-app.vercel.app`)

---

## ✅ POST-DEPLOYMENT CHECKLIST

### Test Backend
1. Visit: `https://your-railway-url.railway.app/api/health` (if you have health endpoint)
2. Or test: `https://your-railway-url.railway.app/api/pos/products` (should return products)

### Test Frontend
1. Visit your Vercel URL
2. Open browser console (F12)
3. Try to login
4. Check for any CORS errors

### Update CORS (if needed)
If you get CORS errors, update `backend/app.py` line 17:
```python
CORS(app, resources={r"/api/*": {"origins": ["https://your-vercel-url.vercel.app"]}}, ...)
```

---

## 🔐 SECURITY CHECKLIST

- [ ] ✅ Changed `JWT_SECRET_KEY` to strong random string
- [ ] ✅ Changed `APP_SECRET_KEY` to strong random string  
- [ ] ✅ Set `FLASK_DEBUG=0` in Railway
- [ ] ✅ Database URL is correct
- [ ] ✅ Frontend `REACT_APP_API_BASE` points to Railway URL
- [ ] ✅ Tested login/authentication
- [ ] ✅ No errors in browser console
- [ ] ✅ No errors in Railway/Vercel logs

---

## 📝 QUICK REFERENCE

### Backend (Railway) Environment Variables:
```
DATABASE_URL=postgresql+psycopg2://postgres:PhoebeDrugStore01@db.xybuirzvlfuwmtcokkwm.supabase.co:5432/postgres?sslmode=require
JWT_SECRET_KEY=69kdsyb6CUVLdTsUsQ0dsqK-DiTPSvhrbqtTucGpVA0
APP_SECRET_KEY=XO5neDCr5RG9OLHuY2zjHGujZ1ypCf15xjUqXDlamBQ
FLASK_DEBUG=0
PORT=5000
```

### Frontend (Vercel) Environment Variable:
```
REACT_APP_API_BASE=https://your-railway-backend.railway.app
```

---

## 🐛 TROUBLESHOOTING

### Backend Issues

**Build Fails:**
- Check Railway logs
- Verify `requirements.txt` is correct
- Ensure Python version is 3.11+ (runtime.txt is set)

**Database Connection Fails:**
- Verify `DATABASE_URL` is exactly as shown above
- Check Supabase allows connections from Railway IPs
- Ensure `sslmode=require` is in connection string

**Port Issues:**
- Railway automatically sets `PORT` - don't hardcode it
- Backend code already uses `os.getenv('PORT', 5000)`

### Frontend Issues

**Build Fails:**
- Check Vercel build logs
- Verify Node.js version (Vercel uses 18+)
- Check `package.json` dependencies

**API Calls Fail:**
- Verify `REACT_APP_API_BASE` is set correctly
- Check browser console for CORS errors
- Verify backend URL is accessible

**CORS Errors:**
- Backend currently allows all origins (`origins: "*"`)
- If you want to restrict, update `backend/app.py` line 17

---

## 🎉 SUCCESS!

Once deployed:
- **Frontend**: `https://your-app.vercel.app`
- **Backend**: `https://your-app.railway.app`

Both services are live and connected! 🚀

---

## 📞 NEED HELP?

1. Check deployment logs in Railway/Vercel dashboards
2. Verify all environment variables are set correctly
3. Test API endpoints directly
4. Check browser console for frontend errors

