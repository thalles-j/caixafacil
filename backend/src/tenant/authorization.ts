import type { RequestHandler } from 'express';
import type { TokenPayload } from '../auth/jwt.js';

export const requireTenantRole = (...roles: Array<'OWNER' | 'OPERATOR'>): RequestHandler => (_req, res, next) => {
  const auth = res.locals.auth as TokenPayload | undefined;
  if (!auth?.tenantId || !auth.tenantRole || !roles.includes(auth.tenantRole)) {
    return res.status(403).json({ error: 'Seu papel na loja não permite esta ação.' });
  }
  next();
};

// Lista positiva: novas rotas exigem OWNER até receberem autorização explícita.
export const authorizeBusiness: RequestHandler = (req, res, next) => {
  if (res.locals.auth?.tenantRole === 'OWNER') return next();
  const key = `${req.method} ${req.path}`;
  if (/^(GET \/data|POST \/sales|POST \/sales\/[a-f0-9-]+\/(cancel|returns)|POST \/customers|POST \/cash-sessions|POST \/cash-sessions\/[a-f0-9-]+\/close)$/.test(key)) return next();
  return res.status(403).json({ error: 'Ação exclusiva do dono da loja.' });
};
