/**
 * The visualizer's pace, shared with what it illustrates. A drag paced by
 * `VISIBLE_DRAG` (dom/drag.ts) picks up when the pointer lands on the source
 * and drops when it lands on the target: the pointer says where it landed
 * with {@link POINTER_LANDED}, and the drag waits for it.
 */

/** How long the pointer takes to reach a target, in ms. */
export const POINTER_TRAVEL_MS = 380;

/** Minimum ms the glow (and so the pointer) stays on a target before the next queued one. */
export const GLOW_DWELL_MS = 500;

/** Fired on `window` with the element as `detail` when the visualizer's pointer lands on it, or the tour moves it on first. */
export const POINTER_LANDED = "gui-agent:pointer-landed";

/** The longest a drag waits for a pointer that may never reach its target (it left the page). */
const POINTER_WAIT_CAP_MS = 8000;

const pointerShown = () => typeof document !== "undefined" && !!document.querySelector("[data-gui-agent-cursor]");

/**
 * Wait until the pointer lands on `el`; with no pointer on the page, wait
 * `ms` instead — what the pointer would take with an empty tour.
 */
export function pointerReaches(el: Element, ms: number): Promise<void> {
  if (!pointerShown()) return new Promise((resolve) => setTimeout(resolve, ms));

  return new Promise((resolve) => {
    const done = () => {
      window.removeEventListener(POINTER_LANDED, landed);
      clearTimeout(cap);
      resolve();
    };
    const landed = (event: Event) => {
      if ((event as CustomEvent<Element>).detail === el) done();
    };
    const cap = setTimeout(done, POINTER_WAIT_CAP_MS);

    window.addEventListener(POINTER_LANDED, landed);
  });
}
