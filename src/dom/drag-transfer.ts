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
  const items = itemList(store);

  return {
    dropEffect: "none",
    // What a real drag starts with, until the source's dragstart says otherwise.
    effectAllowed: "uninitialized",
    get types() {
      return [...store.keys()];
    },
    files: [],
    // The string items a native transfer lists for its data, read and written through the same store.
    items,
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

/* DataTransferItemList over the store: live length, indices and iteration; add() returns the item. */
function itemList(store: Map<string, string>) {
  const item = ([type, value]: [string, string]) => ({ kind: "string", type, getAsString: (cb: (s: string) => void) => cb(value), getAsFile: () => null });
  const at = (index: number) => [...store][index];
  const list = {
    get length() {
      return store.size;
    },
    add(data: string, type: string) {
      store.set(formatOf(type), data);

      return item([formatOf(type), data]);
    },
    remove(index: number) {
      const entry = at(index);
      if (entry) store.delete(entry[0]);
    },
    clear: () => store.clear(),
    *[Symbol.iterator]() {
      for (const entry of store) yield item(entry);
    },
  };

  return new Proxy(list, {
    get: (target, key) => (typeof key === "string" && /^\d+$/.test(key) ? at(Number(key)) && item(at(Number(key))!) : Reflect.get(target, key)),
  });
}

/** The effect a browser proposes over a target, from what the source allows. */
export function initialDropEffect(allowed: string): DataTransfer["dropEffect"] {
  if (allowed === "none") return "none";
  if (allowed === "move") return "move";
  if (allowed === "link" || allowed === "linkMove") return "link";

  return "copy";
}

/** Whether the source allows the effect the target settled on. */
export function allows(allowed: string, effect: string): boolean {
  if (effect === "none") return false;

  return allowed === "all" || allowed === "uninitialized" || allowed.toLowerCase().includes(effect);
}
