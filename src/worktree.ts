import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

// A step runs in its own worktree, removed whether or not the step succeeded.
async function withWorktree<T>(
  {
    repo,
    branch,
    startPoint,
  }: { repo: string; branch: string; startPoint: string },
  body: (cwd: string) => Promise<T>,
): Promise<T> {
  const parent = await mkdtemp(join(tmpdir(), "dispatch-"));
  const path = join(parent, "worktree");

  execFileSync("git", ["worktree", "add", "-b", branch, path, startPoint], {
    cwd: repo,
  });

  try {
    return await body(path);
  } finally {
    execFileSync("git", ["worktree", "remove", "--force", path], { cwd: repo });
    // Removing the worktree leaves its branch behind.
    execFileSync("git", ["branch", "--delete", "--force", branch], {
      cwd: repo,
    });
    await rm(parent, { recursive: true });
  }
}

function onRemote(repo: string, branch: string): boolean {
  try {
    execFileSync("git", ["show-ref", "--verify", `refs/remotes/origin/${branch}`], {
      cwd: repo,
      stdio: "ignore",
    });
    return true;
  } catch {
    return false;
  }
}

// A worktree for work belonging on `branch`, whether or not that branch exists
// yet — which is what decides how it is checked out, so the caller need not
// know or say.
//
// A branch that already exists is one others are working on too: each worktree
// takes a throwaway local branch of its own, since git refuses to check one
// branch out twice. Its upstream is the shared branch, so `git pull --rebase`
// catches up on what the others pushed; pushing needs an explicit refspec,
// which the caller's prompt supplies.
export function withBranch<T>(
  repo: string,
  branch: string,
  body: (cwd: string) => Promise<T>,
): Promise<T> {
  return onRemote(repo, branch)
    ? withWorktree(
        {
          repo,
          branch: `${branch}-${randomUUID().slice(0, 4)}`,
          startPoint: `origin/${branch}`,
        },
        body,
      )
    : withWorktree({ repo, branch, startPoint: "origin/HEAD" }, body);
}
