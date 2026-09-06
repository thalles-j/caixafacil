import jwt from 'jsonwebtoken';

const configuredJwtSecret = process.env.JWT_ACCESS_SECRET ?? process.env.JWT_SECRET;
const configuredRefreshSecret = process.env.JWT_REFRESH_SECRET;
const EXPIRES_IN = process.env.JWT_ACCESS_EXPIRES_IN ?? '15m';
const REFRESH_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN ?? '30d';
const JWT_ISSUER = 'caixafacil-api';
const JWT_AUDIENCE = 'caixafacil-web';

if (!configuredJwtSecret) {
  throw new Error('JWT_ACCESS_SECRET nao foi definido.');
}
if (!configuredRefreshSecret) {
  throw new Error('JWT_REFRESH_SECRET nao foi definido.');
}
const JWT_SECRET: string = configuredJwtSecret;
const JWT_REFRESH_SECRET: string = configuredRefreshSecret;

if (process.env.NODE_ENV === 'production') {
  if (JWT_SECRET.length < 32 || JWT_REFRESH_SECRET.length < 32) {
    throw new Error('Os segredos JWT devem ter pelo menos 32 caracteres em produção.');
  }
  if (JWT_SECRET === JWT_REFRESH_SECRET) {
    throw new Error('JWT_ACCESS_SECRET e JWT_REFRESH_SECRET devem ser diferentes.');
  }
}

export type TokenPayload = {
  sub: string;
  email: string;
  ver: number;
  role: 'client' | 'admin';
};

function assertTokenPayload(payload: string | jwt.JwtPayload): TokenPayload {
  if (
    typeof payload === 'string' ||
    typeof payload.sub !== 'string' ||
    typeof payload.email !== 'string' ||
    typeof payload.ver !== 'number' ||
    (payload.role !== 'client' && payload.role !== 'admin')
  ) {
    throw new jwt.JsonWebTokenError('Token sem os campos obrigatórios.');
  }
  return { sub: payload.sub, email: payload.email, ver: payload.ver, role: payload.role };
}

export function signToken(payload: TokenPayload) {
  return jwt.sign(payload, JWT_SECRET, {
    algorithm: 'HS256',
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
    expiresIn: EXPIRES_IN as jwt.SignOptions['expiresIn'],
  });
}

export function verifyToken(token: string): TokenPayload {
  return assertTokenPayload(jwt.verify(token, JWT_SECRET, {
    algorithms: ['HS256'],
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
  }));
}

export function signRefreshToken(payload: TokenPayload) {
  return jwt.sign(payload, JWT_REFRESH_SECRET, {
    algorithm: 'HS256',
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
    expiresIn: REFRESH_EXPIRES_IN as jwt.SignOptions['expiresIn'],
  });
}

export function verifyRefreshToken(token: string): TokenPayload {
  return assertTokenPayload(jwt.verify(token, JWT_REFRESH_SECRET, {
    algorithms: ['HS256'],
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
  }));
}
