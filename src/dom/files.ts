/**
 * File-injection primitives.
 *
 * Programmatic file "uploads" can't set `input.value`; the only scriptable path
 * is a `DataTransfer`-built `FileList`. These helpers cover the two surfaces a
 * page can expose: a bare `<input type="file">` and a drag-and-drop zone.
 */

/**
 * Set a file input's files via `DataTransfer` and fire the native events, so
 * both plain listeners and React controlled inputs notice the change.
 */
export function setFileInput(input: HTMLInputElement, files: File[]): void {
  if (input.type !== "file") {
    throw new Error("Element is not a file input.");
  }
  const list = toFileList(files);
  try {
    input.files = list;
  } catch {
    // Non-browser DOMs (jsdom) brand-check the FileList; define an own
    // property so tests with a stubbed DataTransfer still work.
    Object.defineProperty(input, "files", { value: list, configurable: true });
  }
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

/**
 * Simulate dropping files onto an element (`dragenter` → `dragover` → `drop`,
 * all carrying a populated `dataTransfer`), for dropzone-style uploaders.
 */
export function dispatchFileDrop(target: Element, files: File[]): void {
  const dataTransfer = withDataTransfer(files);
  for (const type of ["dragenter", "dragover", "drop"] as const) {
    const event = new Event(type, { bubbles: true, cancelable: true }) as DragEvent;
    // DragEvent's `dataTransfer` is read-only (and its constructor can't set
    // it), so define it directly; jsdom lacks DragEvent entirely.
    Object.defineProperty(event, "dataTransfer", { value: dataTransfer });
    target.dispatchEvent(event);
  }
}

function toFileList(files: File[]): FileList {
  return withDataTransfer(files).files;
}

function withDataTransfer(files: File[]): DataTransfer {
  const dataTransfer = new DataTransfer();
  for (const file of files) dataTransfer.items.add(file);
  return dataTransfer;
}
