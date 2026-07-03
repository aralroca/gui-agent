/** Shared shadow-host construction for the visualizer's UI surfaces. */
export function createShadowHost(marker: string, css: string): { host: HTMLElement; root: ShadowRoot } {
  const host = document.createElement("div");
  host.setAttribute(marker, "");
  const root = host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = css;
  root.appendChild(style);
  return { host, root };
}
