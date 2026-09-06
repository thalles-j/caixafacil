import bcrypt from 'bcryptjs';

const SALT_ROUNDS = 10;
export const MIN_PASSWORD_LENGTH = 7;
export const MAX_PASSWORD_BYTES = 72;
const UPPERCASE_RE = /\p{Lu}/u;
const SPECIAL_CHARACTER_RE = /[^\p{L}\p{N}\s]/u;

export function passwordValidationError(password: unknown): string | null {
  if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
    return `A senha deve ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres.`;
  }
  if (!UPPERCASE_RE.test(password)) {
    return 'A senha deve ter pelo menos uma letra maiúscula.';
  }
  if (!SPECIAL_CHARACTER_RE.test(password)) {
    return 'A senha deve ter pelo menos um caractere especial.';
  }
  if (Buffer.byteLength(password, 'utf8') > MAX_PASSWORD_BYTES) {
    return `A senha deve ter no máximo ${MAX_PASSWORD_BYTES} bytes.`;
  }
  return null;
}

export function hashPassword(password: string) {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export function comparePassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}
