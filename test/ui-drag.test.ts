import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { dragAndDrop, VISIBLE_DRAG } from "../src/dom/drag.js";
import { createAgentVisualizer } from "../src/ui/index.js";
import { cursorAt, fakeRect, stubRaf } from "./helpers.js";
import type { AgentStep, ToolCall } from "../src/types.js";

function placed(tag: string, left: number, top: number, width: number, height: number): HTMLElement {
  const el = document.createElement(tag);

  document.body.appendChild(el);
  el.getBoundingClientRect = () => fakeRect(left, top, width, height);

  return el;
}

function dragStep(element: HTMLElement, to: HTMLElement): AgentStep {
  const call: ToolCall = { id: "1", name: "drag", arguments: {} };

  return { type: "tool-target", call, target: { action: "drag", ref: "e1", element, name: "Fix login", to } };
}

const ghost = () => document.querySelector<HTMLElement>("[data-gui-agent-ghost]");

describe("visualizer — drag", () => {
  beforeEach(() => {
    stubRaf();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    document.body.innerHTML = "";
  });

  it("lands on the card, carries a copy of it to the column, and lets go there", () => {
    const viz = createAgentVisualizer({ cursor: true, chips: false });
    const card = placed("button", 10, 20, 100, 40);
    const column = placed("section", 300, 20, 120, 400);

    card.textContent = "Fix login";
    viz.onStep(dragStep(card, column));
    vi.advanceTimersByTime(400);
    expect(cursorAt()).toEqual({ x: 60, y: 40 });
    expect(ghost()).toBeNull();

    vi.advanceTimersByTime(200); // the glow's dwell is over: off to the column
    expect(ghost()?.textContent).toBe("Fix login");
    expect(ghost()?.getAttribute("aria-hidden")).toBe("true");

    vi.advanceTimersByTime(500);
    expect(cursorAt()).toEqual({ x: 360, y: 220 });
    expect(ghost()).toBeNull();
    viz.dispose();
  });

  it("drops on the part of a tall column that is on screen, never below the fold", () => {
    const viz = createAgentVisualizer({ cursor: true, chips: false });
    const card = placed("button", 10, 20, 100, 40);
    const column = placed("section", 300, 600, 120, 2000); // jsdom's viewport is 1024 x 768

    viz.drag(card, column);
    vi.advanceTimersByTime(1200);

    expect(cursorAt()).toEqual({ x: 360, y: 684 });
    viz.dispose();
  });

  it("drops when the pointer lets the copy go, even behind a busy tour", async () => {
    const viz = createAgentVisualizer({ cursor: true, chips: false });
    const busy = placed("button", 600, 20, 100, 40);
    const card = placed("button", 10, 20, 100, 40);
    const column = placed("section", 300, 20, 120, 400);
    let dropped = false;

    card.draggable = true;
    column.addEventListener("dragover", (e) => e.preventDefault());
    column.addEventListener("drop", (e) => { e.preventDefault(); dropped = true; });
    viz.highlight(busy); // the tour is busy with something else first
    viz.drag(card, column);
    const drag = dragAndDrop(card, column, VISIBLE_DRAG);

    await vi.advanceTimersByTimeAsync(900); // an empty tour would have dropped by now
    expect(dropped).toBe(false);
    await vi.advanceTimersByTimeAsync(1000);
    expect(dropped).toBe(true);
    expect(ghost()).toBeNull();
    expect((await drag).dropped).toBe(true);
    viz.dispose();
  });

  it("does not stall when a short glow dwell sends the pointer on before it lands", async () => {
    const viz = createAgentVisualizer({ cursor: true, chips: false, glowDwell: 200 });
    const card = placed("button", 10, 20, 100, 40);
    const column = placed("section", 300, 20, 120, 400);
    let dropped = false;

    column.addEventListener("dragover", (e) => e.preventDefault());
    column.addEventListener("drop", (e) => { e.preventDefault(); dropped = true; });
    viz.drag(card, column);
    const drag = dragAndDrop(card, column, VISIBLE_DRAG);

    await vi.advanceTimersByTimeAsync(1000);
    expect(dropped).toBe(true);
    await drag;
    viz.dispose();
  });

  it("viz.drag shows the same drag for a producer tool", () => {
    const viz = createAgentVisualizer({ cursor: true, chips: false });
    const card = placed("button", 10, 20, 100, 40);
    const column = placed("section", 300, 20, 120, 400);

    viz.drag(card, column);
    vi.advanceTimersByTime(600);

    expect(ghost()).not.toBeNull();
    viz.dispose();
    expect(ghost()).toBeNull();
  });
});

