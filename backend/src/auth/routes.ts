import { Router, type NextFunction, type Request, type Response } from 'express';
import crypto from 'node:crypto';
import { pool } from '../db.js';
import { loadBootstrapData } from '../business/bootstrap.js';
import { hashPassword, comparePassword, passwordValidationError } from './password.js';
import { signRefreshToken, signToken, verifyRefreshToken, verifyToken } from './jwt.js';
import { rateLimit } from '../security.js';
import { sendEmail } from '../email.js';

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

function setRefreshCookie(res: Response, user: { id: string; email: string; tokenVersion: number; role: 'client' | 'admin' }) {
  res.cookie(REFRESH_COOKIE, signRefreshToken({ sub: user.id, email: user.email, ver: user.tokenVersion, role: user.role }), {
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
    await pool.query('INSERT INTO users (id, email, password_hash) VALUES ($1, $2, $3)', [
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

  const token = signToken({ sub: id, email: normalizedEmail, ver: 0, role: 'client' });
  setRefreshCookie(res, { id, email: normalizedEmail, tokenVersion: 0, role: 'client' });
  res.status(201).json({ token, user: { id, email: normalizedEmail, role: 'client' } });
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
    console.error('FRONTEND_URL ausente: recuperação de senha não enviada.');
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
  } catch (error) {
    // Não muda a resposta para evitar enumeração de contas. O erro fica nos
    // logs operacionais para alertas do provedor.
    console.error('Falha ao enviar recuperação de senha:', error);
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

authRouter.post('/login', loginLimit, asyncRoute(async (req, res) => {
  const { email, password } = req.body ?? {};

  if (typeof email !== 'string' || typeof password !== 'string') {
    return res.status(400).json({ error: 'E-mail e senha são obrigatórios.' });
  }
  if (email.length > 254 || Buffer.byteLength(password, 'utf8') > 72) {
    return res.status(401).json({ error: 'E-mail ou senha incorretos.' });
  }

  const normalizedEmail = email.trim().toLowerCase();
  const result = await pool.query('SELECT id, email, name, password_hash, token_version, role, status FROM users WHERE email = $1', [
    normalizedEmail,
  ]);
  const user = result.rows[0];
  if (!user || !(await comparePassword(password, user.password_hash))) {
    return res.status(401).json({ error: 'E-mail ou senha incorretos.' });
  }
  if (user.status !== 'active') {
    return res.status(403).json({
      error: 'Esta conta está suspensa. Entre em contato com o suporte.',
      code: 'ACCOUNT_SUSPENDED',
    });
  }

  const role = user.role as 'client' | 'admin';
  const data = role === 'client' ? await loadBootstrapData({ id: user.id, email: user.email, name: user.name }) : null;
  const token = signToken({ sub: user.id, email: user.email, ver: Number(user.token_version), role });
  setRefreshCookie(res, { id: user.id, email: user.email, tokenVersion: Number(user.token_version), role });
  res.json({ token, user: { id: user.id, email: user.email, role }, data });
}));

authRouter.post('/refresh', authReadLimit, asyncRoute(async (req, res) => {
  const refreshToken = readCookie(req, REFRESH_COOKIE);
  if (!refreshToken) return res.status(401).json({ error: 'Sessão persistente ausente.' });

  let payload;
  try {
    payload = verifyRefreshToken(refreshToken);
  } catch {
    res.clearCookie(REFRESH_COOKIE, refreshCookieOptions());
    return res.status(401).json({ error: 'Sessão persistente inválida ou expirada.' });
  }

  const result = await pool.query('SELECT id, email, name, token_version, role, status FROM users WHERE id = $1', [payload.sub]);
  const user = result.rows[0];
  if (!user || user.status !== 'active' || user.role !== payload.role || Number(user.token_version) !== payload.ver) {
    res.clearCookie(REFRESH_COOKIE, refreshCookieOptions());
    return res.status(401).json({ error: 'Usuário da sessão não existe mais.' });
  }

  const role = user.role as 'client' | 'admin';
  const data = role === 'client' ? await loadBootstrapData({ id: user.id, email: user.email, name: user.name }) : null;
  const token = signToken({ sub: user.id, email: user.email, ver: Number(user.token_version), role });
  setRefreshCookie(res, { id: user.id, email: user.email, tokenVersion: Number(user.token_version), role });
  return res.json({ token, user: { id: user.id, email: user.email, role }, data });
}));

authRouter.post('/logout', (_req, res) => {
  res.clearCookie(REFRESH_COOKIE, refreshCookieOptions());
  return res.status(204).send();
});

authRouter.get('/me', authReadLimit, asyncRoute(async (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) {
    return res.status(401).json({ error: 'Token ausente.' });
  }
  let payload;
  try {
    payload = verifyToken(token);
  } catch {
    return res.status(401).json({ error: 'Token inválido ou expirado.' });
  }

  const result = await pool.query('SELECT id, email, name, token_version, role, status FROM users WHERE id = $1', [payload.sub]);
  const user = result.rows[0];
  if (!user || user.status !== 'active' || user.role !== payload.role || Number(user.token_version) !== payload.ver) {
    return res.status(401).json({ error: 'Sessão revogada. Entre novamente.' });
  }

  const role = user.role as 'client' | 'admin';
  const data = role === 'client' ? await loadBootstrapData({ id: user.id, email: user.email, name: user.name }) : null;
  // Faz upgrade transparente de sessões antigas: um access token ainda válido
  // passa a receber o cookie persistente sem exigir novo login.
  setRefreshCookie(res, { id: user.id, email: user.email, tokenVersion: Number(user.token_version), role });
  return res.json({ user: { id: user.id, email: user.email, role }, data });
}));
