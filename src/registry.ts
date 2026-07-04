/**
 * Tool registry.
 *
 * The registry is gui-agent's source of truth for tools it manages. Every
 * registered tool is also mirrored onto `document.modelContext` so that *other*
 * WebMCP agents (a browser's native agent, an extension, assistive tech) can
 * discover and call it too. Unregistration is driven by `AbortSignal`, matching
 * the current WebMCP spec.
 */
import { ensureModelContext } from "./polyfill.js";
import { errorResult, normalizeResult } from "./result.js";
import { toJsonSchema, toJsonSchemaSync } from "./schema.js";
import type { JSONSchema, RegisteredTool, ToolDefinition, ToolSpec } from "./types.js";

/** Options accepted when registering a tool. */
export interface RegisterOptions {
  /** Abort to unregister the tool (equivalent to calling its `dispose`). */
  signal?: AbortSignal;
  /** Skip mirroring onto `document.modelContext` (registry-local only). */
  skipModelContext?: boolean;
  /** Replace an existing tool with the same name instead of throwing. */
  replace?: boolean;
}

export class ToolRegistry {
  private tools = new Map<string, RegisteredTool>();
  private listeners = new Set<() => void>();

  /** All currently registered tools, in insertion order. */
  list(): RegisteredTool[] {
    return [...this.tools.values()];
  }

  /**
   * JSON-safe specs for every registered tool — what a (possibly remote) LLM
   * needs to know the tools exist. Zod schemas resolve asynchronously right
   * after registration; prefer plain JSON Schema for tools whose specs are
   * shipped per turn.
   */
  listToolSpecs(): ToolSpec[] {
    return this.list().map(({ name, description, inputSchema, annotations }) => ({
      name,
      description,
      inputSchema,
      annotations,
    }));
  }

  get(name: string): RegisteredTool | undefined {
    return this.tools.get(name);
  }

  has(name: string): boolean {
    return this.tools.has(name);
  }

  /** Subscribe to registry changes (tools added/removed). Returns an unsubscribe. */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Register a tool. Returns the {@link RegisteredTool}; call `.dispose()` (or
   * abort the provided signal) to unregister.
   */
  register<I extends Record<string, unknown>>(
    def: ToolDefinition<I>,
    options: RegisterOptions = {},
  ): RegisteredTool {
    if (!def.name) throw new Error("gui-agent: tool `name` is required.");
    if (!def.description) throw new Error(`gui-agent: tool "${def.name}" needs a description.`);
    if (this.tools.has(def.name)) {
      if (!options.replace) {
        throw new Error(`gui-agent: a tool named "${def.name}" is already registered.`);
      }
      this.unregister(def.name);
    }

    const execute = async (input: Record<string, unknown>) => {
      try {
        return normalizeResult(await def.execute(input as I));
      } catch (error) {
        return errorResult(error);
      }
    };

    // Resolve the schema synchronously when possible; patch later for Zod.
    const syncSchema = toJsonSchemaSync(def.inputSchema);
    const tool: RegisteredTool = {
      name: def.name,
      title: def.title,
      description: def.description,
      inputSchema: syncSchema ?? { type: "object", properties: {} },
      annotations: { readOnlyHint: false, ...def.annotations },
      execute,
      dispose: () => this.remove(tool),
    };

    this.tools.set(def.name, tool);

    const finishSchema = syncSchema
      ? Promise.resolve(syncSchema)
      : toJsonSchema(def.inputSchema).then((schema) => {
          tool.inputSchema = schema;
          return schema;
        });

    if (!options.skipModelContext) {
      void finishSchema.then((schema) => this.mirror(tool, schema, options.signal));
    }

    if (options.signal) {
      if (options.signal.aborted) {
        this.remove(tool);
      } else {
        options.signal.addEventListener("abort", () => this.remove(tool), { once: true });
      }
    }

    this.emit();
    return tool;
  }

  /** Remove a tool by name. */
  unregister(name: string): void {
    if (this.tools.delete(name)) this.emit();
  }

  /**
   * Remove a specific tool instance — but only if it's still the one registered
   * under its name. A stale registration's `dispose()` / abort listener must not
   * evict a newer tool that replaced it (the `replace: true` / re-register case).
   */
  private remove(tool: RegisteredTool): void {
    if (this.tools.get(tool.name) === tool) this.unregister(tool.name);
  }

  /** Remove every tool. */
  clear(): void {
    if (this.tools.size === 0) return;
    this.tools.clear();
    this.emit();
  }

  private mirror(tool: RegisteredTool, schema: JSONSchema, signal?: AbortSignal): void {
    const ctx = ensureModelContext();
    if (!ctx) return;
    try {
      void ctx.registerTool(
        {
          name: tool.name,
          title: tool.title,
          description: tool.description,
          inputSchema: schema,
          annotations: tool.annotations as Record<string, unknown>,
          execute: tool.execute,
        },
        signal ? { signal } : undefined,
      );
    } catch {
      // A duplicate or rejected mirror registration must not break the local
      // registry — the agent loop relies on the local copy regardless.
    }
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }
}

/** The process-wide default registry used by {@link defineTool}. */
export const registry = new ToolRegistry();

/** A handle to unregister a tool. */
export type Dispose = () => void;

/**
 * Register a tool on the default registry (and on `document.modelContext`).
 * Returns a `dispose` function.
 *
 * @example
 * const dispose = defineTool({
 *   name: "search_user",
 *   description: "Search users by name or id",
 *   inputSchema: { type: "object", properties: { query: { type: "string" } }, required: ["query"] },
 *   annotations: { readOnlyHint: true },
 *   execute: ({ query }) => doSearch(query as string),
 * });
 */
export function defineTool<I extends Record<string, unknown>>(
  def: ToolDefinition<I>,
  options?: RegisterOptions,
): Dispose {
  const tool = registry.register(def, options);
  return tool.dispose;
}
