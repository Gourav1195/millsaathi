import process from 'node:process';
import pg from 'pg';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL is required. Do not add it to source control.');

const pool = new pg.Pool({ connectionString, ssl: { rejectUnauthorized: true }, max: 1 });
try {
  const { rows: tables } = await pool.query(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    ORDER BY table_name
  `);
  const { rows: foreignKeys } = await pool.query(`
    SELECT COUNT(*)::int AS count
    FROM information_schema.table_constraints
    WHERE table_schema = 'public' AND constraint_type = 'FOREIGN KEY'
  `);
  console.log(JSON.stringify({
    tables: tables.length,
    foreignKeys: foreignKeys[0].count,
  }));
} finally {
  await pool.end();
}
