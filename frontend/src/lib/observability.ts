import * as Sentry from '@sentry/react';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const trace = /^[0-9a-f]{32}$/i;
const errorNames = new Set(['Error', 'TypeError', 'RangeError', 'ReferenceError', 'SyntaxError', 'URIError', 'AggregateError']);
export type RequestCorrelation = { request_id: string; trace_id: string };

export function redactSentryEvent<T extends Sentry.Event>(event: T): T {
  const tags: Record<string, string> = {};
  for (const key of ['request_id', 'trace_id']) {
    const value = event.tags?.[key];
    if (typeof value === 'string' && (key === 'request_id' ? uuid : trace).test(value)) tags[key] = value;
  }
  return {
    event_id: event.event_id,
    timestamp: event.timestamp,
    platform: event.platform,
    level: event.level,
    environment: event.environment,
    release: event.release,
    tags,
    exception: event.exception ? {
      values: event.exception.values?.map((exception) => ({
        type: exception.type && errorNames.has(exception.type) ? exception.type : 'Error',
        value: 'Application error (details redacted)',
        mechanism: exception.mechanism ? { type: exception.mechanism.type, handled: exception.mechanism.handled } : undefined,
        stacktrace: exception.stacktrace ? {
          frames: exception.stacktrace.frames?.map((frame) => ({
            filename: frame.filename?.split(/[?#]/)[0].replaceAll('\\', '/').split('/').pop(),
            lineno: frame.lineno,
            colno: frame.colno,
            in_app: frame.in_app,
          })),
        } : undefined,
      })),
    } : undefined,
  } as T;
}

export function initObservability(): void {
  if (!import.meta.env.VITE_SENTRY_DSN) return;
  Sentry.init({
    dsn: import.meta.env.VITE_SENTRY_DSN,
    environment: import.meta.env.MODE,
    release: import.meta.env.VITE_APP_RELEASE,
    sendDefaultPii: false,
    defaultIntegrations: false,
    integrations: [Sentry.globalHandlersIntegration(), Sentry.browserApiErrorsIntegration()],
    beforeSend: redactSentryEvent,
    maxBreadcrumbs: 0,
  });
}

export function captureFrontendError(error: unknown, correlation?: RequestCorrelation): void {
  Sentry.withScope((scope) => {
    if (correlation) scope.setTags(correlation);
    Sentry.captureException(error);
  });
}

export function createRequestCorrelation(): { correlation: RequestCorrelation; headers: Record<string, string> } {
  const request_id = crypto.randomUUID();
  const trace_id = crypto.randomUUID().replaceAll('-', '');
  const span = crypto.randomUUID().replaceAll('-', '').slice(0, 16);
  return { correlation: { request_id, trace_id }, headers: {
    'X-Request-ID': request_id,
    traceparent: `00-${trace_id}-${span}-00`,
  } };
}

export function readResponseCorrelation(response: Response, fallback: RequestCorrelation): RequestCorrelation {
  const requestId = response.headers.get('X-Request-ID');
  const traceId = response.headers.get('X-Trace-ID');
  return {
    request_id: requestId && uuid.test(requestId) ? requestId : fallback.request_id,
    trace_id: traceId && trace.test(traceId) ? traceId : fallback.trace_id,
  };
}

/** Use only for the application's API; never propagate identifiers to third-party URLs. */
export async function observedFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const { correlation, headers: correlationHeaders } = createRequestCorrelation();
  const headers = new Headers(input instanceof Request ? input.headers : undefined);
  new Headers(init.headers).forEach((value, key) => headers.set(key, value));
  Object.entries(correlationHeaders).forEach(([key, value]) => headers.set(key, value));
  let response: Response;
  try {
    response = await fetch(input, { ...init, headers });
  } catch (error) {
    // A deliberate cancellation is not a network outage.
    if (!(error instanceof Error && error.name === 'AbortError')) captureFrontendError(error, correlation);
    throw error;
  }
  if (response.status >= 500) {
    captureFrontendError(new Error('API unavailable'), readResponseCorrelation(response, correlation));
  }
  return response;
}
