/**
 * The demo's "Board" tab: a small kanban moved with plain HTML5 drag and drop
 * (draggable cards, columns that accept them on dragover and move them on
 * drop). Nothing here knows about the agent: it drags a card with the DOM
 * fallback's `drag` tool, which fires these same handlers, and the pointer
 * carries a copy of the card to its new column.
 */

export const BOARD_COLUMNS = ["Todo", "In progress", "Done"] as const;

const CARDS: { id: string; title: string; column: (typeof BOARD_COLUMNS)[number] }[] = [
  { id: "card-1", title: "Fix login redirect", column: "Todo" },
  { id: "card-2", title: "Write release notes", column: "Todo" },
  { id: "card-3", title: "Dark mode for settings", column: "In progress" },
  { id: "card-4", title: "Upgrade the SDK", column: "Done" },
];

function cardElement(card: (typeof CARDS)[number]): HTMLElement {
  const el = document.createElement("div");

  el.className = "card";
  el.id = card.id;
  el.draggable = true;
  el.textContent = card.title;
  el.addEventListener("dragstart", (e) => {
    e.dataTransfer!.setData("text/plain", card.id);
    e.dataTransfer!.effectAllowed = "move";
    el.classList.add("dragging");
  });
  el.addEventListener("dragend", () => el.classList.remove("dragging"));

  return el;
}

function columnElement(name: string, onMove: (title: string, column: string) => void): HTMLElement {
  const el = document.createElement("section");

  el.className = "column";
  el.setAttribute("aria-label", name);
  // Tells people (and the agent's page outline) that cards can be dropped here.
  el.setAttribute("aria-dropeffect", "move");
  el.innerHTML = `<h3>${name}</h3>`;
  el.addEventListener("dragover", (e) => {
    e.preventDefault();
    el.classList.add("over");
  });
  el.addEventListener("dragleave", () => el.classList.remove("over"));
  el.addEventListener("drop", (e) => {
    const card = document.getElementById(e.dataTransfer!.getData("text/plain"));

    e.preventDefault();
    el.classList.remove("over");
    if (!card || card.parentElement === el) return;
    el.appendChild(card);
    onMove(card.textContent ?? "", name);
  });

  return el;
}

export function mountBoard(root: HTMLElement, onMove: (title: string, column: string) => void): void {
  const columns = new Map(BOARD_COLUMNS.map((name) => [name, columnElement(name, onMove)]));

  for (const card of CARDS) columns.get(card.column)!.appendChild(cardElement(card));
  root.append(...columns.values());
}
