import { Component, type ErrorInfo, type ReactNode } from 'react';
import { trace, context, SpanStatusCode } from '@opentelemetry/api';
import { getTracer } from './index';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: (error: Error, traceId: string | undefined) => ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  traceId: string | undefined;
}

/**
 * React Error Boundary that captures errors with trace context.
 * When an error occurs during rendering, it:
 * 1. Captures the current trace ID from the active span
 * 2. Records the error as an OTel span event
 * 3. Shows a user-friendly error UI with the trace ID for support
 */
export class ErrorBoundaryWithTrace extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null, traceId: undefined };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    // Get current trace ID from active span
    const span = trace.getSpan(context.active());
    const traceId = span?.spanContext()?.traceId;

    return { hasError: true, error, traceId };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    const tracer = getTracer();
    const span = tracer.startSpan('react.error_boundary', {
      attributes: {
        'error.type': 'render_error',
        'error.message': error.message,
        'error.stack': error.stack ?? '',
        'component_stack': errorInfo.componentStack ?? '',
      },
    });

    span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
    span.recordException(error);
    span.end();

    // Log for debugging
    console.error('[ErrorBoundary]', error, errorInfo);
  }

  handleReset = (): void => {
    this.setState({ hasError: false, error: null, traceId: undefined });
  };

  render(): ReactNode {
    if (this.state.hasError && this.state.error) {
      if (this.props.fallback) {
        return this.props.fallback(this.state.error, this.state.traceId);
      }

      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-950 p-6">
          <div className="card max-w-lg w-full text-center">
            <div className="text-4xl mb-4">⚠️</div>
            <h2 className="text-xl font-bold text-red-400 mb-2">
              Something went wrong
            </h2>
            <p className="text-gray-400 text-sm mb-4">
              An unexpected error occurred. The engineering team has been notified.
            </p>
            {this.state.traceId && (
              <div className="bg-gray-800 rounded-lg p-3 mb-4">
                <p className="text-xs text-gray-500 mb-1">Trace ID (for support)</p>
                <code className="text-xs text-blue-400 font-mono break-all">
                  {this.state.traceId}
                </code>
              </div>
            )}
            <button
              onClick={this.handleReset}
              className="btn-primary"
            >
              Try Again
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

/**
 * HOC to wrap a component with the error boundary.
 */
export function withErrorBoundary<P extends object>(
  WrappedComponent: React.ComponentType<P>,
  fallback?: ErrorBoundaryProps['fallback'],
): React.ComponentType<P> {
  const displayName = WrappedComponent.displayName ?? WrappedComponent.name ?? 'Component';

  const ComponentWithErrorBoundary = (props: P) => (
    <ErrorBoundaryWithTrace fallback={fallback}>
      <WrappedComponent {...props} />
    </ErrorBoundaryWithTrace>
  );

  ComponentWithErrorBoundary.displayName = `withErrorBoundary(${displayName})`;
  return ComponentWithErrorBoundary;
}