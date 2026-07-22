import Link from "next/link";
import { Project } from "@/lib/types";
import { generateSummary } from "@/lib/summary";

export default function ProjectCard({ project }: { project: Project }) {
  const raw = project.aiSummary ?? generateSummary(project);
  // Flatten bullet-point summaries into a single line for the card preview
  const summary = raw
    .split("\n")
    .map((l) => l.trim().replace(/^[-•*]\s?/, ""))
    .filter(Boolean)
    .join(" ");

  return (
    <Link
      href={`/projects/${project.id}`}
      className="group flex flex-col gap-2.5 rounded-xl border border-line bg-panel p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-teal-accent/50 hover:shadow-md"
    >
      <div>
        <h3 className="font-semibold text-deep group-hover:text-teal-accent">
          {project.name}
        </h3>
        <p className="mt-0.5 text-sm text-muted">{project.client}</p>
      </div>

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
        <span className="ml-auto">
          {project.comments.length} update{project.comments.length === 1 ? "" : "s"}
        </span>
      </div>
    </Link>
  );
}
