# Environment Variables Setup Guide

## Local Development Setup

### Backend (.env)

Create `backend/.env` (already exists from template):

```bash
# CORS - Comma-separated list of allowed frontend origins
ALLOWED_ORIGINS=http://localhost:3000

# Upload directory
UPLOAD_DIR=uploads
```

### Frontend (.env.local)

Create `frontend/.env.local` (already exists from template):

```bash
# Backend API URL
NEXT_PUBLIC_API_URL=http://localhost:8000

# Authentication (change these for production!)
APP_PASSWORD=powerworld2024
JWT_SECRET=local-dev-secret-do-not-use-in-production

# Environment
NODE_ENV=development
```

### Start Local Development

```bash
# Terminal 1 - Backend
cd /home/daniel/dev/powerworld
docker compose up backend

# Terminal 2 - Frontend
cd /home/daniel/dev/powerworld
docker compose up frontend
```

Visit: http://localhost:3000
Password: `powerworld2024`

---

## Production Deployment (Render)

### Backend Service Environment Variables

Set these in Render backend service dashboard:

```bash
ALLOWED_ORIGINS=https://powerworld.onrender.com
NODE_ENV=production
```

**Important:**
- Replace with your **actual frontend URL**
- Multiple origins: `https://app1.onrender.com,https://app2.onrender.com`
- No wildcards! Must be exact URLs for security
- `NODE_ENV=production` enables additional security validations

### Frontend Service Environment Variables

Set these in Render frontend service dashboard:

```bash
NEXT_PUBLIC_API_URL=https://powerworld-api.onrender.com
APP_PASSWORD=YourSecurePassword123
JWT_SECRET=a-very-long-random-secret-string-min-32-chars-recommended
NODE_ENV=production
```

**Generate secure JWT_SECRET:**
```bash
# On Linux/Mac:
openssl rand -base64 32

# Or use any random string generator
# Must be at least 32 characters long!
```

---

## Security Best Practices

### ✅ DO:
- Use specific URLs in `ALLOWED_ORIGINS` (not wildcards)
- Generate long random strings for `JWT_SECRET` (32+ chars)
- Use strong passwords for `APP_PASSWORD`
- Keep `.env` files out of git (already in .gitignore)
- Use different secrets for dev vs production

### ❌ DON'T:
- Don't use `*` in CORS origins in production
- Don't commit `.env` files to git
- Don't reuse dev secrets in production
- Don't share `JWT_SECRET` publicly

---

## Troubleshooting

### CORS Error: "Access blocked by CORS policy"

**Cause:** Backend's `ALLOWED_ORIGINS` doesn't match frontend URL

**Fix:**
1. Check frontend URL (including https://)
2. Update backend `ALLOWED_ORIGINS` exactly
3. Redeploy backend service
4. Clear browser cache

**Example:**
```bash
# Backend ALLOWED_ORIGINS:
https://powerworld.onrender.com

# Must match frontend URL exactly (no trailing slash!)
```

### Login Not Working

**Cause:** `JWT_SECRET` or `APP_PASSWORD` mismatch

**Fix:**
1. Check environment variables are set correctly
2. Redeploy frontend after changing env vars
3. Clear browser cookies
4. Try incognito/private window

---

## Environment Files Reference

```
powerworld/
├── backend/
│   ├── .env                    # Local dev (gitignored)
│   └── .env.example            # Template (committed)
├── frontend/
│   ├── .env.local              # Local dev (gitignored)
│   └── .env.example            # Template (committed)
└── .env.production.example     # Production reference (committed)
```

**Files committed to git:**
- `.env.example` files (safe templates)
- `.env.production.example` (documentation)

**Files NOT committed (gitignored):**
- `.env` (actual secrets)
- `.env.local` (actual secrets)

