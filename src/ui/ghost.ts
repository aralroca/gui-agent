/**
 * The copy of a dragged element that rides under the simulated pointer.
 *
 * It is a deep clone with every node's computed style written inline, so it
 * keeps its look away from the parent and the selectors that styled it. It
 * lives in the light DOM (fixed, never hit-testable) and the pointer moves it
 * by the offset it was grabbed at, as an OS drag image moves.
 */
export interface Ghost {
  /** Put the copy's grab point at viewport (x, y). */
  follow(x: number, y: number): void;
  remove(): void;
}

/** What the pointer is dragging, if anything, and the copy it carries. */
export interface Carrier {
  carry(from: Element, to: Element): void;
  /** The pointer sets off toward `el` from (x, y): toward the drop target, pick the copy up. */
  depart(el: Element, x: number, y: number): void;
  /** The pointer landed on `el`: on the drop target, let go. */
  arrive(el: Element): void;
  follow(x: number, y: number): void;
  letGo(): void;
}

const GHOST_ATTR = "data-gui-agent-ghost";

/* Drags queue like the glow's tour does: each is carried on its own trip, in order. */
export function createCarrier(): Carrier {
  let drags: { from: Element; to: Element }[] = [];
  let ghost: Ghost | null = null;

  const drop = () => {
    ghost?.remove();
    ghost = null;
  };

  // The tour reached a later drag's source (an earlier one's target never showed): skip to it.
  const catchUp = (el: Element) => {
    if (drags[0]?.to === el) return; // the current drag's own trip (its target may start the next one)
    const at = drags.findIndex((drag) => drag.from === el);

    if (at > 0) drags = drags.slice(at);
  };

  return {
    carry(from, to) {
      drags.push({ from, to });
    },
    depart(el, x, y) {
      catchUp(el);
      if (drags[0]?.to === el && !ghost) ghost = createGhost(drags[0].from, x, y);
    },
    arrive(el) {
      if (!ghost || drags[0]?.to !== el) return;
      drop();
      drags.shift();
    },
    follow(x, y) {
      ghost?.follow(x, y);
    },
    letGo() {
      drop();
      drags = [];
    },
  };
}

export function createGhost(source: Element, grabX: number, grabY: number): Ghost {
  const rect = source.getBoundingClientRect();
  const copy = inertCopy(source) as HTMLElement;
  const offset = { x: grabX - rect.left, y: grabY - rect.top };

  inlineStyles(source, copy);
  copy.setAttribute(GHOST_ATTR, "");
  copy.setAttribute("aria-hidden", "true");
  // Nothing in it can be focused, clicked or hit, whatever style it copied.
  copy.setAttribute("inert", "");
  copy.querySelectorAll<HTMLElement>("*").forEach((el) => el.style.setProperty("pointer-events", "none"));
  Object.assign(copy.style, ghostFrame(rect));
  document.body.appendChild(copy);

  return {
    follow(x, y) {
      copy.style.transform = `translate3d(${x - offset.x}px, ${y - offset.y}px, 0) rotate(2deg)`;
    },
    remove() {
      copy.remove();
    },
  };
}

function ghostFrame(rect: DOMRect): Partial<CSSStyleDeclaration> {
  return {
    position: "fixed",
    left: "0",
    top: "0",
    margin: "0",
    width: `${rect.width}px`,
    height: `${rect.height}px`,
    boxSizing: "border-box",
    pointerEvents: "none",
    opacity: "0.92",
    boxShadow: "0 12px 28px rgba(0, 0, 0, 0.18)",
    zIndex: "2147483646",
    transition: "none",
    animation: "none",
  };
}

/* Elements that would come alive in the copy: a defined custom element runs its
   constructor and lifecycle callbacks, a frame or a media element loads. The
   copy draws each as a plain box with its look (inlineStyles) and no contents. */
const LIVE = new Set(["iframe", "frame", "object", "embed", "video", "audio", "canvas", "script", "template", "slot"]);

/* What would tie a copy to the page: ids, form fields (name, form), focus. */
const DROPPED = new Set(["id", "name", "form", "for", "tabindex", "autofocus", "contenteditable", "popover", "accesskey"]);

const isLive = (el: Element) => el.localName.includes("-") || LIVE.has(el.localName);

/* A look-alike of `node` that does nothing: no ids, no inline handlers, nothing live. */
function inertCopy(node: Node): Node | null {
  if (node.nodeType === Node.TEXT_NODE) return document.createTextNode(node.textContent ?? "");
  if (!(node instanceof Element)) return null;
  // Stylesheets would restyle the page itself (the copy already has its computed look): an empty
  // stand-in keeps the children paired with the source's for inlineStyles, and takes its display: none.
  if (node.localName === "style" || (node.localName === "link" && /stylesheet/i.test(node.getAttribute("rel") ?? ""))) return document.createElement("span");
  if (isLive(node)) return document.createElement("div");
  const copy = document.createElementNS(node.namespaceURI, node.localName);

  for (const { name, value } of Array.from(node.attributes)) {
    if (!DROPPED.has(name) && !name.startsWith("on")) copy.setAttribute(name, value);
  }
  node.childNodes.forEach((child) => {
    const inert = inertCopy(child);
    if (inert) copy.appendChild(inert);
  });
  copyFieldState(node, copy);

  return copy;
}

/* What a field shows now, not what its markup started with. */
function copyFieldState(from: Element, to: Element): void {
  if (from instanceof HTMLInputElement && to instanceof HTMLInputElement) {
    // A file input only takes "" as its value; its look does not depend on it.
    if (from.type !== "file") to.value = from.value;
    to.checked = from.checked;
  } else if ((from instanceof HTMLTextAreaElement || from instanceof HTMLSelectElement) && (to instanceof HTMLTextAreaElement || to instanceof HTMLSelectElement)) {
    to.value = from.value;
  }
}

/* Copy each node's computed style onto its clone, walking both trees together. */
function inlineStyles(from: Element, to: Element): void {
  const computed = getComputedStyle(from);
  const style = (to as HTMLElement).style;

  for (const name of Array.from(computed)) style?.setProperty(name, computed.getPropertyValue(name));
  Array.from(from.children).forEach((child, i) => {
    if (to.children[i]) inlineStyles(child, to.children[i]!);
  });
}
