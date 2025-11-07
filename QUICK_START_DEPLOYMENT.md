# 🚀 Quick Start - Deployment

## ⚡ Fast Track (5 minutes)

### Step 1: Deploy Backend (Railway) - 2 min
1. Go to https://railway.app → Sign up/Login
2. Click **"New Project"** → **"Deploy from GitHub repo"**
3. Select your repository
4. **Settings** → **Root Directory**: `backend`
5. **Variables** tab → Add:
   ```
   DATABASE_URL=your-supabase-connection-string
   JWT_SECRET_KEY=<generate-random-string>
   APP_SECRET_KEY=<generate-random-string>
   FLASK_DEBUG=0
   ```
6. Wait for deployment → Copy the URL (e.g., `https://your-app.railway.app`)

### Step 2: Deploy Frontend (Vercel) - 2 min
1. Go to https://vercel.com → Sign up/Login
2. Click **"Add New Project"**
3. Import your GitHub repository
4. **Settings**:
   - Root Directory: `frontend`
   - Framework: Create React App
   - Build Command: `npm run build`
   - Output Directory: `build`
5. **Environment Variables**:
   ```
   REACT_APP_API_BASE=https://your-app.railway.app
   ```
   (Use the URL from Step 1)
6. Click **"Deploy"**

### Step 3: Test - 1 min
- Visit your Vercel URL
- Try logging in
- Check browser console for errors

---

## 🔑 Generate Secret Keys

Run these commands to generate secure keys:

```bash
# JWT Secret Key
python -c "import secrets; print('JWT_SECRET_KEY=' + secrets.token_urlsafe(32))"

# App Secret Key
python -c "import secrets; print('APP_SECRET_KEY=' + secrets.token_urlsafe(32))"
```

Copy the output and use in Railway environment variables.

---

## ✅ That's It!

Your app is now live:
- Frontend: `https://your-app.vercel.app`
- Backend: `https://your-app.railway.app`

---

## 📚 Need More Details?

See `DEPLOYMENT_GUIDE.md` for comprehensive instructions.

