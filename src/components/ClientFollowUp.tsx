"use client";

import {
  Project,
  emailReminderDeltaDays,
  isEmailReminderDue,
  lastContactDate,
  nextEmailReminderDate,
} from "@/lib/types";
import { useProjects } from "@/lib/store";

function formatDay(iso: string): string {
  return new Date(iso + "T12:00:00").toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default function ClientFollowUp({ project }: { project: Project }) {
  const { updateProject, markClientEmailed } = useProjects();
  const due = isEmailReminderDue(project);
  const delta = emailReminderDeltaDays(project);
  const last = lastContactDate(project);
  const next = nextEmailReminderDate(project);

  let statusText: string;
  if (due) {
    if (delta === 0) statusText = "Email due today";
    else
      statusText = `Overdue by ${Math.abs(delta)} day${Math.abs(delta) === 1 ? "" : "s"}`;
  } else {
    statusText =
      delta === 1 ? "Next email tomorrow" : `Next email in ${delta} days`;
  }

  return (
    <section
      className={`rounded-xl border p-4 shadow-sm transition ${
        due
          ? "border-amber-accent/50 bg-amber-accent/5"
          : "border-line bg-panel"
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span
            className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
              due
                ? "bg-amber-accent text-white"
                : "bg-teal-soft text-teal-accent"
            }`}
            aria-hidden
          >
            <svg viewBox="0 0 20 20" className="h-4 w-4 fill-current">
              <path d="M2 4.5A1.5 1.5 0 0 1 3.5 3h13A1.5 1.5 0 0 1 18 4.5v11a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 2 15.5v-11Zm1.5-.5a.5.5 0 0 0-.5.5v.3l7 4.2 7-4.2V4.5a.5.5 0 0 0-.5-.5h-13Zm13.5 2.4-6.6 4a1 1 0 0 1-1.1 0l-6.6-4V15.5a.5.5 0 0 0 .5.5h13a.5.5 0 0 0 .5-.5V6.4Z" />
            </svg>
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-sm font-bold uppercase tracking-wide text-deep">
                Client follow-up
              </h2>
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                  due
                    ? "bg-amber-accent/15 text-amber-accent"
                    : "bg-surface text-muted"
                }`}
              >
                Our action
              </span>
            </div>
            <p className={`mt-1 text-sm font-medium ${due ? "text-amber-accent" : "text-ink"}`}>
              {due ? `Email ${project.client}` : statusText}
            </p>
            <p className="mt-0.5 text-xs text-muted">
              {due ? `${statusText} · ` : ""}
              Last contact {formatDay(last)}
              {!due ? ` · due ${formatDay(next)}` : ""}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => markClientEmailed(project.id)}
          title="Set last contact to today and restart the reminder"
          className={`shrink-0 rounded-lg px-4 py-2 text-xs font-bold uppercase tracking-wide shadow-sm transition hover:brightness-105 ${
            due
              ? "bg-olive text-olive-ink"
              : "border border-line bg-surface text-deep hover:border-teal-accent/40"
          }`}
        >
          Mark emailed
        </button>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-muted">
            Last contact
          </span>
          <input
            type="date"
            value={last}
            onChange={(e) => {
              if (!e.target.value) return;
              updateProject(project.id, {
                lastClientContactAt: e.target.value,
              });
            }}
            className="rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-teal-accent"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-muted">
            Remind every (days)
          </span>
          <input
            type="number"
            min={1}
            step={1}
            value={project.emailReminderDays}
            onChange={(e) => {
              const n = Number(e.target.value);
              if (!Number.isFinite(n) || n < 1) return;
              updateProject(project.id, {
                emailReminderDays: Math.floor(n),
              });
            }}
            className="rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-teal-accent"
          />
        </label>
      </div>
    </section>
  );
}
