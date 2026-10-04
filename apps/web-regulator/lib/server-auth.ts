import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

/**
 * Server-side auth helper — verifies the Better-Auth session and resolves
 * the authenticated user's role.
 *
 * The Better-Auth server is embedded in the kill-switch backend at /v1/auth
 * (see lib/auth-client.ts). This helper reads the httpOnly session cookie and
 * calls the backend's get-session endpoint to validate the session and resolve
 * the user's role.
 *
 * Used by server-component admin pages to enforce the admin role BEFORE
 * fetching sensitive data, so a non-admin authenticated user never receives
 * the RSC payload containing API keys / secrets / audit logs (Nikaya P1
 * finding). The client-side AdminGuard remains as defense-in-depth.
 */

const BETTER_AUTH_SESSION_COOKIE = 'better-auth.session_token'
const KILL_SWITCH_API_URL =
	process.env.KILL_SWITCH_API_URL ?? 'http://127.0.0.1:3000'

/** The authenticated user shape surfaced to server components. */
export interface ServerSessionUser {
	id: string
	email: string
	name: string
	role: 'admin' | 'sre' | 'developer' | 'viewer'
}

/** Minimal shape of the Better-Auth get-session response. */
interface BetterAuthSessionResponse {
	session: { id: string } | null
	user: {
		id?: string
		email?: string
		name?: string
		role?: string
	} | null
}

/**
 * Read the Better-Auth session from the request cookies and validate it
 * against the backend. Returns the session user, or null when there is no
 * valid session (missing cookie, expired/invalid token, or backend error).
 */
export async function getServerSessionUser(): Promise<ServerSessionUser | null> {
	const cookieStore = await cookies()
	const token = cookieStore.get(BETTER_AUTH_SESSION_COOKIE)?.value

	if (!token) {
		return null
	}

	try {
		const res = await fetch(`${KILL_SWITCH_API_URL}/v1/auth/get-session`, {
			method: 'GET',
			headers: {
				Cookie: `${BETTER_AUTH_SESSION_COOKIE}=${token}`,
				Accept: 'application/json',
			},
			cache: 'no-store',
		})

		if (!res.ok) {
			return null
		}

		const data = (await res.json()) as BetterAuthSessionResponse
		if (!data.session || !data.user?.email) {
			return null
		}

		return {
			id: data.user.id ?? data.user.email,
			email: data.user.email,
			name: data.user.name ?? data.user.email,
			role: (data.user.role as ServerSessionUser['role']) ?? 'viewer',
		}
	} catch {
		// Backend unreachable / network error — treat as unauthenticated so we
		// never serve sensitive data on a failed auth check.
		return null
	}
}

/**
 * Server-side admin gate for server-component admin pages.
 *
 * Verifies the session and admin role BEFORE any sensitive data fetch.
 * Redirects to /login (preserving the requested route as callbackUrl) when
 * the user is unauthenticated or not an admin. Returns the session user when
 * authorized.
 */
export async function requireAdmin(
	callbackUrl?: string,
): Promise<ServerSessionUser> {
	const user = await getServerSessionUser()
	if (user?.role !== 'admin') {
		const target = callbackUrl
			? `/login?callbackUrl=${encodeURIComponent(callbackUrl)}`
			: '/login'
		redirect(target)
	}
	return user
}
