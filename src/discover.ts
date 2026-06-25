/**
 * Discovery of tools registered on `document.modelContext` by code *outside*
 * gui-agent (the host app calling `registerTool` directly, a browser's native
 * agent surface, etc). The built-in agent loop sources tools from the local
 * {@link ToolRegistry}; this module lets it also see foreign tools via the
 * WebMCP producer-preview `getTools()` / `executeTool()` API.
 */
import { ensureModelContext } from "./polyfill.js";
import { normalizeResult } from "./result.js";
import type { JSONSchema, RegisteredTool, ToolResultEnvelope } from "./types.js";

interface RawTool {
  name: string;
  title?: string;
  description?: string;
  inputSchema?: JSONSchema;
  annotations?: Record<string, unknown>;
}

/**
 * Read every tool currently exposed on `document.modelContext` and adapt each
 * into a {@link RegisteredTool} whose `execute` proxies through `executeTool()`.
 * Returns an empty array when discovery is unsupported (e.g. SSR, or a polyfill
 * build without the producer-preview surface).
 */
export async function discoverExternalTools(): Promise<RegisteredTool[]> {
  const ctx = ensureModelContext();
  if (!ctx?.getTools || !ctx.executeTool) return [];

  let raw: unknown[];
  try {
    raw = await ctx.getTools();
  } catch {
    return [];
  }

  return raw.map((handle) => {
    const meta = handle as RawTool;
    const execute = async (input: Record<string, unknown>): Promise<ToolResultEnvelope> => {
      const result = await ctx.executeTool!(handle, JSON.stringify(input ?? {}));
      if (result == null) return { content: [{ type: "text", text: "ok" }] };
      if (typeof result === "string") {
        try {
          return normalizeResult(JSON.parse(result));
        } catch {
          return { content: [{ type: "text", text: result }] };
        }
      }
      return normalizeResult(result);
    };

    return {
      name: meta.name,
      title: meta.title,
      description: meta.description ?? meta.name,
      inputSchema: meta.inputSchema ?? { type: "object", properties: {} },
      annotations: (meta.annotations ?? {}) as RegisteredTool["annotations"],
      execute,
      dispose: () => {},
    } satisfies RegisteredTool;
  });
}
