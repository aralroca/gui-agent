/**
 * Element highlight overlay — an animated gradient glow ring drawn around the
 * live element the agent is acting on.
 *
 * The ring lives in its own fixed-position shadow host appended to
 * `document.body` (lazily, on first use) and tracks the target's bounding rect
 * every frame while visible.
 *
 * Agent actions run far faster than human perception, so highlights are
 * **queued**: when several arrive in quick succession the ring tours each
 * target, dwelling at least `glowDwell` ms on it, and holds `glowDuration` ms
 * on the last one before fading out.
 *
 * While the ring is visible, a **backdrop veil** blurs and dims the rest of
 * the page so the highlighted element stands out. Holes are cut in the veil
 * for the target and for any `exclude`d elements (e.g. your chat panel), via
 * mask layers composited with `exclude`.
 */
import { HIGHLIGHT_CSS } from "./styles.js";
import { createShadowHost } from "./host.js";

export interface BackdropOptions {
  /** Blur radius in px for the rest of the page. Default 3. */
  blur?: number;
  /** Elements (or element ids) to keep sharp — typically your chat panel. */
  exclude?: Array<string | Element>;
}

export interface HighlighterOptions {
  /** Milliseconds the ring holds on the last target before fading. Default 1200. */
  glowDuration?: number;
  /** Minimum milliseconds per target when several highlights are queued. Default 500. */
  glowDwell?: number;
  /** Gradient stops for the ring (up to three are used). */
  glowColors?: string[];
  /** Band width of the crisp ring in px (`--gua-ring-width`). Default 3. */
  ringWidth?: number;
  /** Reach + blur of the soft halo in px (`--gua-halo-size`). Default 12. */
  haloSize?: number;
  /** Halo strength 0–1 (`--gua-halo-opacity`); 0 disables it. Default 0.55. */
  haloOpacity?: number;
  /** Blur/dim the page around the target while the glow is visible. Default true. */
  backdrop?: boolean | BackdropOptions;
}

export interface Highlighter {
  /**
   * Ring an element, or a CSS selector. A selector is resolved against the live
   * DOM and, if the element isn't there yet, polled for up to {@link WAIT_MS} —
   * so a target that mounts a frame or two later (e.g. a React Flow node a tool
   * just created) still gets the glow instead of being silently skipped.
   */
  highlight(target: Element | string, opts?: { duration?: number }): void;
  dispose(): void;
}

const FADE_MS = 300;
const PADDING = 6;
/** How long to poll for a selector's element before giving up. */
const WAIT_MS = 2000;

