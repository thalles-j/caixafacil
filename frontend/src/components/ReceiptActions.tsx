import { useState } from 'react';
import {
  printHtmlReceipt, printSerialReceipt, supportsSerialPrinting,
  type SaleReceipt, type ReceiptSettings,
} from '../lib/printing';

export default function ReceiptActions({ receipt, settings }: { receipt: SaleReceipt; settings: ReceiptSettings }) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [openDrawer, setOpenDrawer] = useState(false);
  const [baudRate, setBaudRate] = useState(9600);
  const serial = supportsSerialPrinting();

  const print = async (method: 'html' | 'serial') => {
    setError(null);
    setBusy(true);
    try {
      if (method === 'html') printHtmlReceipt(receipt, settings);
      else await printSerialReceipt(receipt, settings, openDrawer, baudRate);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível imprimir. Tente a impressão pelo navegador.');
    } finally { setBusy(false); }
  };

  return <div className="space-y-3 rounded-xl border border-line p-3">
    <p className="text-sm font-semibold">Cupom não fiscal · {settings.paperWidth} mm</p>
    {receipt.pendingSync && <p className="text-sm text-brass">Venda salva neste terminal. Aguardando sincronização.</p>}
    <div className="flex flex-wrap gap-2">
      <button type="button" disabled={busy} onClick={() => void print('html')} className="rounded-lg border border-line px-3 py-2 text-sm">Imprimir / salvar PDF</button>
      {serial && <button type="button" disabled={busy} onClick={() => void print('serial')} className="rounded-lg bg-ledger px-3 py-2 text-sm text-white">Impressora térmica</button>}
    </div>
    {serial && <>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={openDrawer} onChange={(event) => setOpenDrawer(event.target.checked)} />Abrir gaveta conectada à impressora</label>
      <label className="flex items-center gap-2 text-sm">Velocidade da impressora
        <select value={baudRate} onChange={(event) => setBaudRate(Number(event.target.value))} className="rounded border border-line bg-paper p-1">
          {[9600, 19200, 38400, 57600, 115200].map((rate) => <option key={rate} value={rate}>{rate}</option>)}
        </select>
      </label>
    </>}
    {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
  </div>;
}
