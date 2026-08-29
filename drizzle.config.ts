import { defineConfig } from "drizzle-kit";

const url = process.env["DATABASE_URL"];

if (url === undefined) {
  throw new Error("DATABASE_URL must point at a postgres database");
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema.ts",
  dbCredentials: { url },
});
