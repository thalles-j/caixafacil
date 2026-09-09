import { useState } from 'react';
import { getWhatsAppCharge } from '../lib/privacy';

export default function WhatsAppChargeButton({ customerId }: { customerId: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function openCharge() {
    setBusy(true);
    setError('');
    // Abrir durante o gesto do usuário evita bloqueio de popup após o fetch.
    const popup = window.open('about:blank', '_blank');
    if (popup) popup.opener = null;
    try {
      const { url } = await getWhatsAppCharge(customerId);
      const target = new URL(url);
      if (target.protocol !== 'https:' || target.hostname !== 'wa.me') throw new Error('Link de cobrança inválido.');
      if (popup) popup.location.replace(url);
      else window.location.assign(url);
    } catch (caught) {
      popup?.close();
      setError(caught instanceof Error ? caught.message : 'Não foi possível abrir a cobrança.');
    } finally { setBusy(false); }
  }
  return <div>
    <button type="button" disabled={busy} onClick={() => void openCharge()} className="text-xs font-semibold text-emerald-700 disabled:opacity-40">{busy ? 'Verificando autorização…' : 'Cobrar via WhatsApp'}</button>
    {error && <p role="alert" className="mt-1 text-xs text-stamp">{error}</p>}
  </div>;
}
