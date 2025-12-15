# PowerWorld Deployment - Ready! ✅

All code changes have been completed. Your application is now ready to deploy to Render!

## What's Been Added

### ✅ Data Persistence (localStorage)
- **Auto-save**: Automatically saves all pasted data to browser storage
- **Auto-load**: On page reload, automatically processes saved data and regenerates charts
- **Clear button**: "🗑️ Clear Data" button in navbar to wipe all saved data
- **Benefits**: Your classmates won't lose work if they close the tab!

### ✅ Password Protection
- **Files created**:
  - `frontend/middleware.ts` - Protects all routes except login
  - `frontend/app/login/page.tsx` - Login page UI
  - `frontend/app/api/auth/route.ts` - Authentication endpoint
- **Security**: Session cookie lasts 7 days, HttpOnly for security
- **Default password**: `powerworld2024` (change via `APP_PASSWORD` env var)

### ✅ CORS Configuration
- **Updated**: `backend/main.py` now allows:
  - `http://localhost:3000` (local development)
  - `https://*.onrender.com` (Render deployments)

### ✅ Production Dockerfiles
- **Frontend**: Now builds for production and uses `npm start`
- **Backend**: Uses Render's `PORT` environment variable with uvicorn

## Next Steps (Manual)

Follow these steps to deploy:

### Step 1: Push to GitHub

```bash
cd /home/daniel/dev/powerworld

# Initialize git if not already done
git init

# Add all files
git add .

# Commit
git commit -m "Add deployment features: password protection and data persistence"

# Create GitHub repo and push
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/powerworld.git
git push -u origin main
```

### Step 2: Deploy Backend to Render

1. Go to https://render.com and sign up (free)
2. Click "New +" → "Web Service"
3. Connect your GitHub repository
4. Configure:
   - **Name**: `powerworld-api` (or your choice)
   - **Region**: Choose closest to you
   - **Branch**: `main`
   - **Root Directory**: Leave empty
   - **Environment**: `Docker`
   - **Dockerfile Path**: `Dockerfile.backend`
   - **Plan**: Free

5. **Add Environment Variables** (click "Advanced"):
   - **Key**: `ALLOWED_ORIGINS`
   - **Value**: `https://powerworld.onrender.com` (you'll update this after frontend deploys)
   
   - **Key**: `NODE_ENV`
   - **Value**: `production`

6. Click "Create Web Service"
7. Wait 3-5 minutes for build
8. **Copy the URL** (e.g., `https://powerworld-api.onrender.com`)

### Step 3: Deploy Frontend to Render

1. Click "New +" → "Web Service"
2. Connect same GitHub repository
3. Configure:
   - **Name**: `powerworld` (or your choice)
   - **Region**: Same as backend
   - **Branch**: `main`
   - **Root Directory**: Leave empty
   - **Environment**: `Docker`
   - **Dockerfile Path**: `Dockerfile.frontend`
   - **Plan**: Free

4. **Add Environment Variables** (click "Advanced"):
   - **Key**: `NEXT_PUBLIC_API_URL`
   - **Value**: `https://powerworld-api.onrender.com` (your backend URL from Step 2)
   
   - **Key**: `APP_PASSWORD`
   - **Value**: `YourSecurePassword123` (choose your own strong password!)
   
   - **Key**: `JWT_SECRET`
   - **Value**: `a-random-secret-string-for-jwt-signing-123456` (choose a long random string!)
   
   - **Key**: `NODE_ENV`
   - **Value**: `production`

5. Click "Create Web Service"
6. Wait 3-5 minutes for build
7. **Copy your frontend URL** (e.g., `https://powerworld.onrender.com`)

### Step 3.5: Update Backend CORS

Now that you have both URLs, go back and update the backend:

1. Open your backend service in Render dashboard
2. Go to "Environment" tab
3. Update `ALLOWED_ORIGINS` to your actual frontend URL:
   - Change from temporary value to: `https://powerworld.onrender.com`
4. Click "Save Changes" (this will trigger a redeploy)
5. Wait ~2 minutes for redeploy

### Step 4: Test It!

1. Visit your frontend URL
2. Login with your password
3. Paste some data
4. Check charts appear
5. Close tab and reopen - data should auto-load! ✨
6. Share URL and password with classmates

## What Your Classmates Get

- **URL**: `https://powerworld.onrender.com` (your frontend URL)
- **Password**: Whatever you set in `APP_PASSWORD`
- **Free DNS**: Both services get free subdomains
- **Auto-reload**: Data persists across browser sessions
- **HTTPS**: Included automatically

## Security Features ✅

**JWT Token-Based Authentication:**
- Passwords are checked on the server
- Signed JWT tokens prevent forgery (can't be tampered with in browser)
- Tokens expire after 7 days
- HttpOnly cookies prevent XSS attacks
- Anyone trying to manually edit the cookie will be rejected

**How it works:**
1. User enters password → Server verifies
2. Server creates signed JWT token with secret key
3. Token stored in HttpOnly cookie
4. Every request verifies JWT signature
5. Tampered tokens = automatic rejection

## Free Tier Notes

- Services sleep after 15 min of inactivity
- First request after sleep: 30-60 second cold start
- 750 hours/month per service (plenty for class project!)
- For typical usage: ~10-30 hours/month (only 4% of limit)

## Troubleshooting

**Password not working?**
- Check `APP_PASSWORD` environment variable in Render frontend service
- Redeploy frontend after changing env vars

**Frontend can't reach backend?**
- Verify `NEXT_PUBLIC_API_URL` matches your backend URL exactly
- Check CORS is configured (already done ✅)

**Services sleeping?**
- Normal for free tier
- First request wakes them up (30-60s wait)
- Optional: Use UptimeRobot (free) to keep awake during day

## Auto-Updates

After deployment, any time you push to GitHub:

```bash
git add .
git commit -m "Update features"
git push
```

Both services automatically redeploy in ~3 minutes!

## Cost Summary

- Render: **$0/month** (free tier)
- GitHub: **$0/month** (free)
- **Total: FREE** 🎉

---

**You're all set!** Follow Steps 1-4 above to deploy. Good luck with your project! 🚀

