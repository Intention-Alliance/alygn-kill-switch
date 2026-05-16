"use client";

import React, { Component } from "react";
import type { ErrorInfo, ReactNode } from "react";

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/**
 * ErrorBoundary — Catches render errors in the component tree.
 * Used as a wrapper around page content and individual feature sections.
 *
 * Design: Graceful degradation — shows a fallback UI instead of a blank screen.
 * Errors are logged and can be forwarded to OTel tracing.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    // Log to console for debugging
    console.error("[ErrorBoundary] Caught error:", error.message, errorInfo.componentStack);

    // Forward to custom error handler (e.g., OTel)
    this.props.onError?.(error, errorInfo);
  }

  handleReset = (): void => {
    this.setState({ hasError: false, error: null });
  };

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      const isDev =
        typeof process !== "undefined" &&
        process.env?.NODE_ENV === "development";

      return (
        <DefaultFallback
          error={this.state.error}
          onReset={this.handleReset}
          isDev={isDev}
        />
      );
    }

    return this.props.children;
  }
}

/**
 * SectionErrorBoundary — Lightweight wrapper for feature sections.
 * Catches errors in individual components without taking down the whole page.
 */
export function SectionErrorBoundary({
  children,
  title = "Section",
}: {
  children: ReactNode;
  title?: string;
}) {
  return (
    <ErrorBoundary
      fallback={
        <div
          className="rounded-lg border border-destructive/30 bg-destructive/5 p-6 text-center"
          role="alert"
        >
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
            <svg
              className="h-6 w-6 text-destructive"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"
              />
            </svg>
          </div>
          <h3 className="text-sm font-semibold text-destructive">
            Failed to load {title}
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            An error occurred while rendering this section. Try refreshing the
            page.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-4 inline-flex items-center gap-2 rounded-md border border-input bg-background px-3 py-1.5 text-xs font-medium hover:bg-accent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Report to Admin & Reload
          </button>
        </div>
      }
    >
      {children}
    </ErrorBoundary>
  );
}

// ─── Default Fallback UI ────────────────────────────────────────

function DefaultFallback({
  error,
  onReset,
  isDev,
}: {
  error: Error | null;
  onReset: () => void;
  isDev: boolean;
}) {
  return (
    <div
      className="flex min-h-[400px] items-center justify-center p-8"
      role="alert"
    >
      <div className="max-w-md text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
          <svg
            className="h-8 w-8 text-destructive"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        </div>
        <h2 className="text-lg font-semibold">Something went wrong</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {error?.message ?? "An unexpected error occurred. Please try again."}
        </p>

        {/* Stack trace — dev only */}
        {isDev && error?.stack && (
          <details className="mt-3 text-left">
            <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground transition-colors">
              Stack trace (dev only)
            </summary>
            <pre className="mt-2 max-h-40 overflow-auto rounded-md bg-muted p-3 text-xs font-mono text-muted-foreground">
              {error.stack}
            </pre>
          </details>
        )}

        <div className="mt-6 flex flex-col items-center gap-3">
          <div className="flex gap-3">
            <button
              onClick={onReset}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              type="button"
            >
              Try Again
            </button>
            <button
              onClick={() => window.location.reload()}
              className="rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-accent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              type="button"
            >
              Reload Page
            </button>
          </div>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground transition-colors"
          >
            Report this error to the admin team
          </button>
        </div>
      </div>
    </div>
  );
}
