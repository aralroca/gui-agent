/**
 * The `DataTransfer` a replayed drag carries. A script-made `DataTransfer`
 * can't stand in for a real one: browsers freeze its `effectAllowed` and
 * `dropEffect` at "none" outside a real drag, so no target could ever accept
 * it. This one keeps the string data and lets the effects be negotiated as a
 * browser does (HTML's drag and drop processing model).
 */
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
    items: [],
    getData: (format: string) => store.get(format) ?? "",
    setData: (format: string, value: string) => {
      store.set(format, value);
    },
    clearData: (format?: string) => {
      if (format) store.delete(format);
      else store.clear();
    },
    setDragImage: () => undefined,
  } as unknown as DataTransfer;
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
