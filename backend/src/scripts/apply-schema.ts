import 'dotenv/config';
import { ensureSchema, pool } from '../db.js';

try {
  await ensureSchema();
  process.stdout.write(JSON.stringify({ event: 'schema_applied', ok: true }) + '\n');
} catch (error) {
  const details = error instanceof Error ? { error: error.message } : { error: 'Erro desconhecido.' };
  const code = typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : undefined;
  process.stderr.write(JSON.stringify({ event: 'schema_apply_failed', ok: false, code, ...details }) + '\n');
  process.exitCode = 1;
} finally {
  await pool.end();
}
