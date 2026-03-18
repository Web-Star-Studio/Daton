import pg from "pg";

const { Pool } = pg;

if (!process.env.SOURCE_DATABASE_URL) {
  throw new Error(
    "SOURCE_DATABASE_URL must be set. This should point to the Supabase v1 database.",
  );
}

export const sourcePool = new Pool({
  connectionString: process.env.SOURCE_DATABASE_URL,
});

/** Run a query against the v1 Supabase source database */
export async function sourceQuery<T>(sql: string, params?: unknown[]): Promise<T[]> {
  const result = await sourcePool.query(sql, params);
  return result.rows as T[];
}
