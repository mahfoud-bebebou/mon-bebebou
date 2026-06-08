import { createMiddlewareClient } from '@supabase/auth-helpers-nextjs'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  const res = NextResponse.next()

  // Ne jamais bloquer les routes API
  if (request.nextUrl.pathname.startsWith('/api/')) {
    return res
  }

  // Ne jamais bloquer les assets statiques
  if (
    request.nextUrl.pathname.startsWith('/_next/') ||
    request.nextUrl.pathname.startsWith('/logo') ||
    request.nextUrl.pathname === '/sw.js' ||
    request.nextUrl.pathname === '/manifest.json'
  ) {
    return res
  }

  const supabase = createMiddlewareClient({ req: request, res })
  await supabase.auth.getSession()

  return res
}

export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico|.*\\.png|.*\\.jpg|.*\\.svg|sw\\.js|manifest\\.json).*)',
  ],
}
