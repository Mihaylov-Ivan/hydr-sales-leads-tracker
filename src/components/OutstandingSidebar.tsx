"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type DragEvent } from "react";
import { useProjects } from "@/lib/store";
import { useProspecting } from "@/lib/prospecting-store";
import {
  ProspectCompany,
  ProspectContact,
} from "@/lib/prospecting-types";
import { assignableTeamMembers } from "@/lib/permissions";
import { useAuth } from "@/lib/auth-context";
import FilterMultiSelect from "@/components/FilterMultiSelect";
import {
  resolveGanttOutstandingKind,
  scheduleEarliestStart,
  type GanttOutstandingKind,
} from "@/lib/gantt-outstanding";
import {
  PersonalTodo,
  Project,
  ProjectTodo,
  TodoKind,
  TODO_KIND_LABELS,
  addDays,
  comparePersonalTodos,
  comparePersonalTodosByWorkWindowStart,
  compareTodosByDeadline,
  compareTodosByWorkWindowStart,
  daysBetween,
  isClientFollowUpTodo,
  isSetNextStepTodo,
  isUserEmailReminderDue,
  nextEmailReminderDateForUser,
  isOwnPersonalTodo,
  isPersonalTodoOpen,
  isInternalHiddenProject,
  isTodoInWorkWindow,
  isTodoWorkWindowUpcoming,
  personalTodoSortDate,
  projectTodoSortDate,
  todayDate,
} from "@/lib/types";
import { useUiPref } from "@/lib/ui-prefs";

const SORT_KEY = "hydr-outstanding-sort";
const SCOPE_KEY = "hydr-outstanding-scope";
const OWNER_FILTER_KEY = "hydr-outstanding-owner";
const TODAY_PRIORITY_KEY = "hydr-outstanding-today-priority";

type SortMode = "by-project" | "by-deadline";
type ScopeMode = "project" | "personal";
/** `null` = default to logged-in user only. */
type OwnerFilterIds = string[] | null;

const KIND_SHORT: Record<TodoKind, string> = {
  "our-action": "Action",
};

const KIND_FULL: Record<TodoKind, string> = {
  "our-action": "Action item",
};

