"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type RefObject,
  type TextareaHTMLAttributes,
  type InputHTMLAttributes,
} from "react";
import { createPortal } from "react-dom";
import type { TeamMember } from "@/lib/types";
import {
  formatMentionLabel,
  mentionHandle,
  mentionSuggestions,
} from "@/lib/notifications";
import { chainWheelToScrollParent } from "@/lib/scroll-chain";

type MenuPos = { top: number; left: number; width: number };

function activeMention(
  value: string,
  caret: number,
): { start: number; query: string } | null {
  const before = value.slice(0, caret);
  const at = before.lastIndexOf("@");
  if (at < 0) return null;
  if (at > 0 && /[A-Za-z0-9._-]/.test(before[at - 1]!)) return null;
  const query = before.slice(at + 1);
  if (/\s/.test(query)) return null;
  return { start: at, query };
}

function useMentionMenu(
  value: string,
  members: TeamMember[],
  fieldRef: RefObject<HTMLTextAreaElement | HTMLInputElement | null>,
) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [start, setStart] = useState(0);
  const [activeIndex, setActiveIndex] = useState(0);
  const [pos, setPos] = useState<MenuPos | null>(null);
  const suggestions = mentionSuggestions(query, members);

  function refreshFromCaret() {
    const el = fieldRef.current;
    if (!el) return;
    const caret = el.selectionStart ?? value.length;
    const m = activeMention(value, caret);
    if (!m) {
      setOpen(false);
      return;
    }
    setStart(m.start);
    setQuery(m.query);
    setOpen(true);
    setActiveIndex(0);
  }

  useLayoutEffect(() => {
    if (!open || !fieldRef.current) {
      setPos(null);
      return;
    }
    const r = fieldRef.current.getBoundingClientRect();
    const pad = 8;
    const width = Math.min(288, window.innerWidth - pad * 2);
    let left = r.left;
    if (left + width > window.innerWidth - pad) {
      left = Math.max(pad, window.innerWidth - pad - width);
    }
    setPos({ top: r.bottom + 4, left, width });
  }, [open, query, suggestions.length, fieldRef]);

  return {
    open: open && suggestions.length > 0,
    suggestions,
    activeIndex,
    setActiveIndex,
    pos,
    start,
    query,
    refreshFromCaret,
    close: () => setOpen(false),
  };
}

function insertMention(
  value: string,
  start: number,
  queryLen: number,
  member: TeamMember,
): { next: string; caret: number } {
  const handle = mentionHandle(member);
  const before = value.slice(0, start);
  const after = value.slice(start + 1 + queryLen);
  const inserted = `@${handle} `;
  return { next: before + inserted + after, caret: before.length + inserted.length };
}

type SharedProps = {
  members: TeamMember[];
  value: string;
  onChange: (value: string) => void;
  className?: string;
};

export function MentionTextarea({
  members,
  value,
  onChange,
  className,
  ...rest
}: SharedProps &
  Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "value" | "onChange">) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const menu = useMentionMenu(value, members, ref);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menu.open) return;
    function onDoc(e: MouseEvent) {
      const t = e.target as Node;
      if (ref.current?.contains(t) || listRef.current?.contains(t)) return;
      menu.close();
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [menu]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => chainWheelToScrollParent(el, e);
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  function pick(member: TeamMember) {
    const { next, caret } = insertMention(
      value,
      menu.start,
      menu.query.length,
      member,
    );
    onChange(next);
    menu.close();
    requestAnimationFrame(() => {
      const el = ref.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(caret, caret);
    });
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (menu.open) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        menu.setActiveIndex((i) => (i + 1) % menu.suggestions.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        menu.setActiveIndex(
          (i) => (i - 1 + menu.suggestions.length) % menu.suggestions.length,
        );
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        const pickMember = menu.suggestions[menu.activeIndex];
        if (pickMember) {
          e.preventDefault();
          pick(pickMember);
          return;
        }
      }
      if (e.key === "Escape") {
        e.preventDefault();
        menu.close();
        return;
      }
    }
    rest.onKeyDown?.(e);
  }

  return (
    <>
      <textarea
        {...rest}
        ref={ref}
        value={value}
        className={className}
        onChange={(e) => {
          onChange(e.target.value);
          requestAnimationFrame(() => menu.refreshFromCaret());
        }}
        onKeyUp={() => menu.refreshFromCaret()}
        onClick={() => menu.refreshFromCaret()}
        onKeyDown={onKeyDown}
      />
      <MentionMenu
        open={menu.open}
        pos={menu.pos}
        suggestions={menu.suggestions}
        activeIndex={menu.activeIndex}
        listRef={listRef}
        onPick={pick}
      />
    </>
  );
}

