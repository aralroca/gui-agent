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

export function createCarrier(): Carrier {
  let drag: { from: Element; to: Element } | null = null;
  let ghost: Ghost | null = null;

  const letGo = () => {
    ghost?.remove();
    ghost = null;
    drag = null;
  };

  return {
    carry(from, to) {
      letGo();
      drag = { from, to };
    },
    depart(el, x, y) {
      if (drag?.to === el && !ghost) ghost = createGhost(drag.from, x, y);
    },
    arrive(el) {
      if (ghost && drag?.to === el) letGo();
    },
    follow(x, y) {
      ghost?.follow(x, y);
    },
    letGo,
  };
}

export function createGhost(source: Element, grabX: number, grabY: number): Ghost {
  const rect = source.getBoundingClientRect();
  const copy = source.cloneNode(true) as HTMLElement;
  const offset = { x: grabX - rect.left, y: grabY - rect.top };

  inlineStyles(source, copy);
  copy.setAttribute(GHOST_ATTR, "");
  copy.setAttribute("aria-hidden", "true");
  copy.removeAttribute("id");
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

/* Copy each node's computed style onto its clone, walking both trees together. */
function inlineStyles(from: Element, to: Element): void {
  const computed = getComputedStyle(from);
  const style = (to as HTMLElement).style;

  for (const name of Array.from(computed)) style?.setProperty(name, computed.getPropertyValue(name));
  Array.from(from.children).forEach((child, i) => {
    if (to.children[i]) inlineStyles(child, to.children[i]!);
  });
}
