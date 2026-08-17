import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createCursor } from "../src/ui/cursor.js";
import { createAgentVisualizer } from "../src/ui/index.js";
import { cursorAt, cursorPoint, fakeRect, stubRaf } from "./helpers.js";
import type { AgentStep, ToolCall } from "../src/types.js";

/** jsdom's viewport — the pointer's seeded start is (width / 2, height). */
const START = { x: 512, y: 768 };

function targetAt(left: number, top: number, width: number, height: number): HTMLElement {
  const el = document.createElement("button");

  document.body.appendChild(el);
  el.getBoundingClientRect = () => fakeRect(left, top, width, height);

  return el;
}

function toolTarget(element: HTMLElement): AgentStep {
  const call: ToolCall = { id: "1", name: "click", arguments: {} };

  return { type: "tool-target", call, target: { action: "click", ref: "e1", element, name: "Save" } };
}

/** The ripple that pings when the pointer lands. */
function ripple(): HTMLElement | null {
  return cursorPoint()?.querySelector(".ripple") ?? null;
}

describe("createCursor", () => {
  beforeEach(() => {
    stubRaf();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    document.body.innerHTML = "";
    document.querySelectorAll("[data-gui-agent-cursor]").forEach((n) => n.remove());
  });

  it("travels to the target's center and ripples on arrival", () => {
    const cursor = createCursor();
    const el = targetAt(10, 20, 100, 40);

    cursor.moveTo(el);
    expect(cursorPoint()!.classList.contains("on")).toBe(true);

    vi.advanceTimersByTime(1000);
    expect(cursorAt().x).toBeCloseTo(60, 1);
    expect(cursorAt().y).toBeCloseTo(40, 1);
    expect(ripple()!.classList.contains("ping")).toBe(true);
    cursor.dispose();
  });

  it("eases in over several frames instead of teleporting", () => {
    const cursor = createCursor();
    const el = targetAt(10, 20, 100, 40);

    cursor.moveTo(el);
    vi.advanceTimersByTime(16);

    // One frame in: moved off the seeded start, nowhere near the target yet.
    const { x } = cursorAt();
    expect(x).toBeLessThan(START.x);
    expect(x).toBeGreaterThan(60);
    expect(ripple()!.classList.contains("ping")).toBe(false);
    cursor.dispose();
  });

  it("lands within its travel time even when frames are scarce, so the ripple plays", () => {
    // ~9fps — what an agent mid-run actually leaves of the frame budget. The
    // travel is timed, not stepped per frame, so it still completes; a
    // proportional per-frame ease would be hundreds of px short here and the
    // ripple, which only fires on arrival, would never play.
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => setTimeout(() => cb(0), 110));
    const cursor = createCursor();
    const el = targetAt(10, 20, 100, 40);

    cursor.moveTo(el);
    vi.advanceTimersByTime(500);

    expect(cursorAt()).toEqual({ x: 60, y: 40 });
    expect(ripple()!.classList.contains("ping")).toBe(true);
    cursor.dispose();
  });

  it("keeps following the target when the page scrolls under it", () => {
    const cursor = createCursor();
    const el = targetAt(10, 20, 100, 40);

    cursor.moveTo(el);
    vi.advanceTimersByTime(1000);
    el.getBoundingClientRect = () => fakeRect(10, 220, 100, 40);
    vi.advanceTimersByTime(1000);

    expect(cursorAt().y).toBeCloseTo(240, 1);
    cursor.dispose();
  });

  it("teleports in a single frame under prefers-reduced-motion", () => {
    vi.stubGlobal("matchMedia", () => ({ matches: true }));
    const cursor = createCursor();
    const el = targetAt(10, 20, 100, 40);

    cursor.moveTo(el);
    vi.advanceTimersByTime(16);

    expect(cursorAt()).toEqual({ x: 60, y: 40 });
    cursor.dispose();
  });

  it("dispose removes the overlay host", () => {
    const cursor = createCursor();

    cursor.moveTo(targetAt(10, 20, 100, 40));
    cursor.dispose();

    expect(document.querySelector("[data-gui-agent-cursor]")).toBeNull();
  });
});

describe("createAgentVisualizer — cursor", () => {
  beforeEach(() => {
    stubRaf();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    document.body.innerHTML = "";
    document.querySelectorAll("[data-gui-agent-cursor]").forEach((n) => n.remove());
    document.querySelectorAll("[data-gui-agent-highlight]").forEach((n) => n.remove());
  });

  it("stays out of the DOM entirely unless `cursor` is enabled", () => {
    const viz = createAgentVisualizer();

    viz.onStep(toolTarget(targetAt(10, 20, 100, 40)));
    vi.advanceTimersByTime(1000);

    expect(document.querySelector("[data-gui-agent-cursor]")).toBeNull();
    viz.dispose();
  });

  it("moves to the target of a tool-target step and hides when the tour ends", () => {
    const viz = createAgentVisualizer({ cursor: true, glowDuration: 500 });

    viz.onStep(toolTarget(targetAt(10, 20, 100, 40)));
    vi.advanceTimersByTime(700);
    expect(cursorAt().x).toBeCloseTo(60, 1);
    expect(cursorPoint()!.classList.contains("on")).toBe(true);

    // glowDuration then the 300ms fade: the ring tears down and takes the
    // pointer with it.
    vi.advanceTimersByTime(1000);
    expect(cursorPoint()!.classList.contains("on")).toBe(false);
    viz.dispose();
  });

  it("follows a manual highlight() call, so producer tools drive it too", () => {
    const viz = createAgentVisualizer({ cursor: true });

    viz.highlight(targetAt(200, 300, 40, 20));
    vi.advanceTimersByTime(1000);

    expect(cursorAt().x).toBeCloseTo(220, 1);
    expect(cursorAt().y).toBeCloseTo(310, 1);
    viz.dispose();
  });
});
