import { afterEach, describe, expect, it, vi } from "vitest";
import { ToolRegistry } from "../src/registry.js";

describe("ToolRegistry", () => {
  let registry: ToolRegistry;

  afterEach(() => registry?.clear());

  it("registers and lists a tool", () => {
    registry = new ToolRegistry();
    registry.register({
      name: "ping",
      description: "Ping",
      execute: () => "pong",
    });
    expect(registry.list().map((t) => t.name)).toEqual(["ping"]);
    expect(registry.get("ping")?.annotations.readOnlyHint).toBe(false);
  });

  it("defaults a missing input schema to an empty object schema", () => {
    registry = new ToolRegistry();
    registry.register({ name: "t", description: "d", execute: () => "" });
    expect(registry.get("t")?.inputSchema).toEqual({ type: "object", properties: {} });
  });

  it("rejects duplicate names", () => {
    registry = new ToolRegistry();
    registry.register({ name: "dup", description: "d", execute: () => "" });
    expect(() => registry.register({ name: "dup", description: "d", execute: () => "" })).toThrow(
      /already registered/,
    );
  });

  it("requires name and description", () => {
    registry = new ToolRegistry();
    expect(() => registry.register({ name: "", description: "d", execute: () => "" })).toThrow();
    expect(() => registry.register({ name: "x", description: "", execute: () => "" })).toThrow();
  });

  it("unregisters when its AbortSignal fires", () => {
    registry = new ToolRegistry();
    const controller = new AbortController();
    registry.register({ name: "abortable", description: "d", execute: () => "" }, { signal: controller.signal });
    expect(registry.has("abortable")).toBe(true);
    controller.abort();
    expect(registry.has("abortable")).toBe(false);
  });

  it("skips registration when the signal is already aborted", () => {
    registry = new ToolRegistry();
    const controller = new AbortController();
    controller.abort();
    registry.register({ name: "dead", description: "d", execute: () => "" }, { signal: controller.signal });
    expect(registry.has("dead")).toBe(false);
  });

  it("normalizes execute results and captures errors", async () => {
    registry = new ToolRegistry();
    registry.register({ name: "ok", description: "d", execute: () => ({ a: 1 }) });
    registry.register({
      name: "boom",
      description: "d",
      execute: () => {
        throw new Error("nope");
      },
    });

    const ok = await registry.get("ok")!.execute({});
    expect(ok.content[0]?.text).toContain('"a": 1');

    const boom = await registry.get("boom")!.execute({});
    expect(boom.isError).toBe(true);
    expect(boom.content[0]?.text).toContain("nope");
  });

  it("notifies subscribers on change", () => {
    registry = new ToolRegistry();
    const listener = vi.fn();
    registry.subscribe(listener);
    registry.register({ name: "n", description: "d", execute: () => "" });
    expect(listener).toHaveBeenCalledTimes(1);
    registry.unregister("n");
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
