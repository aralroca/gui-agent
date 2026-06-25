/**
 * DOM fallback tools.
 *
 * For anything the host app hasn't exposed as a first-class WebMCP tool, these
 * synthesized tools let the agent operate the page like page-agent does:
 * read the text snapshot, then click / fill / select elements by their stable
 * ref. Every mutating tool returns a fresh snapshot so the model stays oriented.
 */
import { DomSnapshotter } from "./snapshot.js";
import type { ToolDefinition } from "../types.js";

export interface DomToolsOptions {
  /** Root to operate within. Defaults to `document.body`. */
  root?: () => ParentNode | undefined;
  /** Cap on nodes per snapshot. Default 200. */
  maxNodes?: number;
  /** Allow full-page `navigate`. Off by default (it would unload the agent). */
  allowNavigation?: boolean;
}

const refSchema = {
  type: "object",
  properties: {
    ref: { type: "string", description: "An element ref from read_page, e.g. \"e7\"." },
  },
  required: ["ref"],
} as const;

/**
 * Build the DOM fallback tool set bound to a shared {@link DomSnapshotter}
 * (so refs stay consistent across calls within a run).
 */
export function createDomTools(
  snapshotter: DomSnapshotter = new DomSnapshotter(),
  options: DomToolsOptions = {},
): ToolDefinition[] {
  const maxNodes = options.maxNodes;
  const rootOf = () => options.root?.() ?? (typeof document !== "undefined" ? document.body : undefined);

  const snapshot = () =>
    snapshotter.snapshot({ root: rootOf() ?? undefined, maxNodes });

  const resolve = (ref: string): HTMLElement => {
    const el = snapshotter.resolve(ref);
    if (!el) throw new Error(`No element for ref "${ref}". Call read_page for current refs.`);
    return el as HTMLElement;
  };

  const withSnapshot = (message: string) => `${message}\n\nPage now:\n${snapshot()}`;

  const tools: ToolDefinition[] = [
    {
      name: "read_page",
      description:
        "Read a text outline of the current page: interactive elements with stable refs (e.g. e7), their roles, labels, and state. Call this first, and again after the page changes.",
      annotations: { readOnlyHint: true },
      execute: () => snapshot(),
    },
    {
      name: "click",
      description: "Click an element (button, link, checkbox, tab…) by its ref.",
      inputSchema: refSchema,
      execute: ({ ref }) => {
        const el = resolve(ref as string);
        el.click();
        return withSnapshot(`Clicked ${ref}.`);
      },
    },
    {
      name: "fill",
      description: "Type a value into a text input, textarea, or contenteditable element by its ref.",
      inputSchema: {
        type: "object",
        properties: {
          ref: { type: "string", description: "Element ref from read_page." },
          value: { type: "string", description: "The text to enter." },
        },
        required: ["ref", "value"],
      },
      execute: ({ ref, value }) => {
        const el = resolve(ref as string);
        fillElement(el, String(value ?? ""));
        return withSnapshot(`Filled ${ref}.`);
      },
    },
    {
      name: "select_option",
      description: "Choose an option in a <select> dropdown by its ref, matching option label or value.",
      inputSchema: {
        type: "object",
        properties: {
          ref: { type: "string", description: "Element ref of the select." },
          value: { type: "string", description: "Option label or value to choose." },
        },
        required: ["ref", "value"],
      },
      execute: ({ ref, value }) => {
        const el = resolve(ref as string);
        selectOption(el, String(value ?? ""));
        return withSnapshot(`Selected "${value}" in ${ref}.`);
      },
    },
    {
      name: "wait_for_text",
      description: "Wait (up to ~5s) until the given text appears anywhere on the page, then re-read it.",
      inputSchema: {
        type: "object",
        properties: { text: { type: "string", description: "Substring to wait for." } },
        required: ["text"],
      },
      execute: async ({ text }) => {
        const found = await waitForText(String(text ?? ""), rootOf());
        return withSnapshot(found ? `Found "${text}".` : `Timed out waiting for "${text}".`);
      },
    },
  ];

  if (options.allowNavigation) {
    tools.push({
      name: "navigate",
      description: "Navigate the browser to a URL. Note: this reloads the page.",
      inputSchema: {
        type: "object",
        properties: { url: { type: "string", description: "Absolute or relative URL." } },
        required: ["url"],
      },
      execute: ({ url }) => {
        if (typeof window !== "undefined") window.location.assign(String(url));
        return `Navigating to ${url}.`;
      },
    });
  }

  return tools;
}

function fillElement(el: HTMLElement, value: string): void {
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    setNativeValue(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    return;
  }
  if (el.isContentEditable) {
    el.textContent = value;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    return;
  }
  throw new Error("Element is not fillable (expected an input, textarea, or contenteditable).");
}

/**
 * Set a value through the native setter so React's controlled inputs notice the
 * change (React patches the instance value setter and compares against it).
 */
function setNativeValue(el: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  const proto = Object.getPrototypeOf(el);
  const descriptor = Object.getOwnPropertyDescriptor(proto, "value");
  if (descriptor?.set) {
    descriptor.set.call(el, value);
  } else {
    el.value = value;
  }
}

function selectOption(el: HTMLElement, value: string): void {
  if (!(el instanceof HTMLSelectElement)) {
    throw new Error("Element is not a <select>.");
  }
  const match = [...el.options].find(
    (opt) => opt.value === value || opt.label === value || opt.textContent?.trim() === value,
  );
  if (!match) throw new Error(`No option matching "${value}".`);
  el.value = match.value;
  el.dispatchEvent(new Event("change", { bubbles: true }));
}

async function waitForText(text: string, root: ParentNode | undefined, timeoutMs = 5000): Promise<boolean> {
  if (!text) return true;
  const target = (root as HTMLElement | undefined) ?? (typeof document !== "undefined" ? document.body : undefined);
  if (!target) return false;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if ((target.textContent ?? "").includes(text)) return true;
    await delay(100);
  }
  return (target.textContent ?? "").includes(text);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
