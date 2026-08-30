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

// A task's first step: a new branch off the repository's default branch.
export function withNewBranch<T>(
  repo: string,
  branch: string,
  body: (cwd: string) => Promise<T>,
): Promise<T> {
  return withWorktree({ repo, branch, startPoint: "origin/HEAD" }, body);
}

// A later step on a pull request that already exists. Several of these run at
// once against one branch, so each takes a local branch of its own — git
// refuses to check the same branch out in two worktrees. Its upstream is the
// pull request's branch, so `git pull --rebase` catches up on what the others
// pushed; pushing needs an explicit refspec, which the caller's prompt supplies.
export function withPrBranch<T>(
  repo: string,
  prBranch: string,
  body: (cwd: string) => Promise<T>,
): Promise<T> {
  return withWorktree(
    {
      repo,
      branch: `${prBranch}-${randomUUID().slice(0, 4)}`,
      startPoint: `origin/${prBranch}`,
    },
    body,
  );
}
