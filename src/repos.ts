import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { basename, join } from "node:path";
import { requireEnv } from "./env.js";

// A bare clone dispatch owns, so it never writes into a checkout someone else
// is using and git never refuses it as another user's repository.
export function ensureRepo(url: string): string {
  const root = requireEnv("DISPATCH_REPOS");
  const path = join(root, `${basename(url, ".git")}.git`);

  if (!existsSync(path)) {
    // `git clone --bare` leaves remote.origin.fetch unset, so later fetches
    // would silently update nothing. `remote add` writes it.
    execFileSync("git", ["init", "--quiet", "--bare", path]);
    execFileSync("git", ["remote", "add", "origin", url], { cwd: path });
  }

  execFileSync("git", ["fetch", "--quiet", "--prune", "origin"], { cwd: path });
  execFileSync("git", ["remote", "set-head", "origin", "--auto"], {
    cwd: path,
    stdio: "ignore",
  });

  return path;
}
