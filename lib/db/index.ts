import postgres from "postgres";

declare global {
  // eslint-disable-next-line no-var
  var __aiwaySql: ReturnType<typeof postgres> | undefined;
}

function createSql() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not set");
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
