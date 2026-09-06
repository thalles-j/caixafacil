import type { NextFunction, Request, Response } from 'express';
import { verifyToken, type TokenPayload } from '../auth/jwt.js';
import { pool } from '../db.js';

export type AdminResponseLocals = { auth?: TokenPayload };

export function authenticateAccessToken(req: Request, res: Response<unknown, AdminResponseLocals>, next: NextFunction) {
  const header = req.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Token ausente.' });
  try {
    const payload = verifyToken(token);
    void pool.query('SELECT role, status, token_version FROM users WHERE id = $1', [payload.sub])
      .then((result) => {
        const user = result.rows[0];
        if (!user || user.status !== 'active' || user.role !== payload.role || Number(user.token_version) !== payload.ver) {
          return res.status(401).json({ error: 'Sessão revogada ou conta suspensa.' });
        }
        res.locals.auth = payload;
        return next();
      })
      .catch(next);
    return;
  } catch {
    return res.status(401).json({ error: 'Token inválido ou expirado.' });
  }
}
