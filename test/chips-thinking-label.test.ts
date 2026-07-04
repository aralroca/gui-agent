import { afterEach, describe, expect, it } from "vitest";
import { createChipList } from "../src/ui/chips.js";
import type { ChipList } from "../src/ui/chips.js";

describe("chips thinkingLabel", () => {
  let chips: ChipList;

  afterEach(() => chips?.dispose());

  it("renders a custom thinking label", () => {
    chips = createChipList({ thinkingLabel: "Pensando" });
    chips.onStep({ type: "llm-request", messages: [], tools: [] });
    const thinking = chips.element.shadowRoot!.querySelector(".thinking");
    expect(thinking?.textContent).toContain("Pensando");
    expect(thinking?.textContent).not.toContain("Thinking");
  });

  it("defaults to the English label", () => {
    chips = createChipList();
    chips.onStep({ type: "llm-request", messages: [], tools: [] });
    expect(chips.element.shadowRoot!.querySelector(".thinking")?.textContent).toContain("Thinking");
  });
});
