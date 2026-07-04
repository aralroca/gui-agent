import { afterEach, describe, expect, it, vi } from "vitest";
import { ToolRegistry } from "../src/registry.js";

describe("ToolRegistry.listToolSpecs", () => {
  let registry: ToolRegistry;

  afterEach(() => registry?.clear());

  it("returns JSON-safe specs including annotations", () => {
    registry = new ToolRegistry();
    registry.register({
      name: "search",
      description: "Search things",
      inputSchema: { type: "object", properties: { q: { type: "string" } }, required: ["q"] },
      annotations: { readOnlyHint: true },
      execute: () => "",
    });

    const specs = registry.listToolSpecs();
    expect(specs).toEqual([
      {
        name: "search",
        description: "Search things",
        inputSchema: { type: "object", properties: { q: { type: "string" } }, required: ["q"] },
        annotations: { readOnlyHint: true },
      },
    ]);
    // JSON-safe: no functions leak through.
    expect(JSON.parse(JSON.stringify(specs))).toEqual(specs);
  });

  it("defaults a missing schema to an empty object schema", () => {
    registry = new ToolRegistry();
    registry.register({ name: "t", description: "d", execute: () => "" });
    expect(registry.listToolSpecs()[0]?.inputSchema).toEqual({ type: "object", properties: {} });
  });
});

describe("RegisterOptions.replace", () => {
  let registry: ToolRegistry;

  afterEach(() => registry?.clear());

  it("replaces an existing tool with the same name instead of throwing", async () => {
    registry = new ToolRegistry();
    const first = vi.fn(() => "first");
    const second = vi.fn(() => "second");
    registry.register({ name: "dup", description: "d", execute: first });
    registry.register({ name: "dup", description: "d2", execute: second }, { replace: true });

    expect(registry.list()).toHaveLength(1);
    expect(registry.get("dup")?.description).toBe("d2");
    const result = await registry.get("dup")!.execute({});
    expect(second).toHaveBeenCalled();
    expect(first).not.toHaveBeenCalled();
    expect(result.content[0]?.text).toBe("second");
  });

  it("still throws on duplicates without replace", () => {
    registry = new ToolRegistry();
    registry.register({ name: "dup", description: "d", execute: () => "" });
    expect(() => registry.register({ name: "dup", description: "d", execute: () => "" })).toThrow(
      /already registered/,
    );
  });
});
