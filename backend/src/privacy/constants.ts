export const WHATSAPP_CONSENT_VERSION = '2026-09-05.1';
export const WHATSAPP_CONSENT_TEXT =
  'Autorizo este estabelecimento a usar meu telefone para enviar lembretes sobre os meus pagamentos pendentes pelo WhatsApp. A autorização é opcional, não condiciona a compra e pode ser revogada a qualquer momento junto ao estabelecimento, sem custo.';
export const ANONYMIZED_CUSTOMER_NAME = 'Cliente anonimizado';

export function normalizeChargePhone(value: unknown): string | null {
  let digits = String(value ?? '').replace(/\D/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.length === 10 || digits.length === 11) digits = `55${digits}`;
  return /^\d{11,15}$/.test(digits) ? digits : null;
}
