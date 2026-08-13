import postgres from "postgres";

declare global {
  // eslint-disable-next-line no-var
  var __aiwaySql: ReturnType<typeof postgres> | undefined;
}

function resolveDatabaseUrl() {
  return (
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.POSTGRES_PRISMA_URL ||
    process.env.POSTGRES_URL_NON_POOLING ||
    ""
  );
}

function createSql() {
  const url = resolveDatabaseUrl();
  if (!url) {
    throw new Error(
      "DATABASE_URL (or POSTGRES_URL from Vercel Supabase) is not set",
    );
  }
  return postgres(url, {
    max: 10,
    idle_timeout: 20,
    connect_timeout: 10,
    prepare: false,
  });
}

export function getSql() {
  if (!global.__aiwaySql) {
    global.__aiwaySql = createSql();
  }
  return global.__aiwaySql;
}

export type Sql = ReturnType<typeof getSql>;
