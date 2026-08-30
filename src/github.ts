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
