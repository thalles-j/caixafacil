import type { NextFunction, Request, Response } from 'express';

export type RoleResponseLocals = { auth?: { role?: 'client' | 'admin' } };

export function requireAdmin(_req: Request, res: Response<unknown, RoleResponseLocals>, next: NextFunction) {
  if (res.locals.auth?.role !== 'admin') {
    return res.status(403).json({ error: 'Acesso restrito a administradores.' });
  }
  return next();
}

export function requireClient(_req: Request, res: Response<unknown, RoleResponseLocals>, next: NextFunction) {
  if (res.locals.auth?.role !== 'client') {
    return res.status(403).json({ error: 'Esta rota pertence a contas de cliente.' });
  }
  return next();
}
