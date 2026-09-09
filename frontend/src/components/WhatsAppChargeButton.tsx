import { useState } from 'react';
import { CheckCircle, ShieldCheck } from '@phosphor-icons/react';
import Modal from './Modal';
import { getConsentText, getWhatsAppCharge, recordWhatsAppConsent, type ConsentText } from '../lib/privacy';

type Props = { customerId: string; customerName?: string };

export default function WhatsAppChargeButton({ customerId, customerName = 'este cliente' }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [consent, setConsent] = useState<ConsentText | null>(null);
  const [consentOpen, setConsentOpen] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [registered, setRegistered] = useState(false);

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
      const message = caught instanceof Error ? caught.message : 'Não foi possível abrir a cobrança.';
      if (message.includes('Registre a autorização atual do cliente')) {
        try {
          setConsent(await getConsentText());
          setAccepted(false);
          setRegistered(false);
          setConsentOpen(true);
        } catch (consentError) {
          setError(consentError instanceof Error ? consentError.message : 'Não foi possível carregar a autorização.');
        }
      } else {
        setError(message);
      }
    } finally { setBusy(false); }
  }

  async function registerConsent() {
    if (!consent || !accepted) return;
    setBusy(true);
    setError('');
    try {
      await recordWhatsAppConsent(customerId, true, consent.version);
      setRegistered(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Não foi possível registrar a autorização.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="min-w-0">
        <button
          type="button"
          disabled={busy}
          onClick={() => void openCharge()}
          className="whitespace-nowrap text-xs font-semibold text-emerald-700 transition hover:text-emerald-800 disabled:opacity-40 dark:text-ledger dark:hover:text-ledger"
        >
          {busy ? 'Verificando autorização…' : 'Cobrar via WhatsApp'}
        </button>
        {error && <p role="alert" className="mt-1 max-w-56 text-left text-xs leading-snug text-stamp">{error}</p>}
      </div>

      <Modal
        open={consentOpen}
        onClose={() => { if (!busy) setConsentOpen(false); }}
        title={`Autorização para WhatsApp — ${customerName}`}
      >
        <div className="space-y-4 text-sm">
          {!registered ? (
            <>
              <div className="rounded-xl border border-brass/30 bg-brass/10 p-3 text-ink">
                <p className="font-semibold">Este cliente ainda não tem autorização registrada.</p>
                <p className="mt-1 text-xs leading-relaxed text-ink-soft">
                  Registre a autorização manifestada pelo próprio cliente para liberar a cobrança via WhatsApp.
                </p>
              </div>
              {consent && (
                <>
                  <div className="rounded-xl border border-line bg-paper p-3 text-sm leading-relaxed text-ink-soft">
                    {consent.text}
                    <p className="mt-2 text-xs">Versão {consent.version}</p>
                  </div>
                  <label className="flex items-start gap-2 text-sm leading-relaxed">
                    <input
                      type="checkbox"
                      checked={accepted}
                      onChange={(event) => setAccepted(event.target.checked)}
                      className="mt-1 accent-ledger"
                    />
                    <span>O cliente autorizou expressamente o uso do telefone para cobranças pelo WhatsApp.</span>
                  </label>
                  <button
                    type="button"
                    disabled={busy || !accepted}
                    onClick={() => void registerConsent()}
                    className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-ledger px-4 py-2.5 text-sm font-bold text-paper transition hover:bg-ledger-strong disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <ShieldCheck size={18} weight="bold" />
                    {busy ? 'Registrando…' : 'Registrar autorização'}
                  </button>
                </>
              )}
            </>
          ) : (
            <div className="rounded-xl border border-ledger/30 bg-ledger/10 p-4 text-center">
              <CheckCircle size={34} weight="fill" className="mx-auto text-ledger" />
              <p className="mt-2 font-bold text-ledger-strong dark:text-ledger">Autorização registrada com sucesso!</p>
              <p className="mt-1 text-xs leading-relaxed text-ink-soft">
                Agora você já pode cobrar este cliente pelo WhatsApp.
              </p>
              <button
                type="button"
                onClick={() => { setConsentOpen(false); void openCharge(); }}
                className="mt-4 inline-flex min-h-10 items-center justify-center rounded-xl bg-ledger px-4 py-2 text-sm font-bold text-paper transition hover:bg-ledger-strong"
              >
                Cobrar via WhatsApp
              </button>
            </div>
          )}
          {error && <p role="alert" className="text-xs text-stamp">{error}</p>}
          <div className="flex justify-end border-t border-line pt-4">
            <button
              type="button"
              disabled={busy}
              onClick={() => setConsentOpen(false)}
              className="min-h-10 rounded-xl border border-line px-5 py-2 text-sm font-bold text-ink-soft transition hover:border-ledger hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
            >
              Cancelar
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}
