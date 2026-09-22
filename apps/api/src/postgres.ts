import { Pool } from 'pg';

/** PostgreSQL is configured only through DATABASE_URL; never place credentials in source files. */
export function createPostgresPool(connectionString = process.env.DATABASE_URL) {
  if (!connectionString) return null;
  return new Pool({ connectionString, max: 10, ssl: { rejectUnauthorized: true } });
}
