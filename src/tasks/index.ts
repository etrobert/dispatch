// Task management: a queue of tasks, the graph of steps each one grows, and the
// pull request review those steps hang off. It decides what work to do and what
// it was for; the agent service does the work.
//
// This file is the whole of its surface. Nothing outside `src/tasks/` may import
// any other file in here.
export { createTask, claimNextTask, claimTask, listTasks } from "./db.js";
export { pollReviews } from "./review.js";
export { runTask } from "./task.js";
// Whether a task's repository can be cloned is the agent service's judgement;
// it is asked here so a command never has to reach past this layer.
export { repoUrl } from "../agent/index.js";
