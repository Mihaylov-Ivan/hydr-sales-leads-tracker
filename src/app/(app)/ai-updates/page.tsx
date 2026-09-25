"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useProjects } from "@/lib/store";
import { useAuth } from "@/lib/auth-context";
import { assignableTeamMembers } from "@/lib/permissions";
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
  source_type: string;
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

type Draft = {
  projectId: string;
  text: string;
  dueDate: string;
  ownerUserId: string;
};

function obj(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function str(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
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

function draftFor(suggestion: Suggestion): Draft {
  const payload = obj(suggestion.payload);
  return {
    projectId: suggestion.project_id,
    text:
      str(payload.text) ??
      str(payload.question) ??
      "",
    dueDate: str(payload.due_date) ?? "",
    ownerUserId: str(payload.owner_user_id) ?? "",
  };
}

function operationLabel(operation: Operation): string {
  const labels: Record<Operation, string> = {
    add_project_comment: "Project update",
    update_project_fields: "Project fields",
    create_project_task: "New task",
    add_project_contact: "New contact",
    update_project_contact: "Contact update",
    change_project_stage: "Stage change",
    clarification: "Clarification",
  };
  return labels[operation];
}

function statusLabel(status: Status): string {
  const labels: Record<Status, string> = {
    pending: "Pending approval",
    "needs-clarification": "Needs clarification",
    applied: "Approved & applied",
    rejected: "Rejected",
  };
  return labels[status];
}

function statusCls(status: Status): string {
  if (status === "applied") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "rejected") return "border-rose-200 bg-rose-50 text-rose-700";
  if (status === "needs-clarification") return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-sky-200 bg-sky-50 text-sky-700";
}

function sourceTypeLabel(sourceType: string): string {
  if (sourceType === "manual-email") return "Email";
  if (sourceType === "meeting") return "Meeting";
  if (sourceType === "document") return "Document";
  return sourceType.replace(/[-_]/g, " ") || "AI source";
}

function fieldLabel(key: string): string {
  const labels: Record<string, string> = {
    name: "Project name",
    client: "Client",
    country: "Country",
    city: "City",
    series: "Series",
    market: "Market",
    size_kw: "System size",
    description: "Description",
    lead_user_id: "Project lead",
  };
  return labels[key] ?? key.replace(/_/g, " ");
}

function displayValue(value: unknown): string {
  if (value == null || value === "") return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") return String(value);
  return String(value);
}

function staticProposalLines(suggestion: Suggestion): Array<{ label: string; value: string }> {
  const payload = obj(suggestion.payload);

  if (suggestion.operation === "add_project_contact") {
    return [
      { label: "Name", value: displayValue(payload.name) },
      { label: "Email", value: displayValue(payload.email) },
      { label: "Phone", value: displayValue(payload.phone) },
      { label: "Position", value: displayValue(payload.position) },
    ].filter((item) => item.value !== "—");
  }

  if (suggestion.operation === "update_project_contact") {
    return [
      { label: "Name", value: displayValue(payload.name) },
      { label: "Email", value: displayValue(payload.email) },
      { label: "Phone", value: displayValue(payload.phone) },
      { label: "Position", value: displayValue(payload.position) },
    ].filter((item) => item.value !== "—");
  }

  if (suggestion.operation === "change_project_stage") {
    return [{ label: "New stage", value: displayValue(payload.stage) }];
  }

  if (suggestion.operation === "update_project_fields") {
    const fields = obj(payload.fields);
    return Object.entries(fields).map(([key, value]) => ({
      label: fieldLabel(key),
      value: displayValue(value),
    }));
  }

  return [];
}

export default function AiUpdatesPage() {
  const {
    projects,
    teamMembers,
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
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [loading, setLoading] = useState(true);
  const [workingId, setWorkingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const projectMap = useMemo(
    () => new Map(projects.map((project) => [project.id, project])),
    [projects],
  );

  const sortedProjects = useMemo(
    () => [...projects].sort((a, b) => a.name.localeCompare(b.name)),
    [projects],
  );

  const assignees = useMemo(
    () => assignableTeamMembers(teamMembers).sort((a, b) => a.name.localeCompare(b.name)),
    [teamMembers],
  );

  const groupedSuggestions = useMemo(() => {
    const groups = new Map<string, Suggestion[]>();
    for (const suggestion of suggestions) {
      const key =
        sourceTypeLabel(suggestion.source_type) +
        "||" +
        (suggestion.source_label?.trim() || "Unlabelled source");
      const current = groups.get(key) ?? [];
      current.push(suggestion);
      groups.set(key, current);
    }
    return [...groups.entries()].map(([key, items]) => {
      const [type, label] = key.split("||");
      return { key, type, label, items };
    });
  }, [suggestions]);

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
      const next = body?.suggestions ?? [];
      setSuggestions(next);
      setDrafts(
        Object.fromEntries(next.map((suggestion) => [suggestion.id, draftFor(suggestion)])),
      );
    } catch (error) {
      setSuggestions([]);
      setDrafts({});
      setMessage(error instanceof Error ? error.message : "Could not load AI suggestions.");
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    void load();
  }, [load]);

  function updateDraft(id: string, patch: Partial<Draft>) {
    setDrafts((current) => ({
      ...current,
      [id]: { ...current[id], ...patch },
    }));
  }

  function buildEditedPayload(suggestion: Suggestion, draft: Draft): Record<string, unknown> {
    const payload = { ...obj(suggestion.payload) };
    if (
      suggestion.operation === "add_project_comment" ||
      suggestion.operation === "create_project_task"
    ) {
      payload.text = draft.text.trim();
    }
    if (suggestion.operation === "create_project_task") {
      payload.due_date = draft.dueDate || null;
      payload.owner_user_id = draft.ownerUserId || null;
    }
    return payload;
  }

  function hasDraftChanges(suggestion: Suggestion): boolean {
    const draft = drafts[suggestion.id] ?? draftFor(suggestion);
    const original = draftFor(suggestion);
    return (
      draft.projectId !== original.projectId ||
      draft.text !== original.text ||
      draft.dueDate !== original.dueDate ||
      draft.ownerUserId !== original.ownerUserId
    );
  }

  async function saveEdits(suggestion: Suggestion): Promise<Suggestion> {
    const draft = drafts[suggestion.id] ?? draftFor(suggestion);
    const payload = buildEditedPayload(suggestion, draft);

    const response = await fetch("/api/ai/suggestions", {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: suggestion.id,
        project_id: draft.projectId,
        payload,
        proposed_value: payload,
      }),
    });
    const body = (await response.json().catch(() => null)) as
      | { suggestion?: Suggestion; error?: string }
      | null;
    if (!response.ok || !body?.suggestion) {
      throw new Error(body?.error || "Could not save the edited suggestion.");
    }

    const saved = body.suggestion;
    setSuggestions((current) =>
      current.map((item) => (item.id === saved.id ? saved : item)),
    );
    setDrafts((current) => ({ ...current, [saved.id]: draftFor(saved) }));
    return saved;
  }

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

    setWorkingId(suggestion.id);
    setMessage(null);

    try {
      const effective = hasDraftChanges(suggestion)
        ? await saveEdits(suggestion)
        : suggestion;
      const project = projectMap.get(effective.project_id);
      if (!project) {
        throw new Error("The selected project is not available in the current CRM view.");
      }

      const payload = obj(effective.payload);

      if (effective.operation === "add_project_comment") {
        const text = str(payload.text);
        if (!text) throw new Error("The proposed project update is empty.");
        if (!(await addComment(project.id, text))) {
          throw new Error("Could not save the project update.");
        }
      } else if (effective.operation === "create_project_task") {
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
      } else if (effective.operation === "add_project_contact") {
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
      } else if (effective.operation === "update_project_contact") {
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
      } else if (effective.operation === "change_project_stage") {
        const stage = str(payload.stage) as Stage | undefined;
        if (!stage || !stagesForTrack(trackOfProject(project)).includes(stage)) {
          throw new Error("The proposed stage is not valid for this project.");
        }
        updateProject(project.id, { stage });
      } else if (effective.operation === "update_project_fields") {
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

      await mark(effective, "applied");
      if (effective.operation !== "add_project_comment") {
        await regenerateSummary(project.id);
      }
      setSuggestions((current) => current.filter((item) => item.id !== effective.id));
      setMessage("Approved and applied: " + effective.title);
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
            Review, correct and approve AI-generated CRM proposals before they change project data.
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
        </div>
      ) : (
        <div className="space-y-6">
          {groupedSuggestions.map((group) => {
            const excerpts = [...new Set(group.items.map((item) => item.source_excerpt).filter(Boolean))] as string[];
            return (
              <section key={group.key} className="space-y-3">
                <div className="rounded-xl border border-line bg-surface px-4 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wide text-muted">{group.type}</p>
                      <h2 className="mt-0.5 text-sm font-semibold text-deep">{group.label}</h2>
                    </div>
                    <span className="rounded-md border border-line bg-panel px-2 py-1 text-[10px] font-semibold text-muted">
                      {group.items.length} update{group.items.length === 1 ? "" : "s"}
                    </span>
                  </div>
                  {excerpts.length > 0 && (
                    <details className="mt-2">
                      <summary className="cursor-pointer text-xs font-semibold text-muted hover:text-deep">
                        Source context
                      </summary>
                      <div className="mt-2 space-y-2 text-xs leading-5 text-muted">
                        {excerpts.map((excerpt, index) => (
                          <p key={index} className="whitespace-pre-wrap">{excerpt}</p>
                        ))}
                      </div>
                    </details>
                  )}
                </div>

                {group.items.map((suggestion) => {
                  const project = projectMap.get(suggestion.project_id);
                  const draft = drafts[suggestion.id] ?? draftFor(suggestion);
                  const busy = workingId === suggestion.id;
                  const clarification =
                    suggestion.status === "needs-clarification" || suggestion.operation === "clarification";
                  const isTask = suggestion.operation === "create_project_task";
                  const isTextUpdate = suggestion.operation === "add_project_comment";
                  const staticLines = staticProposalLines(suggestion);
                  const editable = filter === "actionable" && !clarification;

                  return (
                    <article key={suggestion.id} className="overflow-hidden rounded-xl border border-line bg-panel shadow-sm">
                      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-4 py-4 sm:px-5">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="rounded-md border border-line bg-surface px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-muted">
                              {operationLabel(suggestion.operation)}
                            </span>
                            <span className={"rounded-md border px-2 py-1 text-[10px] font-bold uppercase tracking-wide " + statusCls(suggestion.status)}>
                              {statusLabel(suggestion.status)}
                            </span>
                            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted">
                              {suggestion.confidence} confidence
                            </span>
                          </div>
                          <h3 className="mt-2 text-base font-semibold text-deep">{suggestion.title}</h3>
                          <p className="mt-1 text-xs text-muted">{dateTime(suggestion.created_at)}</p>
                        </div>

                        {filter === "actionable" && (
                          <div className="flex shrink-0 flex-wrap gap-2">
                            {hasDraftChanges(suggestion) && (
                              <button
                                type="button"
                                disabled={busy}
                                onClick={async () => {
                                  setWorkingId(suggestion.id);
                                  setMessage(null);
                                  try {
                                    await saveEdits(suggestion);
                                    setMessage("Saved edits: " + suggestion.title);
                                  } catch (error) {
                                    setMessage(error instanceof Error ? error.message : "Could not save edits.");
                                  } finally {
                                    setWorkingId(null);
                                  }
                                }}
                                className="rounded-lg border border-teal-accent/40 bg-surface px-3 py-2 text-xs font-semibold text-teal-accent transition hover:bg-teal-soft/30 disabled:opacity-50"
                              >
                                Save changes
                              </button>
                            )}
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

                      <div className="space-y-4 px-4 py-4 sm:px-5">
                        <div>
                          <label className="text-[10px] font-bold uppercase tracking-wide text-muted">Project</label>
                          {editable ? (
                            <select
                              value={draft.projectId}
                              onChange={(event) => updateDraft(suggestion.id, { projectId: event.target.value })}
                              className="mt-1 w-full max-w-xl rounded-lg border border-line bg-surface px-3 py-2 text-sm text-deep outline-none focus:border-teal-accent"
                            >
                              {sortedProjects.map((item) => (
                                <option key={item.id} value={item.id}>{item.name}</option>
                              ))}
                            </select>
                          ) : project ? (
                            <div className="mt-1">
                              <Link href={"/projects/" + project.id} className="text-sm font-semibold text-teal-accent hover:underline">
                                {project.name}
                              </Link>
                            </div>
                          ) : (
                            <p className="mt-1 text-sm text-muted">{suggestion.project_id}</p>
                          )}
                        </div>

                        {(isTextUpdate || isTask) && (
                          <div>
                            <label className="text-[10px] font-bold uppercase tracking-wide text-muted">
                              {isTask ? "Task" : "Suggested update"}
                            </label>
                            {editable ? (
                              <textarea
                                value={draft.text}
                                onChange={(event) => updateDraft(suggestion.id, { text: event.target.value })}
                                rows={isTask ? 4 : 5}
                                className="mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm leading-6 text-deep outline-none focus:border-teal-accent"
                              />
                            ) : (
                              <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-deep">
                                {draft.text || "—"}
                              </p>
                            )}
                          </div>
                        )}

                        {isTask && (
                          <div className="grid gap-3 sm:grid-cols-2">
                            <div>
                              <label className="text-[10px] font-bold uppercase tracking-wide text-muted">Deadline</label>
                              {editable ? (
                                <input
                                  type="date"
                                  value={draft.dueDate}
                                  onChange={(event) => updateDraft(suggestion.id, { dueDate: event.target.value })}
                                  className="mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-deep outline-none focus:border-teal-accent"
                                />
                              ) : (
                                <p className="mt-1 text-sm text-deep">{draft.dueDate || "No deadline"}</p>
                              )}
                            </div>
                            <div>
                              <label className="text-[10px] font-bold uppercase tracking-wide text-muted">Assigned to</label>
                              {editable ? (
                                <select
                                  value={draft.ownerUserId}
                                  onChange={(event) => updateDraft(suggestion.id, { ownerUserId: event.target.value })}
                                  className="mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-deep outline-none focus:border-teal-accent"
                                >
                                  <option value="">Unassigned</option>
                                  {assignees.map((member) => (
                                    <option key={member.id} value={member.id}>{member.name}</option>
                                  ))}
                                </select>
                              ) : (
                                <p className="mt-1 text-sm text-deep">
                                  {assignees.find((member) => member.id === draft.ownerUserId)?.name || "Unassigned"}
                                </p>
                              )}
                            </div>
                          </div>
                        )}

                        {clarification && (
                          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-800">
                            <span className="font-semibold">Clarification needed: </span>
                            {draft.text || "More information is required before this can be approved."}
                          </div>
                        )}

                        {staticLines.length > 0 && (
                          <div className="rounded-lg border border-line bg-surface p-3">
                            <p className="text-[10px] font-bold uppercase tracking-wide text-muted">Suggested change</p>
                            <dl className="mt-2 space-y-2">
                              {staticLines.map((line) => (
                                <div key={line.label} className="grid gap-1 sm:grid-cols-[140px_1fr]">
                                  <dt className="text-xs font-semibold text-muted">{line.label}</dt>
                                  <dd className="text-sm text-deep">{line.value}</dd>
                                </div>
                              ))}
                            </dl>
                          </div>
                        )}

                        {suggestion.rationale && (
                          <p className="text-xs leading-5 text-muted">
                            <span className="font-semibold text-deep">Why AI suggested it: </span>
                            {suggestion.rationale}
                          </p>
                        )}
                      </div>
                    </article>
                  );
                })}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
