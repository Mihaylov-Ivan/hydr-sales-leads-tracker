"use client";

import { useEffect, useRef, type DependencyList } from "react";
import { readUiPref, writeUiPref } from "@/lib/ui-prefs";

const STORAGE_KEY = "hydr-scroll-positions-v1";

export type ScrollPos = {
  top: number;
  left?: number;
};

function readAll(): Record<string, ScrollPos> {
  const raw = readUiPref<Record<string, ScrollPos>>(STORAGE_KEY, {});
  if (!raw || typeof raw !== "object") return {};
  return raw;
}

export function getScrollPos(id: string): ScrollPos {
  const saved = readAll()[id];
  if (!saved || typeof saved !== "object") return { top: 0 };
  return {
    top: typeof saved.top === "number" ? saved.top : 0,
    ...(typeof saved.left === "number" ? { left: saved.left } : {}),
  };
}

export function setScrollPos(id: string, pos: ScrollPos): void {
  const all = readAll();
  const top = Math.max(0, Math.round(pos.top));
  const left =
    pos.left !== undefined ? Math.max(0, Math.round(pos.left)) : undefined;
  if (top === 0 && (left === undefined || left === 0)) {
    if (!(id in all)) return;
    delete all[id];
  } else {
    all[id] = {
      top,
      ...(left !== undefined && left > 0 ? { left } : {}),
    };
  }
  writeUiPref(STORAGE_KEY, all);
}

/**
 * Persist scrollTop/scrollLeft for a container across navigations and refresh.
 * `restoreDeps` re-applies the saved position when layout content changes
 * (e.g. projects finished loading) without wiping the stored value.
 */
export function usePersistedScroll(
  id: string | null | undefined,
  restoreDeps: DependencyList = [],
) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!id) return;
    const el = ref.current;
    if (!el) return;

    const apply = () => {
      const saved = getScrollPos(id);
      if (saved.top > 0) el.scrollTop = saved.top;
      if (saved.left && saved.left > 0) el.scrollLeft = saved.left;
    };

    apply();
    const raf = requestAnimationFrame(apply);
    const t1 = window.setTimeout(apply, 50);
    const t2 = window.setTimeout(apply, 250);

    const persist = () => {
      setScrollPos(id, { top: el.scrollTop, left: el.scrollLeft });
    };
    let rafWrite = 0;
    const onScroll = () => {
      cancelAnimationFrame(rafWrite);
      rafWrite = requestAnimationFrame(persist);
    };
    el.addEventListener("scroll", onScroll, { passive: true });

    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      cancelAnimationFrame(rafWrite);
      // Only persist non-zero positions on teardown. A layout remount often
      // resets scrollTop to 0 before this cleanup; wiping would lose the
      // saved place. Intentional scroll-to-top is handled by onScroll.
      if (el.scrollTop > 0 || el.scrollLeft > 0) {
        persist();
      }
      el.removeEventListener("scroll", onScroll);
    };
    // restoreDeps intentionally re-run restore after content/layout settles
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, ...restoreDeps]);

  return ref;
}
