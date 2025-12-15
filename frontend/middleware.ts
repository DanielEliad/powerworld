import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import jwt from 'jsonwebtoken'

// Security: No hardcoded secrets - must be set via environment variables
const JWT_SECRET = process.env.JWT_SECRET

// Validate required secret is set
if (!JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is required for authentication')
}

export function middleware(request: NextRequest) {
  const authCookie = request.cookies.get('pw-auth')
  
  // Allow auth endpoint
  if (request.nextUrl.pathname === '/api/auth') {
    return NextResponse.next()
  }
  
  // Verify JWT token
  let isAuthenticated = false
  if (authCookie?.value && JWT_SECRET) {
    try {
      jwt.verify(authCookie.value, JWT_SECRET)
      isAuthenticated = true
    } catch {
      // Invalid or expired token
      isAuthenticated = false
    }
  }
  
  if (isAuthenticated) {
    return NextResponse.next()
  }
  
  // Redirect to login
  if (request.nextUrl.pathname !== '/login') {
    return NextResponse.redirect(new URL('/login', request.url))
  }
  
  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|login).*)'],
}