describe("drag ghost", () => {
  beforeEach(() => {
    stubRaf();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    document.body.innerHTML = "";
  });

  it("leaves form fields, focus and the pointer alone", () => {
    const viz = createAgentVisualizer({ cursor: true, chips: false });
    const card = placed("div", 10, 20, 100, 40);
    const column = placed("section", 300, 20, 120, 400);

    document.body.insertAdjacentHTML("beforeend", `<form id="f"></form>`);
    card.innerHTML = `<input name="title" form="f" value="hello" tabindex="0"><span style="pointer-events:auto">x</span>`;
    viz.drag(card, column);
    vi.advanceTimersByTime(600);

    const copy = ghost()!;
    expect(new FormData(document.getElementById("f") as HTMLFormElement).getAll("title")).toEqual(["hello"]);
    expect(copy.hasAttribute("inert")).toBe(true);
    expect(copy.querySelector("[name], [form], [tabindex]")).toBeNull();
    expect((copy.querySelector("span") as HTMLElement).style.pointerEvents).toBe("none");
    viz.dispose();
  });

  it("shows fields as they are on screen, not as their markup started", () => {
    const viz = createAgentVisualizer({ cursor: true, chips: false });
    const card = placed("div", 10, 20, 100, 40);
    const column = placed("section", 300, 20, 120, 400);

    card.innerHTML = `<input value="old"><input type="checkbox"><select><option>a</option><option>b</option></select>`;
    (card.children[0] as HTMLInputElement).value = "edited";
    (card.children[1] as HTMLInputElement).checked = true;
    (card.children[2] as HTMLSelectElement).value = "b";
    viz.drag(card, column);
    vi.advanceTimersByTime(600);

    const [text, box, select] = Array.from(ghost()!.children) as [HTMLInputElement, HTMLInputElement, HTMLSelectElement];
    expect([text.value, box.checked, select.value]).toEqual(["edited", true, "b"]);
    viz.dispose();
  });

  it("carries chained drags (a to b, then b to c) each in turn", () => {
    const viz = createAgentVisualizer({ cursor: true, chips: false });
    const a = placed("button", 10, 20, 100, 40);
    const b = placed("button", 300, 20, 100, 40);
    const c = placed("button", 600, 20, 100, 40);
    const carried: (string | undefined)[] = [];

    a.textContent = "A";
    b.textContent = "B";
    viz.drag(a, b);
    viz.drag(b, c);
    for (let t = 0; t < 4000; t += 50) {
      vi.advanceTimersByTime(50);
      const text = ghost()?.textContent;
      if (text && carried.at(-1) !== text) carried.push(text);
    }

    expect(carried).toEqual(["A", "B"]);
    viz.dispose();
  });

  it("carries each of two drags asked for back to back, in order", () => {
    const viz = createAgentVisualizer({ cursor: true, chips: false });
    const first = placed("button", 10, 20, 100, 40);
    const second = placed("button", 10, 120, 100, 40);
    const column = placed("section", 300, 20, 120, 400);
    const carried: (string | undefined)[] = [];

    first.textContent = "First";
    second.textContent = "Second";
    viz.drag(first, column);
    viz.drag(second, column);
    for (let t = 0; t < 4000; t += 50) {
      vi.advanceTimersByTime(50);
      const text = ghost()?.textContent;
      if (text && carried.at(-1) !== text) carried.push(text);
    }

    expect(carried).toEqual(["First", "Second"]);
    viz.dispose();
  });

  it("is an inert look-alike: custom elements and frames do not come alive, ids and handlers are dropped", () => {
    const connected = vi.fn();
    customElements.define("live-badge", class extends HTMLElement { connectedCallback() { connected(); } });
    const viz = createAgentVisualizer({ cursor: true, chips: false });
    const card = placed("div", 10, 20, 100, 40);
    const column = placed("section", 300, 20, 120, 400);

    card.innerHTML = `<span id="t" onclick="alert(1)">Fix login</span><live-badge></live-badge><iframe src="about:blank"></iframe>`;
    connected.mockClear();
    viz.drag(card, column);
    vi.advanceTimersByTime(600);

    expect(ghost()?.textContent).toBe("Fix login");
    expect(ghost()?.querySelector("live-badge, iframe, [id], [onclick]")).toBeNull();
    expect(connected).not.toHaveBeenCalled();
    viz.dispose();
  });
});

describe("VISIBLE_DRAG with no tour", () => {
  beforeEach(() => {
    stubRaf();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    document.body.innerHTML = "";
  });

  it("keeps the empty-tour pace when the pointer left over from an earlier tour is idle", async () => {
    const viz = createAgentVisualizer({ cursor: true, chips: false });
    const other = placed("button", 600, 20, 100, 40);
    const card = placed("button", 10, 20, 100, 40);
    const column = placed("section", 300, 20, 120, 400);
    let dropped = false;

    viz.highlight(other);
    await vi.advanceTimersByTimeAsync(3000); // that tour is over; the pointer's host stays
    column.addEventListener("dragover", (e) => e.preventDefault());
    column.addEventListener("drop", (e) => { e.preventDefault(); dropped = true; });
    const drag = dragAndDrop(card, column, VISIBLE_DRAG);

    await vi.advanceTimersByTimeAsync(900);
    expect(dropped).toBe(true);
    await drag;
    viz.dispose();
  });
});