export function MentionInput({
  members,
  value,
  onChange,
  className,
  ...rest
}: SharedProps &
  Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange">) {
  const ref = useRef<HTMLInputElement>(null);
  const menu = useMentionMenu(value, members, ref);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menu.open) return;
    function onDoc(e: MouseEvent) {
      const t = e.target as Node;
      if (ref.current?.contains(t) || listRef.current?.contains(t)) return;
      menu.close();
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [menu]);

  function pick(member: TeamMember) {
    const { next, caret } = insertMention(
      value,
      menu.start,
      menu.query.length,
      member,
    );
    onChange(next);
    menu.close();
    requestAnimationFrame(() => {
      const el = ref.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(caret, caret);
    });
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (menu.open) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        menu.setActiveIndex((i) => (i + 1) % menu.suggestions.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        menu.setActiveIndex(
          (i) => (i - 1 + menu.suggestions.length) % menu.suggestions.length,
        );
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        const pickMember = menu.suggestions[menu.activeIndex];
        if (pickMember) {
          e.preventDefault();
          pick(pickMember);
          return;
        }
      }
      if (e.key === "Escape") {
        e.preventDefault();
        menu.close();
        return;
      }
    }
    rest.onKeyDown?.(e);
  }

  return (
    <>
      <input
        {...rest}
        ref={ref}
        value={value}
        className={className}
        onChange={(e) => {
          onChange(e.target.value);
          requestAnimationFrame(() => menu.refreshFromCaret());
        }}
        onKeyUp={() => menu.refreshFromCaret()}
        onClick={() => menu.refreshFromCaret()}
        onKeyDown={onKeyDown}
      />
      <MentionMenu
        open={menu.open}
        pos={menu.pos}
        suggestions={menu.suggestions}
        activeIndex={menu.activeIndex}
        listRef={listRef}
        onPick={pick}
      />
    </>
  );
}

function MentionMenu({
  open,
  pos,
  suggestions,
  activeIndex,
  listRef,
  onPick,
}: {
  open: boolean;
  pos: MenuPos | null;
  suggestions: TeamMember[];
  activeIndex: number;
  listRef: RefObject<HTMLDivElement | null>;
  onPick: (m: TeamMember) => void;
}) {
  if (!open || !pos || typeof document === "undefined") return null;
  return createPortal(
    <div
      ref={listRef}
      role="listbox"
      className="fixed z-[90] max-h-56 overflow-y-auto rounded-xl border border-line bg-panel shadow-lg"
      style={{ top: pos.top, left: pos.left, width: pos.width }}
    >
      <p className="border-b border-line px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted">
        Mention
      </p>
      <ul className="py-1">
        {suggestions.map((m, i) => (
          <li key={m.id}>
            <button
              type="button"
              role="option"
              aria-selected={i === activeIndex}
              onMouseDown={(e) => {
                e.preventDefault();
                onPick(m);
              }}
              className={`flex w-full flex-col items-start px-3 py-2 text-left text-sm transition ${
                i === activeIndex ? "bg-teal-soft/60" : "hover:bg-surface"
              }`}
            >
              <span className="font-medium text-ink">{m.name}</span>
              <span className="text-[11px] text-muted">
                {formatMentionLabel(m)}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>,
    document.body,
  );
}

/** Render comment text with @handles highlighted. */
export function MentionRichText({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  const parts = String(text ?? "").split(/(@[A-Za-z0-9._-]+)/g);
  return (
    <span className={className}>
      {parts.map((part, i) =>
        part.startsWith("@") ? (
          <span key={i} className="font-semibold text-teal-accent">
            {part}
          </span>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </span>
  );
}
