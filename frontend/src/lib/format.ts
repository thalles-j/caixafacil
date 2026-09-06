export function formatCurrency(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function formatDate(iso: string): string {
  // parse as local time — new Date(iso) treats a date-only string as UTC
  // midnight, which shifts a day back once formatted in timezones behind UTC
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString('pt-BR');
}

/** Converte uma data ISO (AAAA-MM-DD) para o formato brasileiro do formulário. */
export function formatDateInput(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : '';
}

/** Converte DD/MM/AAAA para ISO e rejeita datas inexistentes. */
export function parseDateInput(raw: string): string | null {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(raw.trim());
  if (!match) return null;

  const [, day, month, year] = match;
  const date = new Date(Number(year), Number(month) - 1, Number(day));
  if (
    date.getFullYear() !== Number(year)
    || date.getMonth() !== Number(month) - 1
    || date.getDate() !== Number(day)
  ) return null;

  return `${year}-${month}-${day}`;
}

/** Mantém somente oito dígitos e adiciona as barras de DD/MM/AAAA. */
export function sanitizeDateInput(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

export function todayISO(): string {
  // usa os componentes locais em vez de toISOString() (que é sempre UTC) —
  // senão, a partir de ~21h no horário de Brasília (UTC-3), a data já teria
  // virado para o dia seguinte e lançamentos seriam gravados na data errada
  const d = new Date();
  const ano = d.getFullYear();
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${ano}-${mes}-${dia}`;
}

/**
 * Aceita o formato de valor monetário em texto livre no padrão BR:
 * "." como separador de milhar e "," como separador decimal (ex: "1.500,00").
 * Os pontos de milhar precisam ser removidos antes de trocar a vírgula por ponto —
 * senão "1.500,00" vira "1.500.00", que Number() não consegue converter (NaN).
 */
export function parseMoney(raw: string): number {
  return Number(raw.trim().replace(/\./g, '').replace(',', '.'));
}

/** Mantém somente dígitos e uma vírgula com até duas casas decimais. */
export function sanitizeMoneyInput(raw: string): string {
  const sanitized = raw.replace(/\./g, '').replace(/[^\d,]/g, '');
  const [integer, ...decimalParts] = sanitized.split(',');
  if (decimalParts.length === 0) return integer;
  return `${integer},${decimalParts.join('').slice(0, 2)}`;
}

/** Mantém somente dígitos em campos de quantidade inteira. */
export function sanitizeIntegerInput(raw: string): string {
  return raw.replace(/\D/g, '');
}
