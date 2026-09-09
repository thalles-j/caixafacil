import { Router, type NextFunction, type Request, type Response } from 'express';
import { withTenantTransaction } from '../db.js';
import { authenticateAccessToken } from '../admin/authorization.js';
import { requireClient } from '../admin/requireAdmin.js';
import { requireTenantRole } from '../tenant/authorization.js';
import { auditTenant } from '../tenant/audit.js';
import { ANONYMIZED_CUSTOMER_NAME, normalizeChargePhone, WHATSAPP_CONSENT_TEXT, WHATSAPP_CONSENT_VERSION } from './constants.js';

type PrivacyActor = { tenantId: string; actorId: string; actorRole: 'OWNER' | 'OPERATOR' };
type Route = (req: Request, res: Response, next: NextFunction) => Promise<unknown>;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const fail = (message: string, status: number) => Object.assign(new Error(message), { status });

function actor(res: Response): PrivacyActor {
  const auth = res.locals.auth;
  if (auth?.role !== 'client' || !uuid.test(auth.sub ?? '') || !uuid.test(auth.tenantId ?? '') || !['OWNER', 'OPERATOR'].includes(auth.tenantRole)) {
    throw fail('Sessão de estabelecimento inválida.', 403);
  }
  return { tenantId: auth.tenantId, actorId: auth.sub, actorRole: auth.tenantRole };
}

function customerId(req: Request) {
  const id = String(req.params.id ?? '');
  if (!uuid.test(id)) throw fail('Identificador de cliente inválido.', 400);
  return id;
}

const asyncRoute = (route: Route) => (req: Request, res: Response, next: NextFunction) => {
  void route(req, res, next).catch(next);
};

export async function recordConsentHandler(req: Request, res: Response) {
  const identity = actor(res);
  const id = customerId(req);
  const { granted, version } = req.body ?? {};
  if (typeof granted !== 'boolean' || (granted && version !== WHATSAPP_CONSENT_VERSION)) {
    throw fail('Confirme explicitamente a versão atual do consentimento.', 400);
  }
  const consent = await withTenantTransaction(identity.tenantId, async (client) => {
    const found = await client.query('SELECT id, phone, anonymized_at FROM customers WHERE business_id = $1 AND id = $2 FOR UPDATE', [identity.tenantId, id]);
    const customer = found.rows[0];
    if (!customer) throw fail('Cliente não encontrado.', 404);
    if (granted && (customer.anonymized_at || !normalizeChargePhone(customer.phone))) throw fail('O cliente precisa ter um telefone válido e cadastro ativo.', 409);
    const result = await client.query(
      `UPDATE customers SET whatsapp_consent_at = CASE WHEN $3 THEN now() ELSE NULL END,
         whatsapp_consent_version = CASE WHEN $3 THEN $4 ELSE NULL END,
         whatsapp_consent_recorded_by = CASE WHEN $3 THEN $5::uuid ELSE NULL END
       WHERE business_id = $1 AND id = $2
       RETURNING whatsapp_consent_at, whatsapp_consent_version, whatsapp_consent_recorded_by`,
      [identity.tenantId, id, granted, WHATSAPP_CONSENT_VERSION, identity.actorId],
    );
    await auditTenant(client, identity, granted ? 'customer.whatsapp_consent_granted' : 'customer.whatsapp_consent_revoked', id, { version: granted ? WHATSAPP_CONSENT_VERSION : null });
    return result.rows[0];
  });
  return res.json({ consent });
}

export async function getConsentStatusHandler(req: Request, res: Response) {
  const identity = actor(res);
  const id = customerId(req);
  const result = await withTenantTransaction(identity.tenantId, async (client) => {
    const found = await client.query(
      `SELECT whatsapp_consent_at, whatsapp_consent_version, whatsapp_consent_recorded_by
       FROM customers WHERE business_id = $1 AND id = $2`,
      [identity.tenantId, id],
    );
    const customer = found.rows[0];
    if (!customer) throw fail('Cliente não encontrado.', 404);
    return {
      granted: Boolean(
        customer.whatsapp_consent_at
          && customer.whatsapp_consent_recorded_by
          && customer.whatsapp_consent_version === WHATSAPP_CONSENT_VERSION,
      ),
      recordedAt: customer.whatsapp_consent_at,
      version: customer.whatsapp_consent_version,
    };
  });
  return res.json({ consent: result });
}

