/**
 * The `DataTransfer` a replayed drag carries. A script-made `DataTransfer`
 * can't stand in for a real one: browsers freeze its `effectAllowed` and
 * `dropEffect` at "none" outside a real drag, so no target could ever accept
 * it. This one keeps the string data and lets the effects be negotiated as a
 * browser does (HTML's drag and drop processing model).
 */
/* Formats as a native DataTransfer keys them: lower case, "text" and "url" as their MIME types. */
const ALIASES: Record<string, string> = { text: "text/plain", url: "text/uri-list" };

const formatOf = (format: string) => {
  const lower = format.toLowerCase();

  return ALIASES[lower] ?? lower;
};

export function createDragTransfer(): DataTransfer {
  const store = new Map<string, string>();

  return {
    dropEffect: "none",
    // What a real drag starts with, until the source's dragstart says otherwise.
    effectAllowed: "uninitialized",
    get types() {
      return [...store.keys()];
    },
    files: [],
    // The string items a native transfer lists for its data, read and written through the same store.
    get items() {
      return itemList(store);
    },
    getData: (format: string) => store.get(formatOf(format)) ?? "",
    setData: (format: string, value: string) => {
      store.set(formatOf(format), value);
    },
    clearData: (format?: string) => {
      if (format) store.delete(formatOf(format));
      else store.clear();
    },
    setDragImage: () => undefined,
  } as unknown as DataTransfer;
}

function itemList(store: Map<string, string>) {
  const entries = [...store];
  const items = entries.map(([type, value]) => ({ kind: "string", type, getAsString: (cb: (s: string) => void) => cb(value), getAsFile: () => null }));

  return Object.assign(items, {
    add: (data: string, type: string) => {
      store.set(formatOf(type), data);
    },
    remove: (index: number) => {
      if (entries[index]) store.delete(entries[index][0]);
    },
    clear: () => store.clear(),
  });
}

/** The effect a browser proposes over a target, from what the source allows. */
export function initialDropEffect(allowed: string): DataTransfer["dropEffect"] {
  if (allowed === "none") return "none";
  if (allowed === "move" || allowed === "linkMove") return "move";
  if (allowed === "link") return "link";

  return "copy";
}

/** Whether the source allows the effect the target settled on. */
export function allows(allowed: string, effect: string): boolean {
  if (effect === "none") return false;

  return allowed === "all" || allowed === "uninitialized" || allowed.toLowerCase().includes(effect);
}
