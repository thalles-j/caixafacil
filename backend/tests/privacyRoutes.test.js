import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ query: vi.fn(), transaction: vi.fn(), audit: vi.fn() }));
vi.mock('../src/db.ts', () => ({ pool: { query: vi.fn() }, withTenantTransaction: mocks.transaction }));
vi.mock('../src/auth/jwt.ts', () => ({ verifyToken: vi.fn() }));
vi.mock('../src/tenant/audit.ts', () => ({ auditTenant: mocks.audit }));

import { anonymizeCustomerHandler, recordConsentHandler, whatsappChargeHandler } from '../src/privacy/routes.ts';
import { WHATSAPP_CONSENT_VERSION } from '../src/privacy/constants.ts';

const tenantA = '11111111-1111-4111-8111-111111111111';
const tenantB = '22222222-2222-4222-8222-222222222222';
const customerA = '33333333-3333-4333-8333-333333333333';
const operatorA = '44444444-4444-4444-8444-444444444444';
const customerB = '55555555-5555-4555-8555-555555555555';

function response(tenantRole = 'OWNER', tenantId = tenantA) {
  return {
    locals: { auth: { sub: tenantRole === 'OWNER' ? tenantId : operatorA, tenantId, tenantRole, role: 'client' } },
    setHeader: vi.fn(),
    json(body) { this.body = body; return this; },
  };
}
const request = (body = {}, id = customerA) => ({ params: { id }, body });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.query.mockReset();
  mocks.transaction.mockImplementation(async (_tenantId, operation) => operation({ query: mocks.query }));
  mocks.audit.mockResolvedValue(undefined);
});

