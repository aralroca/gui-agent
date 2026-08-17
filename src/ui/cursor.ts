/**
 * Simulated mouse pointer — an arrow that travels to whatever the agent is
 * acting on and ripples when it lands.
 *
 * Agent tools act instantly and invisibly: by the time a click has landed the
 * user has no idea *where* on the page it happened. The pointer restores that
 * thread of causality. It rides the same target tour as the glow ring (see
 * `highlight.ts`), so the two surfaces can never disagree about where the
 * action is — and so it works for producer tools that call `viz.highlight()`
 * as well as for the DOM fallback's `tool-target` steps.
 *
 * Motion is a per-frame ease toward the target's *live* center, which means one
 * loop covers both the travel in and staying pinned while the page scrolls
 * underneath. Under `prefers-reduced-motion` the ease is 1: the pointer
 * teleports, and CSS suppresses the ripple.
 */
import { CURSOR_CSS } from "./styles.js";
import { createShadowHost } from "./host.js";

export interface CursorOptions {
  /** Fraction of the remaining distance covered per frame (0–1). Default 0.18. */
  ease?: number;
}

export interface Cursor {
  /** Travel to an element's center, rippling on arrival. */
  moveTo(el: Element): void;
  /** Fade the pointer out — the tour ended. */
  hide(): void;
  dispose(): void;
}

/** Distance in px under which the pointer counts as landed. */
const ARRIVED_PX = 1.5;

const ARROW_SVG = `<svg class="arrow" viewBox="0 0 24 24" aria-hidden="true"><path d="M5.5 2.5 L5.5 18.8 L9.7 14.9 L12.2 20.6 L14.9 19.4 L12.4 13.9 L18.2 13.6 Z"/></svg>`;

export function createCursor(options: CursorOptions = {}): Cursor {
  const ease = prefersReducedMotion() ? 1 : (options.ease ?? 0.18);
  let host: HTMLElement | null = null;
  let point: HTMLElement | null = null;
  let ripple: HTMLElement | null = null;
  let target: Element | null = null;
  let x = 0;
  let y = 0;
  let traveling = false;
  let looping = false;
  let placed = false;
  let written = "";

  // jsdom (and exotic runtimes) may lack rAF; a 16ms timeout is close enough.
  const schedule = (cb: () => void) => {
    if (typeof requestAnimationFrame === "function") requestAnimationFrame(cb);
    else setTimeout(cb, 16);
  };

  const buildPoint = (root: ShadowRoot): HTMLElement => {
    const created = document.createElement("div");

    created.className = "point";
    created.innerHTML = ARROW_SVG;
    root.appendChild(created);

    return created;
  };

  const ensurePoint = (): HTMLElement => {
    if (point) return point;
    const shadow = createShadowHost("data-gui-agent-cursor", CURSOR_CSS);

    host = shadow.host;
    point = buildPoint(shadow.root);
    ripple = point.appendChild(document.createElement("div"));
    ripple.className = "ripple";
    written = "";
    document.body.appendChild(host);

    return point;
  };

  const centerOf = (el: Element): { x: number; y: number } => {
    const rect = el.getBoundingClientRect();

    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  };

  const ping = () => {
    if (!ripple) return;
    ripple.classList.remove("ping");
    ripple.getBoundingClientRect(); // force a reflow so a repeat ping replays
    ripple.classList.add("ping");
  };

  const land = () => {
    traveling = false;
    ping();
  };

  // Once landed the position stops changing, so skip the restyle: the loop
  // keeps running to follow scrolls, but it stops touching the DOM for nothing.
  const draw = (el: HTMLElement) => {
    const next = `translate3d(${x}px, ${y}px, 0)`;

    if (next === written) return;
    written = next;
    el.style.transform = next;
  };

  const advance = () => {
    if (!point || !target?.isConnected) return;
    const dest = centerOf(target);
    const dx = dest.x - x;
    const dy = dest.y - y;
    const landed = Math.hypot(dx, dy) < ARRIVED_PX;

    x += landed ? dx : dx * ease;
    y += landed ? dy : dy * ease;
    draw(point);
    if (landed && traveling) land();
  };

  const loop = () => {
    if (!looping) return;
    advance();
    schedule(loop);
  };

  const startLoop = () => {
    if (looping) return;
    looping = true;
    schedule(loop);
  };

  const hide = () => {
    looping = false;
    traveling = false;
    target = null;
    point?.classList.remove("on");
  };

  // First appearance: rise from the bottom center of the viewport, so the very
  // first action reads as a deliberate move rather than a pointer blinking in.
  const seedStart = () => {
    x = (window.innerWidth || 0) / 2;
    y = window.innerHeight || 0;
  };

  return {
    moveTo(el) {
      if (typeof document === "undefined" || !el.isConnected) return;
      const shown = ensurePoint();

      if (!placed) seedStart();
      placed = true;
      target = el;
      traveling = true;
      shown.classList.add("on");
      startLoop();
    },
    hide,
    dispose() {
      hide();
      host?.remove();
      host = null;
      point = null;
      ripple = null;
    },
  };
}

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;

  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
