# Deployment Architecture

## Overview
This is a **full-stack application** with two separate deployments:

### 1. Backend (Python/Flask API) → Railway
- **Purpose**: Provides REST API endpoints
- **Location**: `backend/` directory
- **Technology**: Python, Flask, PostgreSQL
- **Deployment**: Railway (this is what we're configuring)

### 2. Frontend (React App) → Vercel  
- **Purpose**: User interface/web app
- **Location**: `frontend/` directory  
- **Technology**: React, JavaScript
- **Deployment**: Vercel (separate deployment)

## Why Build Backend on Railway?

**Railway builds the BACKEND because:**
- ✅ Railway is for server-side applications (APIs, databases, services)
- ✅ Your Flask API needs to run 24/7 to handle requests
- ✅ Railway provides the server environment for Python
- ✅ Frontend is static files served by Vercel (doesn't need Railway)

## Railway Configuration

### Option 1: Set Root Directory to `backend` (Recommended)
1. Go to Railway Dashboard → Your Service → Settings
2. Set **Root Directory** to: `backend`
3. Railway will use `backend/nixpacks.toml`
4. Build will happen from backend directory

### Option 2: Build from Root (Current Setup)
- Railway builds from root directory
- Uses `nixpacks.toml` at root
- References `backend/requirements.txt`

## Current Setup

- **Root Directory**: Should be set to `backend` in Railway dashboard
- **Build Tool**: Nixpacks
- **Python Version**: 3.11
- **Start Command**: `gunicorn app:app --bind 0.0.0.0:$PORT --workers 2 --timeout 120`

## Frontend Deployment (Separate)

Frontend is deployed separately on Vercel:
- Go to Vercel.com
- Connect your GitHub repo
- Set root directory to `frontend`
- Vercel will auto-detect React and deploy

## Troubleshooting

**"Importing to docker" failure:**
- Usually means image is too large (>4GB limit)
- We've fixed this by using CPU-only PyTorch
- Image should now be ~2-3GB

**Build failing:**
- Make sure Root Directory is set to `backend` in Railway dashboard
- Remove any buildCommand from Railway dashboard settings
- Let Nixpacks handle the build automatically

