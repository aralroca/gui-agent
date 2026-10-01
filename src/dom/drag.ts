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

export interface DragTiming {
  /** Ms to hold the source before picking it up (the pointer travels to it). Default 0. */
  grabMs?: number;
  /** Ms between picking it up and letting go over the target (the pointer carries it). Default 0. */
  moveMs?: number;
}

/**
 * The pace the `/ui` visualizer's pointer moves at: it lands on the source,
 * then carries a copy of it to the target. Pass it to {@link dragAndDrop}
 * when the drag should be watched.
 */
export const VISIBLE_DRAG: Required<DragTiming> = { grabMs: 450, moveMs: 700 };

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
  fire(target, "dragenter");
  // A target says it accepts by cancelling dragover; only then does it get the drop.
  const accepted = !fire(target, "dragover");

  if (accepted) fire(target, "drop");
  else fire(target, "dragleave");
  fire(source, "dragend");

  return { dropped: accepted, refused: false };
}

function dragEvent(type: string, el: Element, dataTransfer: DataTransfer): Event {
  const rect = el.getBoundingClientRect();
  const init = {
    bubbles: true,
    cancelable: true,
    composed: true,
    clientX: rect.left + rect.width / 2,
    clientY: rect.top + rect.height / 2,
  };
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
