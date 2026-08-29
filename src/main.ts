import { spawn } from "node:child_process";

const [prompt] = process.argv.slice(2);

if (prompt === undefined) {
  console.error("usage: dispatch <prompt>");
  process.exit(1);
}

const child = spawn("claude", ["--print", prompt], { stdio: "inherit" });

child.on("close", (code) => process.exit(code ?? 1));
