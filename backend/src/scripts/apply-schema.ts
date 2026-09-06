import 'dotenv/config';
import { ensureSchema, pool } from '../db.js';

try {
  await ensureSchema();
  process.stdout.write(JSON.stringify({ event: 'schema_applied', ok: true }) + '\n');
} catch {
  process.stderr.write(JSON.stringify({ event: 'schema_apply_failed', ok: false }) + '\n');
  process.exitCode = 1;
} finally {
  await pool.end();
}
