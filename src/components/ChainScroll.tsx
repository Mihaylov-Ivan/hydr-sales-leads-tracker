"use client";

import {
  useEffect,
  useRef,
  type CSSProperties,
  type ReactNode,
  type TextareaHTMLAttributes,
} from "react";
import { chainWheelToScrollParent } from "@/lib/scroll-chain";

/**
 * Nested overflow list. Uses native scroll chaining (smooth) — no JS wheel
 * interception. Keep `overscroll-behavior` at auto so the page can continue
 * scrolling when this list hits its edge.
 */
export default function ChainScroll({
  className,
  style,
  children,
}: {
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  return (
    <div
      className={className}
      style={{ overscrollBehaviorY: "auto", ...style }}
    >
      {children}
    </div>
  );
}

/** Textarea that forwards wheel to the page when it cannot scroll further. */
export function ChainTextarea({
  className,
  style,
  ...rest
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const onWheel = (e: WheelEvent) => {
      chainWheelToScrollParent(el, e);
    };

    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  return (
    <textarea
      ref={ref}
      className={className}
      {...rest}
      style={{ overscrollBehaviorY: "auto", ...style }}
    />
  );
}
