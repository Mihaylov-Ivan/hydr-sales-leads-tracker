"use client";

import { useEffect, useState } from "react";
import { useProjects } from "@/lib/store";
import { PersonalTodoStatus, PERSONAL_TODO_STATUS_LABELS } from "@/lib/types";

const inputCls =
  "w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-teal-accent";

export default function NewPersonalTodoDialog({
  onClose,
}: {
  onClose: () => void;
}) {
  const { addPersonalTodo, teamMembers } = useProjects();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<PersonalTodoStatus>("todo");
  const [dueDate, setDueDate] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [ownerUserId, setOwnerUserId] = useState("");

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const t = title.trim();
    if (!t) return;
    addPersonalTodo({
      title: t,
      ...(description.trim() ? { description: description.trim() } : {}),
      status,
      ...(dueDate ? { dueDate } : {}),
      ...(startDate ? { startDate } : {}),
      ...(endDate ? { endDate } : {}),
      ...(ownerUserId ? { ownerUserId } : {}),
    });
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-deep/40 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="New personal task"
        className="w-full max-w-md rounded-xl border border-line bg-panel p-5 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-bold text-deep">New personal task</h2>
        <p className="mt-1 text-sm text-muted">
          Standalone to-dos — not tied to a sales project.
        </p>
        <form onSubmit={submit} className="mt-4 flex flex-col gap-3">
          <label className="block">
            <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-muted">
              Title
            </span>
            <input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Book flights for Expo"
              className={inputCls}
              required
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-muted">
              Description
            </span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional details…"
              rows={3}
              className={`${inputCls} resize-y`}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-muted">
              Status
            </span>
            <select
              value={status}
              onChange={(e) =>
                setStatus(e.target.value as PersonalTodoStatus)
              }
              className={inputCls}
            >
              {(
                Object.keys(PERSONAL_TODO_STATUS_LABELS) as PersonalTodoStatus[]
              ).map((s) => (
                <option key={s} value={s}>
                  {PERSONAL_TODO_STATUS_LABELS[s]}
                </option>
              ))}
            </select>
          </label>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-muted">
                Deadline
              </span>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className={inputCls}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-muted">
                Responsible
              </span>
              <select
                value={ownerUserId}
                onChange={(e) => setOwnerUserId(e.target.value)}
                className={inputCls}
              >
                <option value="">Unassigned</option>
                {teamMembers.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-muted">
                Window start
              </span>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className={inputCls}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-muted">
                Window end
              </span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className={inputCls}
              />
            </label>
          </div>
          <div className="mt-2 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-line px-4 py-2 text-sm font-semibold text-muted transition hover:text-deep"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!title.trim()}
              className="rounded-lg bg-olive px-4 py-2 text-sm font-bold uppercase tracking-wide text-olive-ink transition hover:brightness-105 disabled:opacity-40"
            >
              Add task
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
