import { beforeEach, describe, expect, it } from "vitest";
import { DomSnapshotter } from "../src/dom/snapshot.js";
import { createDomTools } from "../src/dom/tools.js";
import { refOf } from "./helpers.js";

function toolMap(snapshotter: DomSnapshotter) {
  const tools = createDomTools(snapshotter);
  return Object.fromEntries(tools.map((t) => [t.name, t]));
}

describe("click tool — real-browser event sequence", () => {
  beforeEach(() => {
    document.body.innerHTML = `<button id="menu">Columns</button>`;
  });

  it("dispatches pointerdown → mousedown → pointerup → mouseup → click, in order", async () => {
    const snapshotter = new DomSnapshotter();
    const tools = toolMap(snapshotter);
    await tools.read_page!.execute({});
    const el = document.getElementById("menu")!;
    const ref = refOf(snapshotter, el);

    const seen: string[] = [];
    for (const type of ["pointerdown", "mousedown", "pointerup", "mouseup", "click"]) {
      el.addEventListener(type, () => seen.push(type));
    }

    await tools.click!.execute({ ref });
    expect(seen).toEqual(["pointerdown", "mousedown", "pointerup", "mouseup", "click"]);
  });

  it("opens a Radix-style trigger that only listens to pointerdown", async () => {
    // Radix DropdownMenu/Select triggers open on pointerdown, not click — a
    // bare el.click() never opens them (the original bug: the agent looped on
    // a menu that never appeared).
    const snapshotter = new DomSnapshotter();
    const tools = toolMap(snapshotter);
    await tools.read_page!.execute({});
    const el = document.getElementById("menu")!;
    const ref = refOf(snapshotter, el);

    let opened = false;
    el.addEventListener("pointerdown", () => {
      opened = true;
    });

    await tools.click!.execute({ ref });
    expect(opened).toBe(true);
  });
});
