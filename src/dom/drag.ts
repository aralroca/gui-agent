/**
 * Drag and drop, the way a mouse does it.
 *
 * HTML5 drag and drop can't be started from script, but a page only ever sees
 * its events: `dragstart` on what is picked up, `dragenter`/`dragover` on what
 * it passes over, `drop` where it is let go and `dragend` back on the source,
 * all sharing one `DataTransfer`. Replaying that sequence runs the page's own
 * handlers, so its rules still decide: a target that does not accept the drag
 * (does not `preventDefault()` its `dragover`) gets no `drop`, exactly as with
 * a real mouse.
 */
import { GLOW_DWELL_MS, POINTER_TRAVEL_MS, pointerReaches } from "../timing.js";
import { allows, createDragTransfer, initialDropEffect } from "./drag-transfer.js";
import { visibleCenter } from "./visible-point.js";

export interface DragTiming {
  /** Ms to hold the source before picking it up (the pointer travels to it). Default 0. */
  grabMs?: number;
  /** Ms between picking it up and letting go over the target (the pointer carries it). Default 0. */
  moveMs?: number;
  /**
   * Pick up when the visualizer's pointer lands on the source and drop when
   * it lands on the target, however long its tour takes; `grabMs`/`moveMs`
   * are then what is waited when no pointer is shown.
   */
  followPointer?: boolean;
}

/**
 * Paced by the `/ui` visualizer's pointer: the page moves the card as the
 * pointer lets its copy go. Without a pointer, the pace of an empty tour.
 * Pass it to {@link dragAndDrop} when the drag should be watched.
 */
export const VISIBLE_DRAG: Required<DragTiming> = { grabMs: POINTER_TRAVEL_MS, moveMs: GLOW_DWELL_MS, followPointer: true };

export interface DragResult {
  /** The target accepted the drag and handled its `drop` (cancelled it). */
  dropped: boolean;
  /** The source cancelled `dragstart` (it can't be dragged right now). */
  refused: boolean;
}

/** Drag `source` onto `target`, firing the page's own drag and drop handlers. */
export async function dragAndDrop(source: Element, target: Element, timing: DragTiming = {}): Promise<DragResult> {
  const data = createDragTransfer();
  // Events carry where the pointer is: over the element itself, except dragend, sent to the source from where it was let go.
  const fire = (el: Element, type: string, at = visibleCenter(el)) => el.dispatchEvent(dragEvent(type, at, data));
  const wait = (el: Element, ms = 0) => (timing.followPointer ? pointerReaches(el, ms) : delay(ms));

  await wait(source, timing.grabMs);
  if (!fire(source, "dragstart")) return { dropped: false, refused: true };
  await wait(target, timing.moveMs);
  data.dropEffect = initialDropEffect(data.effectAllowed);
  fire(target, "dragenter");
  // A target accepts by cancelling dragover with an effect the source allows; only then does it get the drop.
  const accepted = !fire(target, "dragover") && allows(data.effectAllowed, data.dropEffect);

  // The target handles the drop by cancelling it; a drop it lets through moved nothing.
  const dropped = accepted && !fire(target, "drop");

  if (!accepted) fire(target, "dragleave");
  if (!dropped) data.dropEffect = "none";
  fire(source, "dragend", visibleCenter(target));

  return { dropped, refused: false };
}

/* A DragEvent where there is one (jsdom has none), carrying our transfer in place of the frozen native one. */
function dragEvent(type: string, at: { x: number; y: number }, dataTransfer: DataTransfer): Event {
  const init = { bubbles: true, cancelable: true, composed: true, clientX: at.x, clientY: at.y };
  const event = typeof DragEvent === "function" ? new DragEvent(type, init) : new MouseEvent(type, init);

  Object.defineProperty(event, "dataTransfer", { value: dataTransfer });

  return event;
}

function delay(ms: number): Promise<void> {
  return ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve();
}
