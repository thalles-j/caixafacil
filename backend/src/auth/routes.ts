import { Router, type NextFunction, type Request, type Response } from 'express';
import crypto from 'node:crypto';
import { pool } from '../db.js';
import { loadBootstrapData } from '../business/bootstrap.js';
import { hashPassword, comparePassword, passwordValidationError } from './password.js';
import { signRefreshToken, signToken, verifyRefreshToken, verifyToken } from './jwt.js';
import { rateLimit } from '../security.js';
import { sendEmail } from '../email.js';
import { activeUser, createSession, publicUser, sessionUser, tokenPayload, validateSession } from './session.js';
import type { TokenPayload } from './jwt.js';
import { loadOperatorData } from '../tenant/data.js';
import { logEvent } from '../observability.js';

export const authRouter = Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const REFRESH_COOKIE = 'mnb_refresh_token';
const REFRESH_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
type AsyncRoute = (req: Request, res: Response, next: NextFunction) => Promise<unknown>;

function refreshCookieOptions() {
  const configuredSameSite = process.env.REFRESH_COOKIE_SAME_SITE?.toLowerCase();
  const sameSite = configuredSameSite === 'none' || configuredSameSite === 'strict'
    ? configuredSameSite
    : configuredSameSite === 'lax'
      ? 'lax'
      : process.env.NODE_ENV === 'production' ? 'none' : 'lax';
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production' || sameSite === 'none',
    sameSite: sameSite as 'lax' | 'none' | 'strict',
    path: '/api/auth',
  };
}

function setRefreshCookie(res: Response, payload: TokenPayload) {
  res.cookie(REFRESH_COOKIE, signRefreshToken(payload), {
    ...refreshCookieOptions(),
    maxAge: REFRESH_MAX_AGE_MS,
  });
}

function readCookie(req: Request, name: string): string | null {
  const header = req.headers.cookie;
  if (!header) return null;
  for (const item of header.split(';')) {
    const [rawName, ...rawValue] = item.trim().split('=');
    if (rawName === name) return decodeURIComponent(rawValue.join('='));
  }
  return null;
}

function asyncRoute(handler: AsyncRoute) {
  return (req: Request, res: Response, next: NextFunction) => {
    void handler(req, res, next).catch(next);
  };
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === '23505';
}

function hashResetToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

const RECOVERY_MESSAGE =
  'Se existir uma conta com este e-mail, as instruções de recuperação estarão disponíveis.';
const authReadLimit = rateLimit('auth-read', 120, 15 * 60 * 1000);
const loginLimit = rateLimit('login', 12, 15 * 60 * 1000);
const registerLimit = rateLimit('register', 6, 60 * 60 * 1000);
const forgotPasswordLimit = rateLimit('forgot-password', 5, 15 * 60 * 1000);
const resetPasswordLimit = rateLimit('reset-password', 8, 15 * 60 * 1000);

authRouter.use((_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});

authRouter.post('/register', registerLimit, asyncRoute(async (req, res) => {
  const { email, password, confirmPassword } = req.body ?? {};

  if (typeof email !== 'string' || email.length > 254 || !EMAIL_RE.test(email)) {
    return res.status(400).json({ error: 'E-mail inválido.' });
  }
  const passwordError = passwordValidationError(password);
  if (passwordError) return res.status(400).json({ error: passwordError });
  if (password !== confirmPassword) {
    return res.status(400).json({ error: 'As senhas não coincidem.' });
  }

  const normalizedEmail = email.trim().toLowerCase();

  const existing = await pool.query('SELECT id FROM users WHERE email = $1', [normalizedEmail]);
  if (existing.rowCount) {
    return res.status(409).json({ error: 'Já existe uma conta com este e-mail.' });
  }

  const id = crypto.randomUUID();
  const passwordHash = await hashPassword(password);
  try {
    await pool.query(`WITH created AS (
        INSERT INTO users (id,email,password_hash) VALUES ($1,$2,$3) RETURNING id,email,created_at
      ), created_business AS (
        INSERT INTO businesses(id,owner_user_id,name,category,offering,created_at,updated_at)
        SELECT id,id,'Meu Negócio','Outros','ambos',created_at,created_at FROM created RETURNING id,owner_user_id
      ), membership AS (
        INSERT INTO business_memberships(user_id,business_id,role)
        SELECT owner_user_id,id,'OWNER' FROM created_business
      )
      INSERT INTO tenant_memberships(actor_id,user_id,role)
      SELECT owner_user_id,id,'OWNER' FROM created_business ON CONFLICT(actor_id) DO NOTHING`, [
      id,
      normalizedEmail,
      passwordHash,
    ]);
  } catch (error) {
    // Tambem cobre dois cadastros simultaneos que passaram pelo SELECT acima.
    if (isUniqueViolation(error)) {
      return res.status(409).json({ error: 'Já existe uma conta com este e-mail.' });
    }
    throw error;
  }

  const user = (await sessionUser(id))!;
  const payload = await createSession(user);
  setRefreshCookie(res, payload);
  res.status(201).json({ token: signToken(payload), user: publicUser(user) });
}));

