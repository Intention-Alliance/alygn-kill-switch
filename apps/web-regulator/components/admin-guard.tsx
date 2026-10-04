'use client'

import type { ReactNode } from 'react'
import { useAuth } from '@/lib/auth-context'

/**
 * AdminGuard — role-based access control wrapper for admin-only pages.
 *
 * Renders a loading spinner while the session is being restored, an
 * "insufficient permissions" screen for non-admin users, and the wrapped
 * children only for users with the `admin` role.
 *
 * This is the client-side complement to the server-side session gate in
 * proxy.ts: the proxy ensures a session exists, AdminGuard ensures the
 * session's role is `admin`.
 */
export function AdminGuard({ children }: { children: ReactNode }) {
	const { user, isLoading } = useAuth()

	if (isLoading) {
		return (
			<div className="flex h-screen items-center justify-center">
				<div className="h-10 w-10 animate-spin rounded-full border-2 border-primary border-t-transparent" />
			</div>
		)
	}

	if (user?.role !== 'admin') {
		return (
			<div className="flex h-screen items-center justify-center">
				<div className="text-center space-y-2">
					<h2 className="text-xl font-semibold">Insufficient permissions</h2>
					<p className="text-sm text-muted-foreground">
						Admin role required to access this page.
					</p>
				</div>
			</div>
		)
	}

	return <>{children}</>
}
