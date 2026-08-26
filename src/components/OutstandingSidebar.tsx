"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useProjects } from "@/lib/store";
import {
  PersonalTodo,
  Project,
  ProjectTodo,
  TodoKind,
  TODO_KIND_LABELS,
  addDays,
  comparePersonalTodosByDeadline,
  compareTodosByDeadline,
  emailReminderDeltaDays,
  isEmailReminderDue,
  isPersonalTodoOpen,
  nextEmailReminderDate,
  personalTodoSortDate,
  todayDate,
} from "@/lib/types";

const EXPANDED_KEY = "hydr-outstanding-expanded";
const SORT_KEY = "hydr-outstanding-sort";
const PERSONAL_SORT_KEY = "hydr-outstanding-personal-sort";
const SCOPE_KEY = "hydr-outstanding-scope";

type SortMode = "by-project" | "by-deadline";
type ScopeMode = "project" | "personal";
type PersonalSortMode = "by-owner" | "by-deadline";

const KIND_SHORT: Record<TodoKind, string> = {
  question: "Q",
  "our-action": "Us",
  "client-action": "Client",
};

const KIND_FULL: Record<TodoKind, string> = {
  question: "Question",
  "our-action": "Our action",
  "client-action": "Client action",
};

const KIND_TONE: Record<TodoKind, string> = {
  question: "bg-teal-soft text-teal-accent",
  "our-action": "bg-olive/15 text-olive-ink",
  "client-action": "bg-amber-accent/15 text-amber-accent",
};

type UrgencyBucket = "overdue" | "today" | "upcoming" | "nodate";

const BUCKET_LABELS: Record<UrgencyBucket, string> = {
  overdue: "Overdue",
  today: "Due today",
  upcoming: "Upcoming",
  nodate: "No date",
};

const BUCKET_ORDER: UrgencyBucket[] = [
  "overdue",
  "today",
  "upcoming",
  "nodate",
];

