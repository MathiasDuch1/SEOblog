import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

/**
 * Hostname routing, admin lockdown, and the non-production noindex guard.
 *
 * Public paths are rewritten from `/{path}` to `/{hostname}{path}` so one app can serve
 * every country domain from `src/app/(frontend)/[host]`. There is no locale segment:
 * a domain publishes in exactly one language.
 *
 * No database access happens here — Proxy is not for data fetching. An unknown hostname
 * is rewritten like any other and handled by the routes under `[host]`.
 */

const ADMIN_HOSTNAME = process.env.ADMIN_HOSTNAME ?? 'localhost'
const IS_PRODUCTION = process.env.SITE_ENV === 'production'

/** Paths that belong to Payload and the admin-only preview, never to a public site. */
const ADMIN_PATHS = ['/admin', '/api', '/preview']

function isAdminPath(pathname: string): boolean {
  return ADMIN_PATHS.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))
}

function withGuards(response: NextResponse): NextResponse {
  if (!IS_PRODUCTION) {
    response.headers.set('X-Robots-Tag', 'noindex, nofollow')
  }
  return response
}

export function proxy(request: NextRequest): NextResponse {
  const hostname = (request.headers.get('host') ?? '').toLowerCase().split(':')[0]
  const { pathname, search } = request.nextUrl

  if (hostname === ADMIN_HOSTNAME) {
    // The admin host serves Payload and nothing else.
    if (isAdminPath(pathname)) return withGuards(NextResponse.next())
    return withGuards(NextResponse.redirect(new URL('/admin', request.url)))
  }

  // Blog hosts never expose the admin, the REST API, or draft preview.
  if (isAdminPath(pathname)) {
    return withGuards(new NextResponse('Not Found', { status: 404 }))
  }

  const url = request.nextUrl.clone()
  url.pathname = `/${hostname}${pathname === '/' ? '' : pathname}`
  url.search = search
  return withGuards(NextResponse.rewrite(url))
}

export const config = {
  matcher: [
    /*
     * Everything except Next's own assets and the root favicon. `robots.txt` and
     * `sitemap.xml` are deliberately NOT excluded — they are per-domain routes.
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
}
