/**
 * Nested overflow regions + AppShell custom scroll containers don't chain
 * wheels to the page smoothly by default. These helpers forward edge /
 * non-overflow wheel deltas to the nearest scrollable ancestor, coalesced
 * with rAF so trackpad bursts stay smooth.
 */

function canScrollY(el: HTMLElement): boolean {
  const style = getComputedStyle(el);
  const oy = style.overflowY;
  if (oy !== "auto" && oy !== "scroll" && oy !== "overlay") return false;
  return el.scrollHeight > el.clientHeight + 1;
}

/** Nearest ancestor that actually scrolls vertically (skips `el` itself). */
export function findScrollParent(el: HTMLElement): HTMLElement | null {
  let node: HTMLElement | null = el.parentElement;
  while (node && node !== document.body) {
    if (canScrollY(node)) return node;
    node = node.parentElement;
  }
  const root = document.scrollingElement;
  return root instanceof HTMLElement ? root : null;
}

function normalizeDeltaY(e: WheelEvent): number {
  let dy = e.deltaY;
  // 0 = pixels, 1 = lines, 2 = pages
  if (e.deltaMode === 1) dy *= 16;
  else if (e.deltaMode === 2) dy *= typeof window !== "undefined" ? window.innerHeight : 800;
  return dy;
}

/** Pending deltas keyed by scroll parent, flushed once per frame. */
const pendingByParent = new WeakMap<HTMLElement, number>();
const rafByParent = new WeakMap<HTMLElement, number>();

function enqueueParentScroll(parent: HTMLElement, deltaY: number) {
  pendingByParent.set(
    parent,
    (pendingByParent.get(parent) ?? 0) + deltaY,
  );
  if (rafByParent.has(parent)) return;

  const raf = requestAnimationFrame(() => {
    rafByParent.delete(parent);
    const dy = pendingByParent.get(parent) ?? 0;
    pendingByParent.delete(parent);
    if (dy === 0) return;
    // Instant jump matching native wheel frames (not CSS smooth — that lags).
    parent.scrollTop += dy;
  });
  rafByParent.set(parent, raf);
}

/**
 * If `el` cannot scroll further in the wheel direction, scroll its parent
 * instead. Call from a non-passive `wheel` listener.
 */
export function chainWheelToScrollParent(
  el: HTMLElement,
  e: WheelEvent,
): void {
  const dy = normalizeDeltaY(e);
  if (dy === 0) return;

  const maxScroll = el.scrollHeight - el.clientHeight;
  const canScroll = maxScroll > 1;
  const atTop = el.scrollTop <= 0;
  const atBottom = el.scrollTop >= maxScroll - 1;
  const scrollingUp = dy < 0;
  const scrollingDown = dy > 0;

  const atEdge =
    !canScroll ||
    (scrollingUp && atTop) ||
    (scrollingDown && atBottom);

  if (!atEdge) return;

  const parent = findScrollParent(el);
  if (!parent || parent === el) return;

  e.preventDefault();
  enqueueParentScroll(parent, dy);
}
