# Deploy Your App Now! 🚀

All code is ready. Follow these steps to get your app online.

---

## Step 1: Push to GitHub (5 minutes)

### Option A: New Repository

```bash
# 1. Go to github.com and create a new repository
#    - Repository name: powerworld (or whatever you like)
#    - Keep it Private or Public (your choice)
#    - Don't initialize with README (you already have files)

# 2. In your terminal, run these commands:
cd /home/daniel/dev/powerworld

# Initialize git if not already done
git init

# Add all files
git add .

# Commit
git commit -m "Add PowerWorld Simulator with password protection and data persistence"

# Set main branch
git branch -M main

# Add your GitHub repo (replace YOUR_USERNAME with your GitHub username)
git remote add origin https://github.com/YOUR_USERNAME/powerworld.git

# Push to GitHub
git push -u origin main
```

### Option B: Existing Repository

```bash
cd /home/daniel/dev/powerworld

# Add and commit changes
git add .
git commit -m "Add deployment features"
git push
```

**✅ Checkpoint:** Visit your GitHub repo - you should see all your files there!

---

## Step 2: Deploy Backend to Render (5 minutes)

### 2.1 Create Backend Service

1. Go to **https://render.com** and sign up (it's free!)
2. Click **"New +"** → **"Web Service"**
3. Click **"Connect a repository"** → Connect your GitHub account
4. Select your **powerworld** repository
5. Configure the service:

```
Name: powerworld-api
Region: Oregon (US West) or closest to you
Branch: main
Root Directory: (leave empty)
Environment: Docker
Dockerfile Path: Dockerfile.backend
Instance Type: Free
```

### 2.2 Add Environment Variables

Click **"Advanced"** → **"Add Environment Variable"**

Add these TWO variables:

```
Key: ALLOWED_ORIGINS
Value: https://powerworld.onrender.com
(Note: We'll update this URL after frontend deploys)

Key: NODE_ENV
Value: production
```

### 2.3 Deploy

1. Click **"Create Web Service"**
2. Watch the logs - build takes ~3-5 minutes
3. Wait for: **"Your service is live 🎉"**
4. **COPY THE URL** - looks like: `https://powerworld-api-xxxx.onrender.com`

**✅ Checkpoint:** Click the URL - you should see:
```json
{"message":"PowerWorld Simulation Analyzer API","status":"running"}
```

---

## Step 3: Deploy Frontend to Render (5 minutes)

### 3.1 Create Frontend Service

1. Still on Render.com, click **"New +"** → **"Web Service"**
2. Select your **powerworld** repository again
3. Configure the service:

```
Name: powerworld
Region: Oregon (US West) - same as backend!
Branch: main
Root Directory: (leave empty)
Environment: Docker
Dockerfile Path: Dockerfile.frontend
Instance Type: Free
```

### 3.2 Add Environment Variables

Click **"Advanced"** → **"Add Environment Variable"**

Add these FOUR variables:

```
Key: NEXT_PUBLIC_API_URL
Value: https://powerworld-api-xxxx.onrender.com
(^ Use YOUR backend URL from Step 2!)

Key: APP_PASSWORD
Value: YourClassPassword2024
(^ Choose a password to share with classmates!)

Key: JWT_SECRET
Value: (run this command to generate):
```

**Generate JWT_SECRET:**
```bash
# On Linux/Mac (run in terminal):
openssl rand -base64 32

# Or just use a long random string like:
mK8vQn2pL5xW9rT4jH6bN3fG7cV1sD0aE8uY4iO9pL2mN5qR7sT
```

```
Key: NODE_ENV
Value: production
```

### 3.3 Deploy

1. Click **"Create Web Service"**
2. Watch the logs - build takes ~5-8 minutes (Next.js is bigger)
3. Wait for: **"Your service is live 🎉"**
4. **COPY THE FRONTEND URL** - looks like: `https://powerworld-xxxx.onrender.com`

**✅ Checkpoint:** Click the URL - you should see the login page!

---

## Step 4: Update Backend CORS (2 minutes)

Now that you have the frontend URL, update the backend:

