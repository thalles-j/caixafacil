import type { NextFunction, Request, RequestHandler, Response } from 'express';

type RateBucket = { count: number; resetAt: number };
const rateBuckets = new Map<string, RateBucket>();
let requestsUntilCleanup = 250;

function clientAddress(req: Request): string {
  return req.ip || req.socket.remoteAddress || 'unknown';
}

function cleanupExpiredBuckets(now: number) {
  requestsUntilCleanup -= 1;
  if (requestsUntilCleanup > 0) return;
  requestsUntilCleanup = 250;
  for (const [key, bucket] of rateBuckets) {
    if (bucket.resetAt <= now) rateBuckets.delete(key);
  }
}

/** Limite simples por processo. Protege tentativas automatizadas sem adicionar
 * uma dependência; em múltiplas instâncias, deve ser complementado no proxy. */
export function rateLimit(scope: string, maxRequests: number, windowMs: number): RequestHandler {
  return (req, res, next) => {
    const now = Date.now();
    cleanupExpiredBuckets(now);
    const key = `${scope}:${clientAddress(req)}`;
    const current = rateBuckets.get(key);
    const bucket = !current || current.resetAt <= now
      ? { count: 0, resetAt: now + windowMs }
      : current;

    const resetSeconds = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
    res.setHeader('RateLimit-Limit', String(maxRequests));
    res.setHeader('RateLimit-Remaining', String(Math.max(0, maxRequests - bucket.count - 1)));
    res.setHeader('RateLimit-Reset', String(resetSeconds));

    if (bucket.count >= maxRequests) {
      res.setHeader('Retry-After', String(resetSeconds));
      return res.status(429).json({ error: 'Muitas tentativas. Aguarde alguns minutos e tente novamente.' });
    }

    bucket.count += 1;
    rateBuckets.set(key, bucket);
    next();
  };
}

export function securityHeaders(req: Request, res: Response, next: NextFunction) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'; base-uri 'none'");
  res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Pragma', 'no-cache');
  if (process.env.NODE_ENV === 'production' && req.secure) {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  next();
}