interface QueuedTarget {
  el: Element;
  duration: number;
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function createHighlighter(options: HighlighterOptions = {}): Highlighter {
  const glowDuration = options.glowDuration ?? 1200;
  const glowDwell = options.glowDwell ?? 500;
  const backdropOption = options.backdrop ?? true;
  const backdropConfig = typeof backdropOption === "object" ? backdropOption : {};
  let host: HTMLElement | null = null;
  let box: HTMLElement | null = null;
  let backdrop: HTMLElement | null = null;
  let current: Element | null = null;
  let currentDuration = glowDuration;
  let shownAt = 0;
  let queue: QueuedTarget[] = [];
  let looping = false;
  let lastFrameKey = "";
  let advanceTimer: ReturnType<typeof setTimeout> | undefined;
  let fadeTimer: ReturnType<typeof setTimeout> | undefined;

  const clearTimers = () => {
    clearTimeout(advanceTimer);
    clearTimeout(fadeTimer);
    advanceTimer = fadeTimer = undefined;
  };

  // jsdom (and exotic runtimes) may lack rAF; a 16ms timeout is close enough.
  const schedule = (cb: () => void) => {
    if (typeof requestAnimationFrame === "function") requestAnimationFrame(cb);
    else setTimeout(cb, 16);
  };

  const ensureBox = (): HTMLElement => {
    if (box) return box;
    const created = createShadowHost("data-gui-agent-highlight", HIGHLIGHT_CSS);
    host = created.host;
    if (options.glowColors) {
      options.glowColors.slice(0, 3).forEach((color, i) => {
        host!.style.setProperty(`--gua-glow-${i + 1}`, color);
      });
    }
    if (options.ringWidth != null) host.style.setProperty("--gua-ring-width", `${options.ringWidth}px`);
    if (options.haloSize != null) host.style.setProperty("--gua-halo-size", `${options.haloSize}px`);
    if (options.haloOpacity != null) host.style.setProperty("--gua-halo-opacity", `${options.haloOpacity}`);
    box = document.createElement("div");
    box.className = "box";
    const glow = document.createElement("div");
    glow.className = "glow";
    const ring = document.createElement("div");
    ring.className = "ring";
    box.append(glow, ring);
    if (backdropOption !== false) {
      backdrop = document.createElement("div");
      backdrop.className = "backdrop";
      if (backdropConfig.blur != null) {
        host.style.setProperty("--gua-backdrop-blur", `${backdropConfig.blur}px`);
      }
      created.root.appendChild(backdrop);
    }
    created.root.appendChild(box);
    document.body.appendChild(host);
    return box;
  };

  const resolveExcludes = (): Element[] => {
    const out: Element[] = [];
    for (const entry of backdropConfig.exclude ?? []) {
      const el = typeof entry === "string" ? document.getElementById(entry) : entry;
      if (el?.isConnected) out.push(el);
    }
    return out;
  };

  /** Veil holes: the target plus every excluded element, minus redundant ones. */
  const collectHoles = (target: Rect): Rect[] => {
    const holes: Rect[] = [];
    for (const el of resolveExcludes()) {
      const r = el.getBoundingClientRect();
      if (r.width && r.height) holes.push({ x: r.left, y: r.top, w: r.width, h: r.height });
    }
    if (!holes.some((h) => containsRect(h, target))) holes.push(target);
    // Overlapping holes would XOR back to veiled: drop duplicates, then any
    // hole fully inside another.
    const unique = holes.filter((h, i) => holes.findIndex((o) => rectsEqual(o, h)) === i);
    return unique.filter((h) => !unique.some((o) => o !== h && containsRect(o, h)));
  };

  // Cut holes in the veil: one mask layer covers everything, then one layer
  // per hole is XORed out (`mask-composite: exclude`).
  const writeBackdropMask = (holes: Rect[]) => {
    if (!backdrop) return;
    const layers = ["linear-gradient(#000 0 0)", ...holes.map(() => "linear-gradient(#000 0 0)")].join(", ");
    const positions = ["0 0", ...holes.map((h) => `${h.x}px ${h.y}px`)].join(", ");
    const sizes = ["100% 100%", ...holes.map((h) => `${h.w}px ${h.h}px`)].join(", ");
    const style = backdrop.style;
    for (const [prefix, composite] of [["mask", "exclude"], ["-webkit-mask", "xor"]] as const) {
      style.setProperty(`${prefix}-image`, layers);
      style.setProperty(`${prefix}-position`, positions);
      style.setProperty(`${prefix}-size`, sizes);
      style.setProperty(`${prefix}-composite`, Array(holes.length + 1).fill(composite).join(", "));
    }
  };

  const reposition = () => {
    if (!box || !current) return;
    if (!current.isConnected) {
      advance();
      return;
    }
    // Read every rect first, then write, so the writes don't force layout —
    // and skip all writes when nothing moved (the common case: the veil's
    // blur re-rasters on every style change, the priciest work on screen).
    const rect = current.getBoundingClientRect();
    const outer: Rect = {
      x: rect.left - PADDING,
      y: rect.top - PADDING,
      w: rect.width + PADDING * 2,
      h: rect.height + PADDING * 2,
    };
    const holes = backdrop ? collectHoles(outer) : [];
    const key = [outer, ...holes].map((r) => `${r.x},${r.y},${r.w},${r.h}`).join(";");
    if (key === lastFrameKey) return;
    lastFrameKey = key;
    box.style.left = `${outer.x}px`;
    box.style.top = `${outer.y}px`;
    box.style.width = `${outer.w}px`;
    box.style.height = `${outer.h}px`;
    writeBackdropMask(holes);
  };

  const loop = () => {
    if (!looping) return;
    reposition();
    schedule(loop);
  };

  const hide = () => {
    looping = false;
    current = null;
    queue = [];
    clearTimers();
    box?.classList.remove("on", "fading");
    backdrop?.classList.remove("on", "fading");
  };

  const scheduleFade = (delay: number) => {
    fadeTimer = setTimeout(() => {
      box?.classList.add("fading");
      backdrop?.classList.add("fading");
      fadeTimer = setTimeout(hide, FADE_MS);
    }, delay);
  };

  const show = (target: QueuedTarget) => {
    const b = ensureBox();
    current = target.el;
    currentDuration = target.duration;
    shownAt = Date.now();
    lastFrameKey = "";
    b.style.borderRadius = readRadius(target.el);
    b.classList.add("on");
    b.classList.remove("fading");
    backdrop?.classList.add("on");
    backdrop?.classList.remove("fading");
    reposition();
    if (!looping) {
      looping = true;
      schedule(loop);
    }
    if (queue.length) advanceTimer = setTimeout(advance, glowDwell);
    else scheduleFade(target.duration);
  };

  const advance = () => {
    clearTimers();
    let next: QueuedTarget | undefined;
    while ((next = queue.shift())) {
      if (next.el.isConnected) break;
    }
    if (next) {
      show(next);
      return;
    }
    if (current?.isConnected) {
      // Queue drained to nothing: let the current target finish its hold.
      scheduleFade(Math.max(0, currentDuration - (Date.now() - shownAt)));
    } else {
      hide();
    }
  };

  // Queue a resolved element for the tour (the common path).
  const enqueue = (el: Element, duration: number) => {
    queue.push({ el, duration });
    if (!current) {
      advance();
      return;
    }
    if (advanceTimer !== undefined) return; // a tour is already in progress
    // The current target is holding for its fade; move on once it has been
    // visible for the dwell time.
    clearTimers();
    const remainingDwell = Math.max(0, glowDwell - (Date.now() - shownAt));
    if (remainingDwell === 0) advance();
    else advanceTimer = setTimeout(advance, remainingDwell);
  };

  // Resolve a selector now, else poll until it mounts or WAIT_MS elapses. Lets
  // the ring follow tools that create their target asynchronously (React Flow
  // nodes, portals, lazily-rendered rows) instead of no-op'ing on a missing el.
  let disposed = false;
  const waitForSelector = (selector: string, duration: number) => {
    const start = Date.now();
    const tryResolve = () => {
      if (disposed) return;
      const el = document.querySelector(selector);
      if (el?.isConnected) {
        enqueue(el, duration);
        return;
      }
      if (Date.now() - start >= WAIT_MS) return; // gave up — no ring, no leak
      schedule(tryResolve);
    };
    tryResolve();
  };

  return {
    highlight(target, opts) {
      if (typeof document === "undefined") return;
      const duration = opts?.duration ?? glowDuration;
      if (typeof target === "string") {
        waitForSelector(target, duration);
        return;
      }
      if (!target.isConnected) return;
      enqueue(target, duration);
    },
    dispose() {
      disposed = true;
      hide();
      host?.remove();
      host = null;
      box = null;
      backdrop = null;
    },
  };
}

function containsRect(outer: Rect, inner: Rect): boolean {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.w <= outer.x + outer.w &&
    inner.y + inner.h <= outer.y + outer.h
  );
}

function rectsEqual(a: Rect, b: Rect): boolean {
  return a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;
}

function readRadius(el: Element): string {
  if (typeof window !== "undefined" && typeof window.getComputedStyle === "function") {
    const radius = window.getComputedStyle(el).borderRadius;
    if (radius && radius !== "0px") return radius;
  }
  return "12px";
}
