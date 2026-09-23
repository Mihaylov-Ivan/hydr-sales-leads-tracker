"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useProjects } from "@/lib/store";
import { useProspecting } from "@/lib/prospecting-store";
import MarketMultiSelect from "@/components/MarketMultiSelect";
import SeriesMultiSelect from "@/components/SeriesMultiSelect";
import {
  ENGAGED_RESULTS,
  OUTREACH_CHANNEL_LABELS,
  OUTREACH_RESULTS,
  OUTREACH_RESULT_LABELS,
  PROSPECTING_CHANNELS,
  PROSPECT_PRIORITIES,
  PROSPECT_PRIORITY_LABELS,
  PROSPECT_SOURCES,
  PROSPECT_SOURCE_LABELS,
  ProspectCompany,
  ProspectContact,
  ProspectMarket,
  ProspectPriority,
  ProspectQualification,
  ProspectSource,
  ProspectSystem,
  OutreachChannel,
  OutreachResult,
  YesNoUnknown,
  promoteDefaultStage,
  todayDateOnly,
} from "@/lib/prospecting-types";
import { CREATE_STAGES, STAGE_LABELS, Stage } from "@/lib/types";
import { assignableTeamMembers } from "@/lib/permissions";
import { useLinkProspectToColdLead } from "./ProspectSalesSync";

const inputCls =
  "w-full rounded-lg border border-line bg-panel px-3 py-2 text-sm text-ink placeholder:text-muted/60 outline-none focus:border-teal-accent";
const labelCls =
  "mb-1 block text-[10px] font-semibold uppercase tracking-wide text-muted";
const selectCls = inputCls;

