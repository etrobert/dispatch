import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { requireEnv } from "./env.js";

// The connection both services share. Split apart, each would open its own.
export type Db = ReturnType<typeof drizzle>;

export function openDb(): Db {
  return drizzle(requireEnv("DISPATCH_DATABASE_URL"));
}

// Idempotent: drizzle records in the database which migrations it has applied,
// so the daemon can call this on every start. The folder is installed next to
// the bundle rather than resolvable from it, so its path comes in from the
// environment.
export async function migrateDb(db: Db): Promise<void> {
  console.log("migrating database");
  await migrate(db, { migrationsFolder: requireEnv("DISPATCH_MIGRATIONS") });
  // drizzle's migrate() reports nothing about which migrations it applied, so
  // reaching this line is all there is to say.
  console.log("database schema up to date");
}
