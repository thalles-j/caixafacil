import { Router } from 'express';
import { timingSafeEqual } from 'node:crypto';
import { pool } from '../db.js';
import { rateLimit } from '../security.js';

export const monitorRouter = Router();

function validMonitorToken(authorization: string | undefined, configuredToken: string | undefined): boolean {
  if (!authorization?.startsWith('Bearer ') || !configuredToken) return false;
  const received = Buffer.from(authorization.slice(7));
  const expected = Buffer.from(configuredToken);
  return received.length === expected.length && timingSafeEqual(received, expected);
}

monitorRouter.post('/uptime', rateLimit('uptime-report', 20, 15 * 60 * 1000), async (req, res, next) => {
  try {
    const configuredToken = process.env.UPTIME_REPORT_TOKEN;
    const authorization = req.get('authorization');
    if (!validMonitorToken(authorization, configuredToken)) {
      return res.status(401).json({ error: 'Credencial do monitor inválida.' });
    }
    const healthy = req.body?.healthy;
    const httpStatus = String(req.body?.httpStatus ?? 'unknown');
    const simulated = req.body?.simulated === true;
    const checkedAt = new Date(String(req.body?.checkedAt ?? ''));
    if (typeof healthy !== 'boolean' || !/^(?:[1-5]\d{2}|unreachable)$/.test(httpStatus) || Number.isNaN(checkedAt.getTime())) {
      return res.status(400).json({ error: 'Relatório do monitor inválido.' });
    }
    if (Math.abs(Date.now() - checkedAt.getTime()) > 15 * 60 * 1000) {
      return res.status(400).json({ error: 'Horário do monitor fora da janela permitida.' });
    }
    await pool.query(
      `INSERT INTO platform_monitor_status(monitor_name,healthy,http_status,simulated,checked_at)
       VALUES('api',$1,$2,$3,$4)
       ON CONFLICT(monitor_name) DO UPDATE SET healthy=excluded.healthy,http_status=excluded.http_status,
         simulated=excluded.simulated,checked_at=excluded.checked_at,received_at=now()`,
      [healthy, httpStatus, simulated, checkedAt.toISOString()],
    );
    return res.sendStatus(204);
  } catch (error) {
    return next(error);
  }
});
