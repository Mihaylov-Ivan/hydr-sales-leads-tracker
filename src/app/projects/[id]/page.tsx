"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useProjects } from "@/lib/store";
import { Market, MARKETS, Series, Stage, STAGE_LABELS, STAGES } from "@/lib/types";
import { generateSummary } from "@/lib/summary";
import StageBadge from "@/components/StageBadge";
import TodoList from "@/components/TodoList";
import ContactList from "@/components/ContactList";
import FinancialsPanel from "@/components/FinancialsPanel";

/** Renders AI bullet-point summaries as a list; falls back to a paragraph. */
function SummaryText({ text }: { text: string }) {
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const isBulleted =
    lines.length > 1 && lines.every((l) => /^[-•*]\s?/.test(l));

  if (!isBulleted) return <p>{text}</p>;
  return (
    <ul className="list-disc space-y-1 pl-4">
      {lines.map((l, i) => (
        <li key={i}>{l.replace(/^[-•*]\s?/, "")}</li>
      ))}
    </ul>
  );
}

/** Click-to-edit text/number field. Commits on Enter or blur, cancels on Escape. */
function EditableText({
  value,
  onSave,
  type = "text",
  suffix,
  className = "",
}: {
  value: string;
  onSave: (next: string) => void;
  type?: "text" | "number";
  suffix?: string;
  className?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  useEffect(() => setDraft(value), [value]);

  function commit() {
    setEditing(false);
    const next = draft.trim();
    if (next && next !== value) onSave(next);
    else setDraft(value);
  }

  if (!editing) {
    return (
      <button
        onClick={() => setEditing(true)}
        title="Click to edit"
        className={`-mx-1 cursor-text rounded px-1 text-left transition hover:bg-teal-soft ${className}`}
      >
        {value}
        {suffix}
      </button>
    );
  }
  return (
    <input
      autoFocus
      type={type}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") commit();
        if (e.key === "Escape") {
          setDraft(value);
          setEditing(false);
        }
      }}
      className={`-mx-1 w-full rounded border border-teal-accent bg-surface px-1 outline-none ${className}`}
    />
  );
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Scrollable region that hands the wheel back to the page at its edges. */
function ChainScroll({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const onWheel = (e: WheelEvent) => {
      const maxScroll = el.scrollHeight - el.clientHeight;
      const atTop = el.scrollTop <= 0;
      const atBottom = el.scrollTop >= maxScroll - 1;
      const scrollingUp = e.deltaY < 0;
      const scrollingDown = e.deltaY > 0;

      // No overflow, or already at the edge in that direction → scroll the page
      if (
        maxScroll <= 1 ||
        (scrollingUp && atTop) ||
        (scrollingDown && atBottom)
      ) {
        e.preventDefault();
        window.scrollBy({ top: e.deltaY });
      }
    };

    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}

export default function ProjectPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const {
    projects,
    ready,
    aiEnabled,
    summarizing,
    addComment,
    updateProject,
    updateComment,
    deleteComment,
    regenerateSummary,
    deleteProject,
  } = useProjects();
  const [text, setText] = useState("");
  const [stageChange, setStageChange] = useState<Stage | "">("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [commentDraft, setCommentDraft] = useState("");
  const [deletingCommentId, setDeletingCommentId] = useState<string | null>(null);

  const project = useMemo(() => projects.find((p) => p.id === id), [projects, id]);

  if (!ready) {
    return <p className="py-20 text-center text-muted">Loading…</p>;
  }
  if (!project) {
    return (
      <div className="py-20 text-center">
        <p className="text-muted">Project not found.</p>
        <Link href="/" className="mt-4 inline-block text-teal-accent hover:underline">
          ← Back to projects
        </Link>
      </div>
    );
  }

  const summary = project.aiSummary ?? generateSummary(project);
  const isSummarizing = Boolean(summarizing[project.id]);
  const timeline = [...project.comments].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    addComment(project!.id, text.trim(), stageChange || undefined);
    setText("");
    setStageChange("");
  }

  function saveComment(commentId: string) {
    const next = commentDraft.trim();
    if (next) updateComment(project!.id, commentId, next);
    setEditingCommentId(null);
  }

  function handleDelete() {
    deleteProject(project!.id);
    router.push("/");
  }

  return (
    <div className="flex flex-col gap-6">
      <Link href="/" className="text-sm text-muted hover:text-teal-accent">
        ← All projects
      </Link>

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-deep">{project.name}</h1>
          <p className="mt-1 text-sm text-muted">
            {project.client} · {project.city}, {project.country}
          </p>
        </div>
        {/* Clickable stage badge: opens a native dropdown */}
        <div className="relative" title="Click to change stage">
          <StageBadge stage={project.stage} />
          <select
            value={project.stage}
            onChange={(e) => updateProject(project.id, { stage: e.target.value as Stage })}
            className="absolute inset-0 cursor-pointer opacity-0"
            aria-label="Change project stage"
          >
            {STAGES.map((s) => (
              <option key={s} value={s}>
                {STAGE_LABELS[s]}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Key facts (click a value to edit) */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <div className="rounded-xl border border-line bg-panel px-4 py-3 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">
            System
          </p>
          <select
            value={project.series}
            onChange={(e) =>
              updateProject(project.id, { series: e.target.value as Series })
            }
            title="Click to change system type"
            className="-mx-1 mt-1 w-full cursor-pointer rounded bg-transparent px-1 text-sm font-medium text-deep outline-none transition hover:bg-teal-soft"
          >
            <option>Z Series</option>
            <option>E Series</option>
            <option>Custom</option>
          </select>
        </div>

        <div className="rounded-xl border border-line bg-panel px-4 py-3 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">
            Market
          </p>
          <select
            value={project.market}
            onChange={(e) =>
              updateProject(project.id, { market: e.target.value as Market })
            }
            title="Click to change market"
            className="-mx-1 mt-1 w-full cursor-pointer rounded bg-transparent px-1 text-sm font-medium text-deep outline-none transition hover:bg-teal-soft"
          >
            {MARKETS.map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
        </div>

        <div className="rounded-xl border border-line bg-panel px-4 py-3 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">
            Size
          </p>
          <div className="mt-1 text-sm font-medium text-deep">
            <EditableText
              type="number"
              value={String(project.sizeKw)}
              suffix=" kW"
              onSave={(v) => {
                const kw = Number(v);
                if (kw > 0) updateProject(project.id, { sizeKw: kw });
              }}
            />
          </div>
        </div>

        <div className="rounded-xl border border-line bg-panel px-4 py-3 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">
            Location
          </p>
          <div className="mt-1 flex items-center gap-1 text-sm font-medium text-deep">
            <EditableText
              value={project.city}
              onSave={(v) => updateProject(project.id, { city: v })}
            />
            <span className="text-muted">,</span>
            <EditableText
              value={project.country}
              onSave={(v) => updateProject(project.id, { country: v })}
            />
          </div>
        </div>

        <div className="rounded-xl border border-line bg-panel px-4 py-3 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">
            Created
          </p>
          <p className="mt-1 text-sm font-medium text-deep">
            {new Date(project.createdAt).toLocaleDateString("en-GB")}
          </p>
        </div>
      </div>

      {/* Living summary */}
      <section className="rounded-xl border border-teal-accent/30 bg-teal-soft/50 p-5">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <h2 className="text-sm font-bold uppercase tracking-wide text-teal-accent">
            Project Summary
          </h2>
          <span className="rounded-full bg-teal-accent/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-teal-accent/90">
            {isSummarizing
              ? "AI is updating…"
              : project.aiSummary
                ? "AI-generated from comments"
                : aiEnabled
                  ? "auto-updated from comments"
                  : "rule-based · add OPENAI_API_KEY for AI"}
          </span>
          {aiEnabled && (
            <button
              onClick={() => regenerateSummary(project.id)}
              disabled={isSummarizing}
              className="ml-auto rounded-lg border border-teal-accent/40 px-3 py-1 text-xs font-semibold text-teal-accent transition hover:bg-teal-accent/10 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSummarizing ? "Generating…" : "Regenerate"}
            </button>
          )}
        </div>
        <div
          className={`text-sm leading-relaxed text-ink transition-opacity ${isSummarizing ? "opacity-50" : ""}`}
        >
          <SummaryText text={summary} />
        </div>
      </section>

      {/* Questions and action items */}
      <TodoList
        projectId={project.id}
        kind="question"
        todos={project.todos.filter((t) => t.kind === "question")}
      />
      <TodoList
        projectId={project.id}
        kind="our-action"
        todos={project.todos.filter((t) => t.kind === "our-action")}
      />
      <TodoList
        projectId={project.id}
        kind="client-action"
        todos={project.todos.filter((t) => t.kind === "client-action")}
      />

      {/* New comment */}
      <section className="rounded-xl border border-line bg-panel p-5 shadow-sm">
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-deep">
          Post an Update
        </h2>
        <form onSubmit={submit} className="flex flex-col gap-3">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="What happened? Site visit, call, offer sent, contract signed…"
            className="min-h-24 w-full resize-y rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-muted/60 outline-none focus:border-teal-accent"
          />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <label className="flex items-center gap-2 text-sm text-muted">
              Move stage:
              <select
                value={stageChange}
                onChange={(e) => setStageChange(e.target.value as Stage | "")}
                className="rounded-lg border border-line bg-surface px-3 py-1.5 text-sm text-ink outline-none focus:border-teal-accent"
              >
                <option value="">Keep current ({STAGE_LABELS[project.stage]})</option>
                {STAGES.filter((s) => s !== project.stage).map((s) => (
                  <option key={s} value={s}>
                    → {STAGE_LABELS[s]}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="submit"
              disabled={!text.trim()}
              className="rounded-lg bg-olive px-5 py-2 text-sm font-bold uppercase tracking-wide text-olive-ink transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Post Update
            </button>
          </div>
        </form>
      </section>

      {/* Timeline */}
      <section>
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-deep">
          Activity ({timeline.length})
        </h2>
        {timeline.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line py-10 text-center text-sm text-muted">
            No updates yet. Post the first one above.
          </p>
        ) : (
          <ChainScroll className="max-h-[28rem] overflow-y-auto pr-1">
            <ol className="relative flex flex-col gap-4 border-l-2 border-line pl-5">
              {timeline.map((c) => (
                <li key={c.id} className="relative">
                  <span className="absolute -left-[27px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-surface bg-teal-accent" />
                  <div className="group rounded-xl border border-line bg-panel p-4 shadow-sm">
                    <div className="mb-1.5 flex flex-wrap items-center gap-2 text-xs text-muted">
                      <span className="font-semibold text-deep">{c.author}</span>
                      <span>{formatDateTime(c.createdAt)}</span>
                      {c.stageChange && <StageBadge stage={c.stageChange} />}
                      <span className="ml-auto flex items-center gap-2 opacity-0 transition group-hover:opacity-100">
                        {deletingCommentId === c.id ? (
                          <>
                            <span className="text-red-500">Delete?</span>
                            <button
                              onClick={() => {
                                deleteComment(project.id, c.id);
                                setDeletingCommentId(null);
                              }}
                              className="font-semibold text-red-500 hover:underline"
                            >
                              Yes
                            </button>
                            <button
                              onClick={() => setDeletingCommentId(null)}
                              className="hover:text-ink"
                            >
                              No
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              onClick={() => {
                                setEditingCommentId(c.id);
                                setCommentDraft(c.text);
                                setDeletingCommentId(null);
                              }}
                              className="font-semibold text-teal-accent hover:underline"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => {
                                setDeletingCommentId(c.id);
                                setEditingCommentId(null);
                              }}
                              className="hover:text-red-500"
                            >
                              Delete
                            </button>
                          </>
                        )}
                      </span>
                    </div>
                    {editingCommentId === c.id ? (
                      <div className="flex flex-col gap-2">
                        <textarea
                          autoFocus
                          value={commentDraft}
                          onChange={(e) => setCommentDraft(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Escape") setEditingCommentId(null);
                          }}
                          className="min-h-20 w-full resize-y rounded-lg border border-teal-accent bg-surface px-3 py-2 text-sm text-ink outline-none"
                        />
                        <div className="flex justify-end gap-2 text-xs">
                          <button
                            onClick={() => setEditingCommentId(null)}
                            className="rounded px-3 py-1.5 text-muted hover:text-ink"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={() => saveComment(c.id)}
                            disabled={!commentDraft.trim()}
                            className="rounded-lg bg-olive px-3 py-1.5 font-bold uppercase tracking-wide text-olive-ink hover:brightness-105 disabled:opacity-40"
                          >
                            Save
                          </button>
                        </div>
                      </div>
                    ) : (
                      <p
                        onClick={() => {
                          setEditingCommentId(c.id);
                          setCommentDraft(c.text);
                          setDeletingCommentId(null);
                        }}
                        title="Click to edit"
                        className="-mx-1 cursor-text whitespace-pre-wrap rounded px-1 text-sm leading-relaxed text-ink transition hover:bg-teal-soft/60"
                      >
                        {c.text}
                      </p>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          </ChainScroll>
        )}
      </section>

      {/* Contacts */}
      <ContactList projectId={project.id} contacts={project.contacts} />

      {/* Financials & timeline */}
      <FinancialsPanel
        projectId={project.id}
        financials={project.financials}
      />

      {/* Danger zone */}
      <div className="flex justify-end border-t border-line pt-4">
        {confirmDelete ? (
          <div className="flex items-center gap-3 text-sm">
            <span className="text-muted">Delete this project permanently?</span>
            <button
              onClick={handleDelete}
              className="rounded-lg border border-red-300 bg-red-50 px-3 py-1.5 font-medium text-red-600 hover:bg-red-100"
            >
              Yes, delete
            </button>
            <button
              onClick={() => setConfirmDelete(false)}
              className="text-muted hover:text-ink"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            onClick={() => setConfirmDelete(true)}
            className="text-xs text-muted/70 hover:text-red-500"
          >
            Delete project
          </button>
        )}
      </div>
    </div>
  );
}
