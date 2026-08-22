import { describe, expect, it } from "vitest";

import { registry } from "../src/registry";

/** Vitest runs in Node (jsdom env), but this package's tsconfig ships no Node
 * types — reach `process` through globalThis with the two methods we use. */
const nodeProcess = (globalThis as Record<string, unknown>).process as {
  on(event: "unhandledRejection", listener: (reason: unknown) => void): void;
  off(event: "unhandledRejection", listener: (reason: unknown) => void): void;
};

describe("registry mirror abort", () => {
  it("does not surface an unhandled rejection when the mirror registration is aborted", async () => {
    const rejections: unknown[] = [];
    const onRejection = (reason: unknown) => rejections.push(reason);

    nodeProcess.on("unhandledRejection", onRejection);
    Object.defineProperty(navigator, "modelContext", {
      configurable: true,
      value: {
        registerTool: (_tool: unknown, options?: { signal?: AbortSignal }) =>
          new Promise((_resolve, reject) => {
            options?.signal?.addEventListener("abort", () =>
              reject(new DOMException("signal is aborted without reason", "AbortError")),
            );
          }),
      },
    });

    const controller = new AbortController();

    registry.register(
      {
        name: "abort_probe",
        description: "probe",
        inputSchema: { type: "object", properties: {} },
        execute: async () => ({ ok: true }),
      },
      { signal: controller.signal, replace: true },
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    controller.abort();
    await new Promise((resolve) => setTimeout(resolve, 10));
    nodeProcess.off("unhandledRejection", onRejection);

    expect(rejections).toEqual([]);
  });
});