1. Go back to **Render Dashboard** → **powerworld-api** service
2. Click **"Environment"** in left sidebar
3. Find **ALLOWED_ORIGINS**
4. Click **Edit** (pencil icon)
5. Change value to your **actual frontend URL**:
   ```
   https://powerworld-xxxx.onrender.com
   ```
   (Use YOUR frontend URL from Step 3!)
6. Click **"Save Changes"**
7. Service will redeploy automatically (~2 minutes)

**✅ Checkpoint:** Wait for backend to finish redeploying

---

## Step 5: Test Your App! (2 minutes)

1. Visit your frontend URL: `https://powerworld-xxxx.onrender.com`
2. You should see the **login page**
3. Enter your password (the one you set in `APP_PASSWORD`)
4. Click **Login** → You should see the main app!
5. Try pasting some data:
   - Click **"Show Paste Areas"**
   - Paste your lines data
   - Click **"Process Lines Data"**
   - See the charts! 📊

6. **Test data persistence:**
   - Close the browser tab
   - Open the URL again
   - Login
   - Charts should automatically reload! ✨

**✅ Success!** Your app is live!

---

## Share with Classmates

Give them:
- **URL**: `https://powerworld-xxxx.onrender.com` (your frontend URL)
- **Password**: Whatever you set in `APP_PASSWORD`

Example message:
```
Hey! PowerWorld Simulator is live:

🔗 URL: https://powerworld-xxxx.onrender.com
🔐 Password: YourClassPassword2024

Note: First load after inactivity takes ~30-60 seconds (free tier wakes up)
Your data is saved automatically!
```

---

## Important Notes

### Free Tier Behavior
- **Services sleep after 15 min** of inactivity
- **First request takes 30-60 seconds** to wake up
- After that, it's fast! ⚡
- **750 hours/month per service** - plenty for class projects

### Cold Start Message
When visiting after sleep, users see:
- Frontend: Loading spinner (30s)
- "Processing data..." while backend wakes

This is normal! Just wait ~1 minute.

### Updating Your App

Made code changes?

```bash
cd /home/daniel/dev/powerworld
git add .
git commit -m "Update features"
git push
```

Both services auto-redeploy from GitHub in ~3-5 minutes!

---

## Troubleshooting

### "Invalid password" on login
- Check `APP_PASSWORD` in frontend environment variables
- Did you type it correctly?

### "Failed to process data" / CORS error
- Check `ALLOWED_ORIGINS` in backend matches your frontend URL exactly
- No trailing slash! `https://app.onrender.com` not `https://app.onrender.com/`
- Redeploy backend after changing

### Service won't start / Build failed
- Check logs in Render dashboard
- Common issue: Missing environment variables
- Make sure `Dockerfile Path` is correct

### Can't login after changing password
- Clear browser cookies (or use incognito/private window)
- Redeploy frontend after changing `APP_PASSWORD` or `JWT_SECRET`

### "Service Unavailable" 503 error
- Service is waking up from sleep
- Wait 30-60 seconds and refresh
- This only happens on first request after 15min inactivity

---

## Cost

**Total: $0/month** 🎉

Both services run on Render's free tier:
- 750 hours/month each = enough to run 24/7
- Auto-sleep saves hours for you
- Free HTTPS/DNS included
- No credit card required

---

## Next Steps

### Optional Improvements
- Custom domain (buy on Namecheap ~$10/year)
- Keep services awake with UptimeRobot (free)
- Add more features!

### Security Reminders
- Don't share `JWT_SECRET` publicly
- Use a strong password for classmates
- Keep `.env` files out of git (already done ✅)

---

## You're Done! 🎉

Your PowerWorld Simulator is now:
- ✅ Live on the internet
- ✅ Password protected
- ✅ Auto-saves data
- ✅ Free hosting
- ✅ Auto-deploys from GitHub

Enjoy your deployed app!

Need help? Check:
- `DEPLOYMENT_READY.md` - Detailed info
- `ENV_SETUP.md` - Environment variables
- `SECURITY.md` - Security details

