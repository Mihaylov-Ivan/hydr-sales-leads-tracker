"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type BriefingType = "daily" | "weekly" | "monthly";

type Briefing = {
  id: string;
  briefing_type: BriefingType;
  period_start: string;
  period_end: string;
  title: string;
  summary: string;
  highlights: unknown;
  metrics: unknown;
  generated_at: string;
  generated_by: string;
  source_from: string | null;
  source_to: string | null;
  created_at: string;
  updated_at: string;
};

const TYPE_META: Record<
  BriefingType,
  { label: string; eyebrow: string; description: string }
> = {
  daily: {
    label: "Daily",
    eyebrow: "Latest activity",
    description: "What changed across the CRM since the previous daily run.",
  },
  weekly: {
    label: "Weekly",
    eyebrow: "Week to date",
    description: "Everything meaningful since Monday.",
  },
  monthly: {
    label: "Monthly",
    eyebrow: "Month to date",
    description: "Everything meaningful since the first Monday of the month.",
  },
};

function formatDate(value: string, opts?: Intl.DateTimeFormatOptions) {
  const date = new Date(value + (value.length === 10 ? "T12:00:00" : ""));
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    ...opts,
  }).format(date);
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function periodLabel(item: Briefing) {
  if (item.period_start === item.period_end) {
    return formatDate(item.period_start);
  }
  return `${formatDate(item.period_start, { year: undefined })} – ${formatDate(
    item.period_end,
  )}`;
}

function metricEntries(value: unknown): Array<[string, string]> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  return Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => ["string", "number"].includes(typeof v))
    .slice(0, 6)
    .map(([key, v]) => [
      key
        .replace(/_/g, " ")
        .replace(/\b\w/g, (char) => char.toUpperCase()),
      String(v),
    ]);
}

function highlightItems(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 8);
}

