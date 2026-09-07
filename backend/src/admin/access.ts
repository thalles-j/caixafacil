import type { NextFunction, Request, Response } from 'express';
import { pool } from '../db.js';
import type { AdminLevel, AdminResponseLocals } from './authorization.js';

export function loadAdminLevel(_req: Request, res: Response<unknown, AdminResponseLocals>, next: NextFunction) {
  const adminId = res.locals.auth?.sub ?? '';
  void pool.query(
    `SELECT admin_level FROM users
     WHERE id=$1 AND role='admin' AND status='active' AND admin_level IN ('SUPPORT','SUPERADMIN')`, [adminId],
  ).then((result) => {
    if (!result.rowCount) return res.status(403).json({ error: 'Acesso administrativo revogado.' });
    res.locals.adminLevel = result.rows[0].admin_level as AdminLevel;
    return next();
  }).catch(next);
}

export function requireSuperadmin(_req: Request, res: Response<unknown, AdminResponseLocals>, next: NextFunction) {
  if (res.locals.adminLevel !== 'SUPERADMIN') return res.status(403).json({ error: 'Esta ação exige acesso de superadministrador.' });
  return next();
}
