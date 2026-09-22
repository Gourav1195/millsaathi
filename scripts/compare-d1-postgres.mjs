import { readFile } from 'node:fs/promises';
import process from 'node:process';
import pg from 'pg';

const sourcePath = process.argv[2] ?? 'work/d1-production-export.sql';
const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL is required. Do not add it to source control.');

const dump = await readFile(sourcePath, 'utf8');
const expectedCounts = new Map();
for (const match of dump.matchAll(/^INSERT INTO "([^"]+)"/gm)) {
  if (match[1] === 'sqlite_sequence') continue;
  expectedCounts.set(match[1], (expectedCounts.get(match[1]) ?? 0) + 1);
}

const pool = new pg.Pool({ connectionString, ssl: { rejectUnauthorized: true }, max: 1 });
try {
  const mismatches = [];
  for (const [tableName, expected] of expectedCounts) {
    const { rows } = await pool.query(`SELECT COUNT(*)::int AS count FROM "${tableName}"`);
    if (rows[0].count !== expected) mismatches.push({ table: tableName, expected, actual: rows[0].count });
  }
  if (mismatches.length) {
    console.error(JSON.stringify({ matchedTables: expectedCounts.size - mismatches.length, mismatches }));
    process.exitCode = 1;
  } else {
    console.log(JSON.stringify({ matchedTables: expectedCounts.size, rows: [...expectedCounts.values()].reduce((total, count) => total + count, 0) }));
  }
} finally {
  await pool.end();
}