describe('privacidade dos clientes', () => {
  it.each([
    {},
    { whatsapp_consent_at: new Date(), whatsapp_consent_version: 'old', whatsapp_consent_recorded_by: tenantA },
    { whatsapp_consent_at: new Date(), whatsapp_consent_version: WHATSAPP_CONSENT_VERSION },
    { anonymized_at: new Date(), whatsapp_consent_at: new Date(), whatsapp_consent_version: WHATSAPP_CONSENT_VERSION, whatsapp_consent_recorded_by: tenantA },
  ])('não prepara cobrança sem autorização vigente e completa: %o', async (consent) => {
    mocks.query.mockResolvedValue({ rowCount: 1, rows: [{ id: customerA, phone: '11999998888', ...consent }] });
    await expect(whatsappChargeHandler(request(), response())).rejects.toMatchObject({ status: 403 });
    expect(mocks.audit).not.toHaveBeenCalled();
    expect(mocks.query).toHaveBeenCalledTimes(1);
  });

  it('usa saldo do banco, tenant autenticado e identidade do operador; não audita telefone', async () => {
    mocks.query.mockResolvedValueOnce({ rowCount: 1, rows: [{
      id: customerA, name: 'Ana', phone: '11999998888', whatsapp_consent_at: new Date(),
      whatsapp_consent_version: WHATSAPP_CONSENT_VERSION, whatsapp_consent_recorded_by: tenantA,
    }] }).mockResolvedValueOnce({ rows: [{ outstanding: '125.50' }] });
    const res = response('OPERATOR');
    await whatsappChargeHandler(request({ amount: 99999, tenantId: tenantB }), res);
    const url = new URL(res.body.url);
    expect(url.hostname).toBe('wa.me');
    expect(url.searchParams.get('text')).toContain('125,50');
    expect(url.searchParams.get('text')).not.toContain('99999');
    expect(mocks.transaction).toHaveBeenCalledWith(tenantA, expect.any(Function));
    expect(mocks.query.mock.calls[1][1]).toEqual([tenantA, customerA]);
    expect(mocks.audit).toHaveBeenCalledWith(expect.anything(), { tenantId: tenantA, actorId: operatorA, actorRole: 'OPERATOR' }, 'customer.whatsapp_charge_prepared', customerA, { consentVersion: WHATSAPP_CONSENT_VERSION });
    expect(JSON.stringify(mocks.audit.mock.calls)).not.toContain('11999998888');
  });

  it('não registra consentimento implícito ou versão antiga', async () => {
    await expect(recordConsentHandler(request({ granted: 'true', version: WHATSAPP_CONSENT_VERSION }), response())).rejects.toMatchObject({ status: 400 });
    await expect(recordConsentHandler(request({ granted: true, version: 'old' }), response())).rejects.toMatchObject({ status: 400 });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it('registra versão e autor autenticado usando timestamp do servidor', async () => {
    mocks.query.mockResolvedValueOnce({ rows: [{ phone: '11999998888' }] }).mockResolvedValueOnce({ rows: [{ whatsapp_consent_at: '2026-09-05T12:00:00Z' }] });
    await recordConsentHandler(request({ granted: true, version: WHATSAPP_CONSENT_VERSION, recordedBy: tenantB, timestamp: '2000-01-01' }), response('OPERATOR'));
    expect(mocks.query.mock.calls[1][0]).toContain('now()');
    expect(mocks.query.mock.calls[1][1]).toEqual([tenantA, customerA, true, WHATSAPP_CONSENT_VERSION, operatorA]);
  });

  it('permite revogar mesmo que o texto tenha mudado', async () => {
    mocks.query.mockResolvedValueOnce({ rows: [{ phone: '11999998888' }] }).mockResolvedValueOnce({ rows: [{}] });
    await recordConsentHandler(request({ granted: false, version: 'old' }), response('OPERATOR'));
    expect(mocks.query.mock.calls[1][1][2]).toBe(false);
    expect(mocks.audit.mock.calls[0][2]).toBe('customer.whatsapp_consent_revoked');
  });

  it('impede operador de anonimizar e exige confirmação do owner', async () => {
    await expect(anonymizeCustomerHandler(request({ confirmationId: customerA }), response('OPERATOR'))).rejects.toMatchObject({ status: 403 });
    await expect(anonymizeCustomerHandler(request(), response())).rejects.toMatchObject({ status: 400 });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it.each(['charge', 'consent', 'anonymize'])('IDs de outro tenant não acessam nem alteram dados: %s', async (action) => {
    mocks.query.mockResolvedValue({ rowCount: 0, rows: [] });
    const req = request({ confirmationId: customerB, granted: true, version: WHATSAPP_CONSENT_VERSION, tenantId: tenantB }, customerB);
    const handler = action === 'charge' ? whatsappChargeHandler : action === 'consent' ? recordConsentHandler : anonymizeCustomerHandler;
    await expect(handler(req, response())).rejects.toMatchObject({ status: 404 });
    expect(mocks.transaction).toHaveBeenCalledWith(tenantA, expect.any(Function));
    expect(mocks.query.mock.calls[0][0]).toContain('WHERE business_id = $1 AND id = $2');
    expect(mocks.query.mock.calls[0][1]).toEqual([tenantA, customerB]);
    expect(mocks.query).toHaveBeenCalledTimes(1);
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it('anonimiza identificadores e descrições mantendo valores e vínculos financeiros', async () => {
    mocks.query.mockResolvedValue({ rowCount: 1, rows: [{ id: customerA }] });
    const res = response();
    await anonymizeCustomerHandler(request({ confirmationId: customerA }), res);
    const updates = mocks.query.mock.calls.filter(([sql]) => sql.trim().startsWith('UPDATE'));
    expect(updates).toHaveLength(3);
    expect(updates[0][0]).toContain('phone = NULL, email = NULL, notes = NULL');
    expect(updates[0][1]).toEqual([tenantA, customerA, 'Cliente anonimizado']);
    expect(updates[1][0]).toContain("description = 'Venda — cliente anonimizado'");
    expect(updates[2][0]).toContain('credit_sale_id IN');
    for (const [sql, values] of updates) {
      expect(sql).toContain('WHERE business_id = $1');
      expect(values[0]).toBe(tenantA);
      expect(sql.slice(sql.indexOf('SET'), sql.indexOf('WHERE'))).not.toMatch(/\b(?:amount|paid_amount|total_amount|quantity|customer_id|sale_id)\s*=/i);
      expect(sql).not.toMatch(/DELETE|TRUNCATE/i);
    }
    expect(mocks.audit.mock.calls[0][4]).toEqual({ financialRecordsPreserved: true });
    expect(res.body).toEqual({ id: customerA, anonymized: true });
  });
});
