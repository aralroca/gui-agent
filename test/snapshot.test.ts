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

  // Regression: a command-palette / combobox (cmdk, Radix) renders its results
  // as `role="option"` rows that are neither <button>/<a> nor tabbable. If the
  // snapshot omits them the agent fills the search box, sees no results in the
  // outline, and can never click a result to navigate — exactly the "search
  // doesn't complete" bug in the console's global search.
  it("lists combobox/listbox result options so they can be clicked", () => {
    document.body.innerHTML = `
      <div role="dialog" aria-label="Global search">
        <input role="combobox" aria-expanded="true"
               placeholder="Search pages, sessions, users, businesses…" />
        <div role="listbox">
          <div role="option">Alejandro Rosás García</div>
          <div role="option">Home</div>
        </div>
      </div>
    `;
    const snap = new DomSnapshotter();
    const text = snap.snapshot();

    // The searchbox itself is already captured (it's an <input>)…
    expect(text).toMatch(/\[e\d+\] combobox "Search pages, sessions, users, businesses…"/);
    // …but the results must be captured too, and be resolvable back to the live
    // node so `click` can open them.
    expect(text).toMatch(/\[e\d+\] option "Alejandro Rosás García"/);
    const ref = text.match(/\[(e\d+)\] option "Alejandro Rosás García"/)?.[1];
    expect(ref).toBeTruthy();
    expect(snap.resolve(ref!)?.textContent).toContain("Alejandro Rosás García");
  });
});
