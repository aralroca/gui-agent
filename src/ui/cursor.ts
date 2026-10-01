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
import { visibleCenter } from "../dom/visible-point.js";
import { POINTER_LANDED, POINTER_TRAVEL_MS } from "../timing.js";
import { createCarrier } from "./ghost.js";
import { createShadowHost } from "./host.js";

export interface CursorOptions {
  /** How long the pointer takes to reach a target, in ms. Default 380. */
  travelMs?: number;
}

export interface Cursor {
  /** Travel to the center of the element's on-screen part, rippling on arrival. */
  moveTo(el: Element): void;
  /** Drag: the pointer's trip from `from` to `to` carries a copy of `from`. */
  carry(from: Element, to: Element): void;
  /** Fade the pointer out — the tour ended. */
  hide(): void;
  dispose(): void;
}

/**
 * Default travel duration in ms. Timed against the wall clock rather than
 * stepped per frame: a proportional per-frame ease ties the duration to the
 * frame rate, so on a busy budget — an agent mid-run is exactly that — the
 * pointer was still short of its target when the ring moved on, and the
 * ripple, which only fires on arrival, never played. Timing it makes a slow
 * frame budget choppier, never longer.
 */
const TRAVEL_MS = POINTER_TRAVEL_MS;

/** Cubic ease-out: quick departure, soft landing — how a hand moves a mouse. */
const easeOut = (t: number): number => 1 - (1 - t) ** 3;

const ARROW_SVG = `<svg class="arrow" viewBox="0 0 24 24" aria-hidden="true"><path d="M5.5 2.5 L5.5 18.8 L9.7 14.9 L12.2 20.6 L14.9 19.4 L12.4 13.9 L18.2 13.6 Z"/></svg>`;

export function createCursor(options: CursorOptions = {}): Cursor {
  const travelMs = prefersReducedMotion() ? 0 : (options.travelMs ?? TRAVEL_MS);
  let host: HTMLElement | null = null;
  let point: HTMLElement | null = null;
  let ripple: HTMLElement | null = null;
  let target: Element | null = null;
  let x = 0;
  let y = 0;
  let fromX = 0;
  let fromY = 0;
  let startedAt = 0;
  let traveling = false;
  let looping = false;
  let placed = false;
  let written = "";
  const carrier = createCarrier();

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

  const ping = () => {
    if (!ripple) return;
    ripple.classList.remove("ping");
    ripple.getBoundingClientRect(); // force a reflow so a repeat ping replays
    ripple.classList.add("ping");
  };

  const land = () => {
    traveling = false;
    if (target) carrier.arrive(target);
    if (target) window.dispatchEvent(new CustomEvent(POINTER_LANDED, { detail: target }));
    ping();
  };

  // Once landed the position stops changing, so skip the restyle: the loop
  // keeps running to follow scrolls, but it stops touching the DOM for nothing.
  const draw = (el: HTMLElement) => {
    const next = `translate3d(${x}px, ${y}px, 0)`;

    if (next === written) return;
    written = next;
    el.style.transform = next;
    carrier.follow(x, y);
  };

  // Interpolate from where the pointer set off toward the target's *live*
  // center, so the same pass draws the travel and, once landed (progress 1),
  // keeps the pointer pinned while the page scrolls underneath.
  const advance = () => {
    if (!point || !target?.isConnected) return;
    const dest = visibleCenter(target);
    const progress = travelMs ? Math.min(1, (Date.now() - startedAt) / travelMs) : 1;
    const eased = easeOut(progress);

    x = fromX + (dest.x - fromX) * eased;
    y = fromY + (dest.y - fromY) * eased;
    draw(point);
    if (progress === 1 && traveling) land();
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
    carrier.letGo();
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

  // Anchor the interpolation at wherever the pointer currently sits, so a new
  // target mid-flight continues from there instead of jumping back.
  const beginTravel = (el: Element) => {
    if (!placed) seedStart();
    placed = true;
    fromX = x;
    fromY = y;
    startedAt = Date.now();
    target = el;
    traveling = true;
  };

  return {
    moveTo(el) {
      if (typeof document === "undefined" || !el.isConnected) return;
      const shown = ensurePoint();

      carrier.depart(el, x, y);
      beginTravel(el);
      shown.classList.add("on");
      startLoop();
    },
    carry: carrier.carry,
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
