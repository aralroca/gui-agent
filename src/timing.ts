/**
 * The visualizer's pace, shared with what it illustrates: a drag paced by
 * `VISIBLE_DRAG` (dom/drag.ts) picks up when the pointer lands on the source
 * and drops when it lands on the target, because both are derived from these.
 */

/** How long the pointer takes to reach a target, in ms. */
export const POINTER_TRAVEL_MS = 380;

/** Minimum ms the glow (and so the pointer) stays on a target before the next queued one. */
export const GLOW_DWELL_MS = 500;
