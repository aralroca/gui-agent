import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { dispatchFileDrop, setFileInput } from "../src/dom/files.js";
import { stubDataTransfer } from "./helpers.js";

describe("setFileInput / dispatchFileDrop", () => {
  beforeEach(() => {
    stubDataTransfer();
    document.body.innerHTML = `<input id="upload" type="file" /><div id="zone">Drop here</div>`;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = "";
  });

  it("sets input.files and fires input + change (in order)", () => {
    const input = document.getElementById("upload") as HTMLInputElement;
    const events: string[] = [];
    input.addEventListener("input", () => events.push("input"));
    input.addEventListener("change", () => events.push("change"));

    const file = new File(["face"], "face.png", { type: "image/png" });
    setFileInput(input, [file]);

    expect(input.files?.length).toBe(1);
    expect(input.files?.[0]).toBe(file);
    expect(events).toEqual(["input", "change"]);
  });

  it("rejects non-file inputs", () => {
    document.body.innerHTML = `<input id="text" type="text" />`;
    const input = document.getElementById("text") as HTMLInputElement;
    expect(() => setFileInput(input, [])).toThrow(/not a file input/);
  });

  it("delivers dragenter → dragover → drop with the files on dataTransfer", () => {
    const zone = document.getElementById("zone")!;
    const seen: string[] = [];
    let dropped: FileList | undefined;
    for (const type of ["dragenter", "dragover", "drop"]) {
      zone.addEventListener(type, (event) => {
        seen.push(type);
        if (type === "drop") dropped = (event as DragEvent).dataTransfer?.files;
      });
    }

    const file = new File(["csv"], "import.csv", { type: "text/csv" });
    dispatchFileDrop(zone, [file]);

    expect(seen).toEqual(["dragenter", "dragover", "drop"]);
    expect(dropped?.length).toBe(1);
    expect(dropped?.[0]).toBe(file);
  });
});
