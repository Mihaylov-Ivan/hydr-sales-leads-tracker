"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useProjects } from "@/lib/store";
import {
  Project,
  ProjectTodo,
  TodoKind,
  TODO_KIND_LABELS,
  isEmailReminderDue,
} from "@/lib/types";

const KIND_SHORT: Record<TodoKind, string> = {
  question: "Q",
  "our-action": "Us",
  "client-action": "Client",
};

const KIND_TONE: Record<TodoKind, string> = {
  question: "bg-teal-soft text-teal-accent",
  "our-action": "bg-olive/15 text-olive-ink",
  "client-action": "bg-amber-accent/15 text-amber-accent",
};

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
}: {
  projectId: string;
  todo: ProjectTodo;
  ownerName: string;
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
          <div className="flex flex-wrap items-center gap-1.5">
            <span
              className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${KIND_TONE[todo.kind]}`}
            >
              {KIND_SHORT[todo.kind]}
            </span>
            <span className="sr-only">{TODO_KIND_LABELS[todo.kind]}</span>
          </div>
          <p className="mt-1 text-xs leading-snug text-ink">{todo.text}</p>
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

type Group = {
  project: Project;
  todos: ProjectTodo[];
  emailDue: boolean;
};

export default function OutstandingSidebar() {
  const { projects, ready, markClientContacted, teamMembers } = useProjects();

  const groups = useMemo(() => {
    const list: Group[] = [];
    for (const project of projects) {
      const todos = project.todos
        .filter((t) => !t.done)
        .sort((a, b) => {
          const order: Record<TodoKind, number> = {
            question: 0,
            "our-action": 1,
            "client-action": 2,
          };
          return order[a.kind] - order[b.kind];
        });
      const emailDue = isEmailReminderDue(project);
      if (todos.length === 0 && !emailDue) continue;
      list.push({ project, todos, emailDue });
    }
    list.sort((a, b) => a.project.name.localeCompare(b.project.name));
    return list;
  }, [projects]);

  const totalOpen =
    groups.reduce((n, g) => n + g.todos.length, 0) +
    groups.filter((g) => g.emailDue).length;

  if (!ready) return null;

  return (
    <aside className="w-full shrink-0 lg:sticky lg:top-[4.5rem] lg:w-72 lg:self-start xl:w-80">
      <div className="flex max-h-none flex-col overflow-hidden rounded-xl border border-line bg-panel shadow-sm lg:max-h-[calc(100vh-6rem)]">
        <header className="flex shrink-0 items-center justify-between border-b border-line px-4 py-3">
          <div>
            <h2 className="text-sm font-bold uppercase tracking-wide text-deep">
              Outstanding
            </h2>
            <p className="mt-0.5 text-[11px] text-muted">
              Open questions &amp; actions
            </p>
          </div>
          <span className="rounded-full bg-teal-soft px-2.5 py-0.5 text-xs font-semibold text-teal-accent">
            {totalOpen}
          </span>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3">
          {groups.length === 0 ? (
            <p className="rounded-lg border border-dashed border-line px-3 py-8 text-center text-xs text-muted">
              Nothing outstanding. Nice work.
            </p>
          ) : (
            <div className="flex flex-col gap-4">
              {groups.map(({ project, todos, emailDue }) => (
                <section key={project.id}>
                  <Link
                    href={`/projects/${project.id}`}
                    className="mb-2 block truncate text-sm font-semibold text-deep transition hover:text-teal-accent hover:underline"
                  >
                    {project.name}
                  </Link>
                  <ul className="flex flex-col gap-2">
                    {emailDue && (
                      <li className="rounded-lg border border-amber-accent/40 bg-amber-accent/5 p-2.5">
                        <div className="flex items-start gap-2">
                          <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center text-amber-accent">
                            <svg
                              viewBox="0 0 16 16"
                              className="h-3.5 w-3.5 fill-current"
                            >
                              <path d="M1.5 3.5A1.5 1.5 0 0 1 3 2h10a1.5 1.5 0 0 1 1.5 1.5v9A1.5 1.5 0 0 1 13 14H3a1.5 1.5 0 0 1-1.5-1.5v-9Zm1.5-.5a.5.5 0 0 0-.5.5v.25l5.25 3.15a.5.5 0 0 0 .5 0L13.5 3.75V3.5a.5.5 0 0 0-.5-.5H3Zm10.5 2.1-4.9 2.94a1.5 1.5 0 0 1-1.5 0L2.2 5.1v7.4a.5.5 0 0 0 .5.5h10a.5.5 0 0 0 .5-.5V5.1Z" />
                            </svg>
                          </span>
                          <div className="min-w-0 flex-1">
                            <span className="rounded bg-amber-accent/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-accent">
                              Contact
                            </span>
                            <p className="mt-1 text-xs text-ink">
                              Follow up with {project.client}
                            </p>
                            <button
                              type="button"
                              onClick={() => markClientContacted(project.id)}
                              className="mt-1.5 text-[11px] font-semibold text-teal-accent hover:underline"
                            >
                              Contacted
                            </button>
                          </div>
                        </div>
                      </li>
                    )}
                    {todos.map((todo) => (
                      <OutstandingItem
                        key={todo.id}
                        projectId={project.id}
                        todo={todo}
                        ownerName={
                          teamMembers.find((m) => m.id === todo.ownerUserId)?.name ??
                          "Unassigned"
                        }
                      />
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
