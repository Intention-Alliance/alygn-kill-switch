import { type NextRequest, NextResponse } from 'next/server'

/**
 * Better-Auth session cookie name.
 *
 * The kill-switch backend embeds Better-Auth at /v1/auth (see
 * lib/auth-client.ts). Session tokens are stored in httpOnly cookies using
 * Better-Auth's default cookie name. Presence of this cookie is the
 * server-side signal that a session may exist — the actual session/role
 * validation happens server-side via lib/server-auth.ts (admin pages) and
 * client-side via the AuthGuard + AdminGuard (the Edge runtime cannot decode
 * the signed JWT without the server secret).
 */
const BETTER_AUTH_SESSION_COOKIE = 'better-auth.session_token'

/**
 * Paths that never require authentication. These are the public entry points
 * (login, sign-up, password reset) plus framework/static assets and the
 * Better-Auth API proxy (which must stay reachable pre-auth).
 */
function isPublicPath(pathname: string): boolean {
	return (
		pathname === '/login' ||
		pathname === '/' ||
		pathname.startsWith('/auth/') ||
		pathname.startsWith('/_next/') ||
		pathname.startsWith('/api/auth/') ||
		pathname === '/favicon.ico'
	)
}

/**
 * Next.js 16 proxy — server-side route protection.
 *
 * Runs on every matched request (Edge runtime). Enforces authentication at
 * the server boundary so protected routes are never served to unauthenticated
 * visitors, even if the client-side AuthGuard is bypassed or JS is disabled.
 *
 * Design notes:
 * - The Edge runtime can check cookie *presence* but cannot decode the
 *   Better-Auth JWT (needs the server secret). So this proxy gates on the
 *   session cookie; the client-side AuthGuard (dashboard layout) validates the
 *   actual session, and AdminGuard enforces the admin role on /admin/* pages.
 *   Server components additionally call requireAdmin() (lib/server-auth.ts)
 *   before fetching sensitive data.
 */
export async function proxy(request: NextRequest) {
	const { pathname } = request.nextUrl

	// Public routes pass through untouched.
	if (isPublicPath(pathname)) {
		return NextResponse.next()
	}

	// Protected route: require the Better-Auth session cookie.
	const hasSessionCookie = request.cookies.has(BETTER_AUTH_SESSION_COOKIE)

	if (!hasSessionCookie) {
		// Preserve the originally-requested route so the login page can redirect
		// back here after a successful sign-in (open-redirect guarded client-side).
		const loginUrl = request.nextUrl.clone()
		loginUrl.pathname = '/login'
		loginUrl.search = ''
		// searchParams.set() URL-encodes the value; the login page reads it back
		// via searchParams.get() (auto-decoded) and open-redirect-guards it.
		loginUrl.searchParams.set('callbackUrl', pathname + request.nextUrl.search)
		return NextResponse.redirect(loginUrl)
	}

	return NextResponse.next()
}

export const config = {
	matcher: [
		/*
		 * Match all request paths except:
		 * - _next/static (static files)
		 * - _next/image (image optimization files)
		 * - favicon.ico (favicon file)
		 * - images - .svg, .png, .jpg, .jpeg, .gif, .webp
		 * Feel free to modify this pattern to include more paths.
		 */
		'/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
	],
}
