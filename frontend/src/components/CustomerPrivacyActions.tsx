import { useState } from 'react';
import Modal from './Modal';
import { anonymizeCustomer, getConsentText, recordWhatsAppConsent, type ConsentText } from '../lib/privacy';

type Props = { customerId: string; customerName: string; canAnonymize: boolean; onChanged?: () => void | Promise<void> };

export default function CustomerPrivacyActions({ customerId, customerName, canAnonymize, onChanged }: Props) {
  const [open, setOpen] = useState(false);
  const [consent, setConsent] = useState<ConsentText | null>(null);
  const [accepted, setAccepted] = useState(false);
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function show() {
    setOpen(true);
    setAccepted(false);
    setConfirmation('');
    setMessage('');
    try { setConsent(await getConsentText()); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Não foi possível carregar o consentimento.'); }
  }

  async function perform(action: 'grant' | 'revoke' | 'anonymize') {
    setBusy(true);
    setMessage('');
    try {
      if (action === 'anonymize') await anonymizeCustomer(customerId, confirmation);
      else {
        if (!consent || (action === 'grant' && !accepted)) return;
        await recordWhatsAppConsent(customerId, action === 'grant', consent.version);
      }
      setAccepted(false);
      setConfirmation('');
      await onChanged?.();
      setMessage(action === 'anonymize' ? 'Dados pessoais removidos. Os valores financeiros foram preservados.' : 'Preferência de contato registrada.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Não foi possível salvar.'); }
    finally { setBusy(false); }
  }

  return <>
    <button type="button" onClick={() => void show()} className="text-xs font-semibold underline">Privacidade do cliente</button>
    <Modal open={open} onClose={() => { if (!busy) setOpen(false); }} title={`Privacidade — ${customerName}`}>
      <div className="space-y-4 text-sm">
        <p>Registre apenas a autorização manifestada pelo próprio cliente após apresentar o texto abaixo.</p>
        {consent && <>
          <p>{consent.text}</p>
          <p className="text-xs text-ink-soft">Versão {consent.version}</p>
          <label className="flex gap-2"><input type="checkbox" checked={accepted} onChange={(event) => setAccepted(event.target.checked)} />O cliente autorizou expressamente este uso do telefone.</label>
          <div className="flex flex-wrap gap-3">
            <button type="button" disabled={busy || !accepted} onClick={() => void perform('grant')} className="rounded-lg bg-ink px-3 py-2 text-paper disabled:opacity-40">Registrar autorização</button>
            <button type="button" disabled={busy} onClick={() => void perform('revoke')} className="rounded-lg border px-3 py-2">Revogar autorização</button>
          </div>
        </>}
        {canAnonymize && <div className="space-y-2 border-t pt-4">
          <p>A anonimização remove nome, telefone, e-mail e observações do cadastro e descrições financeiras vinculadas. Os valores e registros de vendas permanecem. Esta ação não pode ser desfeita.</p>
          <label className="block">Para confirmar, digite o identificador <code className="break-all">{customerId}</code>.
            <input aria-label="Identificador do cliente para anonimização" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} className="mt-2 w-full rounded border p-2" />
          </label>
          <button type="button" disabled={busy || confirmation !== customerId} onClick={() => void perform('anonymize')} className="rounded-lg bg-stamp px-3 py-2 text-paper disabled:opacity-40">Remover dados pessoais</button>
        </div>}
        {message && <p role="status">{message}</p>}
      </div>
    </Modal>
  </>;
}
