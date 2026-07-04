/**
 * Standalone DOM-tool registration.
 *
 * `GuiAgent` registers the DOM fallback tools per run; when an *external* loop
 * drives the page (e.g. a server-side agent whose tool calls stream back to
 * the browser), register them once for the page's lifetime instead. Refs stay
 * stable for as long as the registration lives.
 */
import { createDomTools } from "./tools.js";
import { DomSnapshotter } from "./snapshot.js";
import { registry as defaultRegistry, ToolRegistry } from "../registry.js";
import type { Dispose } from "../registry.js";
import type { DomToolsOptions } from "./tools.js";

export interface RegisterDomToolsOptions extends DomToolsOptions {
  /** Abort to unregister every DOM tool. */
  signal?: AbortSignal;
  /** Registry to register on. Defaults to the process-wide singleton. */
  registry?: ToolRegistry;
  /** Skip mirroring onto `document.modelContext`. Default false. */
  skipModelContext?: boolean;
}

/**
 * Register the DOM fallback tools (`read_page`, `click`, `fill`,
 * `select_option`, `wait_for_text`, and `upload_file` when
 * `resolveAttachment` is provided) on a registry, sharing one
 * {@link DomSnapshotter} so refs stay consistent across calls.
 * Returns a dispose that unregisters them all.
 */
export function registerDomTools(options: RegisterDomToolsOptions = {}): Dispose {
  const { signal, registry = defaultRegistry, skipModelContext = false, ...domOptions } = options;
  const snapshotter = new DomSnapshotter();
  const tools = createDomTools(snapshotter, domOptions);

  const registered = tools.map((tool) =>
    registry.register(tool, { signal, skipModelContext, replace: true }),
  );

  return () => {
    for (const tool of registered) tool.dispose();
  };
}
