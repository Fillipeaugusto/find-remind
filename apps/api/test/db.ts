import { sql, type Database } from "@findremind/db";
import { migrateDb } from "@findremind/db/migrate";
import { loadEnv } from "../src/config/env.js";

async function assertTestDatabase(db: Database): Promise<void> {
  if (loadEnv().NODE_ENV !== "test") {
    throw new Error("Database test helpers require NODE_ENV=test");
  }

  const [result] = await db.execute<{ name: string }>(sql`select current_database() as name`);
  if (result?.name !== "findremind_test") {
    throw new Error("Database test helpers require the findremind_test database");
  }
}

export async function migrateTestDb(db: Database): Promise<void> {
  await assertTestDatabase(db);
  await migrateDb(db);
}

export async function truncateAll(db: Database): Promise<void> {
  await assertTestDatabase(db);
  const tables = await db.execute<{ tablename: string }>(sql`
    select tablename from pg_tables where schemaname = 'public'
  `);
  if (tables.length === 0) return;

  const names = tables.map(({ tablename }) => sql`"public".${sql.identifier(tablename)}`);
  await db.execute(sql`truncate table ${sql.join(names, sql`, `)} restart identity cascade`);
}
