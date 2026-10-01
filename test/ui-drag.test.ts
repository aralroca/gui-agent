import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