function formatDue(date: string): string {
  return new Date(date + "T00:00:00").toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function isOverdueDate(date: string): boolean {
  return date < todayDate();
}

function urgencyBucket(sortDate: string): UrgencyBucket {
  if (sortDate === "9999-12-31") return "nodate";
  const today = todayDate();
  if (sortDate < today) return "overdue";
  if (sortDate === today) return "today";
  return "upcoming";
}

function readExpanded(): boolean {
  try {
    return window.localStorage.getItem(EXPANDED_KEY) === "1";
  } catch {
    return false;
  }
}

function readSortMode(): SortMode {
  try {
    const v = window.localStorage.getItem(SORT_KEY);
    return v === "by-deadline" ? "by-deadline" : "by-project";
  } catch {
    return "by-project";
  }
}

function readScopeMode(): ScopeMode {
  try {
    return window.localStorage.getItem(SCOPE_KEY) === "personal"
      ? "personal"
      : "project";
  } catch {
    return "project";
  }
}

function readPersonalSortMode(): PersonalSortMode {
  try {
    const v = window.localStorage.getItem(PERSONAL_SORT_KEY);
    return v === "by-deadline" ? "by-deadline" : "by-owner";
  } catch {
    return "by-owner";
  }
}

function DeadlineBadge({ date }: { date: string }) {
  const today = todayDate();
  const overdue = isOverdueDate(date);
  const dueToday = date === today;
  const dueTomorrow = date === addDays(today, 1);
  const tone =
    overdue || dueToday
      ? "bg-red-100 text-red-600"
      : dueTomorrow
        ? "bg-amber-accent/15 text-amber-accent"
        : "bg-teal-soft text-teal-accent";
  const label = overdue
    ? "Overdue · "
    : dueToday
      ? "Due today · "
      : dueTomorrow
        ? "Due tomorrow · "
        : "Due ";
  return (
    <span
      className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${tone}`}
    >
      {label}
      {formatDue(date)}
    </span>
  );
}

function SidebarAnswer({
  todo,
  onSave,
}: {
  todo: ProjectTodo;
  onSave: (answer: string | null) => void;
}) {
  const [editing, setEditing] = useState(!todo.answer);
  const [draft, setDraft] = useState(todo.answer ?? "");

  function commit() {
    const next = draft.trim();
    setEditing(false);
    if (next !== (todo.answer ?? "")) onSave(next || null);
    else setDraft(todo.answer ?? "");
  }

  if (!editing && todo.answer) {
    return (
      <button
        type="button"
        onClick={() => {
          setDraft(todo.answer ?? "");
          setEditing(true);
        }}
        className="mt-1.5 w-full cursor-text rounded-md bg-surface px-2 py-1.5 text-left text-xs text-ink transition hover:bg-teal-soft/60"
      >
        <span className="font-semibold text-teal-accent">A · </span>
        {todo.answer}
      </button>
    );
  }

  return (
    <div className="mt-1.5 flex gap-1">
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") {
            setDraft(todo.answer ?? "");
            setEditing(Boolean(todo.answer));
          }
        }}
        placeholder="Answer…"
        className="min-w-0 flex-1 rounded-md border border-line bg-surface px-2 py-1.5 text-xs text-ink outline-none focus:border-teal-accent"
      />
      <button
        type="button"
        onClick={commit}
        disabled={!draft.trim() && !todo.answer}
        className="shrink-0 rounded-md bg-teal-accent px-2 py-1.5 text-[10px] font-bold uppercase tracking-wide text-white disabled:opacity-40"
      >
        Save
      </button>
    </div>
  );
}

function OutstandingItem({
  projectId,
  todo,
  ownerName,
  expanded,
  projectLink,
  onProjectNavigate,
}: {
  projectId: string;
  todo: ProjectTodo;
  ownerName: string;
  expanded: boolean;
  projectLink?: { id: string; name: string };
  onProjectNavigate?: () => void;
}) {
  const { toggleTodo, updateTodo } = useProjects();

  return (
    <li className="rounded-lg border border-line/80 bg-surface/80 p-2.5">
      <div className="flex items-start gap-2">
        <button
          type="button"
          onClick={() => toggleTodo(projectId, todo.id)}
          aria-label="Mark as done"
          title="Mark as done"
          className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border-2 border-line transition hover:border-teal-accent"
        />
        <div className="min-w-0 flex-1">
          {projectLink && (
            <Link
              href={`/projects/${projectLink.id}`}
              onClick={onProjectNavigate}
              className="mb-1 block truncate text-[11px] font-semibold text-teal-accent hover:underline"
            >
              {projectLink.name}
            </Link>
          )}
          <div className="flex flex-wrap items-center gap-1.5">
            <span
              title={TODO_KIND_LABELS[todo.kind]}
              className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${KIND_TONE[todo.kind]}`}
            >
              {expanded ? KIND_FULL[todo.kind] : KIND_SHORT[todo.kind]}
            </span>
            <span className="sr-only">{TODO_KIND_LABELS[todo.kind]}</span>
          </div>
          <p className="mt-1 text-xs leading-snug text-ink">{todo.text}</p>
          {todo.dueDate && <DeadlineBadge date={todo.dueDate} />}
          {expanded && todo.dueDate && (
            <button
              type="button"
              onClick={() =>
                updateTodo(projectId, todo.id, {
                  dueDate: addDays(todo.dueDate!, 1),
                })
              }
              className="mt-1 inline-flex rounded-md border border-line bg-surface px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted transition hover:border-teal-accent hover:text-teal-accent"
              title="Move deadline by 1 day"
            >
              +1 day
            </button>
          )}
          <p className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-muted">
            Owner: {ownerName}
          </p>
          {todo.kind === "question" && (
            <SidebarAnswer
              todo={todo}
              onSave={(answer) => updateTodo(projectId, todo.id, { answer })}
            />
          )}
        </div>
      </div>
    </li>
  );
}

