import { beforeEach, describe, expect, it } from "vitest";
import { DomSnapshotter } from "../src/dom/snapshot.js";
import { createDomTools } from "../src/dom/tools.js";
import { refOf } from "./helpers.js";

/**
 * The snapshot printed a field's value cut at 60 characters and said nothing
 * about the cut. So after filling a long description the agent re-read the page,
 * saw fewer characters than it had written, and concluded the field had a
 * character limit — then retried shorter and shorter strings hunting for it.
 *
 * Observed in production on a transaction rule: six blind retries across one
 * description and one comment, converging on ~60 characters. Neither field has
 * a `maxlength`, and nothing had truncated anything. `maxlength` would not even
 * explain it — the browser applies it to typing, not to a programmatic fill.
 */

const LONG =
  "High-risk jurisdiction — refer to the jurisdiction runbook for enhanced due diligence " +
  "before releasing any transaction flagged by this rule.";

function fillTool(snapshotter: DomSnapshotter) {
  return createDomTools(snapshotter).find((t) => t.name === "fill")!;
}

async function fillAndRead(id: string, value: string) {
  const snapshotter = new DomSnapshotter();
  const el = document.getElementById(id)!;

  return String(await fillTool(snapshotter).execute({ ref: refOf(snapshotter, el), value }));
}

describe("a previewed field value is never mistakable for a truncated one", () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <input id="description" type="text" />
      <textarea id="comment"></textarea>
    `;
  });

  it("marks the preview and names the real length", async () => {
    const snapshot = await fillAndRead("description", LONG);

    expect(snapshot).toContain(`${LONG.length} chars`);
    expect(snapshot).toContain("preview truncated");
    expect(snapshot).toContain("the field kept all of it");
  });

  it("really did keep the whole value — the preview was the only thing cut", async () => {
    await fillAndRead("description", LONG);

    expect((document.getElementById("description") as HTMLInputElement).value).toBe(LONG);
  });

  it("marks textarea previews too — the rule comment was one", async () => {
    const snapshot = await fillAndRead("comment", LONG);

    expect(snapshot).toContain("preview truncated");
    expect((document.getElementById("comment") as HTMLTextAreaElement).value).toBe(LONG);
  });

  it("prints a short value whole, with no preview note", async () => {
    const snapshot = await fillAndRead("description", "High-risk jurisdiction");

    expect(snapshot).toContain('value="High-risk jurisdiction"');
    expect(snapshot).not.toContain("preview truncated");
  });
});