function SummaryBody({ text }: { text: string }) {
  const lines = text.split(/\r?\n/);
  const nodes: React.ReactNode[] = [];
  let bullets: string[] = [];

  const flushBullets = () => {
    if (bullets.length === 0) return;
    nodes.push(
      <ul
        key={`bullets-${nodes.length}`}
        className="space-y-2 pl-1 text-sm leading-6 text-deep"
      >
        {bullets.map((bullet, index) => (
          <li key={index} className="flex gap-2.5">
            <span className="mt-[0.65rem] h-1.5 w-1.5 shrink-0 rounded-full bg-teal-accent" />
            <span>{bullet}</span>
          </li>
        ))}
      </ul>,
    );
    bullets = [];
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      flushBullets();
      continue;
    }
    if (line.startsWith("## ")) {
      flushBullets();
      nodes.push(
        <h4
          key={`heading-${nodes.length}`}
          className="pt-2 text-xs font-bold uppercase tracking-[0.12em] text-muted"
        >
          {line.slice(3)}
        </h4>,
      );
      continue;
    }
    if (line.startsWith("- ")) {
      bullets.push(line.slice(2).trim());
      continue;
    }
    flushBullets();
    nodes.push(
      <p
        key={`p-${nodes.length}`}
        className="text-sm leading-6 text-deep"
      >
        {line}
      </p>,
    );
  }
  flushBullets();

  return <div className="space-y-3">{nodes}</div>;
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 12 8"
      className={`h-2.5 w-2.5 transition-transform ${open ? "rotate-180" : ""}`}
      aria-hidden
    >
      <path
        d="M1 1.5 L6 6.5 L11 1.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CurrentCard({
  type,
  item,
  open,
  onToggle,
}: {
  type: BriefingType;
  item?: Briefing;
  open: boolean;
  onToggle: () => void;
}) {
  const meta = TYPE_META[type];
  const metrics = item ? metricEntries(item.metrics) : [];
  const highlights = item ? highlightItems(item.highlights) : [];

  return (
    <section className="overflow-hidden rounded-2xl border border-line bg-panel shadow-sm">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition hover:bg-surface/70 sm:px-6"
        aria-expanded={open}
      >
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-teal-accent">
              {meta.eyebrow}
            </span>
            {item && (
              <span className="rounded-full border border-line bg-surface px-2 py-0.5 text-[10px] font-semibold text-muted">
                {periodLabel(item)}
              </span>
            )}
          </div>
          <h2 className="mt-1 text-lg font-semibold text-deep">
            {item?.title || `${meta.label} briefing`}
          </h2>
          <p className="mt-1 text-xs leading-5 text-muted">
            {item
              ? `Generated ${formatDateTime(item.generated_at)} · ${meta.description}`
              : meta.description}
          </p>
        </div>
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-line bg-surface text-muted">
          <Chevron open={open} />
        </span>
      </button>

      {open && (
        <div className="border-t border-line px-5 py-5 sm:px-6">
          {!item ? (
            <div className="rounded-xl border border-dashed border-line bg-surface p-6 text-center">
              <p className="text-sm font-semibold text-deep">
                No {meta.label.toLowerCase()} briefing yet
              </p>
              <p className="mt-1 text-xs text-muted">
                The scheduled CRM briefing task will create it at 20:00 Sofia time.
              </p>
            </div>
          ) : (
            <div className="space-y-5">
              {metrics.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {metrics.map(([label, value]) => (
                    <div
                      key={label}
                      className="rounded-xl border border-line bg-surface px-3 py-2"
                    >
                      <div className="text-[10px] font-semibold uppercase tracking-wide text-muted">
                        {label}
                      </div>
                      <div className="mt-0.5 text-base font-semibold text-deep">
                        {value}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {highlights.length > 0 && (
                <div className="rounded-xl border border-teal-accent/20 bg-teal-soft/20 p-4">
                  <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-teal-accent">
                    Key points
                  </p>
                  <ul className="mt-2 space-y-2">
                    {highlights.map((highlight, index) => (
                      <li key={index} className="flex gap-2 text-sm leading-5 text-deep">
                        <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-teal-accent" />
                        <span>{highlight}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <SummaryBody text={item.summary} />
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function HistoryItem({ item }: { item: Briefing }) {
  return (
    <details className="group rounded-xl border border-line bg-panel shadow-sm">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-4 py-3.5">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-deep">{item.title}</p>
          <p className="mt-0.5 text-xs text-muted">
            {periodLabel(item)} · Generated {formatDateTime(item.generated_at)}
          </p>
        </div>
        <span className="text-muted transition group-open:rotate-180">
          <Chevron open={false} />
        </span>
      </summary>
      <div className="border-t border-line px-4 py-4">
        <SummaryBody text={item.summary} />
      </div>
    </details>
  );
}

export default function BriefingsPage() {
  const [briefings, setBriefings] = useState<Briefing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [historyType, setHistoryType] = useState<BriefingType>("daily");
  const [open, setOpen] = useState<Record<BriefingType, boolean>>({
    daily: true,
    weekly: false,
    monthly: false,
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/briefings?limit=365", {
        credentials: "include",
        cache: "no-store",
      });
      const body = (await response.json().catch(() => null)) as
        | { briefings?: Briefing[]; error?: string }
        | null;
      if (!response.ok) {
        throw new Error(body?.error || "Could not load CRM briefings.");
      }
      setBriefings(body?.briefings ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load CRM briefings.");
      setBriefings([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const current = useMemo(() => {
    const result: Partial<Record<BriefingType, Briefing>> = {};
    for (const item of briefings) {
      if (!result[item.briefing_type]) result[item.briefing_type] = item;
    }
    return result;
  }, [briefings]);

  const history = useMemo(() => {
    const currentId = current[historyType]?.id;
    return briefings.filter(
      (item) => item.briefing_type === historyType && item.id !== currentId,
    );
  }, [briefings, current, historyType]);

  const latestGenerated = useMemo(() => {
    if (briefings.length === 0) return null;
    return [...briefings].sort(
      (a, b) =>
        new Date(b.generated_at).getTime() - new Date(a.generated_at).getTime(),
    )[0]?.generated_at;
  }, [briefings]);

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 pb-12">
      <header className="overflow-hidden rounded-2xl border border-line bg-panel shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-5 px-5 py-5 sm:px-6 sm:py-6">
          <div className="max-w-2xl">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-teal-accent">
              CRM intelligence
            </p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-deep sm:text-3xl">
              Briefings
            </h1>
            <p className="mt-2 text-sm leading-6 text-muted">
              Daily, week-to-date and month-to-date summaries generated only from
              CRM activity. The daily briefing opens first; longer periods stay
              collapsed until you need them.
            </p>
          </div>

          <div className="rounded-xl border border-line bg-surface px-3 py-2 text-right">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">
              Automatic generation
            </p>
            <p className="mt-0.5 text-sm font-semibold text-deep">20:00 Sofia</p>
            {latestGenerated && (
              <p className="mt-0.5 text-[11px] text-muted">
                Last: {formatDateTime(latestGenerated)}
              </p>
            )}
          </div>
        </div>
      </header>

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((item) => (
            <div
              key={item}
              className="h-24 animate-pulse rounded-2xl border border-line bg-panel"
            />
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {(["daily", "weekly", "monthly"] as BriefingType[]).map((type) => (
            <CurrentCard
              key={type}
              type={type}
              item={current[type]}
              open={open[type]}
              onToggle={() =>
                setOpen((state) => ({ ...state, [type]: !state[type] }))
              }
            />
          ))}
        </div>
      )}

      <section className="rounded-2xl border border-line bg-surface p-4 shadow-sm sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted">
              Archive
            </p>
            <h2 className="mt-0.5 text-lg font-semibold text-deep">
              Briefing history
            </h2>
          </div>

          <div className="flex rounded-xl border border-line bg-panel p-1">
            {(["daily", "weekly", "monthly"] as BriefingType[]).map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => setHistoryType(type)}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                  historyType === type
                    ? "bg-teal-accent text-white shadow-sm"
                    : "text-muted hover:text-deep"
                }`}
              >
                {TYPE_META[type].label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4 space-y-2">
          {loading ? (
            <p className="py-6 text-center text-sm text-muted">Loading history…</p>
          ) : history.length === 0 ? (
            <div className="rounded-xl border border-dashed border-line bg-panel px-4 py-8 text-center">
              <p className="text-sm font-semibold text-deep">No older briefings yet</p>
              <p className="mt-1 text-xs text-muted">
                Completed {TYPE_META[historyType].label.toLowerCase()} periods will
                accumulate here automatically.
              </p>
            </div>
          ) : (
            history.map((item) => <HistoryItem key={item.id} item={item} />)
          )}
        </div>
      </section>
    </div>
  );
}
