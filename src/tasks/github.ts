import { execFileSync } from "node:child_process";
import { z } from "zod";

// The three states gh reports. Anything but OPEN means a human has settled the
// pull request, so parsing fails loudly on a fourth rather than reading it as
// still open.
const viewSchema = z.object({ state: z.enum(["OPEN", "MERGED", "CLOSED"]) });

export function prState(prUrl: string): "OPEN" | "MERGED" | "CLOSED" {
  // The url addresses the repository too, so this works outside a checkout.
  const view = execFileSync("gh", ["pr", "view", prUrl, "--json", "state"], {
    encoding: "utf8",
  });

  return viewSchema.parse(JSON.parse(view)).state;
}

// The fields of a comment left inline on the diff, named as GitHub names them.
// Not a submitted review — GitHub forbids reviewing your own pull request, and
// dispatch opens them as the account that reviews them.
//
// `line` is nullish two ways, and only one of them is in GitHub's OpenAPI spec:
// the spec has it absent on a comment against a whole file, and the live API
// also returns null once a later push outdates the comment's hunk.
const commentsSchema = z.array(
  z.object({
    id: z.number(),
    created_at: z.string(),
    body: z.string(),
    path: z.string(),
    line: z.number().nullish(),
  }),
);

export type PrComment = z.infer<typeof commentsSchema>[number];

// --paginate because a page holds 30 comments and the rest would otherwise be
// dropped, never answered. gh merges the pages back into one array.
function gh(path: string): unknown {
  return JSON.parse(
    execFileSync("gh", ["api", "--paginate", path], { encoding: "utf8" }),
  );
}

export function listComments(prUrl: string): PrComment[] {
  const match = /github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/.exec(prUrl);

  if (match === null) throw new Error(`not a pull request url: ${prUrl}`);

  const [, owner, repo, number] = match;

  return (
    commentsSchema
      .parse(gh(`repos/${owner}/${repo}/pulls/${number}/comments`))
      // Oldest first, so follow-ups are dispatched in the order they were left.
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
  );
}
