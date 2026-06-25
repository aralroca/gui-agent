import { beforeEach, describe, expect, it } from "vitest";
import { DomSnapshotter } from "../src/dom/snapshot.js";

describe("DomSnapshotter", () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <h1>Users</h1>
      <label for="email">Email</label>
      <input id="email" type="email" />
      <button>Save</button>
      <a href="/help">Help</a>
      <span hidden><button>Ghost</button></span>
    `;
  });

  it("outlines headings and interactive elements with stable refs", () => {
    const snap = new DomSnapshotter();
    const text = snap.snapshot();

    expect(text).toContain("# Users");
    expect(text).toMatch(/\[e\d+\] textbox "Email"/);
    expect(text).toMatch(/\[e\d+\] button "Save"/);
    expect(text).toMatch(/\[e\d+\] link "Help"/);
  });

  it("hides aria-hidden / hidden elements", () => {
    const snap = new DomSnapshotter();
    expect(snap.snapshot()).not.toContain("Ghost");
  });

  it("keeps refs stable across snapshots and resolves them", () => {
    const snap = new DomSnapshotter();
    const first = snap.snapshot();
    const second = snap.snapshot();
    const ref = first.match(/\[(e\d+)\] textbox "Email"/)?.[1];
    expect(ref).toBeTruthy();
    expect(second).toContain(`[${ref}] textbox "Email"`);
    expect(snap.resolve(ref!)).toBe(document.getElementById("email"));
  });

  it("reports input value state", () => {
    const input = document.getElementById("email") as HTMLInputElement;
    input.value = "a@b.com";
    const snap = new DomSnapshotter();
    expect(snap.snapshot()).toContain('value="a@b.com"');
  });
});
