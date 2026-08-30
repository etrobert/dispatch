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

// A url every machine can reach, either `scheme://host/path` or git's scp-like
// `user@host:path`.
const remote = /^[a-z][a-z0-9+.-]*:\/\/|^[^/:]+@[^/:]+:/i;

// The origin of the checkout the operator is standing in, which is the repo
// they almost always mean.
function origin(): string {
  try {
    return execFileSync("git", ["remote", "get-url", "origin"], {
      encoding: "utf8",
      // git's own complaint would land on stderr next to the error thrown here.
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    throw new Error(
      "no repo given, and no origin remote here: pass the url to clone from",
    );
  }
}

// What a task records as its repo. Never a working directory: the task is
// picked up by whichever machine claims it, long after the shell that typed it
// is gone, and dispatch clones the repo into a store of its own anyway. A local
// path would also leave the step with no remote to open a pull request against.
export function repoUrl(arg: string | undefined): string {
  const url = arg ?? origin();

  if (!remote.test(url)) {
    throw new Error(`not a remote url: ${url}`);
  }

  return url;
}
