/**
 * Where on an element a pointer acts: the center of the part of it that is
 * on screen. A tall column or a wide row is often only partly in the
 * viewport, and its own center can be below the fold — a pointer sent there
 * would land (and a drag would drop) where nobody can see it. With nothing of
 * the element on screen, its center is all there is.
 */
export function visibleCenter(el: Element): { x: number; y: number } {
  const rect = el.getBoundingClientRect();
  const left = Math.max(rect.left, 0);
  const top = Math.max(rect.top, 0);
  const right = Math.min(rect.left + rect.width, window.innerWidth || Infinity);
  const bottom = Math.min(rect.top + rect.height, window.innerHeight || Infinity);

  if (right <= left || bottom <= top) return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };

  return { x: (left + right) / 2, y: (top + bottom) / 2 };
}
