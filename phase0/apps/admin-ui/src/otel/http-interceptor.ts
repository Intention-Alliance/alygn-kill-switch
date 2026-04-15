import { trace, context, type SpanContext } from '@opentelemetry/api';

interface FeatureFlagContext {
  userId?: string;
  environment?: string;
  tenantId?: string;
  [key: string]: string | undefined;
}

interface FetchInterceptorOptions {
  baseUrl?: string;
  loginRedirectPath?: string;
  getFeatureFlagContext?: () => FeatureFlagContext;
}

interface TracingHeaders {
  "X-Trace-ID": string;
  traceparent: string;
  "X-Feature-Flag-Context"?: string;
}

const LOGIN_PATH = "/login";

function extractCurrentSpanContext(): SpanContext | null {
  const span = trace.getSpan(context.active());
  if (!span) return null;
  return span.spanContext();
}

function buildTraceHeaders(featureFlagContext?: FeatureFlagContext): TracingHeaders | null {
  const spanContext = extractCurrentSpanContext();
  if (!spanContext) return null;

  const headers: TracingHeaders = {
    "X-Trace-ID": spanContext.traceId,
    traceparent: `00-${spanContext.traceId}-${spanContext.spanId}-0${spanContext.traceFlags}`,
  };

  if (featureFlagContext) {
    const filtered: Record<string, string> = {};
    for (const [key, value] of Object.entries(featureFlagContext)) {
      if (value !== undefined) {
        filtered[key] = value;
      }
    }
    headers["X-Feature-Flag-Context"] = btoa(JSON.stringify(filtered));
  }

  return headers;
}

function isAuthError(response: Response | number): boolean {
  const status = typeof response === "number" ? response : response.status;
  return status === 401 || status === 403;
}

function handleAuthRedirect(loginPath: string): void {
  const currentPath = window.location.pathname + window.location.search;
  const redirectUrl = `${loginPath}?redirect=${encodeURIComponent(currentPath)}`;
  window.location.href = redirectUrl;
}

function injectTraceHeaders(
  existingHeaders: HeadersInit | undefined,
  featureFlagContext?: FeatureFlagContext,
): HeadersInit {
  const traceHeaders = buildTraceHeaders(featureFlagContext);
  if (!traceHeaders) return existingHeaders ?? {};

  const merged: Record<string, string> = {};

  // Merge existing headers
  if (existingHeaders instanceof Headers) {
    existingHeaders.forEach((value, key) => {
      merged[key] = value;
    });
  } else if (Array.isArray(existingHeaders)) {
    for (const [key, value] of existingHeaders) {
      merged[key] = value;
    }
  } else if (existingHeaders) {
    Object.assign(merged, existingHeaders);
  }

  // Inject trace headers
  merged["X-Trace-ID"] = traceHeaders["X-Trace-ID"];
  merged["traceparent"] = traceHeaders.traceparent;
  if (traceHeaders["X-Feature-Flag-Context"]) {
    merged["X-Feature-Flag-Context"] = traceHeaders["X-Feature-Flag-Context"];
  }

  return merged;
}

export function createFetchInterceptor(options: FetchInterceptorOptions = {}): {
  interceptedFetch: typeof fetch;
  restore: () => void;
} {
  const { loginRedirectPath = LOGIN_PATH, getFeatureFlagContext } = options;
  const originalFetch = window.fetch.bind(window);

  const interceptedFetch: typeof fetch = async (input, init) => {
    const featureFlagCtx = getFeatureFlagContext?.();
    const mergedHeaders = injectTraceHeaders(init?.headers, featureFlagCtx);

    const modifiedInit: RequestInit = {
      ...init,
      headers: mergedHeaders,
    };

    const response = await originalFetch(input, modifiedInit);

    if (isAuthError(response)) {
      handleAuthRedirect(loginRedirectPath);
    }

    return response;
  };

  // Replace global fetch
  const originalGlobalFetch = window.fetch;
  window.fetch = interceptedFetch;

  return {
    interceptedFetch,
    restore: () => {
      window.fetch = originalGlobalFetch;
    },
  };
}

export function createXHRInterceptor(options: FetchInterceptorOptions = {}): {
  restore: () => void;
} {
  const { loginRedirectPath = LOGIN_PATH, getFeatureFlagContext } = options;
  const OriginalXHR = window.XMLHttpRequest;
  const originalOpen = OriginalXHR.prototype.open;
  const originalSend = OriginalXHR.prototype.send;
  const originalSetRequestHeader = OriginalXHR.prototype.setRequestHeader;

  // Track headers set per-XHR to inject trace headers
  const pendingHeaders = new WeakMap<XMLHttpRequest, Record<string, string>>();

  OriginalXHR.prototype.open = function (
    method: string,
    url: string | URL,
    async?: boolean,
    username?: string | null,
    password?: string | null,
  ) {
    const featureFlagCtx = getFeatureFlagContext?.();
    const traceHeaders = buildTraceHeaders(featureFlagCtx);
    if (traceHeaders) {
      pendingHeaders.set(this as XMLHttpRequest, {
        "X-Trace-ID": traceHeaders["X-Trace-ID"],
        traceparent: traceHeaders.traceparent,
        ...(traceHeaders["X-Feature-Flag-Context"]
          ? { "X-Feature-Flag-Context": traceHeaders["X-Feature-Flag-Context"] }
          : {}),
      });
    }
    return originalOpen.call(this, method, url, async ?? true, username, password);
  };

  OriginalXHR.prototype.send = function (body?: Document | XMLHttpRequestBodyInit | null) {
    const headers = pendingHeaders.get(this as XMLHttpRequest);
    if (headers) {
      for (const [key, value] of Object.entries(headers)) {
        originalSetRequestHeader.call(this, key, value);
      }
      pendingHeaders.delete(this as XMLHttpRequest);
    }
    return originalSend.call(this, body);
  };

  // Intercept response for auth errors
  const originalAddEventListener = OriginalXHR.prototype.addEventListener;
  OriginalXHR.prototype.addEventListener = function (
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | AddEventListenerOptions,
  ) {
    if (type === "load") {
      const wrappedListener: EventListenerOrEventListenerObject = function (event: Event) {
        const xhr = event.target as XMLHttpRequest;
        if (isAuthError(xhr.status)) {
          handleAuthRedirect(loginRedirectPath);
          return;
        }
        if (typeof listener === "function") {
          listener(event);
        } else {
          listener.handleEvent(event);
        }
      };
      return originalAddEventListener.call(this, type, wrappedListener, options);
    }
    return originalAddEventListener.call(this, type, listener, options);
  };

  return {
    restore: () => {
      OriginalXHR.prototype.open = originalOpen;
      OriginalXHR.prototype.send = originalSend;
      OriginalXHR.prototype.addEventListener = originalAddEventListener;
    },
  };
}

export interface HTTPInterceptor {
  restore: () => void;
}

export function initHTTPInterceptors(options?: FetchInterceptorOptions): HTTPInterceptor {
  const fetchInterceptor = createFetchInterceptor(options);
  const xhrInterceptor = createXHRInterceptor(options);

  return {
    restore: () => {
      fetchInterceptor.restore();
      xhrInterceptor.restore();
    },
  };
}

export { buildTraceHeaders, extractCurrentSpanContext, injectTraceHeaders };
export type { FeatureFlagContext, FetchInterceptorOptions, TracingHeaders };