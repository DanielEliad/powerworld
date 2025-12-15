# Security Guidelines

## Overview

This application implements multiple layers of security to protect your PowerWorld Simulation data and prevent unauthorized access.

## Security Features

### 1. JWT Token Authentication ✅
- **Signed tokens**: Cryptographically signed with `JWT_SECRET`
- **Cannot be forged**: Any tampering invalidates the signature
- **Auto-expiration**: Tokens expire after 7 days
- **HttpOnly cookies**: Prevents XSS attacks (JavaScript can't read the token)

### 2. CORS Protection ✅
- **Explicit origins only**: No wildcards allowed
- **Environment-based**: Different origins for dev vs production
- **Validation**: Origins must start with `http://` or `https://`
- **Fails secure**: Application won't start with invalid CORS config

### 3. No Hardcoded Secrets ✅
- **All secrets via environment variables**: No defaults in production
- **Validation on startup**: App crashes if required secrets are missing
- **Warning system**: Warns about weak passwords in production

### 4. Environment Separation ✅
- **Dev vs Production**: Separate `.env` files with different secrets
- **.gitignore protection**: Actual secrets never committed to git
- **Example files**: `.env.example` files for documentation only

## Required Environment Variables

### Frontend (Production)

```bash
# REQUIRED - No defaults!
APP_PASSWORD=<strong-password>          # Login password (8+ chars recommended)
JWT_SECRET=<random-string>              # JWT signing key (32+ chars recommended)
NEXT_PUBLIC_API_URL=<backend-url>       # Backend URL

# OPTIONAL
NODE_ENV=production
```

### Backend (Production)

```bash
# REQUIRED - No defaults!
ALLOWED_ORIGINS=<frontend-url>          # Exact frontend URL (no wildcards!)

# OPTIONAL
BUDGET_LIMIT_EUR=300000                 # Budget limit in EUR
UPLOAD_DIR=uploads                      # Upload directory
NODE_ENV=production
```

## Security Validations

### Startup Checks

The application performs these security checks on startup:

**Frontend:**
- ✅ `APP_PASSWORD` must be set (no default)
- ✅ `JWT_SECRET` must be set (no default)
- ⚠️  Warns if `APP_PASSWORD` < 8 characters (production)
- ⚠️  Warns if `JWT_SECRET` < 32 characters (production)
- ❌ Blocks weak/default passwords like "password", "admin", "powerworld2024"

**Backend:**
- ✅ `ALLOWED_ORIGINS` must be set in production (no default)
- ✅ No wildcard (`*`) origins allowed
- ✅ All origins must start with `http://` or `https://`
- ⚠️  Warns if using development default

### Runtime Protections

- **JWT verification**: Every request validates token signature
- **Cookie security**: HttpOnly + Secure (production) + SameSite
- **CORS enforcement**: Browser blocks unauthorized origins
- **Token expiration**: Automatic logout after 7 days

## Best Practices

### ✅ DO:

1. **Generate strong secrets**:
   ```bash
   # JWT_SECRET (32+ characters)
   openssl rand -base64 32
   
   # Or use a password generator
   ```

2. **Use unique passwords**:
   - Never use "powerworld2024" or similar in production
   - Minimum 8 characters, preferably 12+
   - Mix of letters, numbers, symbols

3. **Set exact CORS origins**:
   ```bash
   # Good
   ALLOWED_ORIGINS=https://powerworld.onrender.com
   
   # Multiple origins
   ALLOWED_ORIGINS=https://app.example.com,https://app2.example.com
   ```

4. **Different secrets for dev/prod**:
   - Development: Simple passwords OK
   - Production: Strong random strings

5. **Keep secrets out of git**:
   - Use `.env` files (already gitignored)
   - Never commit actual secrets
   - Use `.env.example` for documentation

### ❌ DON'T:

1. **Never use wildcards**:
   ```bash
   # BAD - Application will refuse to start
   ALLOWED_ORIGINS=*
   ALLOWED_ORIGINS=https://*.onrender.com
   ```

2. **Never commit secrets**:
   ```bash
   # BAD
   git add .env
   git add backend/.env
   ```

3. **Never hardcode secrets in code**:
   ```typescript
   // BAD
   const JWT_SECRET = "my-secret-key"
   
   // GOOD
   const JWT_SECRET = process.env.JWT_SECRET
   ```

4. **Never share secrets publicly**:
   - Don't paste in Slack/Discord
   - Don't screenshot with secrets visible
   - Don't commit to public repos

5. **Never reuse production secrets**:
   - Each environment should have unique secrets
   - Don't copy production secrets to dev

## Attack Scenarios & Mitigations

### Scenario 1: Cookie Tampering
**Attack**: User manually edits `pw-auth` cookie to "authenticated"
**Mitigation**: JWT signature validation fails → Redirected to login ✅

### Scenario 2: Token Replay
**Attack**: Attacker steals someone's valid token
**Mitigation**: 
- Token expires after 7 days ✅
- HttpOnly prevents JavaScript theft ✅
- Secure flag prevents HTTP interception (production) ✅

### Scenario 3: XSS Attack
**Attack**: Malicious script tries to read auth cookie
**Mitigation**: HttpOnly flag blocks JavaScript access ✅

### Scenario 4: CORS Bypass
**Attack**: Malicious site tries to call API from different origin
**Mitigation**: Browser enforces CORS, blocks unauthorized origins ✅

### Scenario 5: Brute Force Login
**Attack**: Attacker tries many passwords
**Mitigation**: 
- Single password for app (not per-user, so rate limiting not critical)
- HTTPS prevents password interception ✅
- Consider adding rate limiting for high-security needs

## Security Checklist

Before deploying to production:

- [ ] Generate strong `JWT_SECRET` (32+ characters)
- [ ] Set strong `APP_PASSWORD` (8+ characters, not default)
- [ ] Configure exact `ALLOWED_ORIGINS` (no wildcards)
- [ ] Verify `NODE_ENV=production` is set
- [ ] Confirm `.env` files are in `.gitignore`
- [ ] Test login works with new credentials
- [ ] Verify CORS works from production frontend
- [ ] Check startup logs for security warnings

## Monitoring & Maintenance

### Check for security issues:

1. **Review startup logs** for warnings:
   ```
   ⚠️  WARNING: APP_PASSWORD is too short
   ⚠️  WARNING: JWT_SECRET is too short
   ❌ ERROR: Wildcard CORS origins are not permitted
   ```

2. **Monitor for authentication failures**
3. **Rotate secrets periodically** (recommended: quarterly)
4. **Keep dependencies updated** (npm audit, pip-audit)

## Incident Response

If secrets are compromised:

1. **Immediately rotate secrets**:
   - Generate new `JWT_SECRET`
   - Change `APP_PASSWORD`
   - Update in Render dashboard
   - Redeploy services

2. **All existing sessions invalidated** (JWT_SECRET change)
3. **Users must log in again** with new password
4. **Review logs** for suspicious activity

## Additional Security Measures

For higher security requirements, consider:

1. **Rate limiting**: Prevent brute force attacks
2. **Per-user authentication**: Instead of single shared password
3. **IP allowlisting**: Restrict access to specific IPs
4. **Audit logging**: Track all access attempts
5. **2FA**: Two-factor authentication
6. **Session management**: Ability to revoke sessions

## Questions?

If you're unsure about any security aspect:
- Review this guide
- Check `ENV_SETUP.md` for configuration
- Ensure no secrets are hardcoded
- Test in development before production deployment

