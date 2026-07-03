/** Chip label resolution: built-in labels for the DOM fallback tools, plus a humanized fallback. */
import type { ToolCall } from "../types.js";

export type LabelValue = string | ((call: ToolCall) => string);

export const DEFAULT_LABELS: Record<string, LabelValue> = {
  click: "Clicking",
  fill: "Typing",
  select_option: "Selecting",
  read_page: "Reading page",
  wait_for_text: "Waiting",
  navigate: "Navigating",
};

/** `invite_member` → "Invite member". */
export function humanizeToolName(name: string): string {
  const words = name.replace(/[_-]+/g, " ").trim();
  return words ? words[0]!.toUpperCase() + words.slice(1) : name;
}

export function labelFor(call: ToolCall, labels: Record<string, LabelValue>): string {
  const label = labels[call.name];
  if (typeof label === "function") return label(call);
  if (typeof label === "string") return label;
  return humanizeToolName(call.name);
}
