import type { Pool, PoolClient, QueryResultRow } from 'pg';

type D1Meta = { changes: number; last_row_id: number };
export type D1Result<T = unknown> = { success: true; results: T[]; meta: D1Meta };

function sqlWithPostgresPlaceholders(sql: string): string {
  let placeholder = 0;
  let quote: string | null = null;
  let output = '';
  for (let index = 0; index < sql.length; index += 1) {
    const character = sql[index];
    if (quote) {
      output += character;
      if (character === quote) {
        if (sql[index + 1] === quote) output += sql[++index];
        else quote = null;
      }
      continue;
    }
    if (character === "'" || character === '"') {
      quote = character;
      output += character;
    } else if (character === '?') {
      const numbered = /^\d+/.exec(sql.slice(index + 1));
      if (numbered) {
        placeholder = Math.max(placeholder, Number(numbered[0]));
        output += `$${numbered[0]}`;
        index += numbered[0].length;
      } else {
        placeholder += 1;
        output += `$${placeholder}`;
      }
    } else output += character;
  }
  return output;
}

function postgresSql(sql: string): string {
  const pragma = /^\s*PRAGMA\s+table_info\(([^)]+)\)\s*;?\s*$/i.exec(sql);
  if (pragma) {
    const tableName = pragma[1].replaceAll("'", '').replaceAll('"', '');
    return `SELECT column_name AS name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = '${tableName}' ORDER BY ordinal_position`;
  }
  return sqlWithPostgresPlaceholders(sql)
    // SQLite's two-argument MAX is scalar; PostgreSQL reserves MAX for aggregates.
    .replace(/SUM\(MAX\(/g, 'SUM(GREATEST(')
    .replace(/MAX\(COALESCE\(/g, 'GREATEST(COALESCE(')
    .replace(/MAX\(\s*0\s*,/g, 'GREATEST(0,')
    .replace(/ROUND\(AVG\((CASE WHEN total_input_base > 0 THEN total_output_base \* 100\.0 \/ total_input_base END)\), 1\)/g, 'ROUND(AVG($1)::numeric, 1)')
    .replace(/strftime\('%Y-%m-%dT%H:%M:%fZ','now','-2 days'\)/g, "to_char((CURRENT_TIMESTAMP AT TIME ZONE 'UTC') - INTERVAL '2 days', 'YYYY-MM-DD\"T\"HH24:MI:SS.MS\"Z\"')")
    .replace(/strftime\('%Y-%m-%dT%H:%M:%fZ','now'\)/g, "to_char(CURRENT_TIMESTAMP AT TIME ZONE 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS.MS\"Z\"')")
    .replace(/datetime\('now', '\+7 days'\)/g, "((CURRENT_TIMESTAMP AT TIME ZONE 'UTC') + INTERVAL '7 days')::text")
    .replace(/datetime\('now'\)/g, "(CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::text")
    .replace(/date\('now', '(-?\d+) days'\)/g, "((CURRENT_TIMESTAMP AT TIME ZONE 'UTC') + INTERVAL '$1 days')::date")
    .replace(/date\('now'\)/g, "(CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date");
}

export class PostgresStatement {
  private values: unknown[] = [];

  constructor(private readonly pool: Pool, private readonly sql: string) {}

  bind(...values: unknown[]) {
    this.values = values;
    return this;
  }

  async first<T = unknown>(): Promise<T | null> {
    const result = await this.execute();
    return (result.rows[0] as T | undefined) ?? null;
  }

  async all<T = unknown>(): Promise<D1Result<T>> {
    const result = await this.execute();
    return { success: true, results: result.rows as T[], meta: { changes: result.rowCount ?? 0, last_row_id: 0 } };
  }

  async run(): Promise<D1Result> {
    const result = await this.execute();
    return { success: true, results: result.rows, meta: { changes: result.rowCount ?? 0, last_row_id: 0 } };
  }

  async execute(client?: PoolClient): Promise<{ rows: QueryResultRow[]; rowCount: number | null }> {
    const executor = client ?? this.pool;
    return executor.query(postgresSql(this.sql), this.values);
  }
}

/**
 * Narrow D1-compatible surface used by the established MillSaathi route layer.
 * Keep translations here auditable; new PostgreSQL-native code should use pg directly.
 */
export class PostgresD1Database {
  constructor(private readonly pool: Pool) {}

  prepare(sql: string) {
    return new PostgresStatement(this.pool, sql);
  }

  async batch(statements: PostgresStatement[]): Promise<D1Result[]> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const results = [];
      for (const statement of statements) {
        const result = await statement.execute(client);
        results.push({ success: true as const, results: result.rows, meta: { changes: result.rowCount ?? 0, last_row_id: 0 } });
      }
      await client.query('COMMIT');
      return results;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}
