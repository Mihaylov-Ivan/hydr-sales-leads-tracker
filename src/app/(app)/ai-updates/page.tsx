"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useProjects } from "@/lib/store";
import { useAuth } from "@/lib/auth-context";
import { type Stage, stagesForTrack, trackOfProject } from "@/lib/types";

type Status = "pending" | "needs-clarification" | "applied" | "rejected";
type Operation =
  | "add_project_comment"
  | "update_project_fields"
  | "create_project_task"
  | "add_project_contact"
  | "update_project_contact"
  | "change_project_stage"
  | "clarification";
type Filter = "actionable" | "applied" | "rejected";

type Suggestion = {
  id: string;
  project_id: string;
  source_label: string | null;
  source_excerpt: string | null;
  operation: Operation;
  title: string;
  rationale: string | null;
  confidence: "high" | "medium" | "low";
  payload: Record<string, unknown>;
  existing_value: unknown;
  proposed_value: unknown;
  status: Status;
  created_at: string;
};

function obj(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function str(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function pretty(value: unknown): string {
  if (value == null) return "—";
  if (typeof value === "string") return value || "—";
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function dateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const OP_LABEL: Record<Operation, string> = {
  add_project_comment: "Project update",
  update_project_fields: "Project fields",
  create_project_task: "New task",
  add_project_contact: "New contact",
  update_project_contact: "Contact update",
  change_project_stage: "Stage change",
  clarification: "Clarification",
};

const STATUS_LABEL: Record<Status, string> = {
  pending: "Pending approval",
  "needs-clarification": "Needs clarification",
  applied: "Approved & applied",
  rejected: "Rejected",
};

function statusCls(status: Status): string {
  if (status === "applied") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "rejected") return "border-rose-200 bg-rose-50 text-rose-700";
  if (status === "needs-clarification") return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-sky-200 bg-sky-50 text-sky-700";
}

export default function AiUpdatesPage() {
  const {
    projects,
    ready,
    updateProject,
    addComment,
    addTodo,
    addContact,
    updateContact,
    regenerateSummary,
  } = useProjects();
  const { canWrite } = useAuth();

  const [filter, setFilter] = useState<Filter>("actionable");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [workingId, setWorkingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const projectMap = useMemo(
    () => new Map(projects.map((project) => [project.id, project])),
    [projects],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setMessage(null);
    try {
      const response = await fetch(
        "/api/ai/suggestions?status=" + encodeURIComponent(filter) + "&limit=100",
        { credentials: "include" },
      );
      const body = (await response.json().catch(() => null)) as
        | { suggestions?: Suggestion[]; error?: string }
        | null;
      if (!response.ok) {
        throw new Error(body?.error || "Could not load AI suggestions.");
      }
      setSuggestions(body?.suggestions ?? []);
    } catch (error) {
      setSuggestions([]);
      setMessage(error instanceof Error ? error.message : "Could not load AI suggestions.");
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    void load();
  }, [load]);

  async function mark(suggestion: Suggestion, status: "applied" | "rejected") {
    const response = await fetch("/api/ai/suggestions", {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: suggestion.id, status, review_note: null }),
    });
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    if (!response.ok) throw new Error(body?.error || "Could not update the suggestion.");
  }

  async function approve(suggestion: Suggestion) {
    if (!canWrite) {
      setMessage("This account cannot apply CRM changes.");
      return;
    }
    if (suggestion.operation === "clarification") {
      setMessage("This item needs clarification before it can be approved.");
      return;
    }

    const project = projectMap.get(suggestion.project_id);
    if (!project) {
      setMessage("The linked project is not available in the current CRM view.");
      return;
    }

    setWorkingId(suggestion.id);
    setMessage(null);
    try {
      const payload = obj(suggestion.payload);

      if (suggestion.operation === "add_project_comment") {
        const text = str(payload.text);
        if (!text) throw new Error("The proposed project update is empty.");
        if (!(await addComment(project.id, text))) {
          throw new Error("Could not save the project update.");
        }
      } else if (suggestion.operation === "create_project_task") {
        const text = str(payload.text);
        if (!text) throw new Error("The proposed task is empty.");
        if (!(await addTodo(
          project.id,
          "our-action",
          text,
          str(payload.due_date),
          str(payload.owner_user_id),
          str(payload.start_date),
          str(payload.end_date),
        ))) {
          throw new Error("Could not save the project task.");
        }
      } else if (suggestion.operation === "add_project_contact") {
        const contact: { name?: string; email?: string; phone?: string; position?: string } = {};
        const name = str(payload.name);
        const email = str(payload.email);
        const phone = str(payload.phone);
        const position = str(payload.position);
        if (name) contact.name = name;
        if (email) contact.email = email;
        if (phone) contact.phone = phone;
        if (position) contact.position = position;
        if (Object.keys(contact).length === 0) throw new Error("The proposed contact is empty.");
        addContact(project.id, contact);
      } else if (suggestion.operation === "update_project_contact") {
        const contactId = str(payload.contact_id);
        if (!contactId) throw new Error("The proposed contact update has no contact id.");
        if (!project.contacts.some((contact) => contact.id === contactId)) {
          throw new Error("The contact no longer exists on this project.");
        }
        const patch: { name?: string; email?: string; phone?: string; position?: string } = {};
        if (typeof payload.name === "string") patch.name = payload.name.trim();
        if (typeof payload.email === "string") patch.email = payload.email.trim();
        if (typeof payload.phone === "string") patch.phone = payload.phone.trim();
        if (typeof payload.position === "string") patch.position = payload.position.trim();
        if (Object.keys(patch).length === 0) throw new Error("The proposed contact update is empty.");
        updateContact(project.id, contactId, patch);
      } else if (suggestion.operation === "change_project_stage") {
        const stage = str(payload.stage) as Stage | undefined;
        if (!stage || !stagesForTrack(trackOfProject(project)).includes(stage)) {
          throw new Error("The proposed stage is not valid for this project.");
        }
        updateProject(project.id, { stage });
      } else if (suggestion.operation === "update_project_fields") {
        const fields = obj(payload.fields);
        const patch: Parameters<typeof updateProject>[1] = {};
        if (typeof fields.name === "string" && fields.name.trim()) patch.name = fields.name.trim();
        if (typeof fields.client === "string" && fields.client.trim()) patch.client = fields.client.trim();
        if (typeof fields.country === "string" && fields.country.trim()) patch.country = fields.country.trim();
        if (typeof fields.city === "string") patch.city = fields.city.trim();
        if (typeof fields.series === "string" && fields.series.trim()) patch.series = fields.series.trim();
        if (typeof fields.market === "string" && fields.market.trim()) patch.market = fields.market.trim();
        if (typeof fields.size_kw === "number" && Number.isFinite(fields.size_kw) && fields.size_kw >= 0) {
          patch.sizeKw = fields.size_kw;
        }
        if (typeof fields.description === "string") patch.baseDescription = fields.description.trim();
        if (typeof fields.lead_user_id === "string" && fields.lead_user_id.trim()) {
          patch.leadUserId = fields.lead_user_id.trim();
        }
        if (Object.keys(patch).length === 0) throw new Error("The proposed project-field update is empty.");
        updateProject(project.id, patch);
      } else {
        throw new Error("Unsupported suggestion type.");
      }

      await mark(suggestion, "applied");
      if (suggestion.operation !== "add_project_comment") {
        await regenerateSummary(project.id);
      }
      setSuggestions((current) => current.filter((item) => item.id !== suggestion.id));
      setMessage("Approved and applied: " + suggestion.title);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not apply the suggestion.");
    } finally {
      setWorkingId(null);
    }
  }

  async function reject(suggestion: Suggestion) {
    setWorkingId(suggestion.id);
    setMessage(null);
    try {
      await mark(suggestion, "rejected");
      setSuggestions((current) => current.filter((item) => item.id !== suggestion.id));
      setMessage("Rejected: " + suggestion.title);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not reject the suggestion.");
    } finally {
      setWorkingId(null);
    }
  }

  return (
    <div className="space-y-5 pb-10">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-deep">AI Suggested Updates</h1>
          <p className="mt-1 max-w-3xl text-sm text-muted">
            Review AI-generated CRM proposals before they change project data.
            This page works independently from the disabled Hydr AI chat and voice feature.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="rounded-lg border border-line bg-panel px-3 py-2 text-xs font-semibold text-deep shadow-sm transition hover:border-teal-accent/40 hover:text-teal-accent disabled:opacity-50"
        >
          Refresh
        </button>
      </header>

      <div className="flex flex-wrap gap-2">
        {([["actionable", "Needs review"], ["applied", "Applied"], ["rejected", "Rejected"]] as const).map(
          ([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setFilter(value)}
              className={
                "rounded-lg px-3 py-2 text-xs font-semibold transition " +
                (filter === value
                  ? "bg-teal-accent text-white"
                  : "border border-line bg-panel text-muted hover:text-deep")
              }
            >
              {label}
            </button>
          ),
        )}
      </div>

      {message && (
        <div className="rounded-lg border border-line bg-panel px-4 py-3 text-sm text-deep">{message}</div>
      )}

      {!ready || loading ? (
        <div className="rounded-xl border border-line bg-panel p-6 text-sm text-muted">
          Loading AI suggestions…
        </div>
      ) : suggestions.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line bg-panel p-8 text-center">
          <p className="text-sm font-semibold text-deep">
            No {filter === "actionable" ? "suggestions waiting for review" : filter} suggestions.
          </p>
          <p className="mt-1 text-xs text-muted">
            New AI proposals will appear here automatically when they are added to the queue.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {suggestions.map((suggestion) => {
            const project = projectMap.get(suggestion.project_id);
            const busy = workingId === suggestion.id;
            const clarification =
              suggestion.status === "needs-clarification" || suggestion.operation === "clarification";
            const question = str(obj(suggestion.payload).question);

            return (
              <article key={suggestion.id} className="overflow-hidden rounded-xl border border-line bg-panel shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-4 py-4 sm:px-5">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-md border border-line bg-surface px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-muted">
                        {OP_LABEL[suggestion.operation]}
                      </span>
                      <span className={"rounded-md border px-2 py-1 text-[10px] font-bold uppercase tracking-wide " + statusCls(suggestion.status)}>
                        {STATUS_LABEL[suggestion.status]}
                      </span>
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-muted">
                        {suggestion.confidence} confidence
                      </span>
                    </div>
                    <h2 className="mt-2 text-base font-semibold text-deep">{suggestion.title}</h2>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                      {project ? (
                        <Link href={"/projects/" + project.id} className="font-semibold text-teal-accent hover:underline">
                          {project.name}
                        </Link>
                      ) : (
                        <span>Project {suggestion.project_id}</span>
                      )}
                      <span>{dateTime(suggestion.created_at)}</span>
                    </div>
                  </div>

                  {filter === "actionable" && (
                    <div className="flex shrink-0 gap-2">
                      {!clarification && (
                        <button
                          type="button"
                          disabled={busy || !canWrite}
                          onClick={() => void approve(suggestion)}
                          className="rounded-lg bg-teal-accent px-3 py-2 text-xs font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {busy ? "Applying…" : "Approve"}
                        </button>
                      )}
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void reject(suggestion)}
                        className="rounded-lg border border-line bg-surface px-3 py-2 text-xs font-semibold text-muted transition hover:border-rose-300 hover:text-rose-700 disabled:opacity-50"
                      >
                        Reject
                      </button>
                    </div>
                  )}
                </div>

                <div className="grid gap-4 px-4 py-4 sm:px-5 lg:grid-cols-2">
                  <section className="rounded-lg border border-line bg-surface p-3">
                    <h3 className="text-[10px] font-bold uppercase tracking-wide text-muted">Current CRM</h3>
                    <pre className="mt-2 whitespace-pre-wrap break-words font-sans text-xs leading-5 text-deep">
                      {pretty(suggestion.existing_value)}
                    </pre>
                  </section>
                  <section className="rounded-lg border border-teal-accent/20 bg-teal-soft/30 p-3">
                    <h3 className="text-[10px] font-bold uppercase tracking-wide text-teal-accent">Proposed update</h3>
                    <pre className="mt-2 whitespace-pre-wrap break-words font-sans text-xs leading-5 text-deep">
                      {pretty(suggestion.proposed_value ?? suggestion.payload)}
                    </pre>
                  </section>
                </div>

                {(suggestion.rationale || question) && (
                  <div className="border-t border-line px-4 py-3 sm:px-5">
                    {suggestion.rationale && (
                      <p className="text-xs leading-5 text-muted">
                        <span className="font-semibold text-deep">Why AI suggested it: </span>
                        {suggestion.rationale}
                      </p>
                    )}
                    {question && (
                      <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
                        Clarification needed: {question}
                      </div>
                    )}
                  </div>
                )}

                {(suggestion.source_label || suggestion.source_excerpt) && (
                  <details className="border-t border-line px-4 py-3 sm:px-5">
                    <summary className="cursor-pointer text-xs font-semibold text-muted hover:text-deep">Source context</summary>
                    <div className="mt-2 space-y-1 text-xs leading-5 text-muted">
                      {suggestion.source_label && (
                        <p><span className="font-semibold text-deep">Source: </span>{suggestion.source_label}</p>
                      )}
                      {suggestion.source_excerpt && (
                        <p className="whitespace-pre-wrap">{suggestion.source_excerpt}</p>
                      )}
                    </div>
                  </details>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
