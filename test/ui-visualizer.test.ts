import { afterEach, describe, expect, it, vi } from "vitest";
import { createAgentVisualizer } from "../src/ui/index.js";
import type { AgentVisualizer } from "../src/ui/index.js";
import { fakeRect, highlightBackdrop, highlightBox, stubRaf } from "./helpers.js";
import type { AgentStep, ToolCall } from "../src/types.js";

function call(name: string, id = "1"): ToolCall {
  return { id, name, arguments: {} };
}

const steps = {
  thinking: (): AgentStep => ({ type: "llm-request", messages: [], tools: [] }),
  response: (): AgentStep => ({ type: "llm-response", response: {} }),
  toolCall: (c: ToolCall): AgentStep => ({ type: "tool-call", call: c }),
  toolTarget: (c: ToolCall, element: HTMLElement, name = "Save changes"): AgentStep => ({
    type: "tool-target",
    call: c,
    target: { action: "click", ref: "e1", element, name },
  }),
  result: (c: ToolCall, isError = false): AgentStep => ({
    type: "tool-result",
    call: c,
    result: { content: [{ type: "text", text: "ok" }], ...(isError ? { isError: true } : {}) },
  }),
  denied: (c: ToolCall): AgentStep => ({ type: "tool-denied", call: c }),
  done: (): AgentStep => ({ type: "done", text: "done" }),
};

function chipsOf(viz: AgentVisualizer) {
  return [...viz.element.shadowRoot!.querySelectorAll(".chip")] as HTMLElement[];
}

afterEach(() => {
  document.body.innerHTML = "";
  document.querySelectorAll("[data-gui-agent-highlight]").forEach((n) => n.remove());
});

describe("createAgentVisualizer — chips", () => {
  it("creates a running chip with the default label on tool-call", () => {
    const viz = createAgentVisualizer();
    viz.onStep(steps.toolCall(call("click")));

    const [chip] = chipsOf(viz);
    expect(chip).toBeDefined();
    expect(chip!.dataset.status).toBe("running");
    expect(chip!.querySelector(".label")!.textContent).toBe("Clicking");
    expect(chip!.querySelector(".spinner")).not.toBeNull();
  });

  it("flips the chip to done / error / denied", () => {
    const viz = createAgentVisualizer();
    const c1 = call("click", "1");
    const c2 = call("fill", "2");
    const c3 = call("select_option", "3");
    for (const c of [c1, c2, c3]) viz.onStep(steps.toolCall(c));

    viz.onStep(steps.result(c1));
    viz.onStep(steps.result(c2, true));
    viz.onStep(steps.denied(c3));

    const [chip1, chip2, chip3] = chipsOf(viz);
    expect(chip1!.dataset.status).toBe("done");
    expect(chip1!.querySelector("svg")).not.toBeNull();
    expect(chip2!.dataset.status).toBe("error");
    expect(chip3!.dataset.status).toBe("denied");
  });

  it("shows Thinking… between llm-request and llm-response/tool-call/done", () => {
    const viz = createAgentVisualizer();
    const root = viz.element.shadowRoot!;

    viz.onStep(steps.thinking());
    expect(root.querySelector(".thinking")).not.toBeNull();
    viz.onStep(steps.response());
    expect(root.querySelector(".thinking")).toBeNull();

    viz.onStep(steps.thinking());
    viz.onStep(steps.toolCall(call("click")));
    expect(root.querySelector(".thinking")).toBeNull();

    viz.onStep(steps.thinking());
    viz.onStep(steps.done());
    expect(root.querySelector(".thinking")).toBeNull();
  });

  it("respects showThinking: false", () => {
    const viz = createAgentVisualizer({ showThinking: false });
    viz.onStep(steps.thinking());
    expect(viz.element.shadowRoot!.querySelector(".thinking")).toBeNull();
  });

  it("supports label overrides, function labels, and humanizes unknown tools", () => {
    const viz = createAgentVisualizer({
      labels: {
        click: "Pressing",
        fill: (c) => `Typing into ${c.arguments.ref}`,
      },
    });
    viz.onStep(steps.toolCall(call("click", "1")));
    viz.onStep(steps.toolCall({ id: "2", name: "fill", arguments: { ref: "e7" } }));
    viz.onStep(steps.toolCall(call("invite_member", "3")));

    const labels = chipsOf(viz).map((c) => c.querySelector(".label")!.textContent);
    expect(labels).toEqual(["Pressing", "Typing into e7", "Invite member"]);
  });

  it("enriches the chip from tool-target, wires the locate button, and glows the element", () => {
    const button = document.createElement("button");
    button.textContent = "Save changes";
    document.body.appendChild(button);
    button.getBoundingClientRect = () => fakeRect(10, 20, 100, 40);

    const viz = createAgentVisualizer();
    const c = call("click");
    viz.onStep(steps.toolCall(c));
    viz.onStep(steps.toolTarget(c, button));

    const [chip] = chipsOf(viz);
    expect(chip!.querySelector(".label")!.textContent).toBe("Clicking “Save changes”");
    const locate = chip!.querySelector<HTMLButtonElement>(".locate")!;
    expect(locate.hidden).toBe(false);
    expect(highlightBox().classList.contains("on")).toBe(true);

    locate.click();
    expect(highlightBox().classList.contains("on")).toBe(true);
  });

  it("ignores tool-target for an unknown call and locate on disconnected elements", () => {
    const button = document.createElement("button");
    document.body.appendChild(button);

    const viz = createAgentVisualizer({ highlight: false });
    const c = call("fill");
    viz.onStep(steps.toolCall(c));
    viz.onStep(steps.toolTarget(call("click", "other-id"), button));
    expect(chipsOf(viz)[0]!.querySelector<HTMLButtonElement>(".locate")!.hidden).toBe(true);

    viz.onStep(steps.toolTarget(c, button));
    const locate = chipsOf(viz)[0]!.querySelector<HTMLButtonElement>(".locate")!;
    expect(locate.hidden).toBe(false);

    button.remove();
    locate.click();
    expect(document.querySelector("[data-gui-agent-highlight]")).toBeNull();
  });

  it("applies theme custom properties to the host", () => {
    const viz = createAgentVisualizer({
      theme: { accent: "#f00", chipBg: "#111", chipBorder: "#222", chipText: "#333", font: "monospace" },
    });
    const style = viz.element.style;
    expect(style.getPropertyValue("--gua-accent")).toBe("#f00");
    expect(style.getPropertyValue("--gua-chip-bg")).toBe("#111");
    expect(style.getPropertyValue("--gua-chip-border")).toBe("#222");
    expect(style.getPropertyValue("--gua-chip-text")).toBe("#333");
    expect(style.getPropertyValue("--gua-font")).toBe("monospace");
  });

  it("appends to container, clears, and disposes", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);

    const viz = createAgentVisualizer({ container });
    expect(container.contains(viz.element)).toBe(true);

    viz.onStep(steps.toolCall(call("click")));
    viz.onStep(steps.thinking());
    viz.clear();
    expect(viz.element.shadowRoot!.querySelector(".chip")).toBeNull();
    expect(viz.element.shadowRoot!.querySelector(".thinking")).toBeNull();

    viz.dispose();
    expect(container.contains(viz.element)).toBe(false);
  });

  it("does not render chips when chips: false", () => {
    const viz = createAgentVisualizer({ chips: false });
    viz.onStep(steps.toolCall(call("click")));
    expect(chipsOf(viz)).toHaveLength(0);
  });
});