function ModalShell({
  title,
  onClose,
  children,
  wide,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto overscroll-contain bg-deep/40 p-3 backdrop-blur-sm sm:p-4">
      {/* items-start (not center) so tall forms stay reachable from the top */}
      <div className="mx-auto flex min-h-full w-full max-w-2xl items-start justify-center py-2 sm:py-4">
        <div
          className={`w-full rounded-2xl border border-line bg-surface p-5 shadow-2xl sm:p-6 ${
            wide ? "max-w-2xl" : "max-w-lg"
          }`}
        >
          <div className="mb-4 flex items-start justify-between gap-3">
            <h2 className="text-lg font-bold text-deep">{title}</h2>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md px-2 py-1 text-sm text-muted hover:bg-surface-tint hover:text-deep"
              aria-label="Close"
            >
              ✕
            </button>
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}

export function AddCompanyDialog({ onClose }: { onClose: () => void }) {
  const { addCompany } = useProspecting();
  const { teamMembers, currentUserId } = useProjects();
  const assignable = assignableTeamMembers(teamMembers);
  const ownerDefault =
    currentUserId && assignable.some((m) => m.id === currentUserId)
      ? currentUserId
      : (assignable[0]?.id ?? "");

  type DraftContact = {
    key: string;
    name: string;
    title: string;
    email: string;
    phone: string;
  };

  const [name, setName] = useState("");
  const [country, setCountry] = useState("");
  const [city, setCity] = useState("");
  const [siteName, setSiteName] = useState("");
  const [market, setMarket] = useState<ProspectMarket>("Burner Optimisation");
  const [system, setSystem] = useState<ProspectSystem>("E Series");
  const [source, setSource] = useState<ProspectSource>("email");
  const [ownerId, setOwnerId] = useState(ownerDefault);
  const [sizeKw, setSizeKw] = useState("");
  const [strategyWhy, setStrategyWhy] = useState("");
  const [draftContacts, setDraftContacts] = useState<DraftContact[]>([
    { key: "c0", name: "", title: "", email: "", phone: "" },
  ]);
  const [warning, setWarning] = useState<string | null>(null);

  useEffect(() => {
    if (!ownerId && ownerDefault) setOwnerId(ownerDefault);
  }, [ownerDefault, ownerId]);

  const valid = name.trim().length > 0;

  function updateDraft(key: string, patch: Partial<DraftContact>) {
    setDraftContacts((prev) =>
      prev.map((c) => (c.key === key ? { ...c, ...patch } : c)),
    );
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) return;
    const contacts = draftContacts
      .filter(
        (c) =>
          c.name.trim() ||
          c.title.trim() ||
          c.email.trim() ||
          c.phone.trim(),
      )
      .map((c, index) => ({
        name: c.name.trim(),
        title: c.title,
        email: c.email,
        phone: c.phone,
        isPrimary: index === 0,
      }));
    const parsedSize = Number(sizeKw);
    const result = addCompany({
      name,
      country,
      city,
      siteName,
      market,
      system,
      source,
      priority: "medium",
      ownerId,
      strategyWhy,
      ...(Number.isFinite(parsedSize) && parsedSize > 0
        ? { sizeKw: parsedSize }
        : {}),
      ...(contacts.length ? { contacts } : {}),
    });
    if (result.duplicateWarning) {
      setWarning(result.duplicateWarning);
      // Still created — brief notice then close
      setTimeout(onClose, 900);
      return;
    }
    onClose();
  }

  return (
    <ModalShell title="Add target company" onClose={onClose} wide>
      <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className={labelCls}>Company name *</label>
          <input
            autoFocus
            className={inputCls}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Balkan Cement Plant"
          />
        </div>
        <div>
          <label className={labelCls}>Country</label>
          <input
            className={inputCls}
            value={country}
            onChange={(e) => setCountry(e.target.value)}
          />
        </div>
        <div>
          <label className={labelCls}>City / location</label>
          <input
            className={inputCls}
            value={city}
            onChange={(e) => setCity(e.target.value)}
          />
        </div>
        <div className="sm:col-span-2">
          <label className={labelCls}>Plant / site</label>
          <input
            className={inputCls}
            value={siteName}
            onChange={(e) => setSiteName(e.target.value)}
            placeholder="Optional specific site"
          />
        </div>
        <div>
          <label className={labelCls}>Market *</label>
          <MarketMultiSelect value={market} onChange={setMarket} />
        </div>
        <div>
          <label className={labelCls}>System</label>
          <SeriesMultiSelect value={system} onChange={setSystem} />
        </div>
        <div>
          <label className={labelCls}>System size (kW)</label>
          <input
            className={inputCls}
            type="number"
            min={0}
            value={sizeKw}
            onChange={(e) => setSizeKw(e.target.value)}
            placeholder="Optional"
          />
        </div>
        <div>
          <label className={labelCls}>Source</label>
          <select
            className={selectCls}
            value={source}
            onChange={(e) => setSource(e.target.value as ProspectSource)}
          >
            {PROSPECT_SOURCES.map((s) => (
              <option key={s} value={s}>
                {PROSPECT_SOURCE_LABELS[s]}
              </option>
            ))}
          </select>
        </div>
        <div className="sm:col-span-2">
          <label className={labelCls}>Owner</label>
          <select
            className={selectCls}
            value={ownerId}
            onChange={(e) => setOwnerId(e.target.value)}
          >
            {assignable.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </div>
        <div className="sm:col-span-2">
          <label className={labelCls}>Why contact them?</label>
          <textarea
            className={`${inputCls} min-h-[64px]`}
            value={strategyWhy}
            onChange={(e) => setStrategyWhy(e.target.value)}
            placeholder="Client problem / Hydrogenera fit"
          />
        </div>

        <div className="sm:col-span-2 mt-1 border-t border-line pt-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-xs font-semibold text-deep">
              Contacts (optional — add as many as you need)
            </p>
            <button
              type="button"
              onClick={() =>
                setDraftContacts((prev) => [
                  ...prev,
                  {
                    key: `c${Date.now()}-${prev.length}`,
                    name: "",
                    title: "",
                    email: "",
                    phone: "",
                  },
                ])
              }
              className="text-[10px] font-bold uppercase text-teal-accent hover:underline"
            >
              + Add contact
            </button>
          </div>
          <div className="space-y-3">
            {draftContacts.map((draft, index) => (
              <div
                key={draft.key}
                className="rounded-xl border border-line bg-panel/60 p-3"
              >
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">
                    Contact {index + 1}
                    {index === 0 ? " · primary" : ""}
                  </p>
                  {draftContacts.length > 1 && (
                    <button
                      type="button"
                      onClick={() =>
                        setDraftContacts((prev) =>
                          prev.filter((c) => c.key !== draft.key),
                        )
                      }
                      className="text-[10px] font-semibold text-muted hover:text-amber-accent"
                    >
                      Remove
                    </button>
                  )}
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className={labelCls}>Name</label>
                    <input
                      className={inputCls}
                      value={draft.name}
                      onChange={(e) =>
                        updateDraft(draft.key, { name: e.target.value })
                      }
                      placeholder="Optional"
                    />
                  </div>
                  <div>
                    <label className={labelCls}>Job title</label>
                    <input
                      className={inputCls}
                      value={draft.title}
                      onChange={(e) =>
                        updateDraft(draft.key, { title: e.target.value })
                      }
                      placeholder="Plant Manager"
                    />
                  </div>
                  <div>
                    <label className={labelCls}>Email</label>
                    <input
                      className={inputCls}
                      type="email"
                      value={draft.email}
                      onChange={(e) =>
                        updateDraft(draft.key, { email: e.target.value })
                      }
                    />
                  </div>
                  <div>
                    <label className={labelCls}>Phone</label>
                    <input
                      className={inputCls}
                      value={draft.phone}
                      onChange={(e) =>
                        updateDraft(draft.key, { phone: e.target.value })
                      }
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {warning && (
          <p className="sm:col-span-2 text-xs text-amber-accent">{warning}</p>
        )}

        <div className="sm:col-span-2 mt-2 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-line px-4 py-2 text-sm font-semibold text-muted hover:bg-surface-tint"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!valid}
            className="rounded-lg bg-teal-accent px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
          >
            Add company
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

export function AddContactDialog({
  company,
  onClose,
}: {
  company: ProspectCompany;
  onClose: () => void;
}) {
  const { addContact } = useProspecting();
  const { teamMembers, currentUserId } = useProjects();
  const assignable = assignableTeamMembers(teamMembers);
  const ownerDefault =
    currentUserId && assignable.some((m) => m.id === currentUserId)
      ? currentUserId
      : company.ownerId || assignable[0]?.id || "";

  type DraftContact = {
    key: string;
    name: string;
    title: string;
    email: string;
    phone: string;
    linkedinUrl: string;
    isPrimary: boolean;
  };

  const [ownerId, setOwnerId] = useState(ownerDefault);
  const [draftContacts, setDraftContacts] = useState<DraftContact[]>([
    {
      key: "c0",
      name: "",
      title: "",
      email: "",
      phone: "",
      linkedinUrl: "",
      isPrimary: true,
    },
  ]);
  const [warning, setWarning] = useState<string | null>(null);

  useEffect(() => {
    if (!ownerId && ownerDefault) setOwnerId(ownerDefault);
  }, [ownerDefault, ownerId]);

  function updateDraft(key: string, patch: Partial<DraftContact>) {
    setDraftContacts((prev) =>
      prev.map((c) => {
        if (c.key !== key) {
          if (patch.isPrimary) return { ...c, isPrimary: false };
          return c;
        }
        return { ...c, ...patch };
      }),
    );
  }

  const hasAnyContact = draftContacts.some(
    (c) =>
      c.name.trim() ||
      c.title.trim() ||
      c.email.trim() ||
      c.phone.trim() ||
      c.linkedinUrl.trim(),
  );

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!hasAnyContact) return;
    const toCreate = draftContacts.filter(
      (c) =>
        c.name.trim() ||
        c.title.trim() ||
        c.email.trim() ||
        c.phone.trim() ||
        c.linkedinUrl.trim(),
    );
    let lastWarning: string | undefined;
    toCreate.forEach((c, index) => {
      const result = addContact(company.id, {
        name: c.name.trim(),
        title: c.title,
        email: c.email,
        phone: c.phone,
        linkedinUrl: c.linkedinUrl,
        ownerId,
        isPrimary: c.isPrimary || (index === 0 && !toCreate.some((x) => x.isPrimary)),
        source: company.source,
        priority: company.priority,
      });
      if (result.duplicateWarning) lastWarning = result.duplicateWarning;
    });
    if (lastWarning) {
      setWarning(lastWarning);
      setTimeout(onClose, 900);
      return;
    }
    onClose();
  }

  return (
    <ModalShell title={`Add contact — ${company.name}`} onClose={onClose} wide>
      <form onSubmit={submit} className="grid gap-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs text-muted">
            Name is optional. Add one or more people for this company.
          </p>
          <button
            type="button"
            onClick={() =>
              setDraftContacts((prev) => [
                ...prev,
                {
                  key: `c${Date.now()}-${prev.length}`,
                  name: "",
                  title: "",
                  email: "",
                  phone: "",
                  linkedinUrl: "",
                  isPrimary: false,
                },
              ])
            }
            className="shrink-0 text-[10px] font-bold uppercase text-teal-accent hover:underline"
          >
            + Add another
          </button>
        </div>

        <div>
          <label className={labelCls}>Owner (all new contacts)</label>
          <select
            className={selectCls}
            value={ownerId}
            onChange={(e) => setOwnerId(e.target.value)}
          >
            {assignable.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-3">
          {draftContacts.map((draft, index) => (
            <div
              key={draft.key}
              className="rounded-xl border border-line bg-panel/60 p-3"
            >
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">
                  Contact {index + 1}
                </p>
                {draftContacts.length > 1 && (
                  <button
                    type="button"
                    onClick={() =>
                      setDraftContacts((prev) =>
                        prev.filter((c) => c.key !== draft.key),
                      )
                    }
                    className="text-[10px] font-semibold text-muted hover:text-amber-accent"
                  >
                    Remove
                  </button>
                )}
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className={labelCls}>Name</label>
                  <input
                    autoFocus={index === 0}
                    className={inputCls}
                    value={draft.name}
                    onChange={(e) =>
                      updateDraft(draft.key, { name: e.target.value })
                    }
                    placeholder="Optional"
                  />
                </div>
                <div>
                  <label className={labelCls}>Job title</label>
                  <input
                    className={inputCls}
                    value={draft.title}
                    onChange={(e) =>
                      updateDraft(draft.key, { title: e.target.value })
                    }
                  />
                </div>
                <div>
                  <label className={labelCls}>Email</label>
                  <input
                    className={inputCls}
                    type="email"
                    value={draft.email}
                    onChange={(e) =>
                      updateDraft(draft.key, { email: e.target.value })
                    }
                  />
                </div>
                <div>
                  <label className={labelCls}>Phone</label>
                  <input
                    className={inputCls}
                    value={draft.phone}
                    onChange={(e) =>
                      updateDraft(draft.key, { phone: e.target.value })
                    }
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className={labelCls}>LinkedIn URL</label>
                  <input
                    className={inputCls}
                    value={draft.linkedinUrl}
                    onChange={(e) =>
                      updateDraft(draft.key, { linkedinUrl: e.target.value })
                    }
                  />
                </div>
                <label className="flex items-center gap-2 text-sm text-ink sm:col-span-2">
                  <input
                    type="checkbox"
                    checked={draft.isPrimary}
                    onChange={(e) =>
                      updateDraft(draft.key, { isPrimary: e.target.checked })
                    }
                  />
                  Primary contact
                </label>
              </div>
            </div>
          ))}
        </div>

        {warning && <p className="text-xs text-amber-accent">{warning}</p>}
        <div className="mt-2 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-line px-4 py-2 text-sm font-semibold text-muted"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!hasAnyContact}
            className="rounded-lg bg-teal-accent px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
          >
            Save contacts
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

export function LogOutreachDialog({
  company,
  contact,
  onClose,
}: {
  company: ProspectCompany;
  contact: ProspectContact;
  onClose: () => void;
}) {
  const { logOutreach, contacts } = useProspecting();
  const { currentUserId, teamMembers, updateProject } = useProjects();
  const linkToColdLead = useLinkProspectToColdLead();
  const router = useRouter();
  const userId =
    currentUserId && teamMembers.some((m) => m.id === currentUserId)
      ? currentUserId
      : contact.ownerId || teamMembers[0]?.id || "";

  const isFirst = !contact.firstContactedAt && contact.outreachAttempts === 0;

  const [channel, setChannel] = useState<OutreachChannel>(() => {
    if (
      contact.plannedChannel &&
      PROSPECTING_CHANNELS.includes(contact.plannedChannel)
    ) {
      return contact.plannedChannel;
    }
    return "email";
  });
  const [result, setResult] = useState<OutreachResult>(
    "communication-started",
  );
  const [summary, setSummary] = useState("");
  const [nextAction, setNextAction] = useState("");
  const [nextActionAt, setNextActionAt] = useState("");
  const [openProjectAfter, setOpenProjectAfter] = useState(true);

  const needsFollowUp = result === "no-response-follow-up";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    logOutreach({
      companyId: company.id,
      contactId: contact.id,
      userId,
      channel,
      result,
      summary:
        summary ||
        `${OUTREACH_CHANNEL_LABELS[channel]} — ${OUTREACH_RESULT_LABELS[result]}`,
      nextAction,
      nextActionAt: needsFollowUp && nextActionAt ? nextActionAt : null,
    });

    if (result === "communication-started") {
      const projectId = await linkToColdLead(
        company,
        contacts.filter((c) => c.companyId === company.id),
        contact.id,
      );
      onClose();
      if (openProjectAfter && projectId) {
        router.push(`/projects/${projectId}`);
      }
      return;
    }

    if (result === "no-response-cancel" && company.promotedProjectId) {
      updateProject(company.promotedProjectId, {
        stage: "cancelled",
        cancellationReason: "Cancelled from Prospecting (no response)",
      });
    }

    onClose();
  }

  return (
    <ModalShell title="Log outreach" onClose={onClose}>
      <p className="mb-3 text-sm text-muted">
        <span className="font-semibold text-deep">{contact.name}</span>
        {contact.title ? ` · ${contact.title}` : ""} at{" "}
        <span className="font-semibold text-deep">{company.name}</span>
      </p>
      {!isFirst && (
        <p className="mb-3 rounded-lg bg-surface-tint px-3 py-2 text-xs text-muted">
          Follow-up — does not count toward the 20/80 new-contact target.
        </p>
      )}
      <form onSubmit={submit} className="grid gap-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className={labelCls}>Channel</label>
            <select
              className={selectCls}
              value={channel}
              onChange={(e) => setChannel(e.target.value as OutreachChannel)}
            >
              {PROSPECTING_CHANNELS.map((c) => (
                <option key={c} value={c}>
                  {OUTREACH_CHANNEL_LABELS[c]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>Result</label>
            <select
              className={selectCls}
              value={result}
              onChange={(e) => {
                const next = e.target.value as OutreachResult;
                setResult(next);
                if (next !== "no-response-follow-up") setNextActionAt("");
              }}
            >
              {OUTREACH_RESULTS.map((r) => (
                <option key={r} value={r}>
                  {OUTREACH_RESULT_LABELS[r]}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label className={labelCls}>Summary</label>
          <textarea
            autoFocus
            className={`${inputCls} min-h-[72px]`}
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            placeholder="What happened?"
          />
        </div>
        <div>
          <label className={labelCls}>Next action</label>
          <input
            className={inputCls}
            value={nextAction}
            onChange={(e) => setNextAction(e.target.value)}
            placeholder="e.g. Send case study, call again"
          />
        </div>
        {needsFollowUp && (
          <div>
            <label className={labelCls}>Follow-up date</label>
            <input
              type="date"
              className={inputCls}
              value={nextActionAt}
              onChange={(e) => setNextActionAt(e.target.value)}
              required
            />
          </div>
        )}
        {result === "communication-started" && (
          <label className="flex items-center gap-2 text-sm text-ink">
            <input
              type="checkbox"
              checked={openProjectAfter}
              onChange={(e) => setOpenProjectAfter(e.target.checked)}
            />
            Open Cold Lead on Sales Projects after saving
          </label>
        )}
        <div className="mt-2 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-line px-4 py-2 text-sm font-semibold text-muted"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="rounded-lg bg-teal-accent px-4 py-2 text-sm font-bold text-white"
          >
            {result === "communication-started"
              ? "Save & move to Cold Lead"
              : "Save outcome"}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

/** Prepare list → Contacted: channel(s), summary, follow-up date + reminder task. */
export function MarkContactedDialog({
  company,
  contact,
  onClose,
}: {
  company: ProspectCompany;
  contact: ProspectContact;
  onClose: () => void;
}) {
  const { markContacted } = useProspecting();
  const { currentUserId, teamMembers, addPersonalTodo } = useProjects();
  const userId =
    currentUserId && teamMembers.some((m) => m.id === currentUserId)
      ? currentUserId
      : contact.ownerId || teamMembers[0]?.id || "";

  const [channels, setChannels] = useState<Set<OutreachChannel>>(() => {
    if (
      contact.plannedChannel &&
      PROSPECTING_CHANNELS.includes(contact.plannedChannel)
    ) {
      return new Set([contact.plannedChannel]);
    }
    return new Set<OutreachChannel>(["email"]);
  });
  const [summary, setSummary] = useState("");
  const [followUpAt, setFollowUpAt] = useState(() => {
    if (contact.nextFollowUpAt) return contact.nextFollowUpAt.slice(0, 10);
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return d.toISOString().slice(0, 10);
  });

  function toggleChannel(channel: OutreachChannel) {
    setChannels((prev) => {
      const next = new Set(prev);
      if (next.has(channel)) next.delete(channel);
      else next.add(channel);
      return next;
    });
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!followUpAt || channels.size === 0) return;
    const text = summary.trim();
    const selected = PROSPECTING_CHANNELS.filter((c) => channels.has(c));

    markContacted({
      companyId: company.id,
      contactId: contact.id,
      userId,
      channels: selected,
      summary: text,
      followUpAt,
    });

    addPersonalTodo({
      title: `Follow up: ${contact.name} @ ${company.name}`,
      description: [
        `Channel: ${selected.map((c) => OUTREACH_CHANNEL_LABELS[c]).join(", ")}`,
        text || undefined,
        `Prospecting contact follow-up for ${company.name}.`,
      ]
        .filter(Boolean)
        .join("\n"),
      dueDate: followUpAt,
      ownerUserId: userId,
      status: "todo",
    });

    onClose();
  }

  return (
    <ModalShell title="Mark contacted" onClose={onClose}>
      <p className="mb-3 text-sm text-muted">
        Log outreach to{" "}
        <span className="font-semibold text-deep">{contact.name}</span>
        {contact.title ? ` · ${contact.title}` : ""} at{" "}
        <span className="font-semibold text-deep">{company.name}</span>. Moves
        them to Contacted and creates your follow-up reminder.
      </p>
      <form onSubmit={submit} className="grid gap-3">
        <div>
          <label className={labelCls}>Channels</label>
          <div className="flex flex-wrap gap-2">
            {PROSPECTING_CHANNELS.map((c) => {
              const on = channels.has(c);
              return (
                <label
                  key={c}
                  className={`inline-flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold transition ${
                    on
                      ? "border-teal-accent/50 bg-teal-soft text-teal-accent"
                      : "border-line bg-panel text-muted hover:border-teal-accent/40"
                  }`}
                >
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={on}
                    onChange={() => toggleChannel(c)}
                  />
                  {OUTREACH_CHANNEL_LABELS[c]}
                </label>
              );
            })}
          </div>
          {channels.size === 0 && (
            <p className="mt-1 text-[11px] text-red-700">
              Select at least one channel.
            </p>
          )}
        </div>
        <div>
          <label className={labelCls}>Summary (optional)</label>
          <textarea
            autoFocus
            className={`${inputCls} min-h-[72px]`}
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            placeholder="What did you send / say? (optional)"
          />
        </div>
        <div>
          <label className={labelCls}>Follow-up date</label>
          <input
            type="date"
            required
            className={inputCls}
            value={followUpAt}
            onChange={(e) => setFollowUpAt(e.target.value)}
            min={todayDateOnly()}
          />
          <p className="mt-1 text-[11px] text-muted">
            Creates a personal reminder task for you on this date.
          </p>
        </div>
        <div className="mt-2 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-line px-4 py-2 text-sm font-semibold text-muted"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={channels.size === 0}
            className="rounded-lg bg-teal-accent px-4 py-2 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            Mark contacted
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

/** Contacted → Engaged: response date, result, summary, optional cold lead. */
export function MarkEngagedDialog({
  company,
  contact,
  onClose,
}: {
  company: ProspectCompany;
  contact: ProspectContact;
  onClose: () => void;
}) {
  const { logEngagement, contacts } = useProspecting();
  const { currentUserId, teamMembers } = useProjects();
  const linkToColdLead = useLinkProspectToColdLead();
  const router = useRouter();
  const userId =
    currentUserId && teamMembers.some((m) => m.id === currentUserId)
      ? currentUserId
      : contact.ownerId || teamMembers[0]?.id || "";

  const [responseDate, setResponseDate] = useState(todayDateOnly());
  const [result, setResult] = useState<OutreachResult>("positive");
  const [summary, setSummary] = useState("");
  const [openColdLead, setOpenColdLead] = useState(true);

  const createsColdLead =
    openColdLead &&
    (result === "positive" ||
      result === "requested-info" ||
      result === "requested-meeting" ||
      result === "requested-offer");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const text = summary.trim();

    logEngagement({
      companyId: company.id,
      contactId: contact.id,
      userId,
      channel: contact.plannedChannel || "email",
      result,
      summary: text,
      occurredAt: responseDate,
    });

    if (createsColdLead) {
      const projectId = await linkToColdLead(
        company,
        contacts.filter((c) => c.companyId === company.id),
        contact.id,
      );
      onClose();
      if (projectId) router.push(`/projects/${projectId}`);
      return;
    }

    onClose();
  }

  return (
    <ModalShell title="Mark engaged" onClose={onClose}>
      <p className="mb-3 text-sm text-muted">
        Record the response from{" "}
        <span className="font-semibold text-deep">{contact.name}</span> at{" "}
        <span className="font-semibold text-deep">{company.name}</span>.
      </p>
      <form onSubmit={submit} className="grid gap-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className={labelCls}>Response date</label>
            <input
              type="date"
              required
              className={inputCls}
              value={responseDate}
              onChange={(e) => setResponseDate(e.target.value)}
              max={todayDateOnly()}
            />
          </div>
          <div>
            <label className={labelCls}>Result</label>
            <select
              className={selectCls}
              value={result}
              onChange={(e) => {
                const next = e.target.value as OutreachResult;
                setResult(next);
                if (next === "negative") setOpenColdLead(false);
              }}
            >
              {ENGAGED_RESULTS.map((r) => (
                <option key={r} value={r}>
                  {OUTREACH_RESULT_LABELS[r]}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label className={labelCls}>Summary (optional)</label>
          <textarea
            autoFocus
            className={`${inputCls} min-h-[72px]`}
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            placeholder="What did they say / ask for? (optional)"
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-ink">
          <input
            type="checkbox"
            checked={openColdLead}
            onChange={(e) => setOpenColdLead(e.target.checked)}
            disabled={result === "negative"}
          />
          Open cold lead on Sales Projects
        </label>
        <div className="mt-2 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-line px-4 py-2 text-sm font-semibold text-muted"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="rounded-lg bg-olive px-4 py-2 text-sm font-bold text-olive-ink"
          >
            {createsColdLead ? "Save & create cold lead" : "Save engaged"}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

/** Edit company + all contacts at any time (incl. follow-up date). */
export function EditProspectDialog({
  company,
  contact,
  onClose,
}: {
  company: ProspectCompany;
  contact: ProspectContact;
  onClose: () => void;
}) {
  const { updateCompany, updateContact, addContact, contacts } =
    useProspecting();
  const { teamMembers, currentUserId } = useProjects();
  const assignable = assignableTeamMembers(teamMembers);

  type ExistingDraft = {
    id: string;
    name: string;
    title: string;
    email: string;
    phone: string;
    linkedinUrl: string;
    ownerId: string;
    priority: ProspectPriority;
    isPrimary: boolean;
    nextFollowUpAt: string;
    followUpReason: string;
    notes: string;
  };

  type NewDraft = {
    key: string;
    name: string;
    title: string;
    email: string;
    phone: string;
    linkedinUrl: string;
    isPrimary: boolean;
  };

  const companyContacts = useMemo(() => {
    const list = contacts.filter((c) => c.companyId === company.id);
    return [...list].sort((a, b) => {
      if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1;
      if (a.id === contact.id) return -1;
      if (b.id === contact.id) return 1;
      return (a.name || a.email).localeCompare(b.name || b.email);
    });
  }, [contacts, company.id, contact.id]);

  const [name, setName] = useState(company.name);
  const [country, setCountry] = useState(company.country);
  const [city, setCity] = useState(company.city);
  const [siteName, setSiteName] = useState(company.siteName);
  const [website, setWebsite] = useState(company.website);
  const [market, setMarket] = useState<ProspectMarket>(company.market);
  const [system, setSystem] = useState<ProspectSystem>(company.system);
  const [source, setSource] = useState<ProspectSource>(company.source);
  const [sizeKw, setSizeKw] = useState(
    company.sizeKw > 0 ? String(company.sizeKw) : "",
  );
  const [companyOwnerId, setCompanyOwnerId] = useState(company.ownerId);
  const [strategyWhy, setStrategyWhy] = useState(company.strategyWhy);
  const [companyNotes, setCompanyNotes] = useState(company.notes);
  const [nextAction, setNextAction] = useState(company.nextAction);

  const [existingContacts, setExistingContacts] = useState<ExistingDraft[]>(
    () =>
      companyContacts.map((c) => ({
        id: c.id,
        name: c.name,
        title: c.title,
        email: c.email,
        phone: c.phone,
        linkedinUrl: c.linkedinUrl,
        ownerId: c.ownerId,
        priority: c.priority,
        isPrimary: c.isPrimary,
        nextFollowUpAt: c.nextFollowUpAt ?? "",
        followUpReason: c.followUpReason,
        notes: c.notes,
      })),
  );
  const [newContacts, setNewContacts] = useState<NewDraft[]>([]);

  const valid = name.trim().length > 0;

  function updateExisting(id: string, patch: Partial<ExistingDraft>) {
    setExistingContacts((prev) =>
      prev.map((c) => {
        if (c.id !== id) {
          if (patch.isPrimary) return { ...c, isPrimary: false };
          return c;
        }
        return { ...c, ...patch };
      }),
    );
  }

  function updateNewDraft(key: string, patch: Partial<NewDraft>) {
    setNewContacts((prev) =>
      prev.map((c) => {
        if (c.key !== key) {
          if (patch.isPrimary) return { ...c, isPrimary: false };
          return c;
        }
        return { ...c, ...patch };
      }),
    );
    if (patch.isPrimary) {
      setExistingContacts((prev) =>
        prev.map((c) => ({ ...c, isPrimary: false })),
      );
    }
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) return;
    const parsedSize = Number(sizeKw);
    const primaryExisting = existingContacts.find((c) => c.isPrimary);
    const companyFollowUp =
      (primaryExisting?.nextFollowUpAt ||
        existingContacts[0]?.nextFollowUpAt ||
        "").trim() || null;
    const companyFollowUpReason =
      primaryExisting?.followUpReason.trim() ||
      existingContacts[0]?.followUpReason.trim() ||
      "";

    updateCompany(company.id, {
      name: name.trim(),
      country: country.trim(),
      city: city.trim(),
      siteName: siteName.trim(),
      website: website.trim(),
      market,
      system,
      source,
      ownerId: companyOwnerId,
      strategyWhy: strategyWhy.trim(),
      notes: companyNotes.trim(),
      nextAction: nextAction.trim() || companyFollowUpReason,
      nextActionAt: companyFollowUp,
      sizeKw:
        Number.isFinite(parsedSize) && parsedSize > 0 ? parsedSize : 0,
    });

    for (const draft of existingContacts) {
      updateContact(draft.id, {
        name: draft.name.trim(),
        title: draft.title.trim(),
        email: draft.email.trim(),
        phone: draft.phone.trim(),
        linkedinUrl: draft.linkedinUrl.trim(),
        ownerId: draft.ownerId,
        priority: draft.priority,
        isPrimary: draft.isPrimary,
        nextFollowUpAt: draft.nextFollowUpAt.trim() || null,
        followUpReason: draft.followUpReason.trim(),
        notes: draft.notes.trim(),
      });
    }

    const ownerForNew =
      existingContacts[0]?.ownerId ||
      companyOwnerId ||
      (currentUserId && assignable.some((m) => m.id === currentUserId)
        ? currentUserId
        : assignable[0]?.id) ||
      "";

    for (const draft of newContacts) {
      if (
        !(
          draft.name.trim() ||
          draft.title.trim() ||
          draft.email.trim() ||
          draft.phone.trim() ||
          draft.linkedinUrl.trim()
        )
      ) {
        continue;
      }
      addContact(company.id, {
        name: draft.name.trim(),
        title: draft.title,
        email: draft.email,
        phone: draft.phone,
        linkedinUrl: draft.linkedinUrl,
        ownerId: ownerForNew,
        source,
        priority: company.priority,
        isPrimary: draft.isPrimary,
      });
    }

    onClose();
  }

  return (
    <ModalShell title="Edit prospect" onClose={onClose} wide>
      <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <p className="text-xs font-semibold text-deep">Company</p>
        </div>
        <div className="sm:col-span-2">
          <label className={labelCls}>Company name *</label>
          <input
            autoFocus
            className={inputCls}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div>
          <label className={labelCls}>Country</label>
          <input
            className={inputCls}
            value={country}
            onChange={(e) => setCountry(e.target.value)}
          />
        </div>
        <div>
          <label className={labelCls}>City / location</label>
          <input
            className={inputCls}
            value={city}
            onChange={(e) => setCity(e.target.value)}
          />
        </div>
        <div>
          <label className={labelCls}>Plant / site</label>
          <input
            className={inputCls}
            value={siteName}
            onChange={(e) => setSiteName(e.target.value)}
          />
        </div>
        <div>
          <label className={labelCls}>Website</label>
          <input
            className={inputCls}
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
          />
        </div>
        <div>
          <label className={labelCls}>Market</label>
          <MarketMultiSelect value={market} onChange={setMarket} />
        </div>
        <div>
          <label className={labelCls}>System</label>
          <SeriesMultiSelect value={system} onChange={setSystem} />
        </div>
        <div>
          <label className={labelCls}>Source</label>
          <select
            className={selectCls}
            value={source}
            onChange={(e) => setSource(e.target.value as ProspectSource)}
          >
            {PROSPECT_SOURCES.map((s) => (
              <option key={s} value={s}>
                {PROSPECT_SOURCE_LABELS[s]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls}>System size (kW)</label>
          <input
            className={inputCls}
            type="number"
            min={0}
            value={sizeKw}
            onChange={(e) => setSizeKw(e.target.value)}
            placeholder="Optional"
          />
        </div>
        <div>
          <label className={labelCls}>Company owner</label>
          <select
            className={selectCls}
            value={companyOwnerId}
            onChange={(e) => setCompanyOwnerId(e.target.value)}
          >
            {assignable.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </div>
        <div className="sm:col-span-2">
          <label className={labelCls}>Why contact them?</label>
          <textarea
            className={`${inputCls} min-h-[56px]`}
            value={strategyWhy}
            onChange={(e) => setStrategyWhy(e.target.value)}
          />
        </div>
        <div className="sm:col-span-2">
          <label className={labelCls}>Company notes</label>
          <textarea
            className={`${inputCls} min-h-[56px]`}
            value={companyNotes}
            onChange={(e) => setCompanyNotes(e.target.value)}
          />
        </div>
        <div className="sm:col-span-2">
          <label className={labelCls}>Next action (company)</label>
          <input
            className={inputCls}
            value={nextAction}
            onChange={(e) => setNextAction(e.target.value)}
            placeholder="e.g. Send follow-up email"
          />
        </div>

        <div className="sm:col-span-2 mt-1 border-t border-line pt-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-xs font-semibold text-deep">
              Contacts ({existingContacts.length + newContacts.length})
            </p>
            <button
              type="button"
              onClick={() =>
                setNewContacts((prev) => [
                  ...prev,
                  {
                    key: `n${Date.now()}-${prev.length}`,
                    name: "",
                    title: "",
                    email: "",
                    phone: "",
                    linkedinUrl: "",
                    isPrimary: false,
                  },
                ])
              }
              className="text-[10px] font-bold uppercase text-teal-accent hover:underline"
            >
              + Add contact
            </button>
          </div>
          <div className="space-y-3">
            {existingContacts.map((draft, index) => (
              <div
                key={draft.id}
                className="rounded-xl border border-line bg-panel/60 p-3"
              >
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted">
                  Contact {index + 1}
                  {draft.isPrimary ? " · Primary" : ""}
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className={labelCls}>Full name</label>
                    <input
                      className={inputCls}
                      value={draft.name}
                      onChange={(e) =>
                        updateExisting(draft.id, { name: e.target.value })
                      }
                    />
                  </div>
                  <div>
                    <label className={labelCls}>Job title</label>
                    <input
                      className={inputCls}
                      value={draft.title}
                      onChange={(e) =>
                        updateExisting(draft.id, { title: e.target.value })
                      }
                    />
                  </div>
                  <div>
                    <label className={labelCls}>Email</label>
                    <input
                      className={inputCls}
                      type="email"
                      value={draft.email}
                      onChange={(e) =>
                        updateExisting(draft.id, { email: e.target.value })
                      }
                    />
                  </div>
                  <div>
                    <label className={labelCls}>Phone</label>
                    <input
                      className={inputCls}
                      value={draft.phone}
                      onChange={(e) =>
                        updateExisting(draft.id, { phone: e.target.value })
                      }
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className={labelCls}>LinkedIn URL</label>
                    <input
                      className={inputCls}
                      value={draft.linkedinUrl}
                      onChange={(e) =>
                        updateExisting(draft.id, {
                          linkedinUrl: e.target.value,
                        })
                      }
                    />
                  </div>
                  <div>
                    <label className={labelCls}>Contact owner</label>
                    <select
                      className={selectCls}
                      value={draft.ownerId}
                      onChange={(e) =>
                        updateExisting(draft.id, { ownerId: e.target.value })
                      }
                    >
                      {assignable.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={labelCls}>Priority</label>
                    <select
                      className={selectCls}
                      value={draft.priority}
                      onChange={(e) =>
                        updateExisting(draft.id, {
                          priority: e.target.value as ProspectPriority,
                        })
                      }
                    >
                      {PROSPECT_PRIORITIES.map((p) => (
                        <option key={p} value={p}>
                          {PROSPECT_PRIORITY_LABELS[p]}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={labelCls}>Follow-up date</label>
                    <input
                      type="date"
                      className={inputCls}
                      value={draft.nextFollowUpAt}
                      onChange={(e) =>
                        updateExisting(draft.id, {
                          nextFollowUpAt: e.target.value,
                        })
                      }
                    />
                  </div>
                  <div>
                    <label className={labelCls}>Follow-up reason</label>
                    <input
                      className={inputCls}
                      value={draft.followUpReason}
                      onChange={(e) =>
                        updateExisting(draft.id, {
                          followUpReason: e.target.value,
                        })
                      }
                      placeholder="Why follow up"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className={labelCls}>Contact notes</label>
                    <textarea
                      className={`${inputCls} min-h-[56px]`}
                      value={draft.notes}
                      onChange={(e) =>
                        updateExisting(draft.id, { notes: e.target.value })
                      }
                    />
                  </div>
                  <label className="sm:col-span-2 flex items-center gap-2 text-sm text-ink">
                    <input
                      type="checkbox"
                      checked={draft.isPrimary}
                      onChange={(e) => {
                        const on = e.target.checked;
                        updateExisting(draft.id, { isPrimary: on });
                        if (on) {
                          setNewContacts((prev) =>
                            prev.map((c) => ({ ...c, isPrimary: false })),
                          );
                        }
                      }}
                    />
                    Primary contact
                  </label>
                </div>
              </div>
            ))}

            {newContacts.map((draft, index) => (
              <div
                key={draft.key}
                className="rounded-xl border border-dashed border-line bg-panel/60 p-3"
              >
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">
                    New contact {index + 1}
                  </p>
                  <button
                    type="button"
                    onClick={() =>
                      setNewContacts((prev) =>
                        prev.filter((c) => c.key !== draft.key),
                      )
                    }
                    className="text-[10px] font-semibold text-muted hover:text-amber-accent"
                  >
                    Remove
                  </button>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className={labelCls}>Name</label>
                    <input
                      className={inputCls}
                      value={draft.name}
                      onChange={(e) =>
                        updateNewDraft(draft.key, { name: e.target.value })
                      }
                      placeholder="Optional"
                    />
                  </div>
                  <div>
                    <label className={labelCls}>Job title</label>
                    <input
                      className={inputCls}
                      value={draft.title}
                      onChange={(e) =>
                        updateNewDraft(draft.key, { title: e.target.value })
                      }
                    />
                  </div>
                  <div>
                    <label className={labelCls}>Email</label>
                    <input
                      className={inputCls}
                      type="email"
                      value={draft.email}
                      onChange={(e) =>
                        updateNewDraft(draft.key, { email: e.target.value })
                      }
                    />
                  </div>
                  <div>
                    <label className={labelCls}>Phone</label>
                    <input
                      className={inputCls}
                      value={draft.phone}
                      onChange={(e) =>
                        updateNewDraft(draft.key, { phone: e.target.value })
                      }
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className={labelCls}>LinkedIn URL</label>
                    <input
                      className={inputCls}
                      value={draft.linkedinUrl}
                      onChange={(e) =>
                        updateNewDraft(draft.key, {
                          linkedinUrl: e.target.value,
                        })
                      }
                    />
                  </div>
                  <label className="sm:col-span-2 flex items-center gap-2 text-sm text-ink">
                    <input
                      type="checkbox"
                      checked={draft.isPrimary}
                      onChange={(e) =>
                        updateNewDraft(draft.key, {
                          isPrimary: e.target.checked,
                        })
                      }
                    />
                    Primary contact
                  </label>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="sm:col-span-2 mt-2 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-line px-4 py-2 text-sm font-semibold text-muted"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!valid}
            className="rounded-lg bg-teal-accent px-4 py-2 text-sm font-bold text-white disabled:opacity-40"
          >
            Save changes
          </button>
        </div>
      </form>
    </ModalShell>
  );
}


export function QualifyDialog({
  company,
  onClose,
}: {
  company: ProspectCompany;
  onClose: () => void;
}) {
  const { markQualified } = useProspecting();
  const q = company.qualification;
  const [identifiedProject, setIdentifiedProject] = useState(
    q.identifiedProject ?? "",
  );
  const [painPoint, setPainPoint] = useState(q.painPoint ?? "");
  const [projectTiming, setProjectTiming] = useState(q.projectTiming ?? "");
  const [budgetKnown, setBudgetKnown] = useState<YesNoUnknown>(
    q.budgetKnown ?? "unknown",
  );
  const [fundingNeeded, setFundingNeeded] = useState<YesNoUnknown>(
    q.fundingNeeded ?? "unknown",
  );
  const [decisionMakerIdentified, setDecisionMakerIdentified] =
    useState<YesNoUnknown>(q.decisionMakerIdentified ?? "unknown");
  const [estimatedValue, setEstimatedValue] = useState(
    q.estimatedValue != null ? String(q.estimatedValue) : "",
  );
  const [confidence, setConfidence] = useState(
    q.confidence != null ? String(q.confidence) : "",
  );
  const [notes, setNotes] = useState(q.notes ?? "");

  function ynSelect(
    value: YesNoUnknown,
    onChange: (v: YesNoUnknown) => void,
  ) {
    return (
      <select
        className={selectCls}
        value={value}
        onChange={(e) => onChange(e.target.value as YesNoUnknown)}
      >
        <option value="yes">Yes</option>
        <option value="no">No</option>
        <option value="unknown">Unknown</option>
      </select>
    );
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const qual: ProspectQualification = {
      ...q,
      identifiedProject: identifiedProject.trim(),
      painPoint: painPoint.trim(),
      projectTiming: projectTiming.trim(),
      budgetKnown,
      fundingNeeded,
      decisionMakerIdentified,
      system: company.system,
      estimatedValue: estimatedValue ? Number(estimatedValue) : null,
      confidence: confidence ? Number(confidence) : null,
      notes: notes.trim(),
    };
    markQualified(company.id, qual);
    onClose();
  }

  return (
    <ModalShell title="Qualify prospect" onClose={onClose} wide>
      <p className="mb-3 text-sm text-muted">
        Lightweight qualification for{" "}
        <span className="font-semibold text-deep">{company.name}</span>. Not all
        fields are required.
      </p>
      <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className={labelCls}>Identifiable project / problem</label>
          <input
            className={inputCls}
            value={identifiedProject}
            onChange={(e) => setIdentifiedProject(e.target.value)}
          />
        </div>
        <div className="sm:col-span-2">
          <label className={labelCls}>Pain point / objective</label>
          <textarea
            className={`${inputCls} min-h-[64px]`}
            value={painPoint}
            onChange={(e) => setPainPoint(e.target.value)}
          />
        </div>
        <div>
          <label className={labelCls}>Timing</label>
          <input
            className={inputCls}
            value={projectTiming}
            onChange={(e) => setProjectTiming(e.target.value)}
            placeholder="e.g. 2026 Q3"
          />
        </div>
        <div>
          <label className={labelCls}>Estimated value (€)</label>
          <input
            type="number"
            className={inputCls}
            value={estimatedValue}
            onChange={(e) => setEstimatedValue(e.target.value)}
          />
        </div>
        <div>
          <label className={labelCls}>Budget known?</label>
          {ynSelect(budgetKnown, setBudgetKnown)}
        </div>
        <div>
          <label className={labelCls}>Funding needed?</label>
          {ynSelect(fundingNeeded, setFundingNeeded)}
        </div>
        <div>
          <label className={labelCls}>Decision-maker identified?</label>
          {ynSelect(decisionMakerIdentified, setDecisionMakerIdentified)}
        </div>
        <div>
          <label className={labelCls}>Confidence (0–100)</label>
          <input
            type="number"
            min={0}
            max={100}
            className={inputCls}
            value={confidence}
            onChange={(e) => setConfidence(e.target.value)}
          />
        </div>
        <div className="sm:col-span-2">
          <label className={labelCls}>Notes</label>
          <textarea
            className={`${inputCls} min-h-[64px]`}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>
        <div className="sm:col-span-2 mt-2 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-line px-4 py-2 text-sm font-semibold text-muted"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="rounded-lg bg-teal-accent px-4 py-2 text-sm font-bold text-white"
          >
            Mark qualified
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

export function PromoteDialog({
  company,
  contacts,
  onClose,
}: {
  company: ProspectCompany;
  contacts: ProspectContact[];
  onClose: () => void;
}) {
  const { markPromoted } = useProspecting();
  const { addProject, addContact, waitForProjectInsert, projects, teamMembers, currentUserId } =
    useProjects();
  const assignable = assignableTeamMembers(teamMembers);
  const router = useRouter();

  const existingForClient = useMemo(
    () =>
      projects.filter(
        (p) =>
          !p.isWarehouseHolding &&
          (p.track == null || p.track === "sales") &&
          p.client.trim().toLowerCase() === company.name.trim().toLowerCase(),
      ),
    [projects, company.name],
  );

  const [mode, setMode] = useState<"create" | "link">(
    existingForClient.length > 0 ? "link" : "create",
  );
  const [linkProjectId, setLinkProjectId] = useState(
    existingForClient[0]?.id ?? "",
  );
  const [name, setName] = useState(
    company.siteName
      ? `${company.name} — ${company.siteName}`
      : `${company.name} opportunity`,
  );
  const [stage, setStage] = useState<Stage>(promoteDefaultStage(company));
  const [leadUserId, setLeadUserId] = useState(
    company.ownerId ||
    (currentUserId && assignable.some((m) => m.id === currentUserId)
      ? currentUserId
      : assignable[0]?.id || ""),
  );
  const [description, setDescription] = useState(
    [
      company.strategyWhy && `Why: ${company.strategyWhy}`,
      company.qualification.painPoint &&
      `Pain: ${company.qualification.painPoint}`,
      company.qualification.identifiedProject &&
      `Project: ${company.qualification.identifiedProject}`,
      company.notes && `Notes: ${company.notes}`,
    ]
      .filter(Boolean)
      .join("\n"),
  );

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    let projectId = linkProjectId;

    if (mode === "create") {
      if (!name.trim()) return;
      projectId = addProject({
        name: name.trim(),
        client: company.name,
        country: company.country || "—",
        city: company.city,
      series: company.system,
      market: company.market,
      sizeKw: company.sizeKw > 0 ? company.sizeKw : 0,
      stage,
        baseDescription: description.trim(),
        leadUserId: leadUserId || undefined,
      });
      const projectOk = await waitForProjectInsert(projectId);
      if (!projectOk) {
        console.error(
          "Promote project insert failed; contacts/link not persisted",
          projectId,
        );
      } else {
        for (const c of contacts) {
          addContact(projectId, {
            name: c.name,
            email: c.email || undefined,
            phone: c.phone || undefined,
            position: c.title || undefined,
          });
        }
      }
    } else if (!projectId) {
      return;
    }

    markPromoted(company.id, projectId);
    onClose();
    router.push(`/projects/${projectId}`);
  }

  return (
    <ModalShell title="Promote to Sales Project" onClose={onClose} wide>
      <p className="mb-3 text-sm text-muted">
        Move{" "}
        <span className="font-semibold text-deep">{company.name}</span> into
        Sales Tracking. Prospecting history stays on this page.
      </p>

      {existingForClient.length > 0 && (
        <div className="mb-4 flex gap-2 rounded-lg border border-line bg-surface-tint p-1">
          <button
            type="button"
            onClick={() => setMode("link")}
            className={`flex-1 rounded-md px-3 py-1.5 text-xs font-bold uppercase tracking-wide ${mode === "link"
                ? "bg-panel text-teal-accent shadow-sm"
                : "text-muted"
              }`}
          >
            Link existing
          </button>
          <button
            type="button"
            onClick={() => setMode("create")}
            className={`flex-1 rounded-md px-3 py-1.5 text-xs font-bold uppercase tracking-wide ${mode === "create"
                ? "bg-panel text-teal-accent shadow-sm"
                : "text-muted"
              }`}
          >
            Create new
          </button>
        </div>
      )}

      <form onSubmit={submit} className="grid gap-3">
        {mode === "link" ? (
          <div>
            <label className={labelCls}>Existing Sales Project</label>
            <select
              className={selectCls}
              value={linkProjectId}
              onChange={(e) => setLinkProjectId(e.target.value)}
            >
              {existingForClient.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({STAGE_LABELS[p.stage]})
                </option>
              ))}
            </select>
          </div>
        ) : (
          <>
            <div>
              <label className={labelCls}>Project name *</label>
              <input
                className={inputCls}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className={labelCls}>Initial stage</label>
                <select
                  className={selectCls}
                  value={stage}
                  onChange={(e) => setStage(e.target.value as Stage)}
                >
                  {CREATE_STAGES.map((s) => (
                    <option key={s} value={s}>
                      {STAGE_LABELS[s]}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelCls}>Owner</label>
                <select
                  className={selectCls}
                  value={leadUserId}
                  onChange={(e) => setLeadUserId(e.target.value)}
                >
                  {assignable.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className={labelCls}>Description</label>
              <textarea
                className={`${inputCls} min-h-[88px]`}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
            <p className="text-xs text-muted">
              Maps to {company.market} · {company.system} ·{" "}
              {contacts.length} contact
              {contacts.length === 1 ? "" : "s"} will be copied.
            </p>
          </>
        )}

        <div className="mt-2 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-line px-4 py-2 text-sm font-semibold text-muted"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="rounded-lg bg-deep px-4 py-2 text-sm font-bold text-white"
          >
            {mode === "link" ? "Link & promote" : "Create & promote"}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

