import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerDomTools } from "../src/dom/register.js";
import { ToolRegistry } from "../src/registry.js";
import { envelopeToText } from "../src/result.js";
import type { DomTargetEvent } from "../src/types.js";

const DOM_TOOLS = ["read_page", "click", "fill", "select_option", "wait_for_text"];

describe("registerDomTools", () => {
  let registry: ToolRegistry;

  beforeEach(() => {
    registry = new ToolRegistry();
    document.body.innerHTML = `
      <button id="save">Save changes</button>
      <input id="name" aria-label="Name" />
    `;
  });

  afterEach(() => {
    registry.clear();
    document.body.innerHTML = "";
  });

  it("registers the five DOM tools on the given registry", () => {
    registerDomTools({ registry, skipModelContext: true });
    expect(registry.list().map((t) => t.name)).toEqual(DOM_TOOLS);
  });

  it("adds upload_file when resolveAttachment is provided", () => {
    registerDomTools({ registry, skipModelContext: true, resolveAttachment: async () => null });
    expect(registry.list().map((t) => t.name)).toEqual([...DOM_TOOLS, "upload_file"]);
  });

  it("unregisters everything when the signal aborts (and via the returned dispose)", () => {
    const controller = new AbortController();
    registerDomTools({ registry, skipModelContext: true, signal: controller.signal });
    expect(registry.list()).toHaveLength(5);
    controller.abort();
    expect(registry.list()).toHaveLength(0);

    const dispose = registerDomTools({ registry, skipModelContext: true });
    expect(registry.list()).toHaveLength(5);
    dispose();
    expect(registry.list()).toHaveLength(0);
  });

  it("replaces stale registrations instead of throwing (double-mount safety)", () => {
    registerDomTools({ registry, skipModelContext: true });
    expect(() => registerDomTools({ registry, skipModelContext: true })).not.toThrow();
    expect(registry.list()).toHaveLength(5);
  });

  it("a stale ref error carries a fresh snapshot so the model can re-orient", async () => {
    registerDomTools({ registry, skipModelContext: true });
    // Snapshot the current page to mint refs, then swap the DOM so they go stale.
    await registry.get("read_page")!.execute({});
    document.body.innerHTML = `<button id="new">Brand new</button>`;

    const result = await registry.get("click")!.execute({ ref: "e999" });
    expect(result.isError).toBe(true);
    const text = envelopeToText(result);
    expect(text).toContain('No element for ref "e999"');
    // The error includes the CURRENT elements (fresh refs), not just a nudge.
    expect(text).toMatch(/\[e\d+\][^\n]*Brand new/);
  });

  it("keeps refs stable across read_page calls and resolves them for actions", async () => {
    const onTarget = vi.fn<(event: DomTargetEvent) => void>();
    registerDomTools({ registry, skipModelContext: true, onTarget });

    const first = envelopeToText(await registry.get("read_page")!.execute({}));
    const second = envelopeToText(await registry.get("read_page")!.execute({}));
    const ref = /\[(e\d+)\] button "Save changes"/.exec(first)?.[1];
    expect(ref).toBeTruthy();
    expect(second).toContain(`[${ref}] button`);

    const result = await registry.get("click")!.execute({ ref });
    expect(result.isError).toBeUndefined();
    expect(onTarget).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "click",
        ref,
        element: document.getElementById("save"),
        name: "Save changes",
      }),
    );
  });
});
