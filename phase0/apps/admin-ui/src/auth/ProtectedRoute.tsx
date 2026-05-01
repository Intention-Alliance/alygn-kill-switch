import { useEffect } from 'react';
import { useAuth } from './AuthProvider';
import type { UserRole } from './types';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredRole?: UserRole | UserRole[];
}

/**
 * ProtectedRoute — guards routes behind authentication.
 * Works with the AuthProvider's isAuthenticated state, which
 * is driven by the better-auth session.
 */
export function ProtectedRoute({ children, requiredRole }: ProtectedRouteProps) {
  const { isAuthenticated, user } = useAuth();

  useEffect(() => {
    if (!isAuthenticated) {
      // Preserve the attempted URL for post-login redirect
      const currentPath = window.location.pathname;
      const redirectUrl = currentPath === '/login' || currentPath === '/'
        ? '/login'
        : `/login?redirect=${encodeURIComponent(currentPath)}`;
      window.location.href = redirectUrl;
    }
  }, [isAuthenticated]);

  if (!isAuthenticated) {
    return null;
  }

  if (requiredRole && user) {
    const requiredRoles = Array.isArray(requiredRole)
      ? requiredRole
      : [requiredRole];
    if (!requiredRoles.includes(user.role)) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-gray-950">
          <div className="max-w-md rounded-xl border border-red-800 bg-red-950/50 p-8 text-center">
            <h1 className="mb-2 text-2xl font-semibold text-red-400">
              Access Denied
            </h1>
            <p className="text-gray-400">
              Your role ({user.role}) does not have permission to access this
              page.
            </p>
            <p className="mt-4 text-sm text-gray-500">
              Required role(s): {requiredRoles.join(' or ')}
            </p>
          </div>
        </div>
      );
    }
  }

  return <>{children}</>;
}
