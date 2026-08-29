import { build } from "esbuild";

await build({
  entryPoints: ["src/main.ts"],
  outfile: "dist/dispatch.mjs",
  bundle: true,
  platform: "node",
  target: "node24",
  format: "esm",
  banner: {
    // pg is CommonJS and calls require() at runtime, which an ESM bundle has no
    // binding for.
    js: "import { createRequire } from 'node:module';\nconst require = createRequire(import.meta.url);",
  },
});
