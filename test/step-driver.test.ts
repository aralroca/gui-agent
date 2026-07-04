import { afterEach, describe, expect, it } from "vitest";
import { createStepDriver } from "../src/step-driver.js";
import { createChipList } from "../src/ui/chips.js";
import type { ChipList } from "../src/ui/chips.js";
import type { AgentStep } from "../src/types.js";

const call = (id: string, name: string) => ({ id, name, arguments: {} });
const target = (element: HTMLElement) =>
  ({ action: "click", ref: "e1", element, name: "Save" }) as const;

describe("createStepDriver", () => {
  it("emits the AgentStep sequence with correlated targets", () => {
    const steps: AgentStep[] = [];
    const driver = createStepDriver((step) => steps.push(step));
    const el = document.createElement("button");

    driver.thinking();
    driver.toolStart(call("c1", "click"));
    driver.onTarget(target(el));
    driver.toolResult("c1", { content: [{ type: "text", text: "ok" }] });
    driver.done("all done");

    expect(steps.map((s) => s.type)).toEqual([
      "llm-request",
      "tool-call",
      "tool-target",
      "tool-result",
      "done",
    ]);
    const targetStep = steps[2] as Extract<AgentStep, { type: "tool-target" }>;
    expect(targetStep.call.id).toBe("c1");
    expect(targetStep.target.element).toBe(el);
  });

  it("drops targets when no call is active and correlates denials", () => {
    const steps: AgentStep[] = [];
    const driver = createStepDriver((step) => steps.push(step));

    driver.onTarget(target(document.createElement("div")));
    expect(steps).toHaveLength(0);

    driver.toolStart(call("c1", "fill"));
    driver.toolResult("c1", { content: [] });
    driver.onTarget(target(document.createElement("div")));
    expect(steps.map((s) => s.type)).toEqual(["tool-call", "tool-result"]);

    driver.toolDenied("c1");
    const denied = steps.at(-1) as Extract<AgentStep, { type: "tool-denied" }>;
    expect(denied.type).toBe("tool-denied");
    expect(denied.call.name).toBe("fill");
  });
});

describe("createStepDriver + chip list", () => {
  let chips: ChipList;

  afterEach(() => chips?.dispose());

  const chipEls = () =>
    [...chips.element.shadowRoot!.querySelectorAll<HTMLElement>(".chip")];
  const thinkingEl = () => chips.element.shadowRoot!.querySelector(".thinking");

  it("drives chip statuses through a full externally-run turn", () => {
    chips = createChipList();
    const driver = createStepDriver((step) => chips.onStep(step));

    driver.thinking();
    expect(thinkingEl()).toBeTruthy();

    driver.toolStart(call("c1", "click"));
    expect(thinkingEl()).toBeNull();
    expect(chipEls()[0]?.dataset.status).toBe("running");

    driver.toolResult("c1", { content: [{ type: "text", text: "ok" }] });
    expect(chipEls()[0]?.dataset.status).toBe("done");

    driver.toolStart(call("c2", "fill"));
    driver.toolResult("c2", { content: [], isError: true });
    expect(chipEls()[1]?.dataset.status).toBe("error");

    driver.toolStart(call("c3", "upload_file"));
    driver.toolDenied("c3");
    expect(chipEls()[2]?.dataset.status).toBe("denied");

    driver.done();
    expect(thinkingEl()).toBeNull();
  });
});
