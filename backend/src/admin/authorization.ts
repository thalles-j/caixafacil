import type { NextFunction, Request, Response } from 'express';
import { verifyToken, type TokenPayload } from '../auth/jwt.js';
import { validateSession } from '../auth/session.js';
import { requestActor } from '../tenant/audit.js';

export type AdminLevel = 'SUPPORT' | 'SUPERADMIN';
export type AdminResponseLocals = { auth?: TokenPayload; adminLevel?: AdminLevel };

export function authenticateAccessToken(req: Request, res: Response<unknown, AdminResponseLocals>, next: NextFunction) {
  const header = req.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Token ausente.' });
  try {
    const payload = verifyToken(token);
    void validateSession(payload, !['GET','HEAD'].includes(req.method))
      .then(() => {
        res.locals.auth = payload;
        if (payload.tenantId && payload.tenantRole) return requestActor.run({ tenantId: payload.tenantId,
          actorId: payload.sub, actorRole: payload.tenantRole, method: req.method, path: req.path }, next);
        return next();
      })
      .catch(next);
    return;
  } catch {
    return res.status(401).json({ error: 'Token inválido ou expirado.' });
  }
}
