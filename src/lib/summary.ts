import { Project, STAGE_LABELS } from "./types";

const STAGE_PHRASES: Record<string, string> = {
  "to-contact": "a lead still to be contacted",
  "cold-lead": "a cold lead currently in contact",
  "hot-lead": "a hot lead with an offer sent",
  "under-development": "under active development",
  commissioned: "commissioned and operational",
  cancelled: "cancelled and no longer active",
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** Trim a comment down to a summary-friendly snippet (first sentence, max ~160 chars). */
function snippet(text: string): string {
  const clean = text.trim().replace(/\s+/g, " ");
  const firstSentence = clean.match(/^.*?[.!?](\s|$)/)?.[0]?.trim() ?? clean;
  const cut =
    firstSentence.length > 160
      ? firstSentence.slice(0, 157).trimEnd() + "..."
      : firstSentence;
  return cut.replace(/[.!?]+$/, "");
}

function lowerFirst(s: string): string {
  return s.charAt(0).toLowerCase() + s.slice(1);
}

/**
 * Builds a living summary paragraph for a project. It always starts from the
 * base description and is regenerated automatically from the most recent
 * comments and stage changes, so the summary stays current as the project
 * evolves without anyone having to rewrite it.
 */
export function generateSummary(project: Project): string {
  const parts: string[] = [];

  const base = project.baseDescription.trim();
  if (base) {
    parts.push(base.endsWith(".") || base.endsWith("!") || base.endsWith("?") ? base : base + ".");
  }

  parts.push(
    `The project is currently ${STAGE_PHRASES[project.stage]} (${project.sizeKw.toLocaleString()} kW ${project.series} for ${project.client}, ${project.city}, ${project.country}).`,
  );

  const sorted = [...project.comments].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  const lastStageChange = sorted.find((c) => c.stageChange);
  if (lastStageChange?.stageChange) {
    parts.push(
      `It moved to ${STAGE_LABELS[lastStageChange.stageChange]} on ${formatDate(lastStageChange.createdAt)}.`,
    );
  }

  const recent = sorted.slice(0, 2);
  if (recent.length > 0) {
    const [latest, previous] = recent;
    parts.push(
      `Latest update (${formatDate(latest.createdAt)}, ${latest.author}): ${lowerFirst(snippet(latest.text))}.`,
    );
    if (previous) {
      parts.push(`Previously: ${lowerFirst(snippet(previous.text))}.`);
    }
  } else {
    parts.push("No updates have been logged yet.");
  }

  return parts.join(" ");
}
