import { beforeEach, describe, expect, it } from "vitest";
import { DomSnapshotter } from "../src/dom/snapshot.js";

/**
 * The outline stopped at the node budget and simply ended, so a page bigger than
 * the budget looked like a smaller one. The agent then reasons from absence — an
 * element it cannot see is one that is not there. Radix portals dialog content
 * to the END of document.body, so the first thing to fall off the budget is the
 * modal being worked in, and the conclusion reached is "the dialog closed".
 * Observed in production: eight reopens of a Create-rule dialog that had never
 * closed, its 22 condition rows still intact each time.
 */

describe("the outline says when it stopped early", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  function fill(count: number) {
    document.body.innerHTML = Array.from(
      { length: count },
      (_, i) => `<button>Row ${i}</button>`,
    ).join("");
  }

  it("marks the cut and names the budget", () => {
    fill(30);

    const out = new DomSnapshotter().snapshot({ maxNodes: 10 });

    expect(out).toContain("outline truncated at the 10-element budget");
    expect(out).toMatch(/do NOT read a missing element as absent/i);
  });

  it("warns about what falls off last — a portaled dialog", () => {
    fill(30);

    expect(new DomSnapshotter().snapshot({ maxNodes: 10 })).toMatch(/open dialog/i);
  });

  it("stays quiet when the whole page fitted", () => {
    fill(4);

    const out = new DomSnapshotter().snapshot({ maxNodes: 10 });

    expect(out).not.toContain("truncated");
    expect(out.split("\n")).toHaveLength(4);
  });

  it("still reports an empty page as empty, not as truncated", () => {
    expect(new DomSnapshotter().snapshot({ maxNodes: 10 })).toBe("(no interactive elements found)");
  });
});
