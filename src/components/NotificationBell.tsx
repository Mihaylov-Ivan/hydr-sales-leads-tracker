"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useProjects } from "@/lib/store";
import type { AppNotification } from "@/lib/notifications";

function relativeTime(iso: string): string {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "";
  const diffSec = Math.round((Date.now() - t) / 1000);
  if (diffSec < 60) return "just now";
  const min = Math.round(diffSec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const days = Math.round(hr / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  });
}

function BellIcon({ filled }: { filled?: boolean }) {
  return (
    <svg viewBox="0 0 20 20" className="h-4 w-4 fill-current" aria-hidden>
      {filled ? (
        <path d="M10 2a5 5 0 0 0-5 5v1.6c0 .7-.2 1.4-.6 2L3.2 12.4A1 1 0 0 0 4 14h12a1 1 0 0 0 .8-1.6L15.6 10.6c-.4-.6-.6-1.3-.6-2V7a5 5 0 0 0-5-5Zm0 16a2.5 2.5 0 0 0 2.45-2h-4.9A2.5 2.5 0 0 0 10 18Z" />
      ) : (
        <path d="M10 2a5 5 0 0 0-5 5v1.6c0 .7-.2 1.4-.6 2L3.2 12.4A1 1 0 0 0 4 14h12a1 1 0 0 0 .8-1.6L15.6 10.6c-.4-.6-.6-1.3-.6-2V7a5 5 0 0 0-5-5Zm0 1.5A3.5 3.5 0 0 1 13.5 7v1.6c0 .9.3 1.8.8 2.5l.9 1.4H4.8l.9-1.4c.5-.7.8-1.6.8-2.5V7A3.5 3.5 0 0 1 10 3.5ZM10 18a2.5 2.5 0 0 0 2.45-2h-4.9A2.5 2.5 0 0 0 10 18Z" />
      )}
    </svg>
  );
}

export default function NotificationBell() {
  const {
    notifications,
    unreadNotificationCount,
    markNotificationRead,
    markAllNotificationsRead,
    currentUserId,
    teamMembers,
  } = useProjects();
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const mine = notifications.filter(
    (n) => !currentUserId || n.recipientUserId === currentUserId,
  );
  const unread = unreadNotificationCount;

  useEffect(() => {
    if (!open || !btnRef.current) {
      setPos(null);
      return;
    }
    function update() {
      const btn = btnRef.current;
      if (!btn) return;
      const r = btn.getBoundingClientRect();
      const menuW = 320;
      const pad = 8;
      let left = r.right - menuW;
      left = Math.min(Math.max(pad, left), window.innerWidth - pad - menuW);
      setPos({ top: r.bottom + 6, left });
    }
    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      const t = e.target as Node;
      if (btnRef.current?.contains(t) || panelRef.current?.contains(t)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function actorName(n: AppNotification): string {
    if (!n.actorUserId) return "Someone";
    return teamMembers.find((m) => m.id === n.actorUserId)?.name ?? "Someone";
  }

  if (!currentUserId) return null;

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        title="Notifications"
        className="relative inline-flex h-[38px] w-[38px] items-center justify-center rounded-lg border border-line bg-panel text-deep shadow-sm transition hover:border-teal-accent/40 hover:text-teal-accent"
      >
        <BellIcon filled={unread > 0} />
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-accent px-1 text-[10px] font-bold text-white">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {open &&
        pos &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={panelRef}
            role="menu"
            className="fixed z-[80] flex max-h-[min(28rem,70vh)] w-80 flex-col overflow-hidden rounded-xl border border-line bg-panel shadow-lg"
            style={{ top: pos.top, left: pos.left }}
          >
            <div className="flex shrink-0 items-center justify-between gap-2 border-b border-line px-3 py-2.5">
              <h2 className="text-xs font-bold uppercase tracking-wide text-deep">
                Notifications
              </h2>
              {unread > 0 && (
                <button
                  type="button"
                  onClick={() => markAllNotificationsRead()}
                  className="text-[11px] font-semibold text-teal-accent hover:underline"
                >
                  Mark all read
                </button>
              )}
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {mine.length === 0 ? (
                <p className="px-3 py-8 text-center text-xs text-muted">
                  No notifications yet.
                </p>
              ) : (
                <ul className="divide-y divide-line">
                  {mine.map((n) => {
                    const unreadItem = !n.readAt;
                    const content = (
                      <>
                        <p
                          className={`text-sm ${
                            unreadItem
                              ? "font-semibold text-deep"
                              : "font-medium text-ink"
                          }`}
                        >
                          {n.title}
                        </p>
                        {n.body && (
                          <p className="mt-0.5 line-clamp-2 text-xs text-muted">
                            {n.body}
                          </p>
                        )}
                        <p className="mt-1 text-[10px] text-muted">
                          {actorName(n)} · {relativeTime(n.createdAt)}
                        </p>
                      </>
                    );
                    const className = `block w-full px-3 py-2.5 text-left transition hover:bg-surface ${
                      unreadItem ? "bg-teal-soft/20" : ""
                    }`;
                    return (
                      <li key={n.id}>
                        {n.href ? (
                          <Link
                            href={n.href}
                            role="menuitem"
                            className={className}
                            onClick={() => {
                              markNotificationRead(n.id);
                              setOpen(false);
                            }}
                          >
                            {content}
                          </Link>
                        ) : (
                          <button
                            type="button"
                            role="menuitem"
                            className={className}
                            onClick={() => markNotificationRead(n.id)}
                          >
                            {content}
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
