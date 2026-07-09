/**
 * Inline stylesheets for the visualizer's shadow roots.
 *
 * Everything is themeable through `--gua-*` custom properties, which pierce
 * shadow boundaries: set them via `AgentVisualizerOptions.theme` or from page
 * CSS targeting the host elements.
 */

export const CHIPS_CSS = `
:host {
  display: block;
  font: 500 13px/1.2 var(--gua-font, system-ui, sans-serif);
  color: var(--gua-chip-text, #3f3f46);
}
.list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.chip {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  border-radius: 10px;
  background: var(--gua-chip-bg, #f4f4f5);
  border: 1px solid var(--gua-chip-border, #e4e4e7);
}
.chip[data-status="denied"] { opacity: 0.6; }
.chip[data-status="error"] {
  border-color: rgba(220, 38, 38, 0.35);
  background: rgba(220, 38, 38, 0.08);
}
.chip[data-status="error"] .icon { color: #dc2626; }
.icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 14px;
  height: 14px;
  flex: none;
}
.icon svg { width: 14px; height: 14px; display: block; }
.label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.spinner {
  width: 11px;
  height: 11px;
  border-radius: 50%;
  border: 2px solid var(--gua-accent, #18181b);
  border-right-color: transparent;
  border-bottom-color: transparent;
  animation: gua-spin 0.7s linear infinite;
}
.locate {
  appearance: none;
  border: 0;
  background: none;
  padding: 2px;
  margin: -2px -6px -2px auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border-radius: 6px;
  color: inherit;
  opacity: 0.5;
  cursor: pointer;
  flex: none;
}
.locate:hover { opacity: 1; background: rgba(0, 0, 0, 0.07); }
.locate[hidden] { display: none; }
.locate svg { width: 14px; height: 14px; display: block; }
.thinking {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 4px 2px;
  opacity: 0.6;
}
.thinking .dots { display: inline-flex; gap: 3px; }
.thinking .dots span {
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: currentColor;
  animation: gua-pulse 1.2s ease-in-out infinite;
}
.thinking .dots span:nth-child(2) { animation-delay: 0.18s; }
.thinking .dots span:nth-child(3) { animation-delay: 0.36s; }
@keyframes gua-spin { to { transform: rotate(360deg); } }
@keyframes gua-pulse { 0%, 100% { opacity: 0.25; } 40% { opacity: 1; } }
@media (prefers-reduced-motion: reduce) {
  .spinner { animation-duration: 1.8s; }
  .thinking .dots span { animation: none; opacity: 0.6; }
}
`;

export const HIGHLIGHT_CSS = `
:host {
  position: fixed;
  left: 0;
  top: 0;
  width: 0;
  height: 0;
  pointer-events: none;
  z-index: 2147483646;
}
@property --gua-angle {
  syntax: "<angle>";
  inherits: false;
  initial-value: 0deg;
}
.backdrop {
  position: fixed;
  inset: 0;
  visibility: hidden;
  opacity: 0;
  background: rgba(255, 255, 255, 0.55);
  -webkit-backdrop-filter: blur(var(--gua-backdrop-blur, 3px));
  backdrop-filter: blur(var(--gua-backdrop-blur, 3px));
  transition: opacity 0.3s ease, visibility 0.3s;
  -webkit-mask-repeat: no-repeat;
  mask-repeat: no-repeat;
}
.backdrop.on { visibility: visible; opacity: 1; }
.backdrop.fading { opacity: 0; }
@media (prefers-color-scheme: dark) {
  .backdrop { background: rgba(9, 9, 11, 0.5); }
}
.box {
  position: fixed;
  display: none;
  transition: opacity 0.3s ease;
}
.box.on { display: block; }
.box.fading { opacity: 0; }
.glow, .ring {
  position: absolute;
  border-radius: inherit;
  box-sizing: border-box;
  background: conic-gradient(
    from var(--gua-angle, 0deg),
    var(--gua-glow-1, #7c8cf8),
    var(--gua-glow-2, #f0a6c8),
    var(--gua-glow-3, #7ee0c3),
    var(--gua-glow-1, #7c8cf8)
  );
  animation: gua-rotate 2.4s linear infinite;
  /* Both layers are masked to a border band: the element's content must stay
     fully readable — only its edges glow. */
  -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
  mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
  -webkit-mask-composite: xor;
  mask-composite: exclude;
}
/* Intensity is themeable so a host app can tune the ring to its own focus
   language (all --gua-* vars pierce the shadow root from page CSS on the
   host element, e.g. [data-gui-agent-highlight] { --gua-ring-width: 2px }):
   - --gua-ring-width    band width of the crisp ring (default 3px)
   - --gua-halo-size     how far the soft halo extends + its blur (default 12px)
   - --gua-halo-opacity  halo strength (default 0.55; 0 disables the halo) */
.ring {
  inset: 0;
  padding: var(--gua-ring-width, 3px);
}
.glow {
  /* Halo annulus: from the ring inward edge out to --gua-halo-size beyond it.
     The mask is applied after the blur, so nothing bleeds over the content. */
  inset: calc(-1 * var(--gua-halo-size, 12px));
  padding: calc(var(--gua-ring-width, 3px) + var(--gua-halo-size, 12px));
  filter: blur(var(--gua-halo-size, 12px));
  opacity: var(--gua-halo-opacity, 0.55);
}
@keyframes gua-rotate { to { --gua-angle: 360deg; } }
@media (prefers-reduced-motion: reduce) {
  .glow, .ring { animation: gua-breathe 2.4s ease-in-out infinite; }
  @keyframes gua-breathe { 0%, 100% { opacity: 0.4; } 50% { opacity: 0.8; } }
}
`;
