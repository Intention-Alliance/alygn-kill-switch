'use client';

// Reusable React Error Boundary — class component required for getDerivedStateFromError
// Wraps children with a catch-all error UI matching the dark admin theme

import { Component, type ErrorInfo, type ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error) => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  showDetails: boolean;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null, showDetails: false };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    this.props.onError?.(error);
    // eslint-disable-next-line no-console
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, showDetails: false });
  };

  toggleDetails = () => {
    this.setState((prev) => ({ showDetails: !prev.showDetails }));
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      const { error, showDetails } = this.state;

      return (
        <div className="flex items-center justify-center min-h-[300px] p-6">
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
                An unexpected error occurred in this section.
              </p>
            </div>

            {error && (
              <button
                onClick={this.toggleDetails}
                className="text-xs text-gray-500 hover:text-gray-300 underline mb-4"
              >
                {showDetails ? 'Hide details' : 'Show details'}
              </button>
            )}

            {showDetails && error && (
              <pre className="mt-2 mb-4 text-left text-xs text-red-400 bg-gray-950 border border-gray-800 rounded-lg p-3 overflow-auto max-h-40">
                {error.message}
                {error.stack && `\n\n${error.stack}`}
              </pre>
            )}

            <div className="flex items-center justify-center gap-3 mt-4">
              <button
                onClick={this.handleReset}
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

    return this.props.children;
  }
}