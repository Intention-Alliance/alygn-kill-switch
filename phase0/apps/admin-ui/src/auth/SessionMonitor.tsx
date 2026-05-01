import { useEffect, useRef, useState } from 'react';
import { useAuth } from './AuthProvider';
import { SESSION_CONFIG, SESSION_WARNING_MS } from './types';

interface SessionMonitorProps {
  children: React.ReactNode;
}

/**
 * SessionMonitor — Idle timer that warns before auto-logout.
 * Uses the AuthProvider's logout() which delegates to better-auth signOut.
 */
export function SessionMonitor({ children }: SessionMonitorProps) {
  const { isAuthenticated, logout } = useAuth();
  const [showWarning, setShowWarning] = useState(false);
  const lastActivityRef = useRef<number>(Date.now());
  const warningShownRef = useRef(false);
  const warningDismissedRef = useRef(false);

  // Reset activity timestamp on user interaction
  useEffect(() => {
    if (!isAuthenticated) return;

    const resetActivity = () => {
      lastActivityRef.current = Date.now();
      warningShownRef.current = false;
      warningDismissedRef.current = false;
      setShowWarning(false);
    };

    const events = [
      'mousedown',
      'keydown',
      'scroll',
      'touchstart',
      'mousemove',
      'click',
    ] as const;

    events.forEach((event) => {
      window.addEventListener(event, resetActivity, { passive: true });
    });

    return () => {
      events.forEach((event) => {
        window.removeEventListener(event, resetActivity);
      });
    };
  }, [isAuthenticated]);

  // Monitor session timeout
  useEffect(() => {
    if (!isAuthenticated) return;

    const checkInterval = 5000; // Check every 5 seconds

    const interval = setInterval(() => {
      const elapsed = Date.now() - lastActivityRef.current;

      // Auto-logout at configured timeout of inactivity
      if (elapsed >= SESSION_CONFIG.timeoutMs) {
        logout();
        window.location.href = '/login?reason=session_timeout';
        return;
      }

      // Show warning at warning threshold (only once per session)
      if (
        elapsed >= SESSION_WARNING_MS &&
        !warningShownRef.current &&
        !warningDismissedRef.current
      ) {
        warningShownRef.current = true;
        setShowWarning(true);
      }
    }, checkInterval);

    return () => clearInterval(interval);
  }, [isAuthenticated, logout]);

  const extendSession = () => {
    lastActivityRef.current = Date.now();
    warningShownRef.current = false;
    warningDismissedRef.current = false;
    setShowWarning(false);
  };

  const dismissWarning = () => {
    warningDismissedRef.current = true;
    setShowWarning(false);
  };

  if (!isAuthenticated) {
    return <>{children}</>;
  }

  return (
    <>
      {children}
      {showWarning && (
        <div className="fixed bottom-4 right-4 z-50 max-w-sm rounded-lg border border-yellow-700 bg-yellow-900/90 p-4 shadow-lg backdrop-blur">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="font-medium text-yellow-200">
                Session Expiring Soon
              </h3>
              <p className="mt-1 text-sm text-yellow-300">
                Your session will expire due to inactivity. Click "Stay logged
                in" to extend.
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={dismissWarning}
                className="rounded px-3 py-1 text-sm text-yellow-200 hover:bg-yellow-800/50"
                type="button"
              >
                Dismiss
              </button>
              <button
                onClick={extendSession}
                className="rounded bg-yellow-600 px-3 py-1 text-sm font-medium text-white hover:bg-yellow-500"
                type="button"
              >
                Stay logged in
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
