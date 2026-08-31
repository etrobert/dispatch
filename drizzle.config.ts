import { defineConfig } from "drizzle-kit";

const url = process.env["DISPATCH_DATABASE_URL"];

if (url === undefined) {
  throw new Error("DISPATCH_DATABASE_URL must point at a postgres database");
}

export default defineConfig({
  dialect: "postgresql",
  schema: ["./src/schema.ts", "./src/agent/schema.ts"],
  // Committed SQL. generate writes it here; the daemon applies the folder at
  // startup.
  out: "./migrations",
  dbCredentials: { url },
});
