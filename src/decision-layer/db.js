import pg from 'pg';

const DEFAULT_URL = 'postgres://vocare:vocare_local@127.0.0.1:5434/vocare';
let pool;

export function ledgerPool() {
  if (!pool) pool = new pg.Pool({ connectionString: process.env.DATABASE_URL || DEFAULT_URL, max: 10 });
  return pool;
}

export async function withTransaction(fn) {
  const client = await ledgerPool().connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function closeLedger() {
  if (pool) await pool.end();
  pool = null;
}
