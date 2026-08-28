"use client";

import { useRef, useState } from "react";
import { useProjects } from "@/lib/store";
import {
  PersonalTodo,
  addDays,
  todayDate,
} from "@/lib/types";

export const PERSONAL_TODO_DRAG_TYPE = "application/x-hydr-personal-todo-id";

function formatDue(date: string): string {
  return new Date(date + "T00:00:00").toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function DeadlineBadge({ date }: { date: string }) {
  const today = todayDate();
  const overdue = date < today;
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

export default function PersonalTodoCard({ todo }: { todo: PersonalTodo }) {
  const {
    teamMembers,
    updatePersonalTodo,
    deletePersonalTodo,
    addPersonalTodoComment,
    updatePersonalTodoComment,
    deletePersonalTodoComment,
  } = useProjects();
  const [expanded, setExpanded] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(todo.title);
  const [editingDescription, setEditingDescription] = useState(false);
  const [descriptionDraft, setDescriptionDraft] = useState(
    todo.description ?? "",
  );
  const [showComments, setShowComments] = useState(false);
  const [commentDraft, setCommentDraft] = useState("");
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editCommentDraft, setEditCommentDraft] = useState("");
  const suppressClick = useRef(false);

  function commitTitle() {
    setEditingTitle(false);
    const next = titleDraft.trim();
    if (next && next !== todo.title) updatePersonalTodo(todo.id, { title: next });
    else setTitleDraft(todo.title);
  }

  function commitDescription() {
    setEditingDescription(false);
    const next = descriptionDraft.trim();
    const prev = todo.description ?? "";
    if (next !== prev) {
      updatePersonalTodo(todo.id, { description: next || null });
    } else {
      setDescriptionDraft(todo.description ?? "");
    }
  }

  function submitComment(e: React.FormEvent) {
    e.preventDefault();
    const t = commentDraft.trim();
    if (!t) return;
    addPersonalTodoComment(todo.id, t);
    setCommentDraft("");
  }

  function startEditComment(commentId: string, text: string) {
    setEditingCommentId(commentId);
    setEditCommentDraft(text);
  }

  function commitEditComment() {
    if (!editingCommentId) return;
    const next = editCommentDraft.trim();
    if (next) updatePersonalTodoComment(todo.id, editingCommentId, next);
    setEditingCommentId(null);
    setEditCommentDraft("");
  }

  function cancelEditComment() {
    setEditingCommentId(null);
    setEditCommentDraft("");
  }

  function toggleExpanded() {
    if (suppressClick.current) return;
    setExpanded((v) => {
      if (v) {
        setEditingTitle(false);
        setEditingDescription(false);
        setShowComments(false);
        setEditingCommentId(null);
      }
      return !v;
    });
  }

  return (
    <article
      draggable
      onDragStart={(e) => {
        suppressClick.current = true;
        e.dataTransfer.setData(PERSONAL_TODO_DRAG_TYPE, todo.id);
        e.dataTransfer.setData("text/plain", todo.id);
        e.dataTransfer.effectAllowed = "move";
        if (e.currentTarget instanceof HTMLElement) {
          e.currentTarget.style.opacity = "0.45";
        }
      }}
      onDragEnd={(e) => {
        if (e.currentTarget instanceof HTMLElement) {
          e.currentTarget.style.opacity = "";
        }
        window.setTimeout(() => {
          suppressClick.current = false;
        }, 0);
      }}
      className={`group flex shrink-0 cursor-grab flex-col rounded-xl border border-line bg-panel shadow-sm transition hover:-translate-y-0.5 hover:border-teal-accent/50 hover:shadow-md active:cursor-grabbing ${
        expanded ? "gap-3 px-4 pb-5 pt-4" : "gap-0 px-4 py-3"
      }`}
    >
      <div className="flex items-start gap-2">
        <button
          type="button"
          onClick={toggleExpanded}
          aria-expanded={expanded}
          aria-label={expanded ? "Collapse task" : "Expand task"}
          title={expanded ? "Collapse" : "Expand"}
          className="mt-0.5 shrink-0 rounded p-0.5 text-muted transition hover:text-teal-accent"
        >
          <svg
            viewBox="0 0 12 12"
            className={`h-3 w-3 fill-current transition-transform ${
              expanded ? "rotate-90" : ""
            }`}
            aria-hidden
          >
            <path d="M4.2 2.1 8.1 6l-3.9 3.9-.9-.9L6.3 6 3.3 3l.9-.9Z" />
          </svg>
        </button>

        {expanded && editingTitle ? (
          <input
            autoFocus
            value={titleDraft}
            onChange={(e) => setTitleDraft(e.target.value)}
            onBlur={commitTitle}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitTitle();
              if (e.key === "Escape") {
                setTitleDraft(todo.title);
                setEditingTitle(false);
              }
            }}
            className="min-w-0 flex-1 rounded-md border border-teal-accent bg-surface px-2 py-1 text-sm font-semibold text-deep outline-none"
          />
        ) : (
          <button
            type="button"
            onClick={() => {
              if (suppressClick.current) return;
              if (!expanded) {
                setExpanded(true);
                return;
              }
              setTitleDraft(todo.title);
              setEditingTitle(true);
            }}
            title={expanded ? "Click to edit title" : "Click to expand"}
            className="min-w-0 flex-1 cursor-pointer rounded-md px-1 py-0.5 text-left text-sm font-semibold text-deep transition hover:text-teal-accent"
          >
            {todo.title}
          </button>
        )}

        {expanded && (
          <button
            type="button"
            onClick={() => {
              if (
                window.confirm(`Delete “${todo.title}”? This cannot be undone.`)
              ) {
                deletePersonalTodo(todo.id);
              }
            }}
            aria-label="Delete task"
            title="Delete"
            className="shrink-0 rounded-md p-1.5 text-muted/50 opacity-0 transition hover:text-red-500 group-hover:opacity-100"
          >
            <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 fill-current">
              <path d="M6.5 1a1 1 0 0 0-1 1H3a.75.75 0 0 0 0 1.5h10A.75.75 0 0 0 13 2h-2.5a1 1 0 0 0-1-1h-3ZM4 5h8l-.6 8.4A1.75 1.75 0 0 1 9.66 15H6.34a1.75 1.75 0 0 1-1.74-1.6L4 5Z" />
            </svg>
          </button>
        )}
      </div>

      {expanded && (
        <>
          {editingDescription ? (
            <textarea
              autoFocus
              value={descriptionDraft}
              onChange={(e) => setDescriptionDraft(e.target.value)}
              onBlur={commitDescription}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  setDescriptionDraft(todo.description ?? "");
                  setEditingDescription(false);
                }
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  commitDescription();
                }
              }}
              rows={3}
              placeholder="Add a description…"
              className="w-full resize-y rounded-md border border-teal-accent bg-surface px-2 py-1.5 text-xs leading-relaxed text-ink outline-none"
            />
          ) : todo.description ? (
            <button
              type="button"
              onClick={() => {
                if (suppressClick.current) return;
                setDescriptionDraft(todo.description ?? "");
                setEditingDescription(true);
              }}
              title="Click to edit description"
              className="w-full cursor-text whitespace-pre-wrap rounded-md px-1 py-0.5 text-left text-xs leading-relaxed text-muted transition hover:bg-teal-soft/40 hover:text-ink"
            >
              {todo.description}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                if (suppressClick.current) return;
                setDescriptionDraft("");
                setEditingDescription(true);
              }}
              className="w-full rounded-md px-1 py-0.5 text-left text-xs italic text-muted/70 transition hover:text-teal-accent"
            >
              + description
            </button>
          )}

          <div className="flex min-w-0 flex-wrap items-center gap-2">
            {todo.dueDate ? (
              <DeadlineBadge date={todo.dueDate} />
            ) : (
              <label className="inline-flex max-w-full items-center gap-1 rounded-full bg-surface px-2.5 py-1 text-[10px] font-semibold text-muted">
                <span className="sr-only">Deadline</span>
                <input
                  type="date"
                  value=""
                  onChange={(e) =>
                    updatePersonalTodo(todo.id, {
                      dueDate: e.target.value || null,
                    })
                  }
                  className="max-w-full border-0 bg-transparent p-0 text-[10px] font-semibold text-muted outline-none"
                  title="Set deadline"
                />
              </label>
            )}
            {todo.dueDate && (
              <input
                type="date"
                value={todo.dueDate}
                onChange={(e) =>
                  updatePersonalTodo(todo.id, {
                    dueDate: e.target.value || null,
                  })
                }
                title="Change deadline"
                className="max-w-full rounded-md border border-line bg-surface px-2 py-1 text-[10px] text-ink outline-none focus:border-teal-accent"
              />
            )}
          </div>

          <div className="flex min-w-0 flex-wrap items-center gap-2 text-[10px] text-muted">
            <span className="shrink-0 font-semibold uppercase tracking-wide">
              Window
            </span>
            <input
              type="date"
              value={todo.startDate ?? ""}
              onChange={(e) =>
                updatePersonalTodo(todo.id, {
                  startDate: e.target.value || null,
                })
              }
              title="Start date"
              className="min-w-0 max-w-full flex-1 rounded-md border border-line bg-surface px-2 py-1 text-[10px] text-ink outline-none focus:border-teal-accent"
            />
            <span className="shrink-0" aria-hidden>
              →
            </span>
            <input
              type="date"
              value={todo.endDate ?? ""}
              onChange={(e) =>
                updatePersonalTodo(todo.id, {
                  endDate: e.target.value || null,
                })
              }
              title="End date"
              className="min-w-0 max-w-full flex-1 rounded-md border border-line bg-surface px-2 py-1 text-[10px] text-ink outline-none focus:border-teal-accent"
            />
          </div>

          <button
            type="button"
            onClick={() => setShowComments((v) => !v)}
            className="flex w-full min-w-0 items-center justify-between rounded-lg border border-line/80 bg-surface/60 px-2.5 py-2 text-[11px] font-semibold text-muted transition hover:border-teal-accent/40 hover:text-teal-accent"
          >
            <span>
              Comments
              {todo.comments.length > 0 ? ` (${todo.comments.length})` : ""}
            </span>
            <span aria-hidden>{showComments ? "▴" : "▾"}</span>
          </button>

          {showComments && (
            <div className="flex min-w-0 flex-col gap-2 rounded-lg border border-line/70 bg-surface/50 px-3 pb-5 pt-3">
              {todo.comments.length === 0 ? (
                <p className="text-[11px] text-muted">No comments yet.</p>
              ) : (
                <ul className="flex flex-col gap-1.5">
                  {todo.comments.map((c) => {
                    const author =
                      teamMembers.find((m) => m.id === c.authorUserId)?.name ??
                      "You";
                    const isEditing = editingCommentId === c.id;
                    return (
                      <li
                        key={c.id}
                        className="group/comment rounded-md bg-panel px-2.5 py-2"
                      >
                        {isEditing ? (
                          <div className="flex flex-col gap-1.5">
                            <input
                              autoFocus
                              value={editCommentDraft}
                              onChange={(e) =>
                                setEditCommentDraft(e.target.value)
                              }
                              onKeyDown={(e) => {
                                if (e.key === "Enter") commitEditComment();
                                if (e.key === "Escape") cancelEditComment();
                              }}
                              className="w-full rounded-md border border-teal-accent bg-surface px-2 py-1.5 text-xs text-ink outline-none"
                            />
                            <div className="flex justify-end gap-1.5">
                              <button
                                type="button"
                                onClick={cancelEditComment}
                                className="rounded-md px-2 py-1 text-[10px] font-semibold text-muted transition hover:text-deep"
                              >
                                Cancel
                              </button>
                              <button
                                type="button"
                                onClick={commitEditComment}
                                disabled={!editCommentDraft.trim()}
                                className="rounded-md bg-teal-accent px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-white disabled:opacity-40"
                              >
                                Save
                              </button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <div className="flex items-start justify-between gap-2">
                              <button
                                type="button"
                                onClick={() => startEditComment(c.id, c.text)}
                                title="Click to edit"
                                className="min-w-0 flex-1 cursor-text rounded px-0.5 text-left text-xs text-ink transition hover:bg-teal-soft/40"
                              >
                                {c.text}
                              </button>
                              <div className="flex shrink-0 items-center gap-0.5">
                                <button
                                  type="button"
                                  onClick={() =>
                                    startEditComment(c.id, c.text)
                                  }
                                  className="rounded px-1.5 py-0.5 text-[10px] font-semibold text-teal-accent transition hover:bg-teal-soft"
                                  title="Edit comment"
                                >
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    deletePersonalTodoComment(todo.id, c.id)
                                  }
                                  className="rounded px-1.5 py-0.5 text-[10px] font-semibold text-red-500 transition hover:bg-red-50"
                                  title="Delete comment"
                                >
                                  Delete
                                </button>
                              </div>
                            </div>
                            <p className="mt-1 text-[10px] text-muted">
                              {author} ·{" "}
                              {new Date(c.createdAt).toLocaleString(undefined, {
                                day: "numeric",
                                month: "short",
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </p>
                          </>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
              <form onSubmit={submitComment} className="mb-1 flex gap-1.5 pb-1">
                <input
                  value={commentDraft}
                  onChange={(e) => setCommentDraft(e.target.value)}
                  placeholder="Add a comment…"
                  className="min-w-0 flex-1 rounded-md border border-line bg-panel px-2 py-1.5 text-xs text-ink outline-none focus:border-teal-accent"
                />
                <button
                  type="submit"
                  disabled={!commentDraft.trim()}
                  className="shrink-0 rounded-md bg-teal-accent px-2 py-1.5 text-[10px] font-bold uppercase tracking-wide text-white disabled:opacity-40"
                >
                  Add
                </button>
              </form>
            </div>
          )}
        </>
      )}
    </article>
  );
}
