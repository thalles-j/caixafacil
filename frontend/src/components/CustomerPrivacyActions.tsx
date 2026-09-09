import { useState } from 'react';
import { CheckCircle } from '@phosphor-icons/react';
import Modal from './Modal';
import {
  anonymizeCustomer,
  getConsentText,
  getWhatsAppConsentStatus,
  recordWhatsAppConsent,
  type ConsentStatus,
  type ConsentText,
} from '../lib/privacy';

type Props = { customerId: string; customerName: string; canAnonymize: boolean; onChanged?: () => void | Promise<void> };

export default function CustomerPrivacyActions({ customerId, customerName, canAnonymize, onChanged }: Props) {
  const [open, setOpen] = useState(false);
  const [consent, setConsent] = useState<ConsentText | null>(null);
  const [status, setStatus] = useState<ConsentStatus | null>(null);
  const [accepted, setAccepted] = useState(false);
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [success, setSuccess] = useState('');

  async function show() {
    setOpen(true);
    setAccepted(false);
    setConfirmation('');
    setMessage('');
    setSuccess('');
    try {
      const [consentText, consentStatus] = await Promise.all([
        getConsentText(),
        getWhatsAppConsentStatus(customerId),
      ]);
      setConsent(consentText);
      setStatus(consentStatus.consent);
    }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Não foi possível carregar o consentimento.'); }
  }

  async function perform(action: 'grant' | 'revoke' | 'anonymize') {
    setBusy(true);
    setMessage('');
    setSuccess('');
    try {
      if (action === 'anonymize') await anonymizeCustomer(customerId, confirmation);
      else {
        if (!consent || (action === 'grant' && !accepted)) return;
        await recordWhatsAppConsent(customerId, action === 'grant', consent.version);
      }
      setAccepted(false);
      setConfirmation('');
      await onChanged?.();
      if (action === 'grant') {
        setStatus({ granted: true, recordedAt: new Date().toISOString(), version: consent?.version });
      } else if (action === 'revoke') {
        setStatus({ granted: false });
      }
      if (action === 'anonymize') {
        setSuccess('Dados pessoais removidos. Os valores financeiros foram preservados.');
      }
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Não foi possível salvar.'); }
    finally { setBusy(false); }
  }

  return <>
    <button type="button" onClick={() => void show()} className="text-xs font-semibold underline">Privacidade do cliente</button>
    <Modal open={open} onClose={() => { if (!busy) setOpen(false); }} title={`Privacidade — ${customerName}`}>
      <div className="space-y-4 text-sm">
        <div className={`rounded-xl border p-4 ${status?.granted ? 'border-ledger/35 bg-ledger/10' : 'border-brass/35 bg-brass/10'}`}>
          <p className={`font-bold ${status?.granted ? 'text-ledger-strong dark:text-ledger' : 'text-brass'}`}>
            {status === null ? 'Consultando autorização…' : status.granted ? 'Autorização já registrada' : 'Autorização ainda não registrada'}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-ink-soft">
            {status?.granted
              ? 'Este cliente já pode receber cobranças pelo WhatsApp. Não é necessário registrar novamente.'
              : 'Registre somente se o cliente tiver autorizado expressamente o contato pelo WhatsApp.'}
          </p>
          {status?.granted && status.recordedAt && (
            <p className="mt-2 text-xs font-medium text-ledger-strong dark:text-ledger">
              Registrada em {new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' }).format(new Date(status.recordedAt))}
            </p>
          )}
        </div>

        {status?.granted ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => void perform('revoke')}
            className="min-h-11 w-full rounded-xl border border-stamp/40 px-4 py-2.5 text-sm font-bold text-stamp transition hover:bg-stamp/10 disabled:opacity-40"
          >
            {busy ? 'Salvando…' : 'Revogar autorização'}
          </button>
        ) : (
          consent && (
            <div className="space-y-4">
              <p className="text-sm font-medium text-ink">Texto apresentado ao cliente</p>
              <div className="rounded-xl border border-line bg-paper p-3 leading-relaxed text-ink-soft">
                {consent.text}
                <p className="mt-2 text-xs">Versão {consent.version}</p>
              </div>
              <label className="flex gap-2 leading-relaxed">
                <input type="checkbox" checked={accepted} onChange={(event) => setAccepted(event.target.checked)} className="mt-1 accent-ledger" />
                <span>O cliente autorizou expressamente este uso do telefone.</span>
              </label>
              <button type="button" disabled={busy || !accepted} onClick={() => void perform('grant')} className="min-h-11 w-full rounded-xl bg-ledger px-4 py-2.5 text-sm font-bold text-paper transition hover:bg-ledger-strong disabled:opacity-40">
                {busy ? 'Registrando…' : 'Registrar autorização'}
              </button>
            </div>
          )
        )}

        {canAnonymize && (
          <details className="border-t border-line pt-4">
            <summary className="cursor-pointer text-sm font-semibold text-ink-soft">Remover dados pessoais (irreversível)</summary>
            <div className="mt-3 space-y-2">
              <p className="text-xs leading-relaxed text-ink-soft">Remove nome, telefone, e-mail e observações. Os valores e registros de vendas permanecem.</p>
              <label className="block text-xs">Digite o identificador <code className="break-all">{customerId}</code>.
                <input aria-label="Identificador do cliente para anonimização" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} className="mt-2 w-full rounded-xl border border-line bg-paper p-3" />
              </label>
              <button type="button" disabled={busy || confirmation !== customerId} onClick={() => void perform('anonymize')} className="rounded-xl bg-stamp px-4 py-2.5 text-sm font-bold text-paper disabled:opacity-40">Remover dados pessoais</button>
            </div>
          </details>
        )}
        {success && (
          <div className="flex items-start gap-3 rounded-xl border border-ledger/35 bg-ledger/10 p-4 text-ledger-strong dark:text-ledger" role="status">
            <CheckCircle size={24} weight="fill" className="mt-0.5 shrink-0" />
            <div>
              <p className="font-bold">{success}</p>
              <p className="mt-1 text-xs text-ink-soft">
                Esta alteração já foi salva e está disponível no cadastro do cliente.
              </p>
            </div>
          </div>
        )}
        {message && <p role="alert" className="rounded-lg bg-stamp/10 p-3 text-sm text-stamp">{message}</p>}
        <div className="flex justify-end border-t border-line pt-4">
          <button
            type="button"
            disabled={busy}
            onClick={() => setOpen(false)}
            className="min-h-10 rounded-xl border border-line px-5 py-2 text-sm font-bold text-ink-soft transition hover:border-ledger hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
          >
            Cancelar
          </button>
        </div>
      </div>
    </Modal>
  </>;
}
