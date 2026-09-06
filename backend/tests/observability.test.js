import { afterEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import * as Sentry from '@sentry/node';
import { captureRequestError, logEvent, redactSentryEvent, requestObservability } from '../src/observability.ts';

const requestId = '8bd98e6a-543f-4696-8dbb-5ad9d0e63590';
const traceId = 'b03652a93c9a4de889cc93bb3e7fbeaf';
let server;
afterEach(async () => {
  vi.restoreAllMocks();
  if (server) await new Promise((resolve) => server.close(resolve));
  server = undefined;
  await Sentry.close(1000);
});

describe('observabilidade sem dados pessoais', () => {
  it('correlaciona resposta, log JSON e envelope real do SDK de erro não tratado', async () => {
    const envelopes = [];
    Sentry.init({
      dsn: 'https://public@example.com/1',
      defaultIntegrations: false,
      beforeSend: redactSentryEvent,
      transport: () => ({
        send: async (envelope) => { envelopes.push(envelope); return { statusCode: 200 }; },
        flush: async () => true,
      }),
    });
    const logs = [];
    vi.spyOn(process.stdout, 'write').mockImplementation((line) => { logs.push(String(line)); return true; });
    vi.spyOn(process.stderr, 'write').mockImplementation((line) => { logs.push(String(line)); return true; });
    const app = express();
    app.use(requestObservability);
    app.get('/boom', () => { throw new Error('password=hunter2 token=secret phone=11999998888'); });
    app.use((error, req, res, _next) => {
      captureRequestError(error, req, res);
      res.status(500).json({ error: 'Erro interno.' });
    });
    server = await new Promise((resolve) => { const listening = app.listen(0, '127.0.0.1', () => resolve(listening)); });
    const response = await fetch(`http://127.0.0.1:${server.address().port}/boom?token=secret`, {
      headers: { 'X-Request-ID': requestId, traceparent: `00-${traceId}-0123456789abcdef-01`, Authorization: 'Bearer secret' },
    });
    await response.json();
    await Sentry.flush(2000);
    expect(response.status).toBe(500);
    expect(response.headers.get('x-request-id')).toBe(requestId);
    expect(response.headers.get('x-trace-id')).toBe(traceId);
    const event = envelopes.flatMap((envelope) => envelope[1]).find(([header]) => header.type === 'event')?.[1];
    expect(event).toMatchObject({ tags: { request_id: requestId, trace_id: traceId } });
    expect(event.event_id).toBe(response.headers.get('x-error-id'));
    const entries = logs.filter((line) => line.startsWith('{')).map((line) => JSON.parse(line));
    expect(entries).toContainEqual(expect.objectContaining({ event: 'http_error', request_id: requestId, trace_id: traceId, event_id: event.event_id }));
    expect(entries).toContainEqual(expect.objectContaining({ event: 'http_request', request_id: requestId, status: 500 }));
    for (const secret of ['hunter2', 'secret', '11999998888', 'Authorization']) {
      expect(JSON.stringify({ entries, event })).not.toContain(secret);
    }
  });

  it('descarta cookies, corpo, mensagem, variáveis, usuário, breadcrumbs e contexto SQL', () => {
    const result = redactSentryEvent({
      tags: { request_id: requestId, trace_id: traceId, token: 'secret' },
      request: { headers: { cookie: 'secret' }, data: { password: 'secret' } },
      user: { email: 'secret@example.com' },
      extra: { sql: 'select secret' },
      contexts: { phone: { value: '11999998888' } },
      message: 'secret', breadcrumbs: [{ message: 'secret' }],
      exception: { values: [{ type: 'Error', value: 'secret', stacktrace: { frames: [{ filename: '/home/personal/src/api.ts?token=secret', lineno: 42, vars: { password: 'secret' }, context_line: 'secret' }] } }] },
    });
    expect(JSON.stringify(result)).not.toMatch(/secret|11999998888|personal/);
    expect(result.exception.values[0].stacktrace.frames[0]).toMatchObject({ filename: 'api.ts', lineno: 42 });
  });

  it('recusa correlação malformada e não aceita dados arbitrários no logger', () => {
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    logEvent('info', 'http_request', { request_id: 'secret', trace_id: 'secret', status: 200, password: 'secret', phone: '11999998888', route: '/customers/11999998888?token=secret' });
    const result = JSON.parse(write.mock.calls[0][0]);
    expect(result).toMatchObject({ event: 'http_request', status: 200 });
    expect(JSON.stringify(result)).not.toMatch(/secret|11999998888/);
  });
});
