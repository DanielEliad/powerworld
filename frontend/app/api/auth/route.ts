import { NextResponse } from 'next/server'
import jwt from 'jsonwebtoken'

// Security: No hardcoded secrets - must be set via environment variables
const PASSWORD = process.env.APP_PASSWORD
const JWT_SECRET = process.env.JWT_SECRET
const IS_PRODUCTION = process.env.NODE_ENV === 'production'

// Validate required secrets are set
if (!PASSWORD) {
  throw new Error('APP_PASSWORD environment variable is required')
}

if (!JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is required')
}

// Warn about weak secrets in production
if (IS_PRODUCTION) {
  if (PASSWORD.length < 8) {
    console.warn('⚠️  WARNING: APP_PASSWORD is too short (minimum 8 characters recommended)')
  }
  if (JWT_SECRET.length < 32) {
    console.warn('⚠️  WARNING: JWT_SECRET is too short (minimum 32 characters recommended)')
  }
  // Check for common/default passwords
  const weakPasswords = ['password', 'admin', 'powerworld', '12345678', 'powerworld2024']
  if (weakPasswords.some(weak => PASSWORD.toLowerCase().includes(weak))) {
    console.error('❌ ERROR: APP_PASSWORD appears to be a weak/default password!')
  }
}

export async function POST(request: Request) {
  try {
    const { password } = await request.json()
    
    if (password === PASSWORD) {
      // Create signed JWT token
      const token = jwt.sign(
        { authenticated: true, timestamp: Date.now() },
        JWT_SECRET!,
        { expiresIn: '7d' }
      )
      
      const response = NextResponse.json({ success: true })
      response.cookies.set('pw-auth', token, {
        httpOnly: true,
        secure: IS_PRODUCTION,
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 7, // 7 days
        path: '/'
      })
      return response
    }
    
    return NextResponse.json({ error: 'Invalid password' }, { status: 401 })
  } catch (error) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }
}