authRouter.post('/forgot-password', forgotPasswordLimit, asyncRoute(async (req, res) => {
  const { email } = req.body ?? {};
  if (typeof email !== 'string' || email.length > 254 || !EMAIL_RE.test(email.trim())) {
    return res.status(400).json({ error: 'E-mail inválido.' });
  }

  const normalizedEmail = email.trim().toLowerCase();
  const result = await pool.query('SELECT id FROM users WHERE email = $1', [normalizedEmail]);
  const user = result.rows[0];
  if (!user) return res.json({ message: RECOVERY_MESSAGE });

  const token = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashResetToken(token);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `DELETE FROM password_reset_tokens
       WHERE user_id = $1 AND (used_at IS NULL OR expires_at < now())`,
      [user.id],
    );
    await client.query(
      `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
       VALUES ($1, $2, now() + interval '30 minutes')`,
      [user.id, tokenHash],
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  if (process.env.NODE_ENV === 'development') {
    return res.json({ message: RECOVERY_MESSAGE, resetToken: token });
  }

  const frontendUrl = (process.env.FRONTEND_URL ?? '').replace(/\/$/, '');
  if (!frontendUrl) {
    logEvent('error', 'configuration_error', { error_name: 'Error' });
    return res.json({ message: RECOVERY_MESSAGE });
  }
  try {
    const resetUrl = `${frontendUrl}/recuperar-conta?token=${encodeURIComponent(token)}`;
    await sendEmail({
      to: normalizedEmail,
      subject: 'Recupere sua senha do CaixaFácil',
      text: `Use este link para criar uma nova senha. Ele expira em 30 minutos: ${resetUrl}`,
      html: `<p>Use o link abaixo para criar uma nova senha. Ele expira em 30 minutos.</p><p><a href="${resetUrl}">Criar nova senha</a></p>`,
    });
  } catch {
    // Não muda a resposta para evitar enumeração de contas. O erro fica nos
    // logs operacionais para alertas do provedor.
    logEvent('error', 'email_delivery_error', { error_name: 'Error' });
  }
  return res.json({ message: RECOVERY_MESSAGE });
}));

authRouter.post('/reset-password', resetPasswordLimit, asyncRoute(async (req, res) => {
  const { token, password, confirmPassword } = req.body ?? {};
  if (typeof token !== 'string' || token.length < 32 || token.length > 128) {
    return res.status(400).json({ error: 'Link de recuperação inválido ou expirado.' });
  }
  const passwordError = passwordValidationError(password);
  if (passwordError) return res.status(400).json({ error: passwordError });
  if (password !== confirmPassword) {
    return res.status(400).json({ error: 'As senhas não coincidem.' });
  }

  const passwordHash = await hashPassword(password);
  const tokenHash = hashResetToken(token);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const tokenResult = await client.query(
      `SELECT id, user_id
       FROM password_reset_tokens
       WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now()
       FOR UPDATE`,
      [tokenHash],
    );
    const resetToken = tokenResult.rows[0];
    if (!resetToken) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Link de recuperação inválido ou expirado.' });
    }

    await client.query(
      'UPDATE users SET password_hash = $1, token_version = token_version + 1, updated_at = now() WHERE id = $2',
      [passwordHash, resetToken.user_id],
    );
    await client.query(
      'UPDATE password_reset_tokens SET used_at = now() WHERE user_id = $1 AND used_at IS NULL',
      [resetToken.user_id],
    );
    await client.query('COMMIT');
    return res.json({ message: 'Senha alterada com sucesso.' });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}));


async function authData(user: import('./session.js').SessionUser) {
  if (user.role === 'admin') return null;
  if (user.tenant_role === 'OPERATOR') return loadOperatorData(user.tenant_id!);
  return loadBootstrapData({ id: user.tenant_id!, email: user.email, name: user.name });
}

authRouter.post('/login', loginLimit, asyncRoute(async (req, res) => {
  const { email, password } = req.body ?? {};
  if (typeof email !== 'string' || typeof password !== 'string' || email.length>254 || Buffer.byteLength(password)>72) {
    return res.status(400).json({error:'E-mail e senha inválidos.'});
  }
  const row = (await pool.query('SELECT id FROM users WHERE email=$1',[email.trim().toLowerCase()])).rows[0];
  const user = row ? await sessionUser(row.id) : undefined;
  if (!user || !(await comparePassword(password,user.password_hash))) return res.status(401).json({error:'E-mail ou senha incorretos.'});
  if (!activeUser(user)) return res.status(403).json({error:'Conta ou operador desativado.',code:'ACCOUNT_SUSPENDED'});
  const payload = await createSession(user);
  setRefreshCookie(res,payload);
  return res.json({token:signToken(payload),user:publicUser(user),data:await authData(user)});
}));

