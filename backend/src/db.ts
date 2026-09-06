import { Pool } from 'pg';
import { readFile } from 'node:fs/promises';

const schemaUrls = [
  new URL('../prisma/migrations/0001_init/migration.sql', import.meta.url),
  new URL('../prisma/migrations/0002_admin_panel/migration.sql', import.meta.url),
  new URL('../prisma/migrations/0003_admin_account_management/migration.sql', import.meta.url),
];
const configuredDatabaseUrl = process.env.DATABASE_URL;

if (!configuredDatabaseUrl) {
  throw new Error('DATABASE_URL nao foi definida. Use a connection string pooled do Neon.');
}
const runtimeDatabaseUrl: string = configuredDatabaseUrl;

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizeConnectionString(connectionString: string): string {
  try {
    const url = new URL(connectionString);
    const sslMode = url.searchParams.get('sslmode');
    // pg 8 trata estes modos como verify-full e avisa sobre a mudanca futura.
    // Tornar o comportamento explicito remove o warning e mantem a verificacao
    // do certificado/hostname usada atualmente.
    if (sslMode && ['prefer', 'require', 'verify-ca'].includes(sslMode)) {
      url.searchParams.set('sslmode', 'verify-full');
    }
    return url.toString();
  } catch {
    return connectionString;
  }
}

function createPool(connectionString: string, max: number) {
  return new Pool({
    connectionString: normalizeConnectionString(connectionString),
    max,
    idleTimeoutMillis: positiveInteger(process.env.DB_IDLE_TIMEOUT_MS, 30_000),
    connectionTimeoutMillis: positiveInteger(process.env.DB_CONNECT_TIMEOUT_MS, 10_000),
    keepAlive: true,
    application_name: 'caixafacil-api',
  });
}

// No Neon, DATABASE_URL deve ser a URL pooled (host contendo "-pooler").
export const pool = createPool(
  runtimeDatabaseUrl,
  positiveInteger(process.env.DB_POOL_MAX, 10),
);

export async function ensureSchema() {
  const schemas = await Promise.all(schemaUrls.map((schemaUrl) => readFile(schemaUrl, 'utf8')));
  // Se uma URL direta existir, ela e preferida para DDL. Caso contrario, o
  // mesmo pool do runtime e usado; DATABASE_URL_UNPOOLED nao e obrigatoria.
  const migrationDatabaseUrl = process.env.DATABASE_URL_UNPOOLED ?? runtimeDatabaseUrl;
  if (migrationDatabaseUrl === runtimeDatabaseUrl) {
    for (const schema of schemas) await pool.query(schema);
    return;
  }

  const migrationPool = createPool(migrationDatabaseUrl, 1);
  try {
    for (const schema of schemas) await migrationPool.query(schema);
  } finally {
    await migrationPool.end();
  }
}

/**
 * Executa operacoes autenticadas com o tenant preso a uma transacao.
 * `SET LOCAL` (via set_config(..., true)) impede vazamento entre conexoes do pool.
 */
export async function withTenantTransaction<T>(
  userId: string,
  operation: (client: import('pg').PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // neondb_owner possui BYPASSRLS. A role NOLOGIN criada pelo schema tem
    // apenas privilegios de negocio e obrigatoriamente obedece ao RLS.
    await client.query('SET LOCAL ROLE mnb_app_runtime');
    await client.query("SELECT set_config('app.current_user_id', $1, true)", [userId]);
    const result = await operation(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