describe("createAgentVisualizer — backdrop", () => {
  it("enables the backdrop by default and keeps its own chip list sharp", () => {
    const target = document.createElement("button");
    document.body.appendChild(target);
    target.getBoundingClientRect = () => fakeRect(10, 20, 100, 40);

    const viz = createAgentVisualizer({ container: document.body });
    viz.element.getBoundingClientRect = () => fakeRect(900, 700, 300, 120);
    viz.highlight(target);

    const backdrop = highlightBackdrop()!;
    expect(backdrop.classList.contains("on")).toBe(true);
    expect(backdrop.style.getPropertyValue("mask-position")).toContain("900px 700px"); // chips hole
    viz.dispose();
  });

  it("can be disabled with backdrop: false", () => {
    const target = document.createElement("button");
    document.body.appendChild(target);
    target.getBoundingClientRect = () => fakeRect(0, 0, 10, 10);

    const viz = createAgentVisualizer({ backdrop: false });
    viz.highlight(target);
    expect(highlightBackdrop()).toBeNull();
    viz.dispose();
  });
});

describe("createAgentVisualizer — glow queue", () => {
  it("forwards glowDwell so rapid highlights tour each element", () => {
    stubRaf();
    vi.useFakeTimers();
    try {
      const a = document.createElement("input");
      const b = document.createElement("button");
      document.body.append(a, b);
      a.getBoundingClientRect = () => fakeRect(0, 0, 10, 10);
      b.getBoundingClientRect = () => fakeRect(200, 200, 10, 10);

      const viz = createAgentVisualizer({ glowDwell: 400 });
      viz.highlight(a);
      viz.highlight(b);

      const box = highlightBox();
      expect(box.style.left).toBe("-6px"); // still on the first target
      vi.advanceTimersByTime(432);
      expect(box.style.left).toBe("194px"); // then tours to the second
      viz.dispose();
    } finally {
      vi.useRealTimers();
      vi.unstubAllGlobals();
    }
  });
});

describe("createAgentVisualizer — bind", () => {
  it("composes the consumer's onStep with the visualizer", () => {
    const button = document.createElement("button");
    document.body.appendChild(button);
    button.getBoundingClientRect = () => fakeRect(0, 0, 10, 10);

    const viz = createAgentVisualizer();
    const userOnStep = vi.fn();
    const bound = viz.bind({ llm: async () => ({}), onStep: userOnStep });

    const c = call("click");
    const toolCall = steps.toolCall(c);
    bound.onStep!(toolCall);
    expect(userOnStep).toHaveBeenCalledWith(toolCall);
    expect(chipsOf(viz)).toHaveLength(1);

    const target = steps.toolTarget(c, button);
    bound.onStep!(target);
    expect(userOnStep).toHaveBeenCalledWith(target);
    expect(highlightBox().classList.contains("on")).toBe(true);
  });
});
