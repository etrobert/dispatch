import { spawn } from "node:child_process";

const [prompt] = process.argv.slice(2);

if (prompt === undefined) {
  console.error("usage: dispatch <prompt>");
  process.exit(1);
}

const child = spawn(
  "claude",
  ["--print", prompt, "--model", "haiku", "--output-format", "json"],
  {
    stdio: ["ignore", "pipe", "inherit"],
  },
);

let stdout = "";
child.stdout.setEncoding("utf8");
child.stdout.on("data", (chunk: string) => {
  stdout += chunk;
});

child.on("close", (code) => {
  if (code !== 0) process.exit(code ?? 1);

  // --output-format json emits an array of events; the outcome is the last one.
  // TODO: parse securely somehow
  const events = JSON.parse(stdout) as { result: string }[];
  const final = events.at(-1);
  if (final === undefined)
    throw new Error(`no result in claude output: ${stdout}`);

  console.log(final.result);
});
