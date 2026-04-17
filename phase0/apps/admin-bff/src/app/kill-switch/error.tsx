'use client';

// Kill Switch route error boundary — catches errors specific to the kill switch dashboard

import { useEffect } from 'react';

interface KillSwitchErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function KillSwitchError({ error, reset }: KillSwitchErrorProps) {
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error('[KillSwitchError]', error);
  }, [error]);

  return (
    <div className="flex items-center justify-center min-h-[300px] p-6">
      <div className="w-full max-w-lg rounded-xl border-2 border-red-500/30 bg-red-500/5 p-6 text-center">
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
          <h2 className="text-lg font-semibold text-gray-100">Kill Switch Error</h2>
          <p className="text-sm text-gray-500 mt-1">
            The kill switch dashboard encountered an error. This may affect safety monitoring.
          </p>
        </div>

        <p className="text-xs text-red-400 mb-4 font-mono break-all">
          {error.message}
        </p>

        <div className="flex items-center justify-center gap-3">
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
            Reload Dashboard
          </a>
        </div>
      </div>
    </div>
  );
}