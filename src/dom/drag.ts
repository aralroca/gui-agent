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
import { GLOW_DWELL_MS, POINTER_TRAVEL_MS } from "../timing.js";
import { visibleCenter } from "./visible-point.js";

export interface DragTiming {
  /** Ms to hold the source before picking it up (the pointer travels to it). Default 0. */
  grabMs?: number;
  /** Ms between picking it up and letting go over the target (the pointer carries it). Default 0. */
  moveMs?: number;
}

/**
 * The pace of the `/ui` visualizer's pointer (with its default `glowDwell`):
 * it picks the source up when it lands on it and drops it when it lands on
 * the target, so the page moves the card as the copy is let go. Pass it to
 * {@link dragAndDrop} when the drag should be watched.
 */
export const VISIBLE_DRAG: Required<DragTiming> = { grabMs: POINTER_TRAVEL_MS, moveMs: GLOW_DWELL_MS };

export interface DragResult {
  /** The target accepted the drag and received `drop`. */
  dropped: boolean;
  /** The source cancelled `dragstart` (it can't be dragged right now). */
  refused: boolean;
}

/** Drag `source` onto `target`, firing the page's own drag and drop handlers. */
export async function dragAndDrop(source: Element, target: Element, timing: DragTiming = {}): Promise<DragResult> {
  const data = createDataTransfer();
  const fire = (el: Element, type: string) => el.dispatchEvent(dragEvent(type, el, data));

  await delay(timing.grabMs ?? 0);
  if (!fire(source, "dragstart")) return { dropped: false, refused: true };
  await delay(timing.moveMs ?? 0);
  data.dropEffect = initialDropEffect(data.effectAllowed);
  fire(target, "dragenter");
  // A target accepts by cancelling dragover with an effect the source allows; only then does it get the drop.
  const accepted = !fire(target, "dragover") && allows(data.effectAllowed, data.dropEffect);

  if (accepted) fire(target, "drop");
  else fire(target, "dragleave");
  if (!accepted) data.dropEffect = "none";
  fire(source, "dragend");

  return { dropped: accepted, refused: false };
}

/* The effect a browser proposes over a target, from what the source allows (HTML's drag and drop model). */
function initialDropEffect(allowed: string): DataTransfer["dropEffect"] {
  if (allowed === "none") return "none";
  if (allowed === "move" || allowed === "linkMove") return "move";
  if (allowed === "link") return "link";

  return "copy";
}

function allows(allowed: string, effect: string): boolean {
  if (effect === "none") return false;

  return allowed === "all" || allowed === "uninitialized" || allowed.toLowerCase().includes(effect);
}

function dragEvent(type: string, el: Element, dataTransfer: DataTransfer): Event {
  const at = visibleCenter(el);
  const init = { bubbles: true, cancelable: true, composed: true, clientX: at.x, clientY: at.y };
  // jsdom lacks DragEvent (and DragEvent only takes a real DataTransfer); a
  // MouseEvent with the transfer defined on it reads the same to a handler.
  const native = typeof DragEvent === "function" && typeof DataTransfer === "function" && dataTransfer instanceof DataTransfer;
  const event = native ? new DragEvent(type, { ...init, dataTransfer }) : new MouseEvent(type, init);

  if (!(event as DragEvent).dataTransfer) Object.defineProperty(event, "dataTransfer", { value: dataTransfer });

  return event;
}

/** A real `DataTransfer` where there is one, else a stand-in with the same string API. */
function createDataTransfer(): DataTransfer {
  try {
    return new DataTransfer();
  } catch {
    return memoryDataTransfer();
  }
}

function memoryDataTransfer(): DataTransfer {
  const store = new Map<string, string>();

  return {
    dropEffect: "none",
    effectAllowed: "all",
    get types() {
      return [...store.keys()];
    },
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

function delay(ms: number): Promise<void> {
  return ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve();
}
