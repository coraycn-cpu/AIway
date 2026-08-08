#!/usr/bin/env tsx
import { readdirSync, readFileSync } from "fs";
import { resolve } from "path";
import postgres from "postgres";

async function main() {
  const url =
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.POSTGRES_PRISMA_URL ||
    process.env.POSTGRES_URL_NON_POOLING;
  if (!url) {
    console.error("DATABASE_URL or POSTGRES_URL is required");
    process.exit(1);
  }

  const sql = postgres(url, { max: 1, prepare: false });
  const dir = resolve(process.cwd(), "supabase/migrations");
  const files = readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  for (const file of files) {
    const migration = readFileSync(resolve(dir, file), "utf8");
    console.log(`Applying ${file}...`);
    await sql.unsafe(migration);
  }

  await sql.end();
  console.log("Migrations applied. Admin: admin@qq.com / 123456");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
