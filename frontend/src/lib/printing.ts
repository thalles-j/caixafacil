import type { FormaPagamento } from '../types';
import type { SaleItemInput } from './business';

export interface ReceiptSettings {
  paperWidth: 58 | 80;
  legalName?: string;
  showOperator: boolean;
  showPaymentMethod: boolean;
}

export const DEFAULT_RECEIPT_SETTINGS: ReceiptSettings = {
  paperWidth: 80,
  showOperator: true,
  showPaymentMethod: true,
};

export interface SaleReceipt {
  id: string;
  occurredAt: string;
  businessName: string;
  operatorName: string;
  paymentMethod: FormaPagamento;
  items: SaleItemInput[];
  pendingSync?: boolean;
}

const paymentLabels: Record<FormaPagamento, string> = {
  dinheiro: 'Dinheiro', pix: 'Pix', cartao_credito: 'Cartão de crédito',
  cartao_debito: 'Cartão de débito', fiado: 'Fiado',
};

const money = (value: number) => `R$ ${value.toFixed(2).replace('.', ',')}`;

// Printable data cannot inject ESC/POS commands, line breaks or HTML controls.
const cleanText = (value: string) => [...value].map((character) => {
  const code = character.codePointAt(0) ?? 0;
  return code < 32 || (code >= 127 && code <= 159) ? ' ' : character;
}).join('');
const escapeHtml = (value: string) => cleanText(value).replace(/[&<>"']/g,
  (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!);

export function receiptLines(receipt: SaleReceipt, settings: ReceiptSettings): string[] {
  return [
    cleanText(settings.legalName || receipt.businessName),
    'CUPOM NÃO FISCAL',
    `Venda: ${cleanText(receipt.id)}`,
    new Date(receipt.occurredAt).toLocaleString('pt-BR'),
    ...(settings.showOperator ? [`Operador: ${cleanText(receipt.operatorName)}`] : []),
    '--------------------------------',
    ...receipt.items.flatMap((item) => [
      cleanText(item.description),
      `${item.quantity} x ${money(item.unitPrice)} = ${money(Math.round(item.quantity * item.unitPrice * 100) / 100)}`,
    ]),
    '--------------------------------',
    `TOTAL: ${money(receipt.items.reduce((total, item) => total + Math.round(item.quantity * item.unitPrice * 100), 0) / 100)}`,
    ...(settings.showPaymentMethod ? [`Pagamento: ${paymentLabels[receipt.paymentMethod]}`] : []),
    ...(receipt.pendingSync ? ['VENDA OFFLINE - AGUARDA SINCRONIZAÇÃO'] : []),
  ];
}

export function buildReceiptHtml(receipt: SaleReceipt, settings = DEFAULT_RECEIPT_SETTINGS): string {
  const width = settings.paperWidth === 58 ? 58 : 80;
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Cupom não fiscal</title>
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'">
<style>@page{size:${width}mm auto;margin:0}*{box-sizing:border-box}body{width:${width}mm;margin:0;padding:3mm;font:12px monospace;color:#000;background:#fff}pre{white-space:pre-wrap;overflow-wrap:anywhere;margin:0;font:inherit}</style>
</head><body><pre>${receiptLines(receipt, settings).map(escapeHtml).join('\n')}</pre></body></html>`;
}

/** ESC p m t1 t2: connector pin 2, 100ms on, 500ms off (units = 2ms). */
export function drawerPulse(): Uint8Array {
  return new Uint8Array([0x1b, 0x70, 0, 50, 250]);
}

export function buildEscPos(receipt: SaleReceipt, settings = DEFAULT_RECEIPT_SETTINGS, openDrawer = false): Uint8Array {
  const columns = settings.paperWidth === 58 ? 32 : 48;
  // ASCII transliteration works regardless of the printer's selected code page.
  const text = receiptLines(receipt, settings).flatMap((line) => {
    const ascii = line.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^\x20-\x7e]/g, '?');
    return ascii.match(new RegExp(`.{1,${columns}}`, 'g')) ?? [''];
  }).join('\n');
  return new Uint8Array([
    0x1b, 0x40, // Initialize printer.
    0x1b, 0x4d, 0, // Font A.
    ...new TextEncoder().encode(text), 10, 10, 10,
    ...(openDrawer ? drawerPulse() : []),
    0x1d, 0x56, 0x42, 0, // Partial cut with feed on compatible devices.
  ]);
}

interface SerialPortLike {
  writable: WritableStream<Uint8Array> | null;
  open(options: { baudRate: number }): Promise<void>;
  close(): Promise<void>;
}

interface SerialNavigator extends Navigator {
  serial?: { requestPort(): Promise<SerialPortLike> };
}

export function supportsSerialPrinting(): boolean {
  return typeof navigator !== 'undefined' && Boolean((navigator as SerialNavigator).serial) && window.isSecureContext;
}

/** Call from an explicit button click. Devices and speed are terminal-local. */
export async function printSerialReceipt(receipt: SaleReceipt, settings: ReceiptSettings, openDrawer = false, baudRate = 9600): Promise<void> {
  const serial = (navigator as SerialNavigator).serial;
  if (!serial || !window.isSecureContext) throw new Error('Impressão serial indisponível. Use a impressão pelo navegador.');
  const port = await serial.requestPort();
  await port.open({ baudRate });
  try {
    if (!port.writable) throw new Error('A impressora não disponibilizou uma conexão de escrita.');
    const writer = port.writable.getWriter();
    try { await writer.write(buildEscPos(receipt, settings, openDrawer)); }
    finally { writer.releaseLock(); }
  } finally { await port.close(); }
}

/** Works offline: no remote fonts, assets, scripts or print services. */
export function printHtmlReceipt(receipt: SaleReceipt, settings: ReceiptSettings): void {
  const popup = window.open('', '_blank', 'width=420,height=720');
  if (!popup) throw new Error('Permita a janela de impressão neste navegador e tente novamente.');
  popup.opener = null;
  popup.document.open();
  popup.document.write(buildReceiptHtml(receipt, settings));
  popup.document.close();
  popup.focus();
  popup.print();
}
