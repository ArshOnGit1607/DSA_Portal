import * as fs from 'fs';
import * as path from 'path';
import { pool, withTransaction } from './pool';

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

/**
 * Creates the migrations tracking table if it doesn't already exist
 */
async function ensureMigrationsTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      executed_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
}

/**
 * Runs all pending .sql migrations in alphabetical order within transactions
 */
export async function runMigrations(): Promise<{ applied: string[]; skipped: string[] }> {
  await ensureMigrationsTable();

  const executedRes = await pool.query<{ name: string }>(
    'SELECT name FROM _migrations ORDER BY id ASC'
  );
  const executedNames = new Set(executedRes.rows.map((r) => r.name));

  if (!fs.existsSync(MIGRATIONS_DIR)) {
    return { applied: [], skipped: [] };
  }

  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  const applied: string[] = [];
  const skipped: string[] = [];

  for (const file of files) {
    if (executedNames.has(file)) {
      skipped.push(file);
      continue;
    }

    const filePath = path.join(MIGRATIONS_DIR, file);
    const sql = fs.readFileSync(filePath, 'utf8');

    console.log(`[Migration] Applying ${file}...`);
    await withTransaction(async (client) => {
      await client.query(sql);
      await client.query('INSERT INTO _migrations (name) VALUES ($1)', [file]);
    });

    console.log(`[Migration] Successfully applied ${file}`);
    applied.push(file);
  }

  return { applied, skipped };
}

// Allow direct execution via tsx: npx tsx server/src/db/migrate.ts
if (require.main === module) {
  runMigrations()
    .then(({ applied, skipped }) => {
      console.log(`Migration complete. Applied: ${applied.length}, Skipped: ${skipped.length}`);
      process.exit(0);
    })
    .catch((err) => {
      console.error('Migration failed:', err);
      process.exit(1);
    });
}