authRouter.post('/refresh', authReadLimit, asyncRoute(async (req,res) => {
  const token=readCookie(req,REFRESH_COOKIE);
  if (!token) return res.status(401).json({error:'Sessão persistente ausente.'});
  let payload;
  try { payload=verifyRefreshToken(token); } catch { return res.status(401).json({error:'Sessão expirada.'}); }
  let validated;
  try {
    validated=await validateSession(payload,false,true);
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'status' in error && error.status === 401) {
      res.clearCookie(REFRESH_COOKIE,refreshCookieOptions());
    }
    throw error;
  }
  const {user,locked}=validated;
  const nextPayload=tokenPayload(user,payload.sid!);
  setRefreshCookie(res,nextPayload);
  return res.json({token:signToken(nextPayload),user:publicUser(user),locked,
    data:locked ? undefined : await authData(user)});
}));

authRouter.get('/me', authReadLimit, asyncRoute(async (req,res) => {
  const token=req.headers.authorization?.replace(/^Bearer /,'');
  if (!token) return res.status(401).json({error:'Token ausente.'});
  let payload;
  try { payload=verifyToken(token); } catch { return res.status(401).json({error:'Token inválido ou expirado.'}); }
  const {user}=await validateSession(payload);
  return res.json({user:publicUser(user),data:await authData(user)});
}));

authRouter.post('/business/switch', authReadLimit, asyncRoute(async (req,res) => {
  const token=req.headers.authorization?.replace(/^Bearer /,'');
  const businessId=String(req.body?.businessId ?? '');
  if (!token || !/^[0-9a-f-]{36}$/i.test(businessId)) return res.status(400).json({error:'Negócio inválido.'});
  let payload;
  try { payload=verifyToken(token); } catch { return res.status(401).json({error:'Token inválido ou expirado.'}); }
  await validateSession(payload);
  const selected=await sessionUser(payload.sub,businessId);
  if (!activeUser(selected) || selected.role==='admin' || !selected.tenant_id) {
    return res.status(403).json({error:'Você não possui acesso a este negócio.'});
  }
  await pool.query('UPDATE auth_sessions SET user_id=$3,business_id=$4,last_activity_at=now() WHERE id=$1 AND actor_id=$2',
    [payload.sid,payload.sub,selected.owner_user_id,businessId]);
  const nextPayload=tokenPayload(selected,payload.sid!);
  setRefreshCookie(res,nextPayload);
  return res.json({token:signToken(nextPayload),user:publicUser(selected),data:await authData(selected)});
}));

authRouter.post('/session/activity', authReadLimit, asyncRoute(async (req,res) => {
  const token=req.headers.authorization?.replace(/^Bearer /,'');
  if (!token) return res.status(401).json({error:'Token ausente.'});
  let payload;
  try { payload=verifyToken(token); } catch { return res.status(401).json({error:'Token expirado.'}); }
  await validateSession(payload,true);
  return res.sendStatus(204);
}));

authRouter.post('/session/lock', authReadLimit, asyncRoute(async (req,res) => {
  const token=readCookie(req,REFRESH_COOKIE);
  if (!token) return res.status(401).json({error:'Sessão ausente.'});
  let payload;
  try { payload=verifyRefreshToken(token); } catch { return res.sendStatus(401); }
  await validateSession(payload,false,true);
  await pool.query('UPDATE auth_sessions SET locked_at=now() WHERE id=$1 AND actor_id=$2',[payload.sid,payload.sub]);
  return res.sendStatus(204);
}));

authRouter.post('/session/unlock', loginLimit, asyncRoute(async (req,res) => {
  const token=readCookie(req,REFRESH_COOKIE);
  if (!token) return res.status(401).json({error:'Sessão ausente.'});
  let payload;
  try { payload=verifyRefreshToken(token); } catch { return res.sendStatus(401); }
  const {user}=await validateSession(payload,false,true);
  if (typeof req.body?.password!=='string' || Buffer.byteLength(req.body.password)>72 ||
    !(await comparePassword(req.body.password,user.password_hash))) return res.status(401).json({error:'Senha incorreta.'});
  await pool.query('UPDATE auth_sessions SET locked_at=NULL,last_activity_at=now() WHERE id=$1 AND actor_id=$2',[payload.sid,user.id]);
  const nextPayload=tokenPayload(user,payload.sid!);
  setRefreshCookie(res,nextPayload);
  return res.json({token:signToken(nextPayload),user:publicUser(user),data:await authData(user)});
}));

authRouter.post('/logout', asyncRoute(async (req,res) => {
  const token=readCookie(req,REFRESH_COOKIE);
  if (token) { try { const payload=verifyRefreshToken(token);
    await pool.query('DELETE FROM auth_sessions WHERE id=$1 AND actor_id=$2',[payload.sid,payload.sub]);
  } catch { /* Cookie já expirado: apenas limpar. */ } }
  res.clearCookie(REFRESH_COOKIE,refreshCookieOptions());
  return res.sendStatus(204);
}));
