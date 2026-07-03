import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHighlighter } from "../src/ui/highlight.js";
import { HIGHLIGHT_CSS } from "../src/ui/styles.js";
import { fakeRect, highlightBackdrop, highlightBox, stubRaf } from "./helpers.js";

describe("createHighlighter", () => {
  beforeEach(() => {
    stubRaf();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    document.body.innerHTML = "";
  });

  it("shows a ring positioned around the target rect (with padding)", () => {
    const el = document.createElement("button");
    document.body.appendChild(el);
    el.getBoundingClientRect = () => fakeRect(10, 20, 100, 40);

    const highlighter = createHighlighter();
    highlighter.highlight(el);

    const box = highlightBox();
    expect(box.classList.contains("on")).toBe(true);
    expect(box.style.left).toBe("4px");
    expect(box.style.top).toBe("14px");
    expect(box.style.width).toBe("112px");
    expect(box.style.height).toBe("52px");
    highlighter.dispose();
  });

  it("tracks the target while visible and fades out after glowDuration", () => {
    const el = document.createElement("button");
    document.body.appendChild(el);
    let rect = fakeRect(10, 20, 100, 40);
    el.getBoundingClientRect = () => rect;

    const highlighter = createHighlighter({ glowDuration: 500 });
    highlighter.highlight(el);

    rect = fakeRect(50, 60, 100, 40);
    vi.advanceTimersByTime(48);
    expect(highlightBox().style.left).toBe("44px");
    expect(highlightBox().style.top).toBe("54px");

    vi.advanceTimersByTime(500);
    expect(highlightBox().classList.contains("fading")).toBe(true);
    vi.advanceTimersByTime(300);
    expect(highlightBox().classList.contains("on")).toBe(false);
    highlighter.dispose();
  });

  it("queues rapid highlights so each target stays visible for glowDwell", () => {
    // Regression: agent actions run in milliseconds — three highlights in a row
    // (email field → role select → send button) must tour each element, not
    // jump straight to the last one.
    const a = document.createElement("input");
    const b = document.createElement("select");
    const c = document.createElement("button");
    document.body.append(a, b, c);
    a.getBoundingClientRect = () => fakeRect(0, 0, 10, 10);
    b.getBoundingClientRect = () => fakeRect(100, 100, 10, 10);
    c.getBoundingClientRect = () => fakeRect(200, 200, 10, 10);

    const highlighter = createHighlighter({ glowDwell: 600, glowDuration: 1000 });
    highlighter.highlight(a);
    highlighter.highlight(b);
    highlighter.highlight(c);

    // First target shown immediately and held for the dwell time.
    expect(highlightBox().style.left).toBe("-6px");
    vi.advanceTimersByTime(560);
    expect(highlightBox().style.left).toBe("-6px");

    // Then the second…
    vi.advanceTimersByTime(48);
    expect(highlightBox().style.left).toBe("94px");
    vi.advanceTimersByTime(600);

    // …then the last, which holds for the full glowDuration before fading.
    expect(highlightBox().style.left).toBe("194px");
    vi.advanceTimersByTime(960);
    expect(highlightBox().classList.contains("fading")).toBe(false);
    vi.advanceTimersByTime(48);
    expect(highlightBox().classList.contains("fading")).toBe(true);
    highlighter.dispose();
  });

  it("re-highlight after the dwell elapsed retargets immediately and resets the fade timer", () => {
    const a = document.createElement("button");
    const b = document.createElement("button");
    document.body.append(a, b);
    a.getBoundingClientRect = () => fakeRect(0, 0, 10, 10);
    b.getBoundingClientRect = () => fakeRect(200, 200, 10, 10);

    const highlighter = createHighlighter({ glowDwell: 300, glowDuration: 500 });
    highlighter.highlight(a);
    vi.advanceTimersByTime(400); // > dwell: the ring owes `a` nothing more
    highlighter.highlight(b);
    vi.advanceTimersByTime(32);

    const box = highlightBox();
    expect(box.classList.contains("on")).toBe(true);
    expect(box.classList.contains("fading")).toBe(false);
    expect(box.style.left).toBe("194px");

    vi.advanceTimersByTime(500);
    expect(box.classList.contains("fading")).toBe(true);
    highlighter.dispose();
  });

  it("skips queued targets that got disconnected before their turn", () => {
    const a = document.createElement("button");
    const b = document.createElement("button");
    const c = document.createElement("button");
    document.body.append(a, b, c);
    a.getBoundingClientRect = () => fakeRect(0, 0, 10, 10);
    b.getBoundingClientRect = () => fakeRect(100, 100, 10, 10);
    c.getBoundingClientRect = () => fakeRect(200, 200, 10, 10);

    const highlighter = createHighlighter({ glowDwell: 300, glowDuration: 500 });
    highlighter.highlight(a);
    highlighter.highlight(b);
    highlighter.highlight(c);
    b.remove();

    vi.advanceTimersByTime(332);
    expect(highlightBox().style.left).toBe("194px"); // b was skipped
    highlighter.dispose();
  });

  it("hides when the target is removed from the document", () => {
    const el = document.createElement("button");
    document.body.appendChild(el);
    el.getBoundingClientRect = () => fakeRect(0, 0, 10, 10);

    const highlighter = createHighlighter({ glowDuration: 5000 });
    highlighter.highlight(el);
    el.remove();
    vi.advanceTimersByTime(48);
    expect(highlightBox().classList.contains("on")).toBe(false);
    highlighter.dispose();
  });

  it("shows a blurred backdrop veil with holes for the target and excluded elements", () => {
    const chat = document.createElement("aside");
    chat.id = "chat-panel";
    const toolbar = document.createElement("nav");
    const target = document.createElement("button");
    document.body.append(chat, toolbar, target);
    chat.getBoundingClientRect = () => fakeRect(1000, 0, 400, 900);
    toolbar.getBoundingClientRect = () => fakeRect(0, 500, 50, 50);
    target.getBoundingClientRect = () => fakeRect(10, 20, 100, 40);

    const highlighter = createHighlighter({
      glowDuration: 500,
      backdrop: { exclude: ["chat-panel", toolbar] },
    });
    highlighter.highlight(target);

    const backdrop = highlightBackdrop()!;
    expect(backdrop.classList.contains("on")).toBe(true);

    vi.advanceTimersByTime(32); // let the tracking loop write the mask
    const positions = backdrop.style.getPropertyValue("mask-position");
    const sizes = backdrop.style.getPropertyValue("mask-size");
    expect(positions).toContain("1000px 0px"); // chat hole
    expect(sizes).toContain("400px 900px");
    expect(positions).toContain("0px 500px"); // toolbar hole
    expect(positions).toContain("4px 14px"); // target hole (rect - ring padding)
    expect(sizes).toContain("112px 52px");
    expect(backdrop.style.getPropertyValue("mask-composite")).toContain("exclude");

    // Fades and hides together with the ring.
    vi.advanceTimersByTime(500);
    expect(backdrop.classList.contains("fading")).toBe(true);
    vi.advanceTimersByTime(300);
    expect(backdrop.classList.contains("on")).toBe(false);
    highlighter.dispose();
  });

  it("skips the target hole when the target sits inside an excluded region", () => {
    const chat = document.createElement("aside");
    const inside = document.createElement("button");
    chat.appendChild(inside);
    document.body.append(chat);
    chat.getBoundingClientRect = () => fakeRect(1000, 0, 400, 900);
    inside.getBoundingClientRect = () => fakeRect(1100, 100, 80, 30);

    const highlighter = createHighlighter({ backdrop: { exclude: [chat] } });
    highlighter.highlight(inside);
    vi.advanceTimersByTime(32);

    const positions = highlightBackdrop()!.style.getPropertyValue("mask-position");
    expect(positions).toContain("1000px 0px");
    expect(positions).not.toContain("1094px 94px"); // no double-XOR hole inside the chat
    highlighter.dispose();
  });

  it("supports backdrop: false and a custom blur radius", () => {
    const el = document.createElement("button");
    document.body.appendChild(el);
    el.getBoundingClientRect = () => fakeRect(0, 0, 10, 10);

    const off = createHighlighter({ backdrop: false });
    off.highlight(el);
    expect(highlightBackdrop()).toBeNull();
    off.dispose();

    const custom = createHighlighter({ backdrop: { blur: 8 } });
    custom.highlight(el);
    const host = document.querySelector<HTMLElement>("[data-gui-agent-highlight]")!;
    expect(host.style.getPropertyValue("--gua-backdrop-blur")).toBe("8px");
    custom.dispose();
  });

  it("keeps the element's content readable: both glow layers are masked to a border band", () => {
    // Regression: the blurred .glow layer used to paint the full gradient over
    // the element, washing out its content. Every gradient layer must carve
    // out the content box (mask-composite: exclude) so only the edges glow.
    const gradientRule = HIGHLIGHT_CSS.match(/\.glow, \.ring \{[^}]*\}/)?.[0];
    expect(gradientRule).toBeDefined();
    expect(gradientRule).toContain("content-box");
    expect(gradientRule).toContain("mask-composite: exclude");
  });

  it("ignores disconnected elements and applies custom glow colors", () => {
    const detached = document.createElement("button");
    const highlighter = createHighlighter({ glowColors: ["red", "green", "blue"] });
    highlighter.highlight(detached);
    expect(document.querySelector("[data-gui-agent-highlight]")).toBeNull();

    const el = document.createElement("button");
    document.body.appendChild(el);
    el.getBoundingClientRect = () => fakeRect(0, 0, 10, 10);
    highlighter.highlight(el);

    const host = document.querySelector<HTMLElement>("[data-gui-agent-highlight]")!;
    expect(host.style.getPropertyValue("--gua-glow-1")).toBe("red");
    expect(host.style.getPropertyValue("--gua-glow-2")).toBe("green");
    expect(host.style.getPropertyValue("--gua-glow-3")).toBe("blue");

    highlighter.dispose();
    expect(document.querySelector("[data-gui-agent-highlight]")).toBeNull();
  });
});
