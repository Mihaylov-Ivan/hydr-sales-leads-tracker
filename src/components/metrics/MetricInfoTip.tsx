"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";

interface MetricInfoTipProps {
  title: string;
  text: string;
  onOpenChange?: (open: boolean) => void;
}

const PANEL_WIDTH_PX = 288; // sm:w-72
const VIEW_MARGIN = 12;

/** Small “i” control that opens a plain-language explanation. */
export default function MetricInfoTip({
  title,
  text,
  onOpenChange,
}: MetricInfoTipProps) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(
    null,
  );
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelId = useId();

  function setOpenState(next: boolean) {
    setOpen(next);
    onOpenChange?.(next);
    if (!next) setCoords(null);
  }

  function placePanel() {
    const trigger = rootRef.current?.getBoundingClientRect();
    if (!trigger) return;

    const width = panelRef.current?.offsetWidth || PANEL_WIDTH_PX;
    const height = panelRef.current?.offsetHeight || 120;

    // Prefer aligning to the trigger’s left (opens rightward).
    let left = trigger.left;
    const maxLeft = window.innerWidth - width - VIEW_MARGIN;
    if (left > maxLeft) left = Math.max(VIEW_MARGIN, maxLeft);
    if (left < VIEW_MARGIN) left = VIEW_MARGIN;

    // Prefer below the trigger; flip above if needed.
    let top = trigger.bottom + 8;
    const maxTop = window.innerHeight - height - VIEW_MARGIN;
    if (top > maxTop) {
      top = Math.max(VIEW_MARGIN, trigger.top - height - 8);
    }

    setCoords({ top, left });
  }

  useLayoutEffect(() => {
    if (!open) return;
    placePanel();
    // Re-measure after paint once panel height is known
    const id = requestAnimationFrame(() => placePanel());
    return () => cancelAnimationFrame(id);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onReposition() {
      placePanel();
    }
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node) &&
          !panelRef.current?.contains(e.target as Node)) {
        setOpen(false);
        onOpenChange?.(false);
        setCoords(null);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        onOpenChange?.(false);
        setCoords(null);
      }
    }
    window.addEventListener("resize", onReposition);
    window.addEventListener("scroll", onReposition, true);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("resize", onReposition);
      window.removeEventListener("scroll", onReposition, true);
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onOpenChange]);

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        aria-label={`About ${title}`}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          setOpenState(!open);
        }}
        className="flex h-5 w-5 items-center justify-center rounded-full border border-line bg-white text-[11px] font-bold leading-none text-muted transition hover:border-teal-accent hover:text-teal-accent"
      >
        i
      </button>
      {open && (
        <div
          ref={panelRef}
          id={panelId}
          role="dialog"
          aria-label={title}
          onClick={(e) => e.stopPropagation()}
          style={
            coords
              ? {
                  position: "fixed",
                  top: coords.top,
                  left: coords.left,
                  width: PANEL_WIDTH_PX,
                }
              : {
                  position: "fixed",
                  // Hide until measured to avoid a one-frame off-screen flash
                  top: -9999,
                  left: -9999,
                  width: PANEL_WIDTH_PX,
                }
          }
          className="z-[100] rounded-lg border border-line bg-white p-3 text-left shadow-xl"
        >
          <p className="text-[11px] font-bold uppercase tracking-wide text-deep">
            {title}
          </p>
          <p className="mt-1.5 text-xs leading-relaxed text-ink">{text}</p>
        </div>
      )}
    </div>
  );
}