const KIND_TONE: Record<TodoKind, string> = {
  "our-action": "bg-olive/15 text-olive-ink",
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

type TodayPriorityPrefs = {
  project: string[];
  personal: string[];
};

const EMPTY_TODAY_PRIORITY: TodayPriorityPrefs = {
  project: [],
  personal: [],
};

function personalEntryKey(todo: PersonalTodo): string {
  return `personal:${todo.id}`;
}

function orderByPriorityKeys<T>(
  items: T[],
  order: string[],
  keyOf: (item: T) => string,
): T[] {
  if (items.length <= 1 || order.length === 0) return items;
  const byKey = new Map(items.map((item) => [keyOf(item), item]));
  const result: T[] = [];
  const seen = new Set<string>();
  for (const key of order) {
    const item = byKey.get(key);
    if (!item || seen.has(key)) continue;
    result.push(item);
    seen.add(key);
  }
  for (const item of items) {
    const key = keyOf(item);
    if (!seen.has(key)) result.push(item);
  }
  return result;
}

function movePriorityKey(
  visibleKeys: string[],
  order: string[],
  key: string,
  direction: -1 | 1,
): string[] {
  const current = orderByPriorityKeys(visibleKeys, order, (k) => k);
  const index = current.indexOf(key);
  const next = index + direction;
  if (index < 0 || next < 0 || next >= current.length) return current;
  const swapped = [...current];
  [swapped[index], swapped[next]] = [swapped[next], swapped[index]];
  return swapped;
}

function reorderPriorityKey(
  visibleKeys: string[],
  order: string[],
  fromKey: string,
  toKey: string,
): string[] {
  if (fromKey === toKey) {
    return orderByPriorityKeys(visibleKeys, order, (k) => k);
  }
  const current = orderByPriorityKeys(visibleKeys, order, (k) => k);
  const from = current.indexOf(fromKey);
  const to = current.indexOf(toKey);
  if (from < 0 || to < 0) return current;
  const next = [...current];
  next.splice(from, 1);
  next.splice(to, 0, fromKey);
  return next;
}

const PRIORITY_DRAG_TYPE = "application/x-outstanding-priority";

function TodayPriorityNudge({
  canUp,
  canDown,
  onUp,
  onDown,
}: {
  canUp: boolean;
  canDown: boolean;
  onUp: () => void;
  onDown: () => void;
}) {
  return (
    <div className="absolute right-1 top-1 z-10 flex flex-col opacity-0 transition-opacity duration-150 group-hover/prio:opacity-100 focus-within:opacity-100">
      <button
        type="button"
        disabled={!canUp}
        onClick={(e) => {
          e.stopPropagation();
          onUp();
        }}
        aria-label="Higher priority"
        title="Higher priority"
        className="rounded p-0.5 text-muted/40 transition hover:bg-surface hover:text-ink disabled:pointer-events-none disabled:opacity-0"
      >
        <svg viewBox="0 0 12 12" className="h-3 w-3 fill-current" aria-hidden>
          <path d="M6 3.2 2.4 7.2h7.2L6 3.2Z" />
        </svg>
      </button>
      <button
        type="button"
        disabled={!canDown}
        onClick={(e) => {
          e.stopPropagation();
          onDown();
        }}
        aria-label="Lower priority"
        title="Lower priority"
        className="rounded p-0.5 text-muted/40 transition hover:bg-surface hover:text-ink disabled:pointer-events-none disabled:opacity-0"
      >
        <svg viewBox="0 0 12 12" className="h-3 w-3 fill-current" aria-hidden>
          <path d="M6 8.8 9.6 4.8H2.4L6 8.8Z" />
        </svg>
      </button>
    </div>
  );
}

type PriorityNudgeProps = {
  canUp: boolean;
  canDown: boolean;
  onUp: () => void;
  onDown: () => void;
  dragId: string;
  onReorder: (fromId: string, toId: string) => void;
};

function priorityDragHandlers(nudge: PriorityNudgeProps) {
  return {
    draggable: true as const,
    onDragStart: (e: DragEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target?.closest(
          "button, a, input, textarea, label, select, [contenteditable]",
        )
      ) {
        e.preventDefault();
        return;
      }
      e.dataTransfer.setData(PRIORITY_DRAG_TYPE, nudge.dragId);
      e.dataTransfer.setData("text/plain", nudge.dragId);
      e.dataTransfer.effectAllowed = "move";
    },
    onDragOver: (e: DragEvent) => {
      if (
        !e.dataTransfer.types.includes(PRIORITY_DRAG_TYPE) &&
        !e.dataTransfer.types.includes("text/plain")
      ) {
        return;
      }
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
    },
    onDrop: (e: DragEvent) => {
      e.preventDefault();
      const from =
        e.dataTransfer.getData(PRIORITY_DRAG_TYPE) ||
        e.dataTransfer.getData("text/plain");
      if (!from || from === nudge.dragId) return;
      nudge.onReorder(from, nudge.dragId);
    },
  };
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

function readOwnerFilterIds(): OwnerFilterIds | "all" {
  try {
    const v = window.localStorage.getItem(OWNER_FILTER_KEY);
    if (!v) return null;
    if (v === "all") return "all";
    if (v.startsWith("[")) {
      const parsed = JSON.parse(v) as unknown;
      if (Array.isArray(parsed)) {
        return parsed.filter((x): x is string => typeof x === "string");
      }
      return null;
    }
    // Legacy single-user filter
    return [v];
  } catch {
    return null;
  }
}

function todoMatchesOwnerFilter(
  todo: { ownerUserId?: string },
  selectedIds: Set<string>,
  allSelected: boolean,
): boolean {
  if (allSelected) return true;
  if (selectedIds.size === 0) return false;
  return Boolean(todo.ownerUserId && selectedIds.has(todo.ownerUserId));
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
      className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${tone}`}
    >
      {label}
      {formatDue(date)}
    </span>
  );
}

function SidebarDueDate({
  dueDate,
  editable,
  onChange,
}: {
  dueDate: string | null;
  editable: boolean;
  onChange: (dueDate: string | null) => void;
}) {
  const [editing, setEditing] = useState(false);

  if (editing && editable) {
    return (
      <input
        autoFocus
        type="date"
        value={dueDate ?? ""}
        onChange={(e) => {
          onChange(e.target.value || null);
          setEditing(false);
        }}
        onBlur={() => setEditing(false)}
        onKeyDown={(e) => {
          if (e.key === "Escape") setEditing(false);
        }}
        aria-label="Deadline"
        className="mt-1 rounded border border-teal-accent bg-surface px-1.5 py-0.5 text-[10px] text-ink outline-none"
      />
    );
  }

  if (dueDate) {
    if (editable) {
      return (
        <button
          type="button"
          onClick={() => setEditing(true)}
          title="Click to change the deadline"
          className="mt-1 block text-left transition hover:opacity-80"
        >
          <DeadlineBadge date={dueDate} />
        </button>
      );
    }
    return (
      <span className="mt-1 inline-block">
        <DeadlineBadge date={dueDate} />
      </span>
    );
  }

  if (editable) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        title="Set a deadline"
        className="mt-1 inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold text-muted/70 transition hover:bg-teal-soft hover:text-teal-accent"
      >
        + Set deadline
      </button>
    );
  }

  return null;
}

function SidebarAnswer({
  todo,
  onSave,
  editable = true,
}: {
  todo: ProjectTodo;
  onSave: (answer: string | null) => void;
  editable?: boolean;
}) {
  const [editing, setEditing] = useState(editable && !todo.answer);
  const [draft, setDraft] = useState(todo.answer ?? "");

  function commit() {
    const next = draft.trim();
    setEditing(false);
    if (next !== (todo.answer ?? "")) onSave(next || null);
    else setDraft(todo.answer ?? "");
  }

  if (!editable) {
    if (!todo.answer) return null;
    return (
      <p className="mt-1.5 whitespace-pre-wrap rounded-md bg-surface px-2 py-1.5 text-xs leading-relaxed text-ink">
        <span className="font-semibold text-teal-accent">A · </span>
        {todo.answer}
      </p>
    );
  }

  if (!editing && todo.answer) {
    return (
      <button
        type="button"
        onClick={() => {
          setDraft(todo.answer ?? "");
          setEditing(true);
        }}
        className="mt-1.5 w-full cursor-text whitespace-pre-wrap rounded-md bg-surface px-2 py-1.5 text-left text-xs leading-relaxed text-ink transition hover:bg-teal-soft/60"
      >
        <span className="font-semibold text-teal-accent">A · </span>
        {todo.answer}
      </button>
    );
  }

  return (
    <div className="mt-1.5 flex flex-col gap-1.5">
      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setDraft(todo.answer ?? "");
            setEditing(Boolean(todo.answer));
          }
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            commit();
          }
        }}
        rows={2}
        placeholder="Answer…"
        className="min-w-0 w-full resize-y rounded-md border border-line bg-surface px-2 py-1.5 text-xs leading-relaxed text-ink outline-none focus:border-teal-accent"
      />
      <button
        type="button"
        onClick={commit}
        disabled={!draft.trim() && !todo.answer}
        className="self-end rounded-md bg-teal-accent px-2 py-1.5 text-[10px] font-bold uppercase tracking-wide text-white disabled:opacity-40"
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
  deadlineEditable = false,
  highlight = false,
  projectLink,
  onProjectNavigate,
  priorityNudge,
}: {
  projectId: string;
  todo: ProjectTodo;
  ownerName: string;
  expanded: boolean;
  deadlineEditable?: boolean;
  highlight?: boolean;
  projectLink?: { id: string; name: string };
  onProjectNavigate?: () => void;
  priorityNudge?: PriorityNudgeProps;
}) {
  const { toggleTodo, updateTodo } = useProjects();
  const sortDate = projectTodoSortDate(todo);
  const overdue = sortDate !== "9999-12-31" && isOverdueDate(sortDate);

  return (
    <li
      className={`group/prio relative rounded-lg border p-2.5 ${
        highlight
          ? "border-teal-accent/35 bg-teal-soft/35"
          : "border-line/80 bg-surface/80"
      }${priorityNudge ? " cursor-grab active:cursor-grabbing" : ""}`}
      {...(priorityNudge ? priorityDragHandlers(priorityNudge) : {})}
    >
      {priorityNudge && <TodayPriorityNudge {...priorityNudge} />}
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
          <p className="mt-1 whitespace-pre-wrap text-xs leading-snug text-ink">
            {todo.text}
          </p>
          <SidebarDueDate
            dueDate={todo.dueDate ?? null}
            editable={deadlineEditable}
            onChange={(nextDueDate) =>
              updateTodo(projectId, todo.id, { dueDate: nextDueDate })
            }
          />
          {(todo.startDate || todo.endDate) && (
            <p className="mt-1 text-[10px] text-muted">
              Window:{" "}
              {todo.startDate ? formatDue(todo.startDate) : "…"} →{" "}
              {todo.endDate ? formatDue(todo.endDate) : "…"}
            </p>
          )}
          {(overdue || (expanded && todo.dueDate)) && (
            <div className="mt-1 flex flex-wrap gap-1">
              {overdue && (
                <button
                  type="button"
                  onClick={() =>
                    updateTodo(projectId, todo.id, {
                      dueDate: todayDate(),
                    })
                  }
                  className="inline-flex rounded-md border border-line bg-surface px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted transition hover:border-teal-accent hover:text-teal-accent"
                  title="Move deadline to today"
                >
                  Today
                </button>
              )}
              {expanded && todo.dueDate && (
                <button
                  type="button"
                  onClick={() =>
                    updateTodo(projectId, todo.id, {
                      dueDate: addDays(todo.dueDate!, 1),
                    })
                  }
                  className="inline-flex rounded-md border border-line bg-surface px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted transition hover:border-teal-accent hover:text-teal-accent"
                  title="Move deadline by 1 day"
                >
                  +1 day
                </button>
              )}
            </div>
          )}
          <p className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-muted">
            Owner: {ownerName}
          </p>
          <SidebarAnswer
            todo={todo}
            editable={expanded}
            onSave={(answer) => updateTodo(projectId, todo.id, { answer })}
          />
        </div>
      </div>
    </li>
  );
}

function PersonalOutstandingItem({
  todo,
  expanded,
  highlight = false,
  onNavigate,
  priorityNudge,
}: {
  todo: PersonalTodo;
  expanded: boolean;
  highlight?: boolean;
  onNavigate?: () => void;
  priorityNudge?: PriorityNudgeProps;
}) {
  const { updatePersonalTodo } = useProjects();
  const sortDate = personalTodoSortDate(todo);
  const hasDate = sortDate !== "9999-12-31";
  const overdue = hasDate && isOverdueDate(sortDate);

  return (
    <li
      className={`group/prio relative rounded-lg border p-2.5 ${
        highlight
          ? "border-teal-accent/35 bg-teal-soft/35"
          : "border-line/80 bg-surface/80"
      }${priorityNudge ? " cursor-grab active:cursor-grabbing" : ""}`}
      {...(priorityNudge ? priorityDragHandlers(priorityNudge) : {})}
    >
      {priorityNudge && <TodayPriorityNudge {...priorityNudge} />}
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
            title={todo.title}
          >
            {todo.title}
          </Link>
          {hasDate && <DeadlineBadge date={sortDate} />}
          {expanded && todo.description?.trim() && (
            <p className="mt-1 whitespace-pre-wrap text-[11px] leading-relaxed text-muted">
              {todo.description.trim()}
            </p>
          )}
          {(overdue || (expanded && hasDate && todo.dueDate)) && (
            <div className="mt-1 flex flex-wrap gap-1">
              {overdue && (
                <button
                  type="button"
                  onClick={() =>
                    updatePersonalTodo(todo.id, {
                      dueDate: todayDate(),
                    })
                  }
                  className="inline-flex rounded-md border border-line bg-surface px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted transition hover:border-teal-accent hover:text-teal-accent"
                  title="Move deadline to today"
                >
                  Today
                </button>
              )}
              {expanded && hasDate && todo.dueDate && (
                <button
                  type="button"
                  onClick={() =>
                    updatePersonalTodo(todo.id, {
                      dueDate: addDays(todo.dueDate!, 1),
                    })
                  }
                  className="inline-flex rounded-md border border-line bg-surface px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted transition hover:border-teal-accent hover:text-teal-accent"
                  title="Move deadline by 1 day"
                >
                  +1 day
                </button>
              )}
            </div>
          )}
          {(todo.startDate || todo.endDate) && (
            <p className="mt-1 text-[10px] text-muted">
              Window:{" "}
              {todo.startDate ? formatDue(todo.startDate) : "…"} →{" "}
              {todo.endDate ? formatDue(todo.endDate) : "…"}
            </p>
          )}
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
  priorityNudge,
}: {
  project: Project;
  dueDate: string;
  onContacted: () => void;
  showProjectLink?: boolean;
  onProjectNavigate?: () => void;
  priorityNudge?: PriorityNudgeProps;
}) {
  const delta = daysBetween(todayDate(), dueDate);
  const status =
    delta < 0
      ? `${Math.abs(delta)}d overdue`
      : delta === 0
        ? "Due today"
        : null;

  return (
    <li
      className={`group/prio relative rounded-lg border border-amber-accent/40 bg-amber-accent/5 p-2.5${
        priorityNudge ? " cursor-grab active:cursor-grabbing" : ""
      }`}
      {...(priorityNudge ? priorityDragHandlers(priorityNudge) : {})}
    >
      {priorityNudge && <TodayPriorityNudge {...priorityNudge} />}
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
              Reminder
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

function ProspectFollowUpItem({
  company,
  contact,
  dueDate,
  onDone,
  onReschedule,
  showCompanyLink,
  onNavigate,
  priorityNudge,
}: {
  company: ProspectCompany;
  contact: ProspectContact;
  dueDate: string;
  onDone: () => void;
  onReschedule: (date: string) => void;
  showCompanyLink?: boolean;
  onNavigate?: () => void;
  priorityNudge?: PriorityNudgeProps;
}) {
  const delta = daysBetween(todayDate(), dueDate);
  const status =
    delta < 0
      ? `${Math.abs(delta)}d overdue`
      : delta === 0
        ? "Due today"
        : null;
  const who =
    contact.name.trim() ||
    contact.email.trim() ||
    contact.title.trim() ||
    "contact";

  return (
    <li
      className={`group/prio relative rounded-lg border border-teal-accent/35 bg-teal-soft/40 p-2.5${
        priorityNudge ? " cursor-grab active:cursor-grabbing" : ""
      }`}
      {...(priorityNudge ? priorityDragHandlers(priorityNudge) : {})}
    >
      {priorityNudge && <TodayPriorityNudge {...priorityNudge} />}
      <div className="flex items-start gap-2">
        <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center text-teal-accent">
          <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 fill-current">
            <path d="M1.5 3.5A1.5 1.5 0 0 1 3 2h10a1.5 1.5 0 0 1 1.5 1.5v9A1.5 1.5 0 0 1 13 14H3a1.5 1.5 0 0 1-1.5-1.5v-9Zm1.5-.5a.5.5 0 0 0-.5.5v.25l5.25 3.15a.5.5 0 0 0 .5 0L13.5 3.75V3.5a.5.5 0 0 0-.5-.5H3Zm10.5 2.1-4.9 2.94a1.5 1.5 0 0 1-1.5 0L2.2 5.1v7.4a.5.5 0 0 0 .5.5h10a.5.5 0 0 0 .5-.5V5.1Z" />
          </svg>
        </span>
        <div className="min-w-0 flex-1">
          {showCompanyLink && (
            <Link
              href="/prospecting"
              onClick={onNavigate}
              className="mb-1 block truncate text-[11px] font-semibold text-teal-accent hover:underline"
            >
              {company.name}
            </Link>
          )}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="rounded bg-teal-accent/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-teal-accent">
              Prospecting
            </span>
            {status && (
              <span className="text-[10px] font-semibold uppercase tracking-wide text-amber-accent">
                {status}
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-ink">
            Follow up with {who}
            {contact.title ? ` · ${contact.title}` : ""}
          </p>
          {contact.followUpReason.trim() && (
            <p className="mt-0.5 text-[10px] text-muted">
              {contact.followUpReason.trim()}
            </p>
          )}
          <label className="mt-1.5 flex flex-col gap-0.5">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted">
              Follow-up date
            </span>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => {
                if (!e.target.value) return;
                onReschedule(e.target.value);
              }}
              className="w-full max-w-[11rem] rounded border border-line bg-panel px-2 py-1 text-[11px] text-ink outline-none focus:border-teal-accent"
            />
          </label>
          <button
            type="button"
            onClick={onDone}
            className="mt-1.5 block text-[11px] font-semibold text-teal-accent hover:underline"
          >
            Done
          </button>
        </div>
      </div>
    </li>
  );
}

function GanttBarsIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 fill-current" aria-hidden>
      <rect x="1" y="3" width="6" height="2.5" rx="0.5" />
      <rect x="4" y="7" width="9" height="2.5" rx="0.5" />
      <rect x="2" y="11" width="7" height="2.5" rx="0.5" />
    </svg>
  );
}

function GanttNotificationItem({
  project,
  kind,
  sortDate,
  onApprove,
  onSnooze,
  showProjectLink,
  onProjectNavigate,
  priorityNudge,
}: {
  project: Project;
  kind: GanttOutstandingKind;
  sortDate: string;
  onApprove: () => void;
  onSnooze: () => void;
  showProjectLink?: boolean;
  onProjectNavigate?: () => void;
  priorityNudge?: PriorityNudgeProps;
}) {
  const isMissing = kind === "missing";
  const startLabel = scheduleEarliestStart(project.schedule);

  return (
    <li
      className={`group/prio relative rounded-lg border border-deep/35 bg-gradient-to-br from-deep/10 via-panel to-teal-soft/30 p-2.5 shadow-[inset_3px_0_0_0_var(--deep)]${
        priorityNudge ? " cursor-grab active:cursor-grabbing" : ""
      }`}
      {...(priorityNudge ? priorityDragHandlers(priorityNudge) : {})}
    >
      {priorityNudge && <TodayPriorityNudge {...priorityNudge} />}
      <div className="flex items-start gap-2">
        <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center text-deep">
          <GanttBarsIcon />
        </span>
        <div className="min-w-0 flex-1">
          {showProjectLink && (
            <Link
              href={`/projects/${project.id}`}
              onClick={onProjectNavigate}
              className="mb-1 block truncate text-[11px] font-semibold text-deep hover:underline"
            >
              {project.name}
            </Link>
          )}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="rounded bg-deep/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-deep">
              Gantt
            </span>
            <span className="rounded bg-teal-accent/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-teal-accent">
              {isMissing ? "Missing schedule" : "Project started"}
            </span>
          </div>
          <p className="mt-1 text-xs text-ink">
            {isMissing
              ? "No Gantt chart yet — generate a delivery schedule or snooze for 1 month."
              : `Schedule shows the project started${
                  startLabel ? ` on ${formatDue(startLabel)}` : ""
                }. Approve the dates or shift the Gantt on the project page.`}
          </p>
          <DeadlineBadge date={sortDate} />
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
            <Link
              href={`/projects/${project.id}`}
              onClick={onProjectNavigate}
              className="text-[11px] font-semibold text-deep hover:underline"
            >
              {isMissing ? "Open to generate" : "Open to shift"}
            </Link>
            {isMissing ? (
              <button
                type="button"
                onClick={onSnooze}
                className="text-[11px] font-semibold text-teal-accent hover:underline"
              >
                Snooze 1 month
              </button>
            ) : (
              <button
                type="button"
                onClick={onApprove}
                className="text-[11px] font-semibold text-teal-accent hover:underline"
              >
                Approve schedule
              </button>
            )}
          </div>
        </div>
      </div>
    </li>
  );
}

type SidebarEntry =
  | { type: "contact"; sortDate: string }
  | { type: "todo"; todo: ProjectTodo; sortDate: string };

type ProspectFollowUpFlat = {
  type: "prospect-follow-up";
  sortDate: string;
  company: ProspectCompany;
  contact: ProspectContact;
};

type GanttOutstandingFlat = {
  type: "gantt";
  sortDate: string;
  project: Project;
  kind: GanttOutstandingKind;
};

type FlatEntry =
  | (SidebarEntry & { project: Project })
  | ProspectFollowUpFlat
  | GanttOutstandingFlat;
type TodoFlatEntry = Extract<FlatEntry, { type: "todo" }>;

function flatEntryKey(entry: FlatEntry): string {
  if (entry.type === "todo") return `todo:${entry.project.id}:${entry.todo.id}`;
  if (entry.type === "contact") return `contact:${entry.project.id}`;
  if (entry.type === "prospect-follow-up") {
    return `prospect:${entry.contact.id}`;
  }
  return `gantt:${entry.project.id}:${entry.kind}`;
}

type Group = {
  project: Project;
  entries: SidebarEntry[];
  earliestDue: string;
};

type DisplaySection =
  | {
      kind: "project";
      project: Project;
      entries: SidebarEntry[];
      earliestDue: string;
    }
  | {
      kind: "prospect";
      company: ProspectCompany;
      contact: ProspectContact;
      sortDate: string;
      earliestDue: string;
    }
  | {
      kind: "gantt";
      project: Project;
      ganttKind: GanttOutstandingKind;
      sortDate: string;
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

function compareFlatEntries(a: FlatEntry, b: FlatEntry): number {
  if (a.sortDate !== b.sortDate) {
    return a.sortDate < b.sortDate ? -1 : 1;
  }
  if (a.type === "prospect-follow-up" && b.type !== "prospect-follow-up") {
    return -1;
  }
  if (b.type === "prospect-follow-up" && a.type !== "prospect-follow-up") {
    return 1;
  }
  if (a.type === "gantt" && b.type !== "gantt") return -1;
  if (b.type === "gantt" && a.type !== "gantt") return 1;
  if (a.type === "contact" && b.type !== "contact") return -1;
  if (b.type === "contact" && a.type !== "contact") return 1;
  if (a.type === "todo" && b.type === "todo") {
    return compareTodosByDeadline(a.todo, b.todo);
  }
  if (a.type === "prospect-follow-up" && b.type === "prospect-follow-up") {
    return a.company.name.localeCompare(b.company.name);
  }
  if (a.type === "gantt" && b.type === "gantt") {
    return a.project.name.localeCompare(b.project.name);
  }
  return 0;
}

function projectMatchesOwnerFilter(
  project: Project,
  selectedIds: Set<string>,
  allSelected: boolean,
): boolean {
  if (allSelected) return true;
  if (selectedIds.size === 0) return false;
  return Boolean(
    (project.leadUserId && selectedIds.has(project.leadUserId)) ||
      (project.coLeadUserIds ?? []).some((id) => selectedIds.has(id)),
  );
}

/** Skip prospecting follow-ups once the company is a Sales cold lead. */
function isProspectLinkedColdLead(
  company: ProspectCompany,
  projects: Project[],
): boolean {
  if (!company.promotedProjectId) return false;
  const linked = projects.find((p) => p.id === company.promotedProjectId);
  return Boolean(linked && linked.stage === "cold-lead");
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
    currentUserId,
    getProjectUserReminder,
    projectUserReminders,
    getProjectGanttOutstanding,
    projectGanttOutstanding,
    approveGanttStartNotification,
    snoozeGanttMissingNotification,
  } = useProjects();
  const { can, authEnabled } = useAuth();
  const canSeeGanttOutstanding = !authEnabled || can("technical_sales");
  const {
    ready: prospectingReady,
    companies: prospectCompanies,
    contacts: prospectContacts,
    scheduleFollowUp,
    completeFollowUp,
  } = useProspecting();
  const [fullscreen, setFullscreen] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>("by-project");
  const [scope, setScope] = useState<ScopeMode>("project");
  const [ownerFilterIds, setOwnerFilterIds] = useState<OwnerFilterIds>(null);
  const [pendingSelectAll, setPendingSelectAll] = useState(false);
  const [prefsReady, setPrefsReady] = useState(false);
  const [todayPriority, setTodayPriority] = useUiPref<TodayPriorityPrefs>(
    TODAY_PRIORITY_KEY,
    EMPTY_TODAY_PRIORITY,
  );

  useEffect(() => {
    setSortMode(readSortMode());
    setScope(readScopeMode());
    const stored = readOwnerFilterIds();
    if (stored === "all") {
      setPendingSelectAll(true);
      setOwnerFilterIds([]);
    } else {
      setOwnerFilterIds(stored);
    }
    setPrefsReady(true);
  }, []);

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

  const ownerFilterOptions = useMemo(() => {
    const list = assignableTeamMembers(teamMembers);
    if (currentUserId && !list.some((m) => m.id === currentUserId)) {
      const me = teamMembers.find((m) => m.id === currentUserId);
      if (me) return [me, ...list];
    }
    return list;
  }, [teamMembers, currentUserId]);

  useEffect(() => {
    if (!pendingSelectAll || ownerFilterOptions.length === 0) return;
    setOwnerFilterIds(ownerFilterOptions.map((m) => m.id));
    setPendingSelectAll(false);
  }, [pendingSelectAll, ownerFilterOptions]);

  const selectedOwnerIds = useMemo(() => {
    if (ownerFilterIds === null) {
      return currentUserId ? new Set([currentUserId]) : new Set<string>();
    }
    return new Set(ownerFilterIds);
  }, [ownerFilterIds, currentUserId]);

  const allOwnersSelected =
    ownerFilterOptions.length > 0 &&
    ownerFilterOptions.every((m) => selectedOwnerIds.has(m.id));

  useEffect(() => {
    if (!prefsReady || ownerFilterIds === null) return;
    try {
      if (allOwnersSelected) {
        window.localStorage.setItem(OWNER_FILTER_KEY, "all");
      } else {
        window.localStorage.setItem(
          OWNER_FILTER_KEY,
          JSON.stringify(ownerFilterIds),
        );
      }
    } catch {
      /* ignore */
    }
  }, [ownerFilterIds, prefsReady, allOwnersSelected]);

  useEffect(() => {
    if (!fullscreen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [fullscreen]);

  const projectWorkWindow = useMemo(() => {
    const active: TodoFlatEntry[] = [];
    const upcoming: TodoFlatEntry[] = [];
    const excludedIds = new Set<string>();

    for (const project of projects) {
      if (isInternalHiddenProject(project)) continue;
      for (const todo of project.todos) {
        if (todo.done) continue;
        // Follow-ups are reminder Contact rows, not action todos
        if (isClientFollowUpTodo(todo, project.client)) continue;
        if (isSetNextStepTodo(todo)) continue;
        if (
          !todoMatchesOwnerFilter(todo, selectedOwnerIds, allOwnersSelected)
        ) {
          continue;
        }
        const entry: TodoFlatEntry = {
          type: "todo",
          todo,
          sortDate: projectTodoSortDate(todo),
          project,
        };
        if (isTodoInWorkWindow(todo)) {
          active.push(entry);
          excludedIds.add(todo.id);
        } else if (isTodoWorkWindowUpcoming(todo)) {
          upcoming.push(entry);
          excludedIds.add(todo.id);
        }
      }
    }

    active.sort((a, b) => {
      if (a.type !== "todo" || b.type !== "todo") return 0;
      return compareTodosByDeadline(a.todo, b.todo);
    });
    upcoming.sort((a, b) => {
      if (a.type !== "todo" || b.type !== "todo") return 0;
      return compareTodosByWorkWindowStart(a.todo, b.todo);
    });

    return { active, upcoming, excludedIds };
  }, [projects, selectedOwnerIds, allOwnersSelected]);

  const groups = useMemo(() => {
    const list: Group[] = [];
    const showMyContact =
      Boolean(currentUserId) &&
      (allOwnersSelected || selectedOwnerIds.has(currentUserId!));

    for (const project of projects) {
      if (isInternalHiddenProject(project)) continue;
      const todos = project.todos.filter((t) => {
        if (t.done || projectWorkWindow.excludedIds.has(t.id)) return false;
        // Never list auto follow-ups as actions — they render as Contact reminders
        if (isClientFollowUpTodo(t, project.client)) return false;
        if (isSetNextStepTodo(t)) return false;
        return todoMatchesOwnerFilter(t, selectedOwnerIds, allOwnersSelected);
      });

      const emailDueForMe =
        showMyContact &&
        isUserEmailReminderDue(
          getProjectUserReminder(project.id, currentUserId),
        );
      // Always surface due follow-ups as Contact rows (separate from actions)
      const showSyntheticContact = emailDueForMe;

      if (todos.length === 0 && !showSyntheticContact) continue;

      const entries: SidebarEntry[] = todos.map((todo) => ({
        type: "todo" as const,
        todo,
        sortDate: projectTodoSortDate(todo),
      }));

      if (showSyntheticContact && currentUserId) {
        entries.push({
          type: "contact",
          sortDate: nextEmailReminderDateForUser(
            getProjectUserReminder(project.id, currentUserId),
          ),
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
  }, [
    projects,
    projectWorkWindow.excludedIds,
    currentUserId,
    selectedOwnerIds,
    allOwnersSelected,
    getProjectUserReminder,
    projectUserReminders,
  ]);

  const prospectFollowUps = useMemo((): ProspectFollowUpFlat[] => {
    if (!prospectingReady) return [];
    const companyById = new Map(
      prospectCompanies.map((c) => [c.id, c] as const),
    );
    const list: ProspectFollowUpFlat[] = [];

    for (const contact of prospectContacts) {
      const due = contact.nextFollowUpAt?.slice(0, 10);
      if (!due) continue;
      if (due > todayDate()) continue;
      if (
        contact.status === "disqualified" ||
        contact.status === "cancelled" ||
        contact.status === "not-interested"
      ) {
        continue;
      }
      if (
        !allOwnersSelected &&
        (!contact.ownerId || !selectedOwnerIds.has(contact.ownerId))
      ) {
        continue;
      }
      const company = companyById.get(contact.companyId);
      if (!company) continue;
      if (
        company.status === "disqualified" ||
        company.status === "cancelled" ||
        company.status === "not-interested"
      ) {
        continue;
      }
      if (isProspectLinkedColdLead(company, projects)) continue;

      list.push({
        type: "prospect-follow-up",
        sortDate: due,
        company,
        contact,
      });
    }

    list.sort((a, b) => {
      if (a.sortDate !== b.sortDate) {
        return a.sortDate < b.sortDate ? -1 : 1;
      }
      return a.company.name.localeCompare(b.company.name);
    });
    return list;
  }, [
    prospectingReady,
    prospectCompanies,
    prospectContacts,
    projects,
    selectedOwnerIds,
    allOwnersSelected,
  ]);

  const ganttOutstanding = useMemo((): GanttOutstandingFlat[] => {
    if (!canSeeGanttOutstanding || !currentUserId) return [];
    const list: GanttOutstandingFlat[] = [];
    const today = todayDate();

    for (const project of projects) {
      if (isInternalHiddenProject(project)) continue;
      if (
        !projectMatchesOwnerFilter(
          project,
          selectedOwnerIds,
          allOwnersSelected,
        )
      ) {
        continue;
      }
      const prefs = getProjectGanttOutstanding(project.id);
      const kind = resolveGanttOutstandingKind(project, prefs, today);
      if (!kind) continue;
      const start = scheduleEarliestStart(project.schedule);
      list.push({
        type: "gantt",
        kind,
        project,
        sortDate: kind === "started" && start ? start : today,
      });
    }

    list.sort((a, b) => {
      if (a.sortDate !== b.sortDate) {
        return a.sortDate < b.sortDate ? -1 : 1;
      }
      return a.project.name.localeCompare(b.project.name);
    });
    return list;
  }, [
    canSeeGanttOutstanding,
    currentUserId,
    projects,
    selectedOwnerIds,
    allOwnersSelected,
    getProjectGanttOutstanding,
    projectGanttOutstanding,
  ]);

  const displaySections = useMemo((): DisplaySection[] => {
    const sections: DisplaySection[] = [
      ...groups.map((g) => ({
        kind: "project" as const,
        project: g.project,
        entries: g.entries,
        earliestDue: g.earliestDue,
      })),
      ...prospectFollowUps.map((p) => ({
        kind: "prospect" as const,
        company: p.company,
        contact: p.contact,
        sortDate: p.sortDate,
        earliestDue: p.sortDate,
      })),
      ...ganttOutstanding.map((g) => ({
        kind: "gantt" as const,
        project: g.project,
        ganttKind: g.kind,
        sortDate: g.sortDate,
        earliestDue: g.sortDate,
      })),
    ];
    sections.sort((a, b) => {
      if (a.earliestDue !== b.earliestDue) {
        return a.earliestDue < b.earliestDue ? -1 : 1;
      }
      const an =
        a.kind === "project" || a.kind === "gantt"
          ? a.project.name
          : a.company.name;
      const bn =
        b.kind === "project" || b.kind === "gantt"
          ? b.project.name
          : b.company.name;
      return an.localeCompare(bn);
    });
    return sections;
  }, [groups, prospectFollowUps, ganttOutstanding]);

  const flatByBucket = useMemo(() => {
    const flat: FlatEntry[] = [];
    for (const { project, entries } of groups) {
      for (const entry of entries) {
        flat.push({ ...entry, project });
      }
    }
    for (const entry of prospectFollowUps) {
      flat.push(entry);
    }
    for (const entry of ganttOutstanding) {
      flat.push(entry);
    }
    flat.sort((a, b) => {
      const byDate = compareFlatEntries(a, b);
      if (byDate !== 0) return byDate;
      const an =
        a.type === "prospect-follow-up"
          ? a.company.name
          : a.project.name;
      const bn =
        b.type === "prospect-follow-up"
          ? b.company.name
          : b.project.name;
      return an.localeCompare(bn);
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
  }, [groups, prospectFollowUps, ganttOutstanding]);

  const openPersonal = useMemo(
    () =>
      personalTodos
        .filter(
          (todo) =>
            isPersonalTodoOpen(todo) && isOwnPersonalTodo(todo, currentUserId),
        )
        .slice()
        .sort(comparePersonalTodos),
    [personalTodos, currentUserId],
  );

  const personalWorkWindow = useMemo(() => {
    const active: PersonalTodo[] = [];
    const upcoming: PersonalTodo[] = [];
    const excludedIds = new Set<string>();

    for (const todo of openPersonal) {
      if (isTodoInWorkWindow(todo)) {
        active.push(todo);
        excludedIds.add(todo.id);
      } else if (isTodoWorkWindowUpcoming(todo)) {
        upcoming.push(todo);
        excludedIds.add(todo.id);
      }
    }

    active.sort(comparePersonalTodos);
    upcoming.sort(comparePersonalTodosByWorkWindowStart);
    return { active, upcoming, excludedIds };
  }, [openPersonal]);

  const personalFlatByBucket = useMemo(() => {
    const buckets: Record<UrgencyBucket, PersonalTodo[]> = {
      overdue: [],
      today: [],
      upcoming: [],
      nodate: [],
    };
    for (const todo of openPersonal) {
      if (personalWorkWindow.excludedIds.has(todo.id)) continue;
      buckets[urgencyBucket(personalTodoSortDate(todo))].push(todo);
    }
    return buckets;
  }, [openPersonal, personalWorkWindow.excludedIds]);

  const prioritizedProjectToday = useMemo(
    () =>
      orderByPriorityKeys(
        flatByBucket.today,
        Array.isArray(todayPriority.project) ? todayPriority.project : [],
        flatEntryKey,
      ),
    [flatByBucket.today, todayPriority.project],
  );

  const prioritizedPersonalToday = useMemo(
    () =>
      orderByPriorityKeys(
        personalFlatByBucket.today,
        Array.isArray(todayPriority.personal) ? todayPriority.personal : [],
        personalEntryKey,
      ),
    [personalFlatByBucket.today, todayPriority.personal],
  );

  function moveProjectTodayPriority(key: string, direction: -1 | 1) {
    const visibleKeys = flatByBucket.today.map(flatEntryKey);
    setTodayPriority((prev) => ({
      project: movePriorityKey(
        visibleKeys,
        Array.isArray(prev.project) ? prev.project : [],
        key,
        direction,
      ),
      personal: Array.isArray(prev.personal) ? prev.personal : [],
    }));
  }

  function movePersonalTodayPriority(key: string, direction: -1 | 1) {
    const visibleKeys = personalFlatByBucket.today.map(personalEntryKey);
    setTodayPriority((prev) => ({
      project: Array.isArray(prev.project) ? prev.project : [],
      personal: movePriorityKey(
        visibleKeys,
        Array.isArray(prev.personal) ? prev.personal : [],
        key,
        direction,
      ),
    }));
  }

  function reorderProjectTodayPriority(fromKey: string, toKey: string) {
    const visibleKeys = flatByBucket.today.map(flatEntryKey);
    setTodayPriority((prev) => ({
      project: reorderPriorityKey(
        visibleKeys,
        Array.isArray(prev.project) ? prev.project : [],
        fromKey,
        toKey,
      ),
      personal: Array.isArray(prev.personal) ? prev.personal : [],
    }));
  }

  function reorderPersonalTodayPriority(fromKey: string, toKey: string) {
    const visibleKeys = personalFlatByBucket.today.map(personalEntryKey);
    setTodayPriority((prev) => ({
      project: Array.isArray(prev.project) ? prev.project : [],
      personal: reorderPriorityKey(
        visibleKeys,
        Array.isArray(prev.personal) ? prev.personal : [],
        fromKey,
        toKey,
      ),
    }));
  }

  function projectTodayNudge(
    entry: FlatEntry,
    index: number,
    total: number,
  ): PriorityNudgeProps | undefined {
    if (total <= 1) return undefined;
    const key = flatEntryKey(entry);
    return {
      canUp: index > 0,
      canDown: index < total - 1,
      onUp: () => moveProjectTodayPriority(key, -1),
      onDown: () => moveProjectTodayPriority(key, 1),
      dragId: key,
      onReorder: reorderProjectTodayPriority,
    };
  }

  function personalTodayNudge(
    todo: PersonalTodo,
    index: number,
    total: number,
  ): PriorityNudgeProps | undefined {
    if (total <= 1) return undefined;
    const key = personalEntryKey(todo);
    return {
      canUp: index > 0,
      canDown: index < total - 1,
      onUp: () => movePersonalTodayPriority(key, -1),
      onDown: () => movePersonalTodayPriority(key, 1),
      dragId: key,
      onReorder: reorderPersonalTodayPriority,
    };
  }

  const projectTotalOpen = useMemo(() => {
    let n =
      projectWorkWindow.active.length + projectWorkWindow.upcoming.length;
    for (const g of groups) n += g.entries.length;
    n += prospectFollowUps.length;
    n += ganttOutstanding.length;
    return n;
  }, [
    groups,
    projectWorkWindow,
    prospectFollowUps.length,
    ganttOutstanding.length,
  ]);
  const totalOpen =
    scope === "personal" ? openPersonal.length : projectTotalOpen;

  function ownerName(ownerUserId?: string): string {
    return (
      teamMembers.find((m) => m.id === ownerUserId)?.name ?? "Unassigned"
    );
  }

  const richChrome = fullscreen;

  const exitFullscreen = () => setFullscreen(false);

  function renderProjectWorkWindowSections(layout: "rail" | "fullscreen") {
    const { active, upcoming } = projectWorkWindow;
    if (active.length === 0 && upcoming.length === 0) return null;

    const listClass =
      layout === "fullscreen"
        ? "grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4"
        : "flex flex-col gap-2";

    return (
      <div className="mb-4 flex flex-col gap-4">
        {active.length > 0 && (
          <section>
            <h3 className="mb-2 text-[10px] font-bold uppercase tracking-wide text-teal-accent">
              Working on now
              <span className="ml-1.5 font-semibold text-teal-accent/70">
                {active.length}
              </span>
            </h3>
            <ul className={listClass}>
              {active.map((entry) => (
                <OutstandingItem
                  key={entry.todo.id}
                  projectId={entry.project.id}
                  todo={entry.todo}
                  ownerName={ownerName(entry.todo.ownerUserId)}
                  expanded={richChrome}
                  deadlineEditable={layout === "fullscreen"}
                  highlight
                  projectLink={{
                    id: entry.project.id,
                    name: entry.project.name,
                  }}
                  onProjectNavigate={exitFullscreen}
                />
              ))}
            </ul>
          </section>
        )}
        {upcoming.length > 0 && (
          <section>
            <h3 className="mb-2 text-[10px] font-bold uppercase tracking-wide text-muted">
              Coming up next
              <span className="ml-1.5 font-semibold text-muted/70">
                {upcoming.length}
              </span>
            </h3>
            <ul className={listClass}>
              {upcoming.map((entry) => (
                <OutstandingItem
                  key={entry.todo.id}
                  projectId={entry.project.id}
                  todo={entry.todo}
                  ownerName={ownerName(entry.todo.ownerUserId)}
                  expanded={richChrome}
                  deadlineEditable={layout === "fullscreen"}
                  projectLink={{
                    id: entry.project.id,
                    name: entry.project.name,
                  }}
                  onProjectNavigate={exitFullscreen}
                />
              ))}
            </ul>
          </section>
        )}
      </div>
    );
  }

  function renderPersonalWorkWindowSections(layout: "rail" | "fullscreen") {
    const { active, upcoming } = personalWorkWindow;
    if (active.length === 0 && upcoming.length === 0) return null;

    const listClass =
      layout === "fullscreen"
        ? "grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4"
        : "flex flex-col gap-2";

    return (
      <div className="mb-4 flex flex-col gap-4">
        {active.length > 0 && (
          <section>
            <h3 className="mb-2 text-[10px] font-bold uppercase tracking-wide text-teal-accent">
              Working on now
              <span className="ml-1.5 font-semibold text-teal-accent/70">
                {active.length}
              </span>
            </h3>
            <ul className={listClass}>
              {active.map((todo) => (
                <PersonalOutstandingItem
                  key={todo.id}
                  todo={todo}
                  expanded={richChrome}
                  highlight
                  onNavigate={exitFullscreen}
                />
              ))}
            </ul>
          </section>
        )}
        {upcoming.length > 0 && (
          <section>
            <h3 className="mb-2 text-[10px] font-bold uppercase tracking-wide text-muted">
              Coming up next
              <span className="ml-1.5 font-semibold text-muted/70">
                {upcoming.length}
              </span>
            </h3>
            <ul className={listClass}>
              {upcoming.map((todo) => (
                <PersonalOutstandingItem
                  key={todo.id}
                  todo={todo}
                  expanded={richChrome}
                  onNavigate={exitFullscreen}
                />
              ))}
            </ul>
          </section>
        )}
      </div>
    );
  }

  function renderFlatEntry(
    entry: FlatEntry,
    layout: "rail" | "fullscreen",
    priorityNudge?: PriorityNudgeProps,
  ) {
    if (entry.type === "prospect-follow-up") {
      return (
        <ProspectFollowUpItem
          key={`prospect-${entry.contact.id}`}
          company={entry.company}
          contact={entry.contact}
          dueDate={entry.sortDate}
          onDone={() => completeFollowUp(entry.contact.id)}
          onReschedule={(date) =>
            scheduleFollowUp(
              entry.contact.id,
              date,
              entry.contact.followUpReason || undefined,
            )
          }
          showCompanyLink
          onNavigate={exitFullscreen}
          priorityNudge={priorityNudge}
        />
      );
    }
    if (entry.type === "gantt") {
      return (
        <GanttNotificationItem
          key={`gantt-${entry.project.id}-${entry.kind}`}
          project={entry.project}
          kind={entry.kind}
          sortDate={entry.sortDate}
          onApprove={() => approveGanttStartNotification(entry.project.id)}
          onSnooze={() => snoozeGanttMissingNotification(entry.project.id)}
          showProjectLink
          onProjectNavigate={exitFullscreen}
          priorityNudge={priorityNudge}
        />
      );
    }
    if (entry.type === "contact") {
      return (
        <ContactItem
          key={`${entry.project.id}-contact`}
          project={entry.project}
          dueDate={entry.sortDate}
          onContacted={() => markClientContacted(entry.project.id)}
          showProjectLink
          onProjectNavigate={exitFullscreen}
          priorityNudge={priorityNudge}
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
        deadlineEditable={layout === "fullscreen"}
        projectLink={{ id: entry.project.id, name: entry.project.name }}
        onProjectNavigate={exitFullscreen}
        priorityNudge={priorityNudge}
      />
    );
  }

  function renderPersonalDeadlineBuckets(layout: "rail" | "fullscreen") {
    const listClass =
      layout === "fullscreen"
        ? "grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4"
        : "flex flex-col gap-2";

    return (
      <div className="flex flex-col gap-5">
        {renderPersonalWorkWindowSections(layout)}
        {BUCKET_ORDER.map((bucket) => {
          const items =
            bucket === "today"
              ? prioritizedPersonalToday
              : personalFlatByBucket[bucket];
          if (items.length === 0) return null;
          return (
            <section key={bucket}>
              <h3 className="mb-2 text-[10px] font-bold uppercase tracking-wide text-muted">
                {BUCKET_LABELS[bucket]}
                <span className="ml-1.5 font-semibold text-muted/70">
                  {items.length}
                </span>
              </h3>
              <ul className={listClass}>
                {items.map((todo, index) => (
                  <PersonalOutstandingItem
                    key={todo.id}
                    todo={todo}
                    expanded={richChrome}
                    onNavigate={exitFullscreen}
                    priorityNudge={
                      bucket === "today"
                        ? personalTodayNudge(todo, index, items.length)
                        : undefined
                    }
                  />
                ))}
              </ul>
            </section>
          );
        })}
      </div>
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

    // By-deadline (and personal fullscreen) use urgency buckets; Due today is prioritizable.
    if (layout === "fullscreen" || sortMode === "by-deadline") {
      return renderPersonalDeadlineBuckets(layout);
    }

    return (
      <>
        {renderPersonalWorkWindowSections(layout)}
        <ul className="flex flex-col gap-2">
          {openPersonal
            .filter((todo) => !personalWorkWindow.excludedIds.has(todo.id))
            .map((todo) => (
              <PersonalOutstandingItem
                key={todo.id}
                todo={todo}
                expanded={richChrome}
                onNavigate={exitFullscreen}
              />
            ))}
        </ul>
      </>
    );
  }

  function renderList(layout: "rail" | "fullscreen") {
    if (scope === "personal") return renderPersonalList(layout);

    if (projectTotalOpen === 0) {
      return (
        <p className="rounded-lg border border-dashed border-line px-3 py-8 text-center text-xs text-muted">
          {allOwnersSelected || selectedOwnerIds.size === 0
            ? selectedOwnerIds.size === 0
              ? "No users selected."
              : "Nothing outstanding. Nice work."
            : "No outstanding tasks for the selected users."}
        </p>
      );
    }

    const useProjectSort = layout === "rail" || sortMode === "by-project";

    if (useProjectSort) {
      return (
        <>
          {renderProjectWorkWindowSections(layout)}
          <div
            className={
              layout === "fullscreen"
                ? "grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4"
                : "flex flex-col gap-4"
            }
          >
            {displaySections.map((section) =>
              section.kind === "prospect" ? (
                <section
                  key={`prospect-${section.contact.id}`}
                  className={
                    layout === "fullscreen"
                      ? "rounded-xl border border-line/80 bg-surface/40 p-3"
                      : undefined
                  }
                >
                  <Link
                    href="/prospecting"
                    onClick={exitFullscreen}
                    className="mb-2 block truncate text-sm font-semibold text-deep transition hover:text-teal-accent hover:underline"
                  >
                    {section.company.name}
                    <span className="ml-1.5 text-[10px] font-bold uppercase tracking-wide text-teal-accent">
                      Prospecting
                    </span>
                  </Link>
                  <ul className="flex flex-col gap-2">
                    <ProspectFollowUpItem
                      company={section.company}
                      contact={section.contact}
                      dueDate={section.sortDate}
                      onDone={() => completeFollowUp(section.contact.id)}
                      onReschedule={(date) =>
                        scheduleFollowUp(
                          section.contact.id,
                          date,
                          section.contact.followUpReason || undefined,
                        )
                      }
                    />
                  </ul>
                </section>
              ) : section.kind === "gantt" ? (
                <section
                  key={`gantt-${section.project.id}-${section.ganttKind}`}
                  className={
                    layout === "fullscreen"
                      ? "rounded-xl border border-deep/25 bg-deep/5 p-3"
                      : undefined
                  }
                >
                  <Link
                    href={`/projects/${section.project.id}`}
                    onClick={exitFullscreen}
                    className="mb-2 block truncate text-sm font-semibold text-deep transition hover:text-teal-accent hover:underline"
                  >
                    {section.project.name}
                    <span className="ml-1.5 text-[10px] font-bold uppercase tracking-wide text-deep">
                      Gantt
                    </span>
                  </Link>
                  <ul className="flex flex-col gap-2">
                    <GanttNotificationItem
                      project={section.project}
                      kind={section.ganttKind}
                      sortDate={section.sortDate}
                      onApprove={() =>
                        approveGanttStartNotification(section.project.id)
                      }
                      onSnooze={() =>
                        snoozeGanttMissingNotification(section.project.id)
                      }
                    />
                  </ul>
                </section>
              ) : (
                <section
                  key={section.project.id}
                  className={
                    layout === "fullscreen"
                      ? "rounded-xl border border-line/80 bg-surface/40 p-3"
                      : undefined
                  }
                >
                  <Link
                    href={`/projects/${section.project.id}`}
                    onClick={exitFullscreen}
                    className="mb-2 block truncate text-sm font-semibold text-deep transition hover:text-teal-accent hover:underline"
                  >
                    {section.project.name}
                  </Link>
                  <ul className="flex flex-col gap-2">
                    {section.entries.map((entry) =>
                      entry.type === "contact" ? (
                        <ContactItem
                          key="contact"
                          project={section.project}
                          dueDate={entry.sortDate}
                          onContacted={() =>
                            markClientContacted(section.project.id)
                          }
                        />
                      ) : (
                        <OutstandingItem
                          key={entry.todo.id}
                          projectId={section.project.id}
                          todo={entry.todo}
                          ownerName={ownerName(entry.todo.ownerUserId)}
                          expanded={richChrome}
                          deadlineEditable={layout === "fullscreen"}
                        />
                      ),
                    )}
                  </ul>
                </section>
              ),
            )}
          </div>
        </>
      );
    }

    return (
      <div className="flex flex-col gap-5">
        {renderProjectWorkWindowSections(layout)}
        {BUCKET_ORDER.map((bucket) => {
          const items =
            bucket === "today" ? prioritizedProjectToday : flatByBucket[bucket];
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
                {items.map((entry, index) =>
                  renderFlatEntry(
                    entry,
                    layout,
                    bucket === "today"
                      ? projectTodayNudge(entry, index, items.length)
                      : undefined,
                  ),
                )}
              </ul>
            </section>
          );
        })}
      </div>
    );
  }

  function renderOwnerFilter(opts?: { compact?: boolean }) {
    if (scope === "personal") return null;

    return (
      <div className={opts?.compact ? undefined : "mt-2 w-full"}>
        <FilterMultiSelect
          title="Users"
          options={ownerFilterOptions.map((m) => ({
            id: m.id,
            label:
              m.id === currentUserId ? `${m.name} (you)` : m.name,
          }))}
          selectedIds={selectedOwnerIds}
          onToggle={(id) => {
            setOwnerFilterIds((prev) => {
              const base =
                prev === null
                  ? currentUserId
                    ? [currentUserId]
                    : []
                  : prev;
              return base.includes(id)
                ? base.filter((x) => x !== id)
                : [...base, id];
            });
          }}
          onSelectAll={() =>
            setOwnerFilterIds(ownerFilterOptions.map((m) => m.id))
          }
          onClear={() => setOwnerFilterIds([])}
          allLabel="All users"
          noneLabel="No users"
          manyLabel={(n) => `${n} users`}
          compact={opts?.compact}
        />
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
    if (scope === "personal") return null;

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

  return (
    <>
      <aside className="flex w-full shrink-0 flex-col lg:h-full lg:w-72 xl:w-80">
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
              <button
                type="button"
                onClick={() => setFullscreen(true)}
                title="Open full screen"
                className="inline-flex shrink-0 items-center gap-1 rounded-md border border-line px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted transition hover:border-teal-accent hover:text-teal-accent"
              >
                <FullscreenIcon />
                Full screen
              </button>
            </div>
            <div className="mt-2">{renderScopeToggle()}</div>
            {renderOwnerFilter()}
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
                {scope === "project" && (
                  <div className="w-44 sm:w-52">
                    {renderOwnerFilter({ compact: true })}
                  </div>
                )}
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
