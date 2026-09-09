import { describe, expect, it, vi } from 'vitest';
import { runUptimeCheck } from '../scripts/uptime-monitor.mjs';

const env = {
  UPTIME_HEALTH_URL: 'https://api.example.com/api/health',
  UPTIME_ALERT_EMAIL: 'operacao@example.com',
  EMAIL_WEBHOOK_URL: 'https://email.example.com/send',
  EMAIL_WEBHOOK_TOKEN: 'secret',
  EMAIL_FROM: 'CaixaFácil <monitor@example.com>',
};

describe('monitor externo de uptime', () => {
  it('não alerta quando o health retorna ok', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response('{"ok":true}'));
    expect(await runUptimeCheck(env, { fetch })).toEqual({ healthy: true, alerted: false });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('envia alerta por e-mail após três respostas 503', async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(new Response('{}', { status: 503 }))
      .mockResolvedValueOnce(new Response('{}', { status: 503 }))
      .mockResolvedValueOnce(new Response('{}', { status: 503 }))
      .mockResolvedValueOnce(new Response('{}', { status: 202 }));
    expect(await runUptimeCheck(env, { fetch, pause: vi.fn() })).toEqual({ healthy: false, alerted: true, simulated: false });
    const [url, request] = fetch.mock.calls[3];
    expect(url.href).toBe(env.EMAIL_WEBHOOK_URL);
    expect(JSON.parse(request.body)).toMatchObject({ to: env.UPTIME_ALERT_EMAIL, subject: '[CaixaFácil] API indisponível' });
    expect(request.headers.Authorization).toBe('Bearer secret');
  });

  it('permite exercício de indisponibilidade sem derrubar a API', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response('{}', { status: 202 }));
    const result = await runUptimeCheck({ ...env, UPTIME_SIMULATE_FAILURE: 'true' }, { fetch, pause: vi.fn() });
    expect(result).toEqual({ healthy: false, alerted: true, simulated: true });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fetch.mock.calls[0][1].body).subject).toContain('[SIMULAÇÃO]');
  });

  it('não mascara falha do canal de alerta', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response('{}', { status: 500 }));
    await expect(runUptimeCheck({ ...env, UPTIME_SIMULATE_FAILURE: 'true' }, { fetch, pause: vi.fn() }))
      .rejects.toThrow('provedor recusou');
  });

  it('rejeita URL com segredo e configuração incompleta antes de consultar a API', async () => {
    const fetch = vi.fn();
    await expect(runUptimeCheck({ ...env, UPTIME_HEALTH_URL: 'https://user:secret@example.com/api/health' }, { fetch })).rejects.toThrow('HTTPS sem');
    await expect(runUptimeCheck({ ...env, UPTIME_ALERT_EMAIL: '' }, { fetch })).rejects.toThrow('UPTIME_ALERT_EMAIL');
    expect(fetch).not.toHaveBeenCalled();
  });
});
