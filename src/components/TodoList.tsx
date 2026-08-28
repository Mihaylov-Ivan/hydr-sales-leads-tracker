"use client";

import { useState } from "react";
import { useProjects } from "@/lib/store";
import {
  ProjectTodo,
  TeamMember,
  TodoKind,
  TODO_KIND_LABELS,
  addDays,
  partitionOpenProjectTodos,
  todayDate,
} from "@/lib/types";

function Checkbox({ done }: { done: boolean }) {
  return (
    <span
      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 transition ${
        done
          ? "border-teal-accent bg-teal-accent"
          : "border-line bg-surface group-hover/item:border-teal-accent/60"
      }`}
    >
      <svg
        viewBox="0 0 12 12"
        className={`h-3 w-3 transition ${done ? "opacity-100" : "opacity-0"}`}
      >
        <path
          d="M2 6.5 4.5 9 10 3.5"
          fill="none"
          stroke="white"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

function formatDue(date: string): string {
  return new Date(date + "T00:00:00").toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function DueDate({
  todo,
  onChange,
}: {
  todo: ProjectTodo;
  onChange: (dueDate: string | null) => void;
}) {
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <input
        autoFocus
        type="date"
        value={todo.dueDate ?? ""}
        onChange={(e) => {
          onChange(e.target.value || null);
          setEditing(false);
        }}
        onBlur={() => setEditing(false)}
        onKeyDown={(e) => {
          if (e.key === "Escape") setEditing(false);
        }}
        className="rounded border border-teal-accent bg-surface px-1.5 py-0.5 text-xs text-ink outline-none"
      />
    );
  }
  if (todo.dueDate) {
    const today = todayDate();
    const overdue = !todo.done && todo.dueDate < today;
    const dueToday = !todo.done && todo.dueDate === today;
    const dueTomorrow = !todo.done && todo.dueDate === addDays(today, 1);
    const tone =
      overdue || dueToday
        ? "bg-red-100 text-red-600 hover:bg-red-200"
        : dueTomorrow
          ? "bg-amber-accent/15 text-amber-accent hover:bg-amber-accent/25"
          : "bg-teal-soft text-teal-accent hover:bg-teal-accent/20";
    const label = overdue
      ? "Overdue · "
      : dueToday
        ? "Due today · "
        : dueTomorrow
          ? "Due tomorrow · "
          : "Complete by ";
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        title="Click to change the deadline"
        className={`shrink-0 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold transition ${tone}`}
      >
        {label}
        {formatDue(todo.dueDate)}
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      title="Set a deadline"
      className="shrink-0 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold text-muted/70 opacity-0 transition hover:bg-teal-soft hover:text-teal-accent group-hover/item:opacity-100"
    >
      + deadline
    </button>
  );
}

function WorkWindow({
  todo,
  onPatch,
  className = "",
}: {
  todo: ProjectTodo;
  onPatch: (patch: {
    startDate?: string | null;
    endDate?: string | null;
  }) => void;
  className?: string;
}) {
  return (
    <div
      className={`flex min-w-0 flex-wrap items-center gap-2 text-[10px] text-muted ${className}`}
    >
      <span className="shrink-0 font-semibold uppercase tracking-wide">
        Window
      </span>
      <input
        type="date"
        value={todo.startDate ?? ""}
        onChange={(e) =>
          onPatch({ startDate: e.target.value || null })
        }
        title="Start working on"
        aria-label="Start working on"
        className="min-w-0 max-w-full flex-1 rounded-md border border-line bg-surface px-2 py-1 text-[10px] text-ink outline-none focus:border-teal-accent"
      />
      <span className="shrink-0" aria-hidden>
        →
      </span>
      <input
        type="date"
        value={todo.endDate ?? ""}
        onChange={(e) =>
          onPatch({ endDate: e.target.value || null })
        }
        title="Aim to finish by"
        aria-label="Aim to finish by"
        className="min-w-0 max-w-full flex-1 rounded-md border border-line bg-surface px-2 py-1 text-[10px] text-ink outline-none focus:border-teal-accent"
      />
    </div>
  );
}

function Answer({
  todo,
  onSave,
}: {
  todo: ProjectTodo;
  onSave: (answer: string | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(todo.answer ?? "");

  function commit() {
    setEditing(false);
    const next = draft.trim();
    if (next !== (todo.answer ?? "")) onSave(next || null);
    else setDraft(todo.answer ?? "");
  }

  if (editing) {
    return (
      <textarea
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setDraft(todo.answer ?? "");
            setEditing(false);
          }
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            commit();
          }
        }}
        rows={2}
        placeholder="Write the answer…"
        className="w-full resize-y rounded border border-teal-accent bg-surface px-1.5 py-1 text-sm leading-relaxed text-ink outline-none"
      />
    );
  }
  if (todo.answer) {
    return (
      <button
        type="button"
        onClick={() => {
          setDraft(todo.answer ?? "");
          setEditing(true);
        }}
        title="Click to edit the answer"
        className="w-full cursor-text whitespace-pre-wrap rounded px-0.5 text-left text-sm leading-relaxed text-ink transition hover:bg-teal-soft/60"
      >
        <span className="font-semibold text-teal-accent">A: </span>
        {todo.answer}
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={() => {
        setDraft("");
        setEditing(true);
      }}
      className="rounded px-0.5 text-left text-sm italic text-muted/70 transition hover:text-teal-accent"
    >
      Add answer…
    </button>
  );
}

function TodoItem({
  todo,
  teamMembers,
  showAnswer,
  highlight = false,
  onToggle,
  onPatch,
  onDelete,
}: {
  todo: ProjectTodo;
  teamMembers: TeamMember[];
  showAnswer: boolean;
  highlight?: boolean;
  onToggle: () => void;
  onPatch: (patch: {
    text?: string;
    answer?: string | null;
    dueDate?: string | null;
    startDate?: string | null;
    endDate?: string | null;
    ownerUserId?: string | null;
  }) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(todo.text);

  function commit() {
    setEditing(false);
    const next = draft.trim();
    if (next && next !== todo.text) onPatch({ text: next });
    else setDraft(todo.text);
  }

  return (
    <li
      className={`group/item rounded-lg px-2 py-1.5 transition hover:bg-teal-soft/50 ${
        highlight ? "border border-teal-accent/35 bg-teal-soft/35" : ""
      }`}
    >
      <div className="flex items-start gap-3">
        <button
          type="button"
          onClick={onToggle}
          aria-label={todo.done ? "Mark as not done" : "Mark as done"}
          className="mt-0.5 cursor-pointer"
        >
          <Checkbox done={todo.done} />
        </button>

        {editing ? (
          <textarea
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setDraft(todo.text);
                setEditing(false);
              }
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                commit();
              }
            }}
            rows={3}
            className="min-w-0 flex-1 resize-y rounded border border-teal-accent bg-surface px-1.5 py-1 text-sm leading-relaxed text-ink outline-none"
          />
        ) : (
          <button
            type="button"
            onClick={() => setEditing(true)}
            title="Click to edit"
            className={`min-w-0 flex-1 cursor-text whitespace-pre-wrap rounded px-0.5 text-left text-sm leading-relaxed transition ${
              todo.done ? "text-muted line-through decoration-muted/60" : "text-ink"
            }`}
          >
            {todo.text}
          </button>
        )}

        <DueDate todo={todo} onChange={(dueDate) => onPatch({ dueDate })} />
        <select
          value={todo.ownerUserId ?? ""}
          onChange={(e) => onPatch({ ownerUserId: e.target.value || null })}
          title="Responsible person"
          aria-label="Responsible person"
          className="mt-0.5 shrink-0 rounded border border-line bg-surface px-1.5 py-1 text-xs text-ink outline-none focus:border-teal-accent"
        >
          <option value="">Unassigned</option>
          {teamMembers.map((member) => (
            <option key={member.id} value={member.id}>
              {member.name}
            </option>
          ))}
        </select>

        <button
          type="button"
          onClick={onDelete}
          aria-label="Delete item"
          title="Delete"
          className="mt-0.5 rounded p-1 text-muted/60 opacity-0 transition hover:text-red-500 group-hover/item:opacity-100"
        >
          <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 fill-current">
            <path d="M6.5 1a1 1 0 0 0-1 1H3a.75.75 0 0 0 0 1.5h10A.75.75 0 0 0 13 2h-2.5a1 1 0 0 0-1-1h-3ZM4 5h8l-.6 8.4A1.75 1.75 0 0 1 9.66 15H6.34a1.75 1.75 0 0 1-1.74-1.6L4 5Z" />
          </svg>
        </button>
      </div>

      <WorkWindow
        todo={todo}
        onPatch={onPatch}
        className="mt-1 pl-8 pr-8"
      />

      {showAnswer && (
        <div className="mt-1 pl-8 pr-8">
          <Answer todo={todo} onSave={(answer) => onPatch({ answer })} />
        </div>
      )}
    </li>
  );
}

const PLACEHOLDERS: Record<TodoKind, string> = {
  question: "Add an open question… e.g. What pressure does the offtaker need?",
  "our-action": "Add an action for us… e.g. Send revised offer",
  "client-action": "Add an action for the client… e.g. Share site electrical drawings",
};

export default function TodoList({
  projectId,
  kind,
  todos,
}: {
  projectId: string;
  kind: TodoKind;
  todos: ProjectTodo[];
}) {
  const { addTodo, toggleTodo, updateTodo, deleteTodo, teamMembers } = useProjects();
  const [text, setText] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [ownerUserId, setOwnerUserId] = useState("");

  const { active, upcoming, rest, done } = partitionOpenProjectTodos(todos);
  const doneCount = done.length;
  const progress = todos.length ? Math.round((doneCount / todos.length) * 100) : 0;

  function renderTodoItem(t: ProjectTodo, highlight = false) {
    return (
      <TodoItem
        key={t.id}
        todo={t}
        teamMembers={teamMembers}
        showAnswer={kind === "question"}
        highlight={highlight}
        onToggle={() => toggleTodo(projectId, t.id)}
        onPatch={(patch) => updateTodo(projectId, t.id, patch)}
        onDelete={() => deleteTodo(projectId, t.id)}
      />
    );
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const t = text.trim();
    if (!t) return;
    addTodo(
      projectId,
      kind,
      t,
      dueDate || undefined,
      ownerUserId || undefined,
      startDate || undefined,
      endDate || undefined,
    );
    setText("");
    setDueDate("");
    setStartDate("");
    setEndDate("");
    setOwnerUserId("");
  }

  return (
    <section className="rounded-xl border border-line bg-panel p-5 shadow-sm">
      <div className="mb-3 flex items-center gap-3">
        <h2 className="text-sm font-bold uppercase tracking-wide text-deep">
          {TODO_KIND_LABELS[kind]}
        </h2>
        {todos.length > 0 && (
          <>
            <span className="text-xs font-semibold text-muted">
              {doneCount}/{todos.length} done
            </span>
            <div className="h-1.5 max-w-32 flex-1 overflow-hidden rounded-full bg-line/60">
              <div
                className="h-full rounded-full bg-teal-accent transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          </>
        )}
      </div>

      <form onSubmit={submit} className="mb-2 flex flex-wrap gap-2">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              (e.currentTarget.form as HTMLFormElement | null)?.requestSubmit();
            }
          }}
          rows={2}
          placeholder={PLACEHOLDERS[kind]}
          className="w-full resize-y rounded-lg border border-line bg-surface px-3 py-2 text-sm leading-relaxed text-ink placeholder:text-muted/60 outline-none focus:border-teal-accent"
        />
        <input
          type="date"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
          title="Deadline (optional)"
          aria-label="Deadline (optional)"
          className="shrink-0 rounded-lg border border-line bg-surface px-2 py-2 text-sm text-ink outline-none focus:border-teal-accent"
        />
        <input
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          title="Start working on (optional)"
          aria-label="Start working on (optional)"
          className="shrink-0 rounded-lg border border-line bg-surface px-2 py-2 text-sm text-ink outline-none focus:border-teal-accent"
        />
        <input
          type="date"
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
          title="Aim to finish by (optional)"
          aria-label="Aim to finish by (optional)"
          className="shrink-0 rounded-lg border border-line bg-surface px-2 py-2 text-sm text-ink outline-none focus:border-teal-accent"
        />
        <select
          value={ownerUserId}
          onChange={(e) => setOwnerUserId(e.target.value)}
          title="Responsible person"
          aria-label="Responsible person"
          className="shrink-0 rounded-lg border border-line bg-surface px-2 py-2 text-sm text-ink outline-none focus:border-teal-accent"
        >
          <option value="">Unassigned</option>
          {teamMembers.map((member) => (
            <option key={member.id} value={member.id}>
              {member.name}
            </option>
          ))}
        </select>
        <button
          type="submit"
          disabled={!text.trim()}
          className="shrink-0 rounded-lg bg-olive px-4 py-2 text-sm font-bold text-olive-ink transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Add
        </button>
      </form>

      {todos.length === 0 ? (
        <p className="px-2 py-3 text-sm text-muted/80">
          {kind === "question"
            ? "No open questions. Add one so it doesn't get forgotten."
            : "Nothing here yet. Add the next step so it doesn't slip."}
        </p>
      ) : (
        <ul className="flex flex-col">
          {active.length > 0 && (
            <>
              <li
                className="px-2 pt-1 text-[10px] font-bold uppercase tracking-wide text-teal-accent"
                aria-hidden
              >
                Working on now · {active.length}
              </li>
              {active.map((t) => renderTodoItem(t, true))}
            </>
          )}
          {upcoming.length > 0 && (
            <>
              <li
                className={`px-2 text-[10px] font-bold uppercase tracking-wide text-muted ${
                  active.length > 0 ? "mt-3" : "pt-1"
                }`}
                aria-hidden
              >
                Coming up next · {upcoming.length}
              </li>
              {upcoming.map((t) => renderTodoItem(t))}
            </>
          )}
          {rest.length > 0 && (active.length > 0 || upcoming.length > 0) && (
            <li
              className="mx-2 my-2 px-2 text-[10px] font-bold uppercase tracking-wide text-muted"
              aria-hidden
            >
              Other open · {rest.length}
            </li>
          )}
          {rest.map((t) => renderTodoItem(t))}
          {(active.length > 0 || upcoming.length > 0 || rest.length > 0) &&
            done.length > 0 && (
              <li
                className="mx-2 my-1.5 border-t border-dashed border-line"
                aria-hidden
              />
            )}
          {done.map((t) => renderTodoItem(t))}
        </ul>
      )}
    </section>
  );
}
