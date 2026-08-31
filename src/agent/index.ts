// The agent service: give it a repository, a branch and a prompt, and it clones,
// builds a worktree, runs an agent in it and records what that cost. It knows
// nothing of tasks, steps or pull requests, and writes only `runs` and
// `tool_failures` — so it could be lifted out of this project whole.
//
// This file is the whole of its surface. Nothing outside `src/agent/` may import
// any other file in here.
export { runAgent, type Workspace } from "./runner.js";
export { runWorkspace } from "./db.js";
// What the service will accept as a repository to clone.
export { repoUrl } from "./repos.js";