export async function whatsappChargeHandler(req: Request, res: Response) {
  const identity = actor(res);
  const id = customerId(req);
  const url = await withTenantTransaction(identity.tenantId, async (client) => {
    // Serializa com revogação e anonimização: nenhuma URL é emitida usando estado anterior.
    const found = await client.query(
      `SELECT id, name, phone, anonymized_at, whatsapp_consent_at, whatsapp_consent_version, whatsapp_consent_recorded_by
       FROM customers WHERE business_id = $1 AND id = $2 FOR UPDATE`, [identity.tenantId, id],
    );
    const customer = found.rows[0];
    if (!customer) throw fail('Cliente não encontrado.', 404);
    if (customer.anonymized_at || !customer.whatsapp_consent_at || !customer.whatsapp_consent_recorded_by || customer.whatsapp_consent_version !== WHATSAPP_CONSENT_VERSION) {
      throw fail('Registre a autorização atual do cliente em Privacidade antes de cobrar pelo WhatsApp.', 403);
    }
    const phone = normalizeChargePhone(customer.phone);
    if (!phone) throw fail('Telefone do cliente inválido.', 409);
    const balance = await client.query(
      `SELECT COALESCE(SUM(amount - paid_amount), 0) AS outstanding
       FROM credit_sales WHERE business_id = $1 AND customer_id = $2 AND status IN ('pendente', 'parcial')`,
      [identity.tenantId, id],
    );
    const amount = Number(balance.rows[0]?.outstanding);
    if (!Number.isFinite(amount) || amount <= 0) throw fail('O cliente não possui saldo pendente.', 409);
    const formatted = amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    const text = `Olá, ${customer.name}! Consta um valor pendente de ${formatted} no estabelecimento. Podemos combinar o pagamento? Se já pagou, desconsidere esta mensagem.`;
    await auditTenant(client, identity, 'customer.whatsapp_charge_prepared', id, { consentVersion: WHATSAPP_CONSENT_VERSION });
    return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
  });
  res.setHeader('Cache-Control', 'no-store');
  return res.json({ url });
}

export async function anonymizeCustomerHandler(req: Request, res: Response) {
  const identity = actor(res);
  if (identity.actorRole !== 'OWNER') throw fail('Apenas o responsável pelo estabelecimento pode anonimizar clientes.', 403);
  const id = customerId(req);
  if (req.body?.confirmationId !== id) throw fail('Digite o identificador do cliente para confirmar.', 400);
  await withTenantTransaction(identity.tenantId, async (client) => {
    const found = await client.query('SELECT id FROM customers WHERE business_id = $1 AND id = $2 FOR UPDATE', [identity.tenantId, id]);
    if (!found.rowCount) throw fail('Cliente não encontrado.', 404);
    await client.query(
      `UPDATE customers SET name = $3, phone = NULL, email = NULL, notes = NULL,
         whatsapp_consent_at = NULL, whatsapp_consent_version = NULL, whatsapp_consent_recorded_by = NULL,
         anonymized_at = COALESCE(anonymized_at, now())
       WHERE business_id = $1 AND id = $2`, [identity.tenantId, id, ANONYMIZED_CUSTOMER_NAME],
    );
    await client.query(`INSERT INTO privacy_erasure_tombstones(business_id,customer_id)
      VALUES($1,$2) ON CONFLICT(business_id,customer_id) DO NOTHING`, [identity.tenantId, id]);
    // Descrições históricas podem conter nomes/telefones digitados ou interpolados.
    // Substituí-las integralmente evita manter partes identificáveis em texto livre.
    await client.query(
      `UPDATE sales SET description = 'Venda — cliente anonimizado'
       WHERE business_id = $1 AND customer_id = $2`, [identity.tenantId, id],
    );
    await client.query(
      `UPDATE transactions SET description = 'Movimentação — cliente anonimizado'
       WHERE business_id = $1 AND (
         sale_id IN (SELECT id FROM sales WHERE business_id = $1 AND customer_id = $2)
         OR credit_sale_id IN (SELECT id FROM credit_sales WHERE business_id = $1 AND customer_id = $2)
       )`, [identity.tenantId, id],
    );
    await auditTenant(client, identity, 'customer.anonymized', id, { financialRecordsPreserved: true });
  });
  return res.json({ id, anonymized: true });
}

export const privacyRouter = Router();
privacyRouter.use(authenticateAccessToken, requireClient);
privacyRouter.get('/consent-text', (_req, res) => res.json({ version: WHATSAPP_CONSENT_VERSION, text: WHATSAPP_CONSENT_TEXT }));
privacyRouter.get('/customers/:id/whatsapp-consent', asyncRoute(getConsentStatusHandler));
privacyRouter.post('/customers/:id/whatsapp-consent', asyncRoute(recordConsentHandler));
privacyRouter.post('/customers/:id/whatsapp-charge', asyncRoute(whatsappChargeHandler));
privacyRouter.delete('/customers/:id/personal-data', requireTenantRole('OWNER'), asyncRoute(anonymizeCustomerHandler));
