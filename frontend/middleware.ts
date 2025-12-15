import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import jwt from 'jsonwebtoken'

export function middleware(request: NextRequest) {
  const JWT_SECRET = process.env.JWT_SECRET
  
  if (!JWT_SECRET) {
    console.error('❌ JWT_SECRET environment variable is required for authentication')
    return NextResponse.redirect(new URL('/login', request.url))
  }

  const authCookie = request.cookies.get('pw-auth')
  
  if (request.nextUrl.pathname === '/api/auth') {
    return NextResponse.next()
  }
  
  let isAuthenticated = false
  if (authCookie?.value) {
    try {
      jwt.verify(authCookie.value, JWT_SECRET)
      isAuthenticated = true
    } catch {
      isAuthenticated = false
    }
  }
  
  if (isAuthenticated) {
    return NextResponse.next()
  }
  
  if (request.nextUrl.pathname !== '/login') {
    return NextResponse.redirect(new URL('/login', request.url))
  }
  
  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|login).*)'],
}

