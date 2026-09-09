import { pathToFileURL } from 'node:url';

function configuredUrl(value, field) {
  let url;
  try { url = new URL(value); } catch { throw new Error(`${field}: configure uma URL HTTPS válida.`); }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) {
    throw new Error(`${field}: use HTTPS sem credenciais, query string ou fragmento.`);
  }
  return url;
}

async function reportStatus(env, fetcher, payload) {
  if (!env.UPTIME_REPORT_URL || !env.UPTIME_REPORT_TOKEN) return;
  const reportUrl = configuredUrl(env.UPTIME_REPORT_URL, 'UPTIME_REPORT_URL');
  if (reportUrl.pathname !== '/api/monitor/uptime') throw new Error('UPTIME_REPORT_URL deve apontar para /api/monitor/uptime.');
  const response = await fetcher(reportUrl, {
    method: 'POST', signal: AbortSignal.timeout(10_000), redirect: 'error',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.UPTIME_REPORT_TOKEN}` },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error('A API recusou o relatório do monitor.');
}

/** Runs on an external scheduler, independent of the monitored API and its database. */
export async function runUptimeCheck(env = process.env, dependencies = {}) {
  const fetcher = dependencies.fetch ?? fetch;
  const pause = dependencies.pause ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  const healthUrl = configuredUrl(env.UPTIME_HEALTH_URL, 'UPTIME_HEALTH_URL');
  if (healthUrl.pathname !== '/api/health') throw new Error('UPTIME_HEALTH_URL deve apontar para /api/health.');
  const emailUrl = configuredUrl(env.EMAIL_WEBHOOK_URL, 'EMAIL_WEBHOOK_URL');
  if (!env.UPTIME_ALERT_EMAIL || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(env.UPTIME_ALERT_EMAIL)) {
    throw new Error('Configure UPTIME_ALERT_EMAIL para receber os alertas.');
  }
  if (!env.EMAIL_FROM) throw new Error('Configure EMAIL_FROM para o provedor de e-mail.');

  let status = 'unreachable';
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      if (env.UPTIME_SIMULATE_FAILURE === 'true') throw new Error('simulation');
      const response = await fetcher(healthUrl, { signal: AbortSignal.timeout(10_000), redirect: 'error' });
      status = String(response.status);
      if (response.ok && (await response.json())?.ok === true) {
        await reportStatus(env, fetcher, { healthy: true, httpStatus: String(response.status), simulated: false, checkedAt: new Date().toISOString() });
        return { healthy: true, alerted: false };
      }
    } catch {
      // Network exceptions may contain credentials/URLs; use an enumerated status only.
      status = 'unreachable';
    }
    if (attempt < 2) await pause(2000);
  }

  const simulated = env.UPTIME_SIMULATE_FAILURE === 'true';
  const alertResponse = await fetcher(emailUrl, {
    method: 'POST',
    signal: AbortSignal.timeout(10_000),
    redirect: 'error',
    headers: { 'Content-Type': 'application/json', ...(env.EMAIL_WEBHOOK_TOKEN
      ? { Authorization: `Bearer ${env.EMAIL_WEBHOOK_TOKEN}` } : {}) },
    body: JSON.stringify({
      from: env.EMAIL_FROM,
      to: env.UPTIME_ALERT_EMAIL,
      subject: `${simulated ? '[SIMULAÇÃO] ' : ''}[CaixaFácil] API indisponível`,
      text: `O monitor externo detectou três falhas consecutivas em ${healthUrl.origin}/api/health. Status: ${status}. Horário UTC: ${new Date().toISOString()}. Consulte os logs e o Sentry.`,
    }),
  });
  if (!alertResponse.ok) throw new Error('O provedor recusou o alerta de uptime. Verifique a execução do monitor.');
  await reportStatus(env, fetcher, { healthy: false, httpStatus: status, simulated, checkedAt: new Date().toISOString() });
  return { healthy: false, alerted: true, simulated };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const result = await runUptimeCheck();
    process.stdout.write(JSON.stringify({ event: 'uptime_check', ...result }) + '\n');
    if (!result.healthy) process.exitCode = 1;
  } catch {
    process.stderr.write(JSON.stringify({ event: 'uptime_monitor_failed', message: 'Verifique configuração e disponibilidade do provedor de alerta.' }) + '\n');
    process.exitCode = 1;
  }
}
