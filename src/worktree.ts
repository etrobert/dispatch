import { execFileSync } from "node:child_process";

export function createWorktree({
  repo,
  path,
  branch,
}: {
  repo: string;
  path: string;
  branch: string;
}): void {
  execFileSync("git", ["worktree", "add", "-b", branch, path], { cwd: repo });
}

export function removeWorktree({
  repo,
  path,
  branch,
}: {
  repo: string;
  path: string;
  branch: string;
}): void {
  execFileSync("git", ["worktree", "remove", "--force", path], { cwd: repo });
  // Removing the worktree leaves its branch behind.
  execFileSync("git", ["branch", "--delete", "--force", branch], { cwd: repo });
}