function PersonalOutstandingItem({
  todo,
  ownerName,
  expanded,
  onNavigate,
}: {
  todo: PersonalTodo;
  ownerName: string;
  expanded: boolean;
  onNavigate?: () => void;
}) {
  const { updatePersonalTodo } = useProjects();
  const sortDate = personalTodoSortDate(todo);
  const hasDate = sortDate !== "9999-12-31";

  return (
    <li className="rounded-lg border border-line/80 bg-surface/80 p-2.5">
      <div className="flex items-start gap-2">
        <button
          type="button"
          onClick={() => updatePersonalTodo(todo.id, { status: "done" })}
          aria-label="Mark as done"
          title="Mark as done"
          className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border-2 border-line transition hover:border-teal-accent"
        />
        <div className="min-w-0 flex-1">
          <Link
            href="/todos"
            onClick={onNavigate}
            className="mb-1 block truncate text-[11px] font-semibold text-teal-accent hover:underline"
          >
            Personal
          </Link>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="rounded bg-olive/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-olive-ink">
              {todo.status === "doing" ? "Doing" : "To-Do"}
            </span>
          </div>
          <p className="mt-1 text-xs leading-snug text-ink">{todo.title}</p>
          {hasDate && <DeadlineBadge date={sortDate} />}
          {expanded && hasDate && todo.dueDate && (
            <button
              type="button"
              onClick={() =>
                updatePersonalTodo(todo.id, {
                  dueDate: addDays(todo.dueDate!, 1),
                })
              }
              className="mt-1 inline-flex rounded-md border border-line bg-surface px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted transition hover:border-teal-accent hover:text-teal-accent"
              title="Move deadline by 1 day"
            >
              +1 day
            </button>
          )}
          {(todo.startDate || todo.endDate) && (
            <p className="mt-1 text-[10px] text-muted">
              Window:{" "}
              {todo.startDate ? formatDue(todo.startDate) : "…"} →{" "}
              {todo.endDate ? formatDue(todo.endDate) : "…"}
            </p>
          )}
          <p className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-muted">
            Owner: {ownerName}
          </p>
          {todo.comments.length > 0 && (
            <p className="mt-1 text-[10px] text-muted">
              {todo.comments.length} comment
              {todo.comments.length === 1 ? "" : "s"}
            </p>
          )}
        </div>
      </div>
    </li>
  );
}

