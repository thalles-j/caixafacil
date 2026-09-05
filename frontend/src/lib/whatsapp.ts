import { formatCurrency, formatDate } from './format';

type WhatsAppChargeInput = {
  telefone?: string;
  clienteNome: string;
  valor: number;
  descricao?: string;
  vencimento?: string;
  nomeNegocio?: string;
};

export function normalizeWhatsAppPhone(telefone?: string): string | null {
  let digits = String(telefone ?? '').replace(/\D/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.length === 10 || digits.length === 11) digits = `55${digits}`;
  return digits.length >= 11 && digits.length <= 15 ? digits : null;
}

export function buildWhatsAppChargeUrl({
  telefone,
  clienteNome,
  valor,
  descricao,
  vencimento,
  nomeNegocio,
}: WhatsAppChargeInput): string | null {
  const phone = normalizeWhatsAppPhone(telefone);
  if (!phone || !Number.isFinite(valor) || valor <= 0) return null;

  const referencia = descricao?.trim() ? ` referente a ${descricao.trim()}` : '';
  const prazo = vencimento ? `, com vencimento em ${formatDate(vencimento)}` : '';
  const assinatura = nomeNegocio?.trim() ? `\n\n${nomeNegocio.trim()}` : '';
  const message =
    `Olá, ${clienteNome.trim() || 'tudo bem'}! Tudo bem? ` +
    `Passando para lembrar que há um valor pendente de ${formatCurrency(valor)}${referencia}${prazo}. ` +
    `Se você já realizou o pagamento, pode desconsiderar esta mensagem. Obrigado!${assinatura}`;

  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
}


export function whatsappChargeUrl(phone: string | undefined, name: string, amount: number): string | null {
  let digits = (phone ?? '').replace(/\D/g, '');
  if (digits.length === 10 || digits.length === 11) digits = `55${digits}`;
  if (digits.length < 12 || digits.length > 13) return null;
  const message = `Olá, ${name}! Consta um valor pendente de ${formatCurrency(amount)}. Podemos combinar o pagamento?`;
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}
