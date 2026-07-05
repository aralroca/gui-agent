/**
 * Text-based DOM snapshot — the page-agent-inspired core of the DOM fallback.
 *
 * Instead of screenshots, gui-agent serializes the page's interactive surface
 * into a compact, accessibility-oriented text outline. Each actionable element
 * gets a *stable* ref (e.g. `e7`) that survives across snapshots, so the model
 * can say "click e7" and we can resolve it back to the live element.
 */

const INTERACTIVE_SELECTOR = [
  "a[href]",
  "button",
  "input",
  "textarea",
  "select",
  "summary",
  "[role=button]",
  "[role=link]",
  "[role=checkbox]",
  "[role=radio]",
  "[role=tab]",
  "[role=menuitem]",
  "[role=menuitemcheckbox]",
  "[role=menuitemradio]",
  "[role=switch]",
  "[role=option]",
  "[role=combobox]",
  "[contenteditable=true]",
  "[contenteditable='']",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

const HEADING_SELECTOR = "h1,h2,h3,h4,h5,h6,[role=heading]";

export interface SnapshotOptions {
  /** Root to snapshot. Defaults to `document.body`. */
  root?: ParentNode;
  /** Cap on the number of nodes serialized. Default 200. */
  maxNodes?: number;
}

export class DomSnapshotter {
  private elToRef = new WeakMap<Element, string>();
  private refToEl = new Map<string, WeakRef<Element>>();
  private counter = 0;

  /** Resolve a ref produced by a previous snapshot back to a live element. */
  resolve(ref: string): Element | undefined {
    const el = this.refToEl.get(ref)?.deref();
    if (el && el.isConnected) return el;
    return undefined;
  }

  private refFor(el: Element): string {
    let ref = this.elToRef.get(el);
    if (!ref) {
      ref = `e${++this.counter}`;
      this.elToRef.set(el, ref);
    }
    this.refToEl.set(ref, new WeakRef(el));
    return ref;
  }

  /** Produce a text outline of the current page. */
  snapshot(options: SnapshotOptions = {}): string {
    if (typeof document === "undefined") return "";
    const root = options.root ?? document.body;
    if (!root) return "";
    const maxNodes = options.maxNodes ?? 200;

    const seen = new Set<Element>();
    const lines: string[] = [];

    const collect = (selector: string, render: (el: Element) => string | undefined) => {
      for (const el of root.querySelectorAll(selector)) {
        if (lines.length >= maxNodes) break;
        if (seen.has(el)) continue;
        if (isHidden(el)) continue;
        const line = render(el);
        if (line) {
          seen.add(el);
          lines.push(line);
        }
      }
    };

    collect(HEADING_SELECTOR, (el) => {
      const name = accessibleName(el);
      return name ? `# ${name}` : undefined;
    });

    collect(INTERACTIVE_SELECTOR, (el) => {
      const ref = this.refFor(el);
      const role = roleOf(el);
      const name = accessibleName(el) || "(no label)";
      const parts = [`[${ref}]`, role, JSON.stringify(name)];
      const state = stateOf(el);
      if (state) parts.push(state);
      return parts.join(" ");
    });

    if (lines.length === 0) return "(no interactive elements found)";
    return lines.join("\n");
  }
}

function isHidden(el: Element): boolean {
  // `hidden`/`aria-hidden` apply to the whole subtree, so check ancestors too.
  if (el.closest("[hidden]")) return true;
  if (el.closest('[aria-hidden="true"]')) return true;
  const style = (el as HTMLElement).style;
  if (style && (style.display === "none" || style.visibility === "hidden")) return true;
  if (typeof window !== "undefined" && typeof window.getComputedStyle === "function") {
    const computed = window.getComputedStyle(el as HTMLElement);
    if (computed.display === "none" || computed.visibility === "hidden") return true;
  }
  return false;
}

function roleOf(el: Element): string {
  const explicit = el.getAttribute("role");
  if (explicit) return explicit;

  const tag = el.tagName.toLowerCase();
  if (tag === "a") return "link";
  if (tag === "button" || tag === "summary") return "button";
  if (tag === "textarea") return "textbox";
  if (tag === "select") return "combobox";
  if (tag === "input") {
    const type = (el as HTMLInputElement).type;
    if (type === "checkbox") return "checkbox";
    if (type === "radio") return "radio";
    if (type === "button" || type === "submit" || type === "reset") return "button";
    if (type === "search") return "searchbox";
    if (type === "file") return "file";
    return "textbox";
  }
  if (el.getAttribute("contenteditable") != null) return "textbox";
  return "control";
}

export function accessibleName(el: Element): string {
  const ariaLabel = el.getAttribute("aria-label");
  if (ariaLabel) return ariaLabel.trim();

  const labelledby = el.getAttribute("aria-labelledby");
  if (labelledby) {
    const text = labelledby
      .split(/\s+/)
      .map((id) => el.ownerDocument?.getElementById(id)?.textContent ?? "")
      .join(" ")
      .trim();
    if (text) return text;
  }

  const tag = el.tagName.toLowerCase();
  if (tag === "input" || tag === "textarea" || tag === "select") {
    const id = el.id;
    if (id) {
      const label = el.ownerDocument?.querySelector(`label[for="${cssEscape(id)}"]`);
      if (label?.textContent) return label.textContent.trim();
    }
    const wrappingLabel = el.closest("label");
    if (wrappingLabel?.textContent) return wrappingLabel.textContent.trim();
    const placeholder = el.getAttribute("placeholder");
    if (placeholder) return placeholder.trim();
    const name = el.getAttribute("name");
    if (name) return name.trim();
  }

  if (tag === "img") {
    const alt = el.getAttribute("alt");
    if (alt) return alt.trim();
  }

  const title = el.getAttribute("title");
  const text = (el.textContent ?? "").replace(/\s+/g, " ").trim();
  if (text) return text.slice(0, 120);
  if (title) return title.trim();
  return "";
}

function stateOf(el: Element): string | undefined {
  const flags: string[] = [];
  if ((el as HTMLInputElement).disabled) flags.push("disabled");
  const tag = el.tagName.toLowerCase();
  if (tag === "input") {
    const input = el as HTMLInputElement;
    if (input.type === "checkbox" || input.type === "radio") {
      flags.push(input.checked ? "checked" : "unchecked");
    } else if (input.value) {
      flags.push(`value=${JSON.stringify(input.value.slice(0, 60))}`);
    }
  } else if (tag === "textarea") {
    const value = (el as HTMLTextAreaElement).value;
    if (value) flags.push(`value=${JSON.stringify(value.slice(0, 60))}`);
  }
  const expanded = el.getAttribute("aria-expanded");
  if (expanded) flags.push(`expanded=${expanded}`);
  return flags.length ? flags.join(" ") : undefined;
}

function cssEscape(value: string): string {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") return CSS.escape(value);
  return value.replace(/["\\]/g, "\\$&");
}
