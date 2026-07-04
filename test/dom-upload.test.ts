import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerDomTools } from "../src/dom/register.js";
import { ToolRegistry } from "../src/registry.js";
import { envelopeToText } from "../src/result.js";
import { stubDataTransfer } from "./helpers.js";
import type { DomTargetEvent } from "../src/types.js";

describe("upload_file DOM tool", () => {
  let registry: ToolRegistry;
  const face = new File(["face"], "face.png", { type: "image/png" });

  beforeEach(() => {
    stubDataTransfer();
    registry = new ToolRegistry();
    document.body.innerHTML = `
      <input id="upload" type="file" aria-label="Face image" />
      <div id="zone" role="button" aria-label="Drop CSV here">Drop CSV here</div>
    `;
  });

  afterEach(() => {
    registry.clear();
    vi.unstubAllGlobals();
    document.body.innerHTML = "";
  });

  const register = (resolve: (id: string) => Promise<File | null>) => {
    const onTarget = vi.fn<(event: DomTargetEvent) => void>();
    registerDomTools({ registry, skipModelContext: true, resolveAttachment: resolve, onTarget });
    return onTarget;
  };

  const refFor = async (name: string): Promise<string> => {
    const page = envelopeToText(await registry.get("read_page")!.execute({}));
    const ref = new RegExp(`\\[(e\\d+)\\][^\\n]*${name}`).exec(page)?.[1];
    if (!ref) throw new Error(`no ref for ${name} in:\n${page}`);
    return ref;
  };

  it("is not registered without resolveAttachment", () => {
    registerDomTools({ registry, skipModelContext: true });
    expect(registry.has("upload_file")).toBe(false);
  });

  it("resolves the attachment into a file input and notifies the target", async () => {
    const onTarget = register(async (id) => (id === "att_1" ? face : null));
    const ref = await refFor("Face image");
    const input = document.getElementById("upload") as HTMLInputElement;
    const changed = vi.fn();
    input.addEventListener("change", changed);

    const result = await registry.get("upload_file")!.execute({ ref, attachment: "att_1" });

    expect(result.isError).toBeUndefined();
    expect(envelopeToText(result)).toContain("Uploaded face.png");
    expect(input.files?.[0]).toBe(face);
    expect(changed).toHaveBeenCalled();
    expect(onTarget).toHaveBeenCalledWith(
      expect.objectContaining({ action: "upload_file", ref, element: input }),
    );
  });

  it("drops onto non-input targets", async () => {
    register(async () => face);
    const ref = await refFor("Drop CSV here");
    const zone = document.getElementById("zone")!;
    let dropped: FileList | undefined;
    zone.addEventListener("drop", (event) => {
      dropped = (event as DragEvent).dataTransfer?.files;
    });

    const result = await registry.get("upload_file")!.execute({ ref, attachment: "att_1" });

    expect(result.isError).toBeUndefined();
    expect(dropped?.[0]).toBe(face);
  });

  it("returns an error envelope for unknown attachments", async () => {
    register(async () => null);
    const ref = await refFor("Face image");

    const result = await registry.get("upload_file")!.execute({ ref, attachment: "att_99" });

    expect(result.isError).toBe(true);
    expect(envelopeToText(result)).toContain('Unknown attachment "att_99"');
  });
});
