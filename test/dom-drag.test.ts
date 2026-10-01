import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { dragAndDrop } from "../src/dom/drag.js";
import { DomSnapshotter } from "../src/dom/snapshot.js";
import { createDomTools } from "../src/dom/tools.js";
import type { DomTargetEvent } from "../src/types.js";
import { refOf } from "./helpers.js";

/* A two-column board wired the HTML5 way: a card says what it carries on
   dragstart, a column accepts by cancelling dragover and moves it on drop. */
function board({ accept = true } = {}) {
  const seen: string[] = [];

  document.body.innerHTML = `
    <section data-column="todo"><button draggable="true" id="card">Fix login</button></section>
    <section data-column="done" id="done" aria-label="Done" aria-dropeffect="move"></section>`;
  const card = document.getElementById("card")!;
  const done = document.getElementById("done")!;

  for (const type of ["dragstart", "dragend"]) card.addEventListener(type, () => seen.push(type));
  card.addEventListener("dragstart", (e) => (e as DragEvent).dataTransfer!.setData("text/plain", card.id));
  done.addEventListener("dragenter", () => seen.push("dragenter"));
  done.addEventListener("dragleave", () => seen.push("dragleave"));
  done.addEventListener("dragover", (e) => {
    seen.push("dragover");
    if (accept) e.preventDefault();
  });
  done.addEventListener("drop", (e) => {
    seen.push("drop");
    done.appendChild(document.getElementById((e as DragEvent).dataTransfer!.getData("text/plain"))!);
  });

  return { card, done, seen };
}

describe("dragAndDrop", () => {
  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = "";
  });

  it("fires the page's drag and drop sequence with one shared DataTransfer", async () => {
    const { card, done, seen } = board();

    const result = await dragAndDrop(card, done);

    expect(seen).toEqual(["dragstart", "dragenter", "dragover", "drop", "dragend"]);
    expect(card.parentElement).toBe(done);
    expect(result).toEqual({ dropped: true, refused: false });
  });

  it("does not drop on a target that does not accept the drag", async () => {
    const { card, done, seen } = board({ accept: false });

    const result = await dragAndDrop(card, done);

    expect(seen).toEqual(["dragstart", "dragenter", "dragover", "dragleave", "dragend"]);
    expect(card.parentElement).not.toBe(done);
    expect(result.dropped).toBe(false);
  });

  it("stops when the source cancels dragstart", async () => {
    const { card, done, seen } = board();

    card.addEventListener("dragstart", (e) => e.preventDefault());
    const result = await dragAndDrop(card, done);

    expect(seen).toEqual(["dragstart"]);
    expect(result).toEqual({ dropped: false, refused: true });
  });

  it("holds before picking up and while carrying, so a pointer can be watched doing it", async () => {
    vi.useFakeTimers();
    const { card, done, seen } = board();

    const pending = dragAndDrop(card, done, { grabMs: 100, moveMs: 200 });
    await vi.advanceTimersByTimeAsync(99);
    expect(seen).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    expect(seen).toEqual(["dragstart"]);
    await vi.advanceTimersByTimeAsync(200);
    await pending;
    expect(seen.at(-1)).toBe("dragend");
  });
});

describe("drag tool", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = "";
  });

  async function dragTool(onTarget?: (event: DomTargetEvent) => void) {
    const snapshotter = new DomSnapshotter();
    const tool = createDomTools(snapshotter, { onTarget }).find((t) => t.name === "drag")!;

    snapshotter.snapshot();

    return { snapshotter, tool };
  }

  it("drops a card on another column and reports both ends to onTarget", async () => {
    const { card, done } = board();
    const targets: DomTargetEvent[] = [];
    const { snapshotter, tool } = await dragTool((event) => targets.push(event));

    const run = tool.execute({ ref: refOf(snapshotter, card), to: refOf(snapshotter, done) });
    await vi.runAllTimersAsync();

    expect(await run).toMatch(/^Dragged e\d+ onto e\d+\./);
    expect(card.parentElement).toBe(done);
    expect(targets).toEqual([expect.objectContaining({ action: "drag", element: card, to: done })]);
  });

  it("fails when the target refuses the card", async () => {
    const { card, done } = board({ accept: false });
    const { snapshotter, tool } = await dragTool();

    const run = Promise.resolve(tool.execute({ ref: refOf(snapshotter, card), to: refOf(snapshotter, done) }));
    const settled = run.catch((error: Error) => error.message);
    await vi.runAllTimersAsync();

    expect(await settled).toMatch(/doesn't accept/);
  });
});

describe("snapshot of a board", () => {
  it("lists draggable cards and the columns they can be dropped on", () => {
    const snapshotter = new DomSnapshotter();

    board();
    document.getElementById("card")!.outerHTML = `<div draggable="true" id="card">Fix login</div>`;

    expect(snapshotter.snapshot()).toMatch(/\[e\d+\] control "Fix login" draggable/);
    expect(snapshotter.snapshot()).toMatch(/\[e\d+\] droptarget "Done"/);
  });
});
