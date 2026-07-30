"use client";

import Link from "next/link";
import { useRef } from "react";
import { Project, isEmailReminderDue } from "@/lib/types";
import { generateSummary } from "@/lib/summary";
import { useProjects } from "@/lib/store";

export const PROJECT_DRAG_TYPE = "application/x-hydr-project-id";

export default function ProjectCard({ project }: { project: Project }) {
  const { teamMembers } = useProjects();
  const raw = project.aiSummary ?? generateSummary(project);
  const openTodos = project.todos.filter((t) => !t.done).length;
  const emailDue = isEmailReminderDue(project);
  // Flatten bullet-point summaries into a single line for the card preview
  const summary = raw
    .split("\n")
    .map((l) => l.trim().replace(/^[-•*]\s?/, ""))
    .filter(Boolean)
    .join(" ");

  const suppressClick = useRef(false);
  const lead = teamMembers.find((m) => m.id === project.leadUserId);

  return (
    <Link
      href={`/projects/${project.id}`}
      draggable
      onDragStart={(e) => {
        suppressClick.current = true;
        e.dataTransfer.setData(PROJECT_DRAG_TYPE, project.id);
        e.dataTransfer.setData("text/plain", project.id);
        e.dataTransfer.effectAllowed = "move";
        if (e.currentTarget instanceof HTMLElement) {
          e.currentTarget.style.opacity = "0.45";
        }
      }}
      onDragEnd={(e) => {
        if (e.currentTarget instanceof HTMLElement) {
          e.currentTarget.style.opacity = "";
        }
        // Click fires after dragEnd in some browsers — clear on next tick
        window.setTimeout(() => {
          suppressClick.current = false;
        }, 0);
      }}
      onClick={(e) => {
        if (suppressClick.current) {
          e.preventDefault();
          suppressClick.current = false;
        }
      }}
      className={`group flex cursor-grab flex-col gap-2.5 rounded-xl border bg-panel p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md active:cursor-grabbing ${
        emailDue
          ? "border-amber-accent/40 hover:border-amber-accent/70"
          : "border-line hover:border-teal-accent/50"
      }`}
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-deep group-hover:text-teal-accent">
            {project.name}
          </h3>
          <p className="mt-0.5 text-sm text-muted">{project.client}</p>
        </div>
        {emailDue && (
          <span
            title="Client follow-up due"
            className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-accent/15 px-2 py-1 text-[11px] font-semibold text-amber-accent"
          >
            <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 fill-current">
              <path d="M1.5 3.5A1.5 1.5 0 0 1 3 2h10a1.5 1.5 0 0 1 1.5 1.5v9A1.5 1.5 0 0 1 13 14H3a1.5 1.5 0 0 1-1.5-1.5v-9Zm1.5-.5a.5.5 0 0 0-.5.5v.25l5.25 3.15a.5.5 0 0 0 .5 0L13.5 3.75V3.5a.5.5 0 0 0-.5-.5H3Zm10.5 2.1-4.9 2.94a1.5 1.5 0 0 1-1.5 0L2.2 5.1v7.4a.5.5 0 0 0 .5.5h10a.5.5 0 0 0 .5-.5V5.1Z" />
            </svg>
            Contact
          </span>
        )}
      </div>

      <span className="w-fit rounded-full bg-teal-soft px-2 py-0.5 text-[11px] font-semibold text-teal-accent">
        {project.market}
      </span>
      {lead && (
        <span className="w-fit rounded-full bg-surface px-2 py-0.5 text-[11px] font-semibold text-muted">
          Lead: {lead.name}
        </span>
      )}

      <p className="line-clamp-3 text-sm leading-relaxed text-muted">
        {summary}
      </p>

      <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 pt-1 text-xs text-muted">
        <span className="inline-flex items-center gap-1">
          <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 fill-current opacity-70">
            <path d="M8 0a5.5 5.5 0 0 0-5.5 5.5C2.5 9.6 8 16 8 16s5.5-6.4 5.5-10.5A5.5 5.5 0 0 0 8 0Zm0 7.5a2 2 0 1 1 0-4 2 2 0 0 1 0 4Z" />
          </svg>
          {project.city}, {project.country}
        </span>
        <span className="font-semibold text-teal-accent">
          {project.sizeKw.toLocaleString()} kW
        </span>
        <span>{project.series}</span>
        <span className="ml-auto flex items-center gap-2">
          {openTodos > 0 && (
            <span
              title={`${openTodos} open to-do${openTodos === 1 ? "" : "s"}`}
              className="inline-flex items-center gap-1 rounded-full bg-olive/15 px-2 py-0.5 font-semibold text-olive-ink"
            >
              <svg viewBox="0 0 16 16" className="h-3 w-3 fill-current opacity-70">
                <path d="M13.5 2.5 6 10 2.5 6.5l-1 1L6 12l8.5-8.5-1-1Z" />
              </svg>
              {openTodos}
            </span>
          )}
          {project.comments.length} update
          {project.comments.length === 1 ? "" : "s"}
        </span>
      </div>
    </Link>
  );
}
