import { vi } from "vitest";
import type { DomSnapshotter } from "../src/dom/snapshot.js";
import type { Llm, LlmResponse } from "../src/types.js";

/** A deterministic LLM that replays a fixed script of responses. */
export function scriptedLlm(script: LlmResponse[]): { llm: Llm } {
  let i = 0;
  const llm: Llm = async () => script[i++] ?? { text: "(no more script)" };
  return { llm };
}

/** A DOMRect-shaped literal for mocking `getBoundingClientRect`. */
export function fakeRect(left: number, top: number, width: number, height: number): DOMRect {
  return { left, top, width, height, right: left + width, bottom: top + height, x: left, y: top } as DOMRect;
}

/** Stub rAF with a 16ms timeout so vitest's fake timers can drive the highlighter loop. */
export function stubRaf(): void {
  vi.stubGlobal(
    "requestAnimationFrame",
    (cb: FrameRequestCallback) => setTimeout(() => cb(0), 16) as unknown as number,
  );
}

/** Find the stable snapshot ref for a live element. */
export function refOf(snapshotter: DomSnapshotter, el: Element): string {
  for (const match of snapshotter.snapshot().matchAll(/\[(e\d+)\]/g)) {
    if (snapshotter.resolve(match[1]!) === el) return match[1]!;
  }
  throw new Error("ref not found for element");
}

/**
 * Stub `DataTransfer` (jsdom doesn't implement its constructor) with a minimal
 * fake exposing `items.add` and an array-like `files` FileList.
 */
export function stubDataTransfer(): void {
  class FakeDataTransfer {
    private stored: File[] = [];
    items = { add: (file: File) => void this.stored.push(file) };
    get files(): FileList {
      const files = this.stored;
      const list: Record<number | string, unknown> = {
        length: files.length,
        item: (i: number) => files[i] ?? null,
      };
      files.forEach((file, i) => (list[i] = file));
      return list as unknown as FileList;
    }
  }
  vi.stubGlobal("DataTransfer", FakeDataTransfer);
}

/** The glow ring wrapper inside the highlight overlay's shadow root. */
export function highlightBox(): HTMLElement {
  return document.querySelector("[data-gui-agent-highlight]")!.shadowRoot!.querySelector(".box")!;
}

/** The backdrop veil inside the highlight overlay's shadow root (null when disabled). */
export function highlightBackdrop(): HTMLElement | null {
  return document.querySelector("[data-gui-agent-highlight]")!.shadowRoot!.querySelector(".backdrop");
}
