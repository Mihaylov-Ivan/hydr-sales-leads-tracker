"use client";

import { useEffect } from "react";
import {
  Project,
  addDays,
  daysBetween,
  userEmailReminderDeltaDays,
  isUserEmailReminderDue,
  lastContactDateForUserReminder,
  nextEmailReminderDateForUser,
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
  const {
    markClientContacted,
    getProjectUserReminder,
    updateProjectUserReminder,
    ensureProjectUserReminder,
    currentUserId,
  } = useProjects();

  useEffect(() => {
    if (!currentUserId) return;
    ensureProjectUserReminder(project.id);
  }, [currentUserId, project.id, ensureProjectUserReminder]);

  const reminder = getProjectUserReminder(project.id, currentUserId);
  const enabled = reminder.emailReminderEnabled === true;
  const due = Boolean(currentUserId) && isUserEmailReminderDue(reminder);
  const delta = userEmailReminderDeltaDays(reminder);
  const last = lastContactDateForUserReminder(reminder);
  const next = nextEmailReminderDateForUser(reminder);

  let statusText: string;
  if (!currentUserId) {
    statusText = "Sign in to manage your reminders";
  } else if (!enabled) {
    statusText = "Your reminders disabled";
  } else if (due) {
    if (delta === 0) statusText = "Follow-up due today";
    else
      statusText = `Overdue by ${Math.abs(delta)} day${Math.abs(delta) === 1 ? "" : "s"}`;
  } else {
    statusText =
      delta === 1
        ? "Next follow-up tomorrow"
        : `Next follow-up in ${delta} days`;
  }

  const setLastContact = (value: string) => {
    if (!value) return;
    updateProjectUserReminder(project.id, {
      lastClientContactAt: value,
    });
  };

  const setRemindInDays = (days: number) => {
    if (!Number.isFinite(days) || days < 1) return;
    updateProjectUserReminder(project.id, {
      emailReminderDays: Math.floor(days),
    });
  };

  /** Keep days and next follow-up date aligned from last contact. */
  const setNextFollowUp = (value: string) => {
    if (!value) return;
    const days = Math.max(1, daysBetween(last, value));
    updateProjectUserReminder(project.id, {
      emailReminderDays: days,
    });
  };

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
                : enabled
                  ? "bg-teal-soft text-teal-accent"
                  : "bg-surface text-muted"
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
                My client follow-up
              </h2>
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                  due
                    ? "bg-amber-accent/15 text-amber-accent"
                    : enabled
                      ? "bg-surface text-muted"
                      : "bg-surface text-muted/70"
                }`}
              >
                {enabled ? "Your reminder" : "Paused"}
              </span>
            </div>
            <p
              className={`mt-1 text-sm font-medium ${
                due ? "text-amber-accent" : "text-ink"
              }`}
            >
              {due ? `Contact ${project.client}` : statusText}
            </p>
            <p className="mt-0.5 text-xs text-muted">
              {due ? `${statusText} · ` : ""}
              Last contact {formatDay(last)}
              {enabled && !due ? ` · due ${formatDay(next)}` : ""}
            </p>
          </div>
        </div>

        <button
          type="button"
          disabled={!currentUserId}
          onClick={() => markClientContacted(project.id)}
          title="Set last contact to today and restart your reminder"
          className={`shrink-0 rounded-lg px-4 py-2 text-xs font-bold uppercase tracking-wide shadow-sm transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-40 ${
            due
              ? "bg-olive text-olive-ink"
              : "border border-line bg-surface text-deep hover:border-teal-accent/40"
          }`}
        >
          Contacted
        </button>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-muted">
            Last contact date
          </span>
          <input
            type="date"
            disabled={!currentUserId}
            value={last}
            onChange={(e) => setLastContact(e.target.value)}
            className="rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-teal-accent disabled:cursor-not-allowed disabled:opacity-50"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-muted">
            Next follow-up date
          </span>
          <input
            type="date"
            disabled={!enabled || !currentUserId}
            min={addDays(last, 1)}
            value={next}
            onChange={(e) => setNextFollowUp(e.target.value)}
            className="rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-teal-accent disabled:cursor-not-allowed disabled:opacity-50"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-muted">
            Remind in (days)
          </span>
          <input
            type="number"
            min={1}
            step={1}
            disabled={!enabled || !currentUserId}
            value={reminder.emailReminderDays}
            onChange={(e) => setRemindInDays(Number(e.target.value))}
            className="rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-teal-accent disabled:cursor-not-allowed disabled:opacity-50"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-muted">
            Your reminders
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={enabled}
            disabled={!currentUserId}
            onClick={() =>
              updateProjectUserReminder(project.id, {
                emailReminderEnabled: !enabled,
              })
            }
            className={`flex h-[38px] items-center justify-between rounded-lg border px-3 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${
              enabled
                ? "border-teal-accent/40 bg-teal-soft/60 text-teal-accent"
                : "border-line bg-surface text-muted"
            }`}
          >
            <span>{enabled ? "Enabled" : "Disabled"}</span>
            <span
              className={`relative h-5 w-9 rounded-full transition ${
                enabled ? "bg-teal-accent" : "bg-line"
              }`}
              aria-hidden
            >
              <span
                className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition ${
                  enabled ? "left-4" : "left-0.5"
                }`}
              />
            </span>
          </button>
        </label>
      </div>
    </section>
  );
}
