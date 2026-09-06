import { describe, expect, it } from 'vitest';
import { createRequestCorrelation, readResponseCorrelation, redactSentryEvent } from './observability';

describe('correlação e privacidade do rastreamento no navegador', () => {
  it('gera identificadores independentes por requisição e um traceparent válido', () => {
    const first = createRequestCorrelation();
    const second = createRequestCorrelation();
    expect(first.correlation.request_id).not.toBe(second.correlation.request_id);
    expect(first.headers.traceparent).toMatch(/^00-[0-9a-f]{32}-[0-9a-f]{16}-00$/);
    expect(first.headers['X-Request-ID']).toBe(first.correlation.request_id);
  });

  it('lê correlação do servidor e preserva a local se os headers não forem expostos pelo CORS', () => {
    const local = createRequestCorrelation();
    const remote = createRequestCorrelation();
    expect(readResponseCorrelation(new Response('{}'), local.correlation)).toEqual(local.correlation);
    expect(readResponseCorrelation(new Response('{}', { headers: { 'X-Request-ID': remote.correlation.request_id, 'X-Trace-ID': remote.correlation.trace_id } }), local.correlation)).toEqual(remote.correlation);
  });

  it('remove dados da sessão e mensagens que possam conter senha, token ou telefone', () => {
    const local = createRequestCorrelation();
    const event = redactSentryEvent({
      tags: { ...local.correlation, password: 'secret' },
      user: { email: 'secret@example.com' },
      request: { url: 'https://app.example.com/reset?token=secret', data: { phone: '11999998888' } },
      extra: { password: 'secret' },
      breadcrumbs: [{ message: 'secret' }],
      exception: { values: [{ type: 'TypeError', value: 'password=secret phone=11999998888', stacktrace: { frames: [{ filename: 'https://app.example.com/assets/app.js?secret', lineno: 20, context_line: 'secret' }] } }] },
    });
    expect(JSON.stringify(event)).not.toMatch(/secret|11999998888/);
    expect(event.tags).toEqual(local.correlation);
    expect(event.exception?.values?.[0].stacktrace?.frames?.[0]).toMatchObject({ filename: 'app.js', lineno: 20 });
  });
});
