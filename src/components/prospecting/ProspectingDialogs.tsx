"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useProjects } from "@/lib/store";
import { useProspecting } from "@/lib/prospecting-store";
import {
  OUTREACH_CHANNEL_LABELS,
  OUTREACH_RESULTS,
  OUTREACH_RESULT_LABELS,
  PROSPECTING_CHANNELS,
  PROSPECT_MARKETS,
  PROSPECT_MARKET_LABELS,
  PROSPECT_MARKET_PRODUCT,
  PROSPECT_PRODUCTS,
  PROSPECT_PRODUCT_PURITY,
  PROSPECT_SOURCES,
  PROSPECT_SOURCE_LABELS,
  PROSPECT_TO_PROJECT_MARKET,
  PROSPECT_TO_PROJECT_SERIES,
  ProspectCompany,
  ProspectContact,
  ProspectMarket,
  ProspectProduct,
  ProspectQualification,
  ProspectSource,
  OutreachChannel,
  OutreachResult,
  YesNoUnknown,
  promoteDefaultStage,
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
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-deep/40 p-4 backdrop-blur-sm sm:items-center"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={`my-6 w-full rounded-2xl border border-line bg-surface p-5 shadow-2xl sm:p-6 ${
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

  const [name, setName] = useState("");
  const [country, setCountry] = useState("");
  const [city, setCity] = useState("");
  const [siteName, setSiteName] = useState("");
  const [market, setMarket] = useState<ProspectMarket>("Burner Optimisation");
  const [product, setProduct] = useState<ProspectProduct>(
    PROSPECT_MARKET_PRODUCT["Burner Optimisation"],
  );
  const [source, setSource] = useState<ProspectSource>("email");
  const [ownerId, setOwnerId] = useState(ownerDefault);
  const [strategyWhy, setStrategyWhy] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactTitle, setContactTitle] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [warning, setWarning] = useState<string | null>(null);

  useEffect(() => {
    setProduct(PROSPECT_MARKET_PRODUCT[market]);
  }, [market]);

  const valid = name.trim().length > 0;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) return;
    const result = addCompany({
      name,
      country,
      city,
      siteName,
      market,
      product,
      source,
      priority: "medium",
      ownerId,
      strategyWhy,
      ...(contactName.trim()
        ? {
            contact: {
              name: contactName,
              title: contactTitle,
              email: contactEmail,
              phone: contactPhone,
              isPrimary: true,
            },
          }
        : {}),
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
          <select
            className={selectCls}
            value={market}
            onChange={(e) => setMarket(e.target.value as ProspectMarket)}
          >
            {PROSPECT_MARKETS.map((m) => (
              <option key={m} value={m}>
                {PROSPECT_MARKET_LABELS[m]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls}>
            Product ({PROSPECT_PRODUCT_PURITY[product]} H₂)
          </label>
          <select
            className={selectCls}
            value={product}
            onChange={(e) => setProduct(e.target.value as ProspectProduct)}
          >
            {PROSPECT_PRODUCTS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
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
          <p className="mb-2 text-xs font-semibold text-deep">
            First contact (optional)
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className={labelCls}>Name</label>
              <input
                className={inputCls}
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
              />
            </div>
            <div>
              <label className={labelCls}>Job title</label>
              <input
                className={inputCls}
                value={contactTitle}
                onChange={(e) => setContactTitle(e.target.value)}
                placeholder="Plant Manager"
              />
            </div>
            <div>
              <label className={labelCls}>Email</label>
              <input
                className={inputCls}
                type="email"
                value={contactEmail}
                onChange={(e) => setContactEmail(e.target.value)}
              />
            </div>
            <div>
              <label className={labelCls}>Phone</label>
              <input
                className={inputCls}
                value={contactPhone}
                onChange={(e) => setContactPhone(e.target.value)}
              />
            </div>
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

  const [name, setName] = useState("");
  const [title, setTitle] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [linkedinUrl, setLinkedinUrl] = useState("");
  const [ownerId, setOwnerId] = useState(ownerDefault);
  const [isPrimary, setIsPrimary] = useState(false);
  const [warning, setWarning] = useState<string | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    const result = addContact(company.id, {
      name,
      title,
      email,
      phone,
      linkedinUrl,
      ownerId,
      isPrimary,
      source: company.source,
      priority: company.priority,
    });
    if (result.duplicateWarning) setWarning(result.duplicateWarning);
    onClose();
  }

  return (
    <ModalShell title={`Add contact — ${company.name}`} onClose={onClose}>
      <form onSubmit={submit} className="grid gap-3">
        <div>
          <label className={labelCls}>Full name *</label>
          <input
            autoFocus
            className={inputCls}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div>
          <label className={labelCls}>Job title</label>
          <input
            className={inputCls}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className={labelCls}>Email</label>
            <input
              className={inputCls}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div>
            <label className={labelCls}>Phone</label>
            <input
              className={inputCls}
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>
        </div>
        <div>
          <label className={labelCls}>LinkedIn URL</label>
          <input
            className={inputCls}
            value={linkedinUrl}
            onChange={(e) => setLinkedinUrl(e.target.value)}
          />
        </div>
        <div>
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
        <label className="flex items-center gap-2 text-sm text-ink">
          <input
            type="checkbox"
            checked={isPrimary}
            onChange={(e) => setIsPrimary(e.target.checked)}
          />
          Primary contact
        </label>
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
            disabled={!name.trim()}
            className="rounded-lg bg-teal-accent px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
          >
            Add contact
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

  function submit(e: React.FormEvent) {
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
      const projectId = linkToColdLead(
        company,
        contacts.filter((c) => c.companyId === company.id),
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
      {isFirst && (
        <p className="mb-3 rounded-lg bg-teal-soft/60 px-3 py-2 text-xs text-deep">
          First contact — counts toward the weekly/monthly new-contact target.
        </p>
      )}
      {!isFirst && (
        <p className="mb-3 rounded-lg bg-surface-tint px-3 py-2 text-xs text-muted">
          Follow-up — does not count toward the 20/80 new-contact target.
        </p>
      )}
      {result === "communication-started" && (
        <p className="mb-3 rounded-lg border border-teal-accent/30 bg-teal-soft/50 px-3 py-2 text-xs text-deep">
          This will create (or link) a <strong>Cold Lead</strong> on Sales
          Projects so the opportunity continues there.
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
      product: company.product,
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
  const { addProject, addContact, projects, teamMembers, currentUserId } =
    useProjects();
  const assignable = assignableTeamMembers(teamMembers);
  const router = useRouter();

  const existingForClient = useMemo(
    () =>
      projects.filter(
        (p) =>
          !p.isWarehouseHolding &&
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

  function submit(e: React.FormEvent) {
    e.preventDefault();
    let projectId = linkProjectId;

    if (mode === "create") {
      if (!name.trim()) return;
      projectId = addProject({
        name: name.trim(),
        client: company.name,
        country: company.country || "—",
        city: company.city,
        series: PROSPECT_TO_PROJECT_SERIES[company.product],
        market: PROSPECT_TO_PROJECT_MARKET[company.market],
        sizeKw: 0,
        stage,
        baseDescription: description.trim(),
        leadUserId: leadUserId || undefined,
      });
      for (const c of contacts) {
        addContact(projectId, {
          name: c.name,
          email: c.email || undefined,
          phone: c.phone || undefined,
          position: c.title || undefined,
        });
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
            className={`flex-1 rounded-md px-3 py-1.5 text-xs font-bold uppercase tracking-wide ${
              mode === "link"
                ? "bg-panel text-teal-accent shadow-sm"
                : "text-muted"
            }`}
          >
            Link existing
          </button>
          <button
            type="button"
            onClick={() => setMode("create")}
            className={`flex-1 rounded-md px-3 py-1.5 text-xs font-bold uppercase tracking-wide ${
              mode === "create"
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
              Maps to {PROSPECT_TO_PROJECT_MARKET[company.market]} ·{" "}
              {PROSPECT_TO_PROJECT_SERIES[company.product]} ·{" "}
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

export function PrepareContactDialog({
  company,
  contact,
  onClose,
}: {
  company: ProspectCompany;
  contact: ProspectContact;
  onClose: () => void;
}) {
  const { updateContact, markPrepared } = useProspecting();
  const [note, setNote] = useState(contact.personalizationNote || contact.notes);
  const [draftMessage, setDraftMessage] = useState(contact.draftMessage);
  const [channel, setChannel] = useState<OutreachChannel | "">(
    contact.plannedChannel &&
      PROSPECTING_CHANNELS.includes(contact.plannedChannel)
      ? contact.plannedChannel
      : "",
  );
  const [plannedContactDate, setPlannedContactDate] = useState(
    contact.plannedContactDate ?? "",
  );
  const [email, setEmail] = useState(contact.email);
  const [phone, setPhone] = useState(contact.phone);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    updateContact(contact.id, {
      personalizationNote: note,
      draftMessage,
      plannedChannel: channel,
      plannedContactDate: plannedContactDate || null,
      email,
      phone,
    });
    markPrepared(contact.id);
    onClose();
  }

  return (
    <ModalShell title="Prepare for outreach" onClose={onClose} wide>
      <p className="mb-3 text-sm text-muted">
        Ready{" "}
        <span className="font-semibold text-deep">{contact.name}</span> at{" "}
        <span className="font-semibold text-deep">{company.name}</span> for the
        next contact day.
      </p>
      <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className={labelCls}>Email</label>
          <input
            className={inputCls}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div>
          <label className={labelCls}>Phone</label>
          <input
            className={inputCls}
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </div>
        <div>
          <label className={labelCls}>Channel</label>
          <select
            className={selectCls}
            value={channel}
            onChange={(e) =>
              setChannel(e.target.value as OutreachChannel | "")
            }
          >
            <option value="">Not set</option>
            {PROSPECTING_CHANNELS.map((c) => (
              <option key={c} value={c}>
                {OUTREACH_CHANNEL_LABELS[c]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls}>Planned contact date</label>
          <input
            type="date"
            className={inputCls}
            value={plannedContactDate}
            onChange={(e) => setPlannedContactDate(e.target.value)}
          />
        </div>
        <div className="sm:col-span-2">
          <label className={labelCls}>Note</label>
          <textarea
            className={`${inputCls} min-h-[64px]`}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Anything useful for the outreach call/email"
          />
        </div>
        <div className="sm:col-span-2">
          <label className={labelCls}>Draft message</label>
          <textarea
            className={`${inputCls} min-h-[96px]`}
            value={draftMessage}
            onChange={(e) => setDraftMessage(e.target.value)}
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
            Mark prepared
          </button>
        </div>
      </form>
    </ModalShell>
  );
}
