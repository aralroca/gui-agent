/**
 * WebMCP polyfill bootstrap.
 *
 * Guarantees `document.modelContext` exists by installing
 * `@mcp-b/webmcp-polyfill` when the browser has no native implementation. This
 * is what lets gui-agent ship as a plain npm import with **no script injection**
 * — importing the package is enough.
 *
 * The spec moved the `modelContext` getter from `Navigator` to `Document`
 * (webmachinelearning/webmcp#184; Chrome 150 deprecates `navigator.modelContext`),
 * so `document.modelContext` is the canonical surface we target.
 */
import { initializeWebMCPPolyfill } from "@mcp-b/webmcp-polyfill";

/** The strict WebMCP core surface we rely on. */
export interface ModelContextLike {
  registerTool: (tool: ModelContextTool, options?: { signal?: AbortSignal }) => Promise<void> | void;
  getTools?: () => Promise<unknown[]>;
  executeTool?: (tool: unknown, inputArgsJson: string, options?: unknown) => Promise<unknown>;
}

export interface ModelContextTool {
  name: string;
  title?: string;
  description: string;
  inputSchema?: Record<string, unknown>;
  annotations?: Record<string, unknown>;
  execute: (input: Record<string, unknown>) => unknown | Promise<unknown>;
}

let initialized = false;

/**
 * Ensure the WebMCP runtime is installed and return the active `modelContext`.
 * No-op on the server; safe to call repeatedly. Returns `undefined` when there
 * is no document (e.g. during SSR).
 */
export function ensureModelContext(): ModelContextLike | undefined {
  if (typeof document === "undefined") return undefined;

  if (!initialized) {
    try {
      // Non-destructive: skipped automatically if native support already exists.
      initializeWebMCPPolyfill({ installTestingShim: "if-missing" });
    } catch {
      // If the polyfill cannot install (exotic environment), the local registry
      // still works — mirroring onto modelContext is best-effort.
    }
    initialized = true;
  }

  const ctx =
    (document as unknown as { modelContext?: ModelContextLike }).modelContext ??
    (navigator as unknown as { modelContext?: ModelContextLike }).modelContext;

  return ctx;
}

/** Whether a usable `modelContext` is available in the current environment. */
export function hasModelContext(): boolean {
  return ensureModelContext() != null;
}

export { initializeWebMCPPolyfill };
