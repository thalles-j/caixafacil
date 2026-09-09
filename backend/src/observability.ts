import { AsyncLocalStorage } from 'node:async_hooks';
import { randomBytes, randomUUID } from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import * as Sentry from '@sentry/node';

type Correlation = { request_id: string; trace_id: string; span_id: string };
const context = new AsyncLocalStorage<Correlation>();
const requests = new WeakMap<Request, Correlation>();
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const trace = /^[0-9a-f]{32}$/i;
const errorNames = new Set(['Error', 'TypeError', 'RangeError', 'ReferenceError', 'SyntaxError', 'URIError', 'AggregateError']);
let initialized = false;
const capturedErrorTimes: number[] = [];
const simulatedErrorTimes: number[] = [];

function rememberCapturedError(): void {
  const now = Date.now();
  capturedErrorTimes.push(now);
  while (capturedErrorTimes[0] < now - 24 * 60 * 60 * 1000) capturedErrorTimes.shift();
}

export function getOperationalErrorSnapshot() {
  const now = Date.now();
  return {
    configured: Boolean(process.env.SENTRY_DSN),
    recentErrors: capturedErrorTimes.filter((time) => time >= now - 15 * 60 * 1000).length,
    recentSimulatedErrors: simulatedErrorTimes.filter((time) => time >= now - 15 * 60 * 1000).length,
    windowMinutes: 15,
    source: 'captured-events' as const,
  };
}

export function simulateOperationalErrorSpike(count: number): ReturnType<typeof getOperationalErrorSnapshot> {
  const now = Date.now();
  for (let index = 0; index < count; index += 1) {
    capturedErrorTimes.push(now);
    simulatedErrorTimes.push(now);
  }
  return getOperationalErrorSnapshot();
}

function safeErrorName(value: unknown): string {
  return typeof value === 'string' && errorNames.has(value) ? value : 'Error';
}

/** Build an allowlisted event. Regex-based masking cannot safely redact arbitrary errors. */
export function redactSentryEvent<T extends Sentry.Event>(event: T): T {
  const tags: Record<string, string> = {};
  for (const key of ['request_id', 'trace_id']) {
    const value = event.tags?.[key] ?? context.getStore()?.[key as 'request_id' | 'trace_id'];
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
        type: safeErrorName(exception.type),
        value: 'Application error (details redacted)',
        mechanism: exception.mechanism ? {
          type: exception.mechanism.type,
          handled: exception.mechanism.handled,
        } : undefined,
        stacktrace: exception.stacktrace ? {
          frames: exception.stacktrace.frames?.map((frame) => ({
            // Keep only code locations; omit absolute paths, source context and local variables.
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
  if (initialized) return;
  initialized = true;
  if (process.env.SENTRY_DSN) Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV ?? 'development',
    release: process.env.APP_RELEASE,
    sendDefaultPii: false,
    defaultIntegrations: false,
    // Global handlers below replace SDK defaults, which print raw error messages.
    integrations: [],
    beforeSend: redactSentryEvent,
    maxBreadcrumbs: 0,
  });
  const fatal = (error: unknown) => {
    void captureFatalError(error, 'server_error').finally(() => process.exit(1));
  };
  process.on('uncaughtException', fatal);
  process.on('unhandledRejection', fatal);
}

type LogEvent = 'http_request' | 'http_error' | 'server_started' | 'server_error' | 'database_error' | 'configuration_error' | 'email_delivery_error';
type LogFields = { request_id?: string; trace_id?: string; event_id?: string; status?: number; duration_ms?: number; method?: string; route?: string; error_name?: string; port?: number };

/** Never pass bodies, headers, cookies, error messages or arbitrary objects to the log sink. */
export function logEvent(level: 'info' | 'warn' | 'error', event: LogEvent, fields: LogFields = {}): void {
  const safe: Record<string, string | number> = {};
  const correlated = { ...context.getStore(), ...fields };
  for (const key of ['request_id', 'trace_id', 'event_id'] as const) {
    const value = correlated[key];
    if (typeof value === 'string' && (key === 'request_id' ? uuid : trace).test(value)) safe[key] = value;
  }
  for (const key of ['status', 'duration_ms', 'port'] as const) {
    const value = fields[key];
    if (typeof value === 'number' && Number.isFinite(value)) safe[key] = value;
  }
  if (fields.method && /^(GET|HEAD|POST|PUT|PATCH|DELETE|OPTIONS)$/.test(fields.method)) safe.method = fields.method;
  // Only Express route templates, never req.url/originalUrl or a URL query string.
  if (fields.route && /^\/[a-zA-Z/:_-]*$/.test(fields.route)) safe.route = fields.route;
  if (fields.error_name) safe.error_name = safeErrorName(fields.error_name);
  const line = JSON.stringify({ timestamp: new Date().toISOString(), level, event, ...safe }) + '\n';
  (level === 'error' ? process.stderr : process.stdout).write(line);
}

export function requestObservability(req: Request, res: Response, next: NextFunction): void {
  const incomingId = req.get('x-request-id');
  const incomingTrace = req.get('traceparent')?.match(/^00-([0-9a-f]{32})-([0-9a-f]{16})-0[01]$/i);
  const correlation: Correlation = {
    request_id: incomingId && uuid.test(incomingId) ? incomingId.toLowerCase() : randomUUID(),
    trace_id: incomingTrace && !/^0+$/.test(incomingTrace[1]) && !/^0+$/.test(incomingTrace[2])
      ? incomingTrace[1].toLowerCase() : randomBytes(16).toString('hex'),
    span_id: randomBytes(8).toString('hex'),
  };
  requests.set(req, correlation);
  res.setHeader('X-Request-ID', correlation.request_id);
  res.setHeader('X-Trace-ID', correlation.trace_id);
  res.setHeader('traceparent', `00-${correlation.trace_id}-${correlation.span_id}-00`);
  const start = performance.now();
  res.once('finish', () => {
    logEvent(res.statusCode >= 500 ? 'error' : 'info', 'http_request', {
      ...correlation,
      status: res.statusCode,
      duration_ms: Math.round(performance.now() - start),
      method: req.method,
      route: typeof req.route?.path === 'string' ? req.route.path : undefined,
    });
  });
  context.run(correlation, next);
}

export function captureRequestError(error: unknown, req: Request, res: Response): string | undefined {
  const correlation = requests.get(req);
  const status = typeof error === 'object' && error !== null && 'status' in error ? Number(error.status) : 500;
  // Validation failures are operational events, not unhandled application errors.
  let eventId: string | undefined;
  if (!(status >= 400 && status < 500)) {
    rememberCapturedError();
    Sentry.withScope((scope) => {
      if (correlation) scope.setTags({ request_id: correlation.request_id, trace_id: correlation.trace_id });
      eventId = Sentry.captureException(error);
    });
  }
  const level = status === 401 ? 'info' : status >= 400 && status < 500 ? 'warn' : 'error';
  logEvent(level, 'http_error', {
    ...correlation,
    event_id: eventId,
    error_name: error instanceof Error ? error.name : 'Error',
    status: Number.isInteger(status) && status >= 400 && status <= 599 ? status : 500,
  });
  if (eventId && !res.headersSent) res.setHeader('X-Error-ID', eventId);
  return eventId;
}

export async function captureFatalError(error: unknown, event: 'server_error' | 'database_error'): Promise<void> {
  rememberCapturedError();
  const eventId = Sentry.captureException(error, { mechanism: { handled: false, type: 'auto.node.global_handlers' } });
  logEvent('error', event, { event_id: eventId, error_name: error instanceof Error ? error.name : 'Error' });
  await Sentry.flush(2000);
}
