'use client';

// Root error boundary — catches unhandled errors in any route segment
// Next.js auto-wraps each route segment; this is the root-level fallback

import { useEffect } from 'react';

interface RootErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function RootError({ error, reset }: RootErrorProps) {
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error('[RootError]', error);
  }, [error]);

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-950 p-6">
      <div className="w-full max-w-lg rounded-xl border border-gray-800 bg-gray-900 p-6 text-center">
        <div className="mb-4">
          <div className="mx-auto w-12 h-12 rounded-full bg-red-900/30 flex items-center justify-center mb-3">
            <svg
              className="w-6 h-6 text-red-500"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-gray-100">Something went wrong</h2>
          <p className="text-sm text-gray-500 mt-1">
            An unexpected error occurred. Please try again or return to the dashboard.
          </p>
        </div>

        <div className="flex items-center justify-center gap-3 mt-4">
          <button
            onClick={reset}
            className="rounded-md bg-gray-800 px-4 py-2 text-sm font-medium text-gray-200 transition-colors hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-600"
          >
            Try Again
          </button>
          <a
            href="/kill-switch"
            className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-500 focus:outline-none focus:ring-2 focus:ring-red-500"
          >
            Go to Dashboard
          </a>
        </div>
      </div>
    </div>
  );
}