function ContactItem({
  project,
  dueDate,
  onContacted,
  showProjectLink,
  onProjectNavigate,
}: {
  project: Project;
  dueDate: string;
  onContacted: () => void;
  showProjectLink?: boolean;
  onProjectNavigate?: () => void;
}) {
  const delta = emailReminderDeltaDays(project);
  const status =
    delta < 0
      ? `${Math.abs(delta)}d overdue`
      : delta === 0
        ? "Due today"
        : null;

  return (
    <li className="rounded-lg border border-amber-accent/40 bg-amber-accent/5 p-2.5">
      <div className="flex items-start gap-2">
        <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center text-amber-accent">
          <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 fill-current">
            <path d="M1.5 3.5A1.5 1.5 0 0 1 3 2h10a1.5 1.5 0 0 1 1.5 1.5v9A1.5 1.5 0 0 1 13 14H3a1.5 1.5 0 0 1-1.5-1.5v-9Zm1.5-.5a.5.5 0 0 0-.5.5v.25l5.25 3.15a.5.5 0 0 0 .5 0L13.5 3.75V3.5a.5.5 0 0 0-.5-.5H3Zm10.5 2.1-4.9 2.94a1.5 1.5 0 0 1-1.5 0L2.2 5.1v7.4a.5.5 0 0 0 .5.5h10a.5.5 0 0 0 .5-.5V5.1Z" />
          </svg>
        </span>
        <div className="min-w-0 flex-1">
          {showProjectLink && (
            <Link
              href={`/projects/${project.id}`}
              onClick={onProjectNavigate}
              className="mb-1 block truncate text-[11px] font-semibold text-teal-accent hover:underline"
            >
              {project.name}
            </Link>
          )}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="rounded bg-amber-accent/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-accent">
              Contact
            </span>
            {status && (
              <span className="text-[10px] font-semibold uppercase tracking-wide text-amber-accent">
                {status}
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-ink">
            Follow up with {project.client}
          </p>
          <DeadlineBadge date={dueDate} />
          <button
            type="button"
            onClick={onContacted}
            className="mt-1.5 block text-[11px] font-semibold text-teal-accent hover:underline"
          >
            Contacted
          </button>
        </div>
      </div>
    </li>
  );
}

type SidebarEntry =
  | { type: "contact"; sortDate: string }
  | { type: "todo"; todo: ProjectTodo; sortDate: string };

type FlatEntry = SidebarEntry & { project: Project };

type Group = {
  project: Project;
  entries: SidebarEntry[];
  earliestDue: string;
};

function compareSidebarEntries(a: SidebarEntry, b: SidebarEntry): number {
  if (a.sortDate !== b.sortDate) {
    return a.sortDate < b.sortDate ? -1 : 1;
  }
  // Same day: contact follow-ups take priority over todos
  if (a.type !== b.type) return a.type === "contact" ? -1 : 1;
  if (a.type === "todo" && b.type === "todo") {
    return compareTodosByDeadline(a.todo, b.todo);
  }
  return 0;
}

function WiderIcon({ active }: { active: boolean }) {
  return active ? (
    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 fill-current" aria-hidden>
      <path d="M2 2h5v1.5H3.5V7H2V2Zm7 0h5v5h-1.5V3.5H9V2ZM2 9h1.5v3.5H7V14H2V9Zm12 0V14H9v-1.5h3.5V9H14Z" />
    </svg>
  ) : (
    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 fill-current" aria-hidden>
      <path d="M1 1h6v1.5H2.5V7H1V1Zm8 0h6v6h-1.5V2.5H9V1ZM1 9h1.5v4.5H7V15H1V9Zm14 0V15H9v-1.5h4.5V9H15Z" />
    </svg>
  );
}

function FullscreenIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 fill-current" aria-hidden>
      <path d="M1 1h5v1.5H2.5V6H1V1Zm9 0h5v5h-1.5V2.5H10V1ZM1 10h1.5v3.5H6V15H1v-5Zm14 0V15h-5v-1.5h3.5V10H15Z" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 fill-current" aria-hidden>
      <path d="M3.2 2.1 8 6.9l4.8-4.8 1.1 1.1L9.1 8l4.8 4.8-1.1 1.1L8 9.1l-4.8 4.8-1.1-1.1L6.9 8 2.1 3.2l1.1-1.1Z" />
    </svg>
  );
}

