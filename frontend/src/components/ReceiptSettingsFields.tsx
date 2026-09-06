import type { ReceiptSettings } from '../lib/printing';

/** Parent persists with the tenant's authenticated owner-only settings endpoint. */
export default function ReceiptSettingsFields({ value, onChange, disabled = false }: {
  value: ReceiptSettings; onChange(value: ReceiptSettings): void; disabled?: boolean;
}) {
  return <fieldset disabled={disabled} className="space-y-5">
    <legend className="font-display text-lg font-bold text-ink">Cupom não fiscal</legend>
    <p className="text-xs text-ink-soft">Configure o conteúdo e a largura usada pela impressora do caixa.</p>
    <label className="block text-sm font-semibold text-ink">Largura do papel
      <select className="mt-2 block w-full rounded-lg border border-line bg-paper p-2.5 text-ink focus:outline-none focus:ring-2 focus:ring-ledger/30" value={value.paperWidth} onChange={(event) => onChange({ ...value, paperWidth: event.target.value === '58' ? 58 : 80 })}>
        <option value={58}>58 mm</option><option value={80}>80 mm</option>
      </select>
    </label>
    <label className="block text-sm font-semibold text-ink">Razão social <span className="font-normal text-ink-soft">(opcional)</span>
      <input className="mt-2 block w-full rounded-lg border border-line bg-paper p-2.5 text-ink focus:outline-none focus:ring-2 focus:ring-ledger/30" maxLength={160} value={value.legalName ?? ''} onChange={(event) => onChange({ ...value, legalName: event.target.value })} />
    </label>
    <div className="space-y-3 border-t border-line pt-4">
      <label className="flex items-center justify-between gap-4 rounded-xl bg-paper px-4 py-3 text-sm font-medium text-ink"><span>Exibir operador responsável</span><input className="h-5 w-5 accent-ledger" type="checkbox" checked={value.showOperator} onChange={(event) => onChange({ ...value, showOperator: event.target.checked })} /></label>
      <label className="flex items-center justify-between gap-4 rounded-xl bg-paper px-4 py-3 text-sm font-medium text-ink"><span>Exibir forma de pagamento</span><input className="h-5 w-5 accent-ledger" type="checkbox" checked={value.showPaymentMethod} onChange={(event) => onChange({ ...value, showPaymentMethod: event.target.checked })} /></label>
    </div>
  </fieldset>;
}
