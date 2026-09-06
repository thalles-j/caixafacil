export const PASSWORD_MIN_LENGTH = 7;
export const PASSWORD_MAX_LENGTH = 72;
export const PASSWORD_HINT = 'Mínimo de 7 caracteres, com maiúscula e caractere especial';

const UPPERCASE_RE = /\p{Lu}/u;
const SPECIAL_CHARACTER_RE = /[^\p{L}\p{N}\s]/u;

export function passwordPolicyError(password: string): string | null {
  if (password.length < PASSWORD_MIN_LENGTH) {
    return `A senha deve ter pelo menos ${PASSWORD_MIN_LENGTH} caracteres.`;
  }
  if (!UPPERCASE_RE.test(password)) {
    return 'A senha deve ter pelo menos uma letra maiúscula.';
  }
  if (!SPECIAL_CHARACTER_RE.test(password)) {
    return 'A senha deve ter pelo menos um caractere especial.';
  }
  return null;
}