export default function OutstandingSidebar() {
  const {
    projects,
    personalTodos,
    ready,
    markClientContacted,
    teamMembers,
  } = useProjects();
  const [wider, setWider] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>("by-project");
  const [personalSortMode, setPersonalSortMode] =
    useState<PersonalSortMode>("by-owner");
  const [scope, setScope] = useState<ScopeMode>("project");
  const [prefsReady, setPrefsReady] = useState(false);

  useEffect(() => {
    setWider(readExpanded());
    setSortMode(readSortMode());
    setPersonalSortMode(readPersonalSortMode());
    setScope(readScopeMode());
    setPrefsReady(true);
  }, []);

  useEffect(() => {
    if (!prefsReady) return;
    try {
      window.localStorage.setItem(EXPANDED_KEY, wider ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, [wider, prefsReady]);

  useEffect(() => {
    if (!prefsReady) return;
    try {
      window.localStorage.setItem(SORT_KEY, sortMode);
    } catch {
      /* ignore */
    }
  }, [sortMode, prefsReady]);

  useEffect(() => {
    if (!prefsReady) return;
    try {
      window.localStorage.setItem(SCOPE_KEY, scope);
    } catch {
      /* ignore */
    }
  }, [scope, prefsReady]);

  useEffect(() => {
    if (!prefsReady) return;
    try {
      window.localStorage.setItem(PERSONAL_SORT_KEY, personalSortMode);
    } catch {
      /* ignore */
    }
  }, [personalSortMode, prefsReady]);

  useEffect(() => {
    if (!fullscreen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFullscreen(false);
    };
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [fullscreen]);

  const groups = useMemo(() => {
    const list: Group[] = [];
    for (const project of projects) {
      const todos = project.todos.filter((t) => !t.done);
      const emailDue = isEmailReminderDue(project);
      if (todos.length === 0 && !emailDue) continue;

      const entries: SidebarEntry[] = todos.map((todo) => ({
        type: "todo" as const,
        todo,
        sortDate: todo.dueDate ?? "9999-12-31",
      }));

      if (emailDue) {
        entries.push({
          type: "contact",
          sortDate: nextEmailReminderDate(project),
        });
      }

      entries.sort(compareSidebarEntries);

      const earliestDue = entries.reduce(
        (min, e) => (e.sortDate < min ? e.sortDate : min),
        "9999-12-31",
      );

      list.push({ project, entries, earliestDue });
    }
    list.sort((a, b) => {
      if (a.earliestDue !== b.earliestDue) {
        return a.earliestDue < b.earliestDue ? -1 : 1;
      }
      return a.project.name.localeCompare(b.project.name);
    });
    return list;
  }, [projects]);

  const flatByBucket = useMemo(() => {
    const flat: FlatEntry[] = [];
    for (const { project, entries } of groups) {
      for (const entry of entries) {
        flat.push({ ...entry, project });
      }
    }
    flat.sort((a, b) => {
      const byDate = compareSidebarEntries(a, b);
      if (byDate !== 0) return byDate;
      return a.project.name.localeCompare(b.project.name);
    });

    const buckets: Record<UrgencyBucket, FlatEntry[]> = {
      overdue: [],
      today: [],
      upcoming: [],
      nodate: [],
    };
    for (const entry of flat) {
      buckets[urgencyBucket(entry.sortDate)].push(entry);
    }
    return buckets;
  }, [groups]);

  const openPersonal = useMemo(
    () =>
      personalTodos
        .filter(isPersonalTodoOpen)
        .slice()
        .sort(comparePersonalTodosByDeadline),
    [personalTodos],
  );

  type PersonalOwnerGroup = {
    key: string;
    label: string;
    todos: PersonalTodo[];
    earliestDue: string;
  };

  const personalOwnerGroups = useMemo(() => {
    const map = new Map<string, PersonalOwnerGroup>();
    for (const todo of openPersonal) {
      const key = todo.ownerUserId ?? "";
      const label =
        teamMembers.find((m) => m.id === key)?.name ?? "Unassigned";
      const existing = map.get(key);
      const sortDate = personalTodoSortDate(todo);
      if (existing) {
        existing.todos.push(todo);
        if (sortDate < existing.earliestDue) existing.earliestDue = sortDate;
      } else {
        map.set(key, {
          key,
          label,
          todos: [todo],
          earliestDue: sortDate,
        });
      }
    }
    return [...map.values()].sort((a, b) => {
      if (a.earliestDue !== b.earliestDue) {
        return a.earliestDue < b.earliestDue ? -1 : 1;
      }
      return a.label.localeCompare(b.label);
    });
  }, [openPersonal, teamMembers]);

  const personalFlatByBucket = useMemo(() => {
    const buckets: Record<UrgencyBucket, PersonalTodo[]> = {
      overdue: [],
      today: [],
      upcoming: [],
      nodate: [],
    };
    for (const todo of openPersonal) {
      buckets[urgencyBucket(personalTodoSortDate(todo))].push(todo);
    }
    return buckets;
  }, [openPersonal]);

  const projectTotalOpen = groups.reduce((n, g) => n + g.entries.length, 0);
  const totalOpen =
    scope === "personal" ? openPersonal.length : projectTotalOpen;

  function ownerName(ownerUserId?: string): string {
    return (
      teamMembers.find((m) => m.id === ownerUserId)?.name ?? "Unassigned"
    );
  }

  const richChrome = wider || fullscreen;

  const exitFullscreen = () => setFullscreen(false);

  function renderFlatEntry(entry: FlatEntry) {
    if (entry.type === "contact") {
      return (
        <ContactItem
          key={`${entry.project.id}-contact`}
          project={entry.project}
          dueDate={entry.sortDate}
          onContacted={() => markClientContacted(entry.project.id)}
          showProjectLink
          onProjectNavigate={exitFullscreen}
        />
      );
    }
    return (
      <OutstandingItem
        key={entry.todo.id}
        projectId={entry.project.id}
        todo={entry.todo}
        ownerName={ownerName(entry.todo.ownerUserId)}
        expanded={richChrome}
        projectLink={{ id: entry.project.id, name: entry.project.name }}
        onProjectNavigate={exitFullscreen}
      />
    );
  }

  function renderPersonalList(layout: "rail" | "fullscreen") {
    if (openPersonal.length === 0) {
      return (
        <p className="rounded-lg border border-dashed border-line px-3 py-8 text-center text-xs text-muted">
          No personal outstanding tasks.
        </p>
      );
    }

    const useOwnerSort =
      layout === "rail" || personalSortMode === "by-owner";

    if (useOwnerSort) {
      return (
        <div
          className={
            layout === "fullscreen"
              ? "grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4"
              : "flex flex-col gap-4"
          }
        >
          {personalOwnerGroups.map((group) => (
            <section
              key={group.key || "unassigned"}
              className={
                layout === "fullscreen"
                  ? "rounded-xl border border-line/80 bg-surface/40 p-3"
                  : undefined
              }
            >
              <Link
                href="/todos"
                onClick={exitFullscreen}
                className="mb-2 block truncate text-sm font-semibold text-deep transition hover:text-teal-accent hover:underline"
              >
                {group.label}
              </Link>
              <ul className="flex flex-col gap-2">
                {group.todos.map((todo) => (
                  <PersonalOutstandingItem
                    key={todo.id}
                    todo={todo}
                    ownerName={ownerName(todo.ownerUserId)}
                    expanded={richChrome}
                    onNavigate={exitFullscreen}
                  />
                ))}
              </ul>
            </section>
          ))}
        </div>
      );
    }

    return (
      <div className="flex flex-col gap-5">
        {BUCKET_ORDER.map((bucket) => {
          const items = personalFlatByBucket[bucket];
          if (items.length === 0) return null;
          return (
            <section key={bucket}>
              <h3 className="mb-2 text-[10px] font-bold uppercase tracking-wide text-muted">
                {BUCKET_LABELS[bucket]}
                <span className="ml-1.5 font-semibold text-muted/70">
                  {items.length}
                </span>
              </h3>
              <ul
                className={
                  layout === "fullscreen"
                    ? "grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4"
                    : "flex flex-col gap-2"
                }
              >
                {items.map((todo) => (
                  <PersonalOutstandingItem
                    key={todo.id}
                    todo={todo}
                    ownerName={ownerName(todo.ownerUserId)}
                    expanded={richChrome}
                    onNavigate={exitFullscreen}
                  />
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    );
  }

  function renderList(layout: "rail" | "fullscreen") {
    if (scope === "personal") return renderPersonalList(layout);

    if (totalOpen === 0) {
      return (
        <p className="rounded-lg border border-dashed border-line px-3 py-8 text-center text-xs text-muted">
          Nothing outstanding. Nice work.
        </p>
      );
    }

    const useProjectSort = layout === "rail" || sortMode === "by-project";

    if (useProjectSort) {
      return (
        <div
          className={
            layout === "fullscreen"
              ? "grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4"
              : "flex flex-col gap-4"
          }
        >
          {groups.map(({ project, entries }) => (
            <section
              key={project.id}
              className={
                layout === "fullscreen"
                  ? "rounded-xl border border-line/80 bg-surface/40 p-3"
                  : undefined
              }
            >
              <Link
                href={`/projects/${project.id}`}
                onClick={exitFullscreen}
                className="mb-2 block truncate text-sm font-semibold text-deep transition hover:text-teal-accent hover:underline"
              >
                {project.name}
              </Link>
              <ul className="flex flex-col gap-2">
                {entries.map((entry) =>
                  entry.type === "contact" ? (
                    <ContactItem
                      key="contact"
                      project={project}
                      dueDate={entry.sortDate}
                      onContacted={() => markClientContacted(project.id)}
                    />
                  ) : (
                    <OutstandingItem
                      key={entry.todo.id}
                      projectId={project.id}
                      todo={entry.todo}
                      ownerName={ownerName(entry.todo.ownerUserId)}
                      expanded={richChrome}
                    />
                  ),
                )}
              </ul>
            </section>
          ))}
        </div>
      );
    }

    return (
      <div className="flex flex-col gap-5">
        {BUCKET_ORDER.map((bucket) => {
          const items = flatByBucket[bucket];
          if (items.length === 0) return null;
          return (
            <section key={bucket}>
              <h3 className="mb-2 text-[10px] font-bold uppercase tracking-wide text-muted">
                {BUCKET_LABELS[bucket]}
                <span className="ml-1.5 font-semibold text-muted/70">
                  {items.length}
                </span>
              </h3>
              <ul
                className={
                  layout === "fullscreen"
                    ? "grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4"
                    : "flex flex-col gap-2"
                }
              >
                {items.map(renderFlatEntry)}
              </ul>
            </section>
          );
        })}
      </div>
    );
  }

  function renderScopeToggle() {
    return (
      <div
        className="flex rounded-lg border border-line bg-surface p-0.5"
        role="group"
        aria-label="Outstanding scope"
      >
        <button
          type="button"
          onClick={() => setScope("project")}
          aria-pressed={scope === "project"}
          className={`min-w-0 flex-1 rounded-md px-2 py-1.5 text-[10px] font-bold uppercase tracking-wide transition ${
            scope === "project"
              ? "bg-teal-accent text-white"
              : "text-muted hover:text-deep"
          }`}
        >
          Project
        </button>
        <button
          type="button"
          onClick={() => setScope("personal")}
          aria-pressed={scope === "personal"}
          className={`min-w-0 flex-1 rounded-md px-2 py-1.5 text-[10px] font-bold uppercase tracking-wide transition ${
            scope === "personal"
              ? "bg-teal-accent text-white"
              : "text-muted hover:text-deep"
          }`}
        >
          Personal
        </button>
      </div>
    );
  }

  function renderSortToggle() {
    if (scope === "personal") {
      return (
        <div
          className="flex rounded-lg border border-line bg-surface p-0.5"
          role="group"
          aria-label="Sort personal outstanding items"
        >
          <button
            type="button"
            onClick={() => setPersonalSortMode("by-owner")}
            aria-pressed={personalSortMode === "by-owner"}
            className={`min-w-0 flex-1 rounded-md px-2 py-1.5 text-[10px] font-bold uppercase tracking-wide transition ${
              personalSortMode === "by-owner"
                ? "bg-teal-accent text-white"
                : "text-muted hover:text-deep"
            }`}
          >
            By owner
          </button>
          <button
            type="button"
            onClick={() => setPersonalSortMode("by-deadline")}
            aria-pressed={personalSortMode === "by-deadline"}
            className={`min-w-0 flex-1 rounded-md px-2 py-1.5 text-[10px] font-bold uppercase tracking-wide transition ${
              personalSortMode === "by-deadline"
                ? "bg-teal-accent text-white"
                : "text-muted hover:text-deep"
            }`}
          >
            By deadline
          </button>
        </div>
      );
    }

    return (
      <div
        className="flex rounded-lg border border-line bg-surface p-0.5"
        role="group"
        aria-label="Sort outstanding items"
      >
        <button
          type="button"
          onClick={() => setSortMode("by-project")}
          aria-pressed={sortMode === "by-project"}
          className={`min-w-0 flex-1 rounded-md px-2 py-1.5 text-[10px] font-bold uppercase tracking-wide transition ${
            sortMode === "by-project"
              ? "bg-teal-accent text-white"
              : "text-muted hover:text-deep"
          }`}
        >
          By project
        </button>
        <button
          type="button"
          onClick={() => setSortMode("by-deadline")}
          aria-pressed={sortMode === "by-deadline"}
          className={`min-w-0 flex-1 rounded-md px-2 py-1.5 text-[10px] font-bold uppercase tracking-wide transition ${
            sortMode === "by-deadline"
              ? "bg-teal-accent text-white"
              : "text-muted hover:text-deep"
          }`}
        >
          By deadline
        </button>
      </div>
    );
  }

  if (!ready) return null;

  const widthClass = wider ? "lg:w-[26rem] xl:w-[30rem]" : "lg:w-72 xl:w-80";

  return (
    <>
      <aside
        className={`flex w-full shrink-0 flex-col lg:h-full ${widthClass}`}
      >
        <div className="flex max-h-[min(28rem,70dvh)] min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-line bg-panel shadow-sm lg:max-h-none">
          <header className="shrink-0 border-b border-line px-3 py-3 sm:px-4">
            <div className="flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2">
                <h2 className="text-sm font-bold uppercase tracking-wide text-deep">
                  Outstanding
                </h2>
                <span className="rounded-full bg-teal-soft px-2.5 py-0.5 text-xs font-semibold text-teal-accent">
                  {totalOpen}
                </span>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setWider((v) => !v)}
                  title={wider ? "Narrow sidebar" : "Widen sidebar"}
                  aria-pressed={wider}
                  className="hidden items-center gap-1 rounded-md border border-line px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted transition hover:border-teal-accent hover:text-teal-accent lg:inline-flex"
                >
                  <WiderIcon active={wider} />
                  {wider ? "Narrow" : "Wider"}
                </button>
                <button
                  type="button"
                  onClick={() => setFullscreen(true)}
                  title="Open full screen"
                  className="inline-flex items-center gap-1 rounded-md border border-line px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted transition hover:border-teal-accent hover:text-teal-accent"
                >
                  <FullscreenIcon />
                  Full screen
                </button>
              </div>
            </div>
            <div className="mt-2">{renderScopeToggle()}</div>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3">
            {renderList("rail")}
          </div>
        </div>
      </aside>

      {fullscreen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Outstanding full screen"
          className="fixed inset-0 z-50 flex flex-col bg-surface"
        >
          <header className="shrink-0 border-b border-line bg-panel px-4 py-3 sm:px-6">
            <div className="mx-auto flex w-full max-w-[1800px] flex-wrap items-center justify-between gap-3">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <h2 className="text-sm font-bold uppercase tracking-wide text-deep">
                  Outstanding
                </h2>
                <span className="rounded-full bg-teal-soft px-2.5 py-0.5 text-xs font-semibold text-teal-accent">
                  {totalOpen}
                </span>
                <div className="w-44 sm:w-52">{renderScopeToggle()}</div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="w-56 sm:w-64">{renderSortToggle()}</div>
                <button
                  type="button"
                  onClick={() => setFullscreen(false)}
                  title="Exit full screen (Esc)"
                  className="inline-flex items-center gap-1.5 rounded-md bg-teal-accent px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide text-white transition hover:opacity-90"
                >
                  <CloseIcon />
                  Close
                </button>
              </div>
            </div>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-6 sm:py-5">
            <div className="mx-auto w-full max-w-[1800px]">
              {renderList("fullscreen")}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
