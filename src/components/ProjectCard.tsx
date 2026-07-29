"use client";

import Link from "next/link";
import { useRef } from "react";
import { Project } from "@/lib/types";
import { generateSummary } from "@/lib/summary";

export const PROJECT_DRAG_TYPE = "application/x-hydr-project-id";

export default function ProjectCard({ project }: { project: Project }) {
  const raw = project.aiSummary ?? generateSummary(project);
  const openTodos = project.todos.filter((t) => !t.done).length;
  // Flatten bullet-point summaries into a single line for the card preview
  const summary = raw
    .split("\n")
    .map((l) => l.trim().replace(/^[-•*]\s?/, ""))
    .filter(Boolean)
    .join(" ");

  const suppressClick = useRef(false);

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
      className="group flex cursor-grab flex-col gap-2.5 rounded-xl border border-line bg-panel p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-teal-accent/50 hover:shadow-md active:cursor-grabbing"
    >
      <div>
        <h3 className="font-semibold text-deep group-hover:text-teal-accent">
          {project.name}
        </h3>
        <p className="mt-0.5 text-sm text-muted">{project.client}</p>
      </div>

      <span className="w-fit rounded-full bg-teal-soft px-2 py-0.5 text-[11px] font-semibold text-teal-accent">
        {project.market}
      </span>

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
          {project.comments.length} update{project.comments.length === 1 ? "" : "s"}
        </span>
      </div>
    </Link>
  );
}
