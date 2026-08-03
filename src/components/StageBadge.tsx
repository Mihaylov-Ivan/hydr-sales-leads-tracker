import { Stage, STAGE_LABELS } from "@/lib/types";

const STYLES: Record<Stage, string> = {
  "to-contact": "bg-surface-tint text-deep border-line",
  "cold-lead": "bg-teal-soft text-teal-accent border-teal-accent/40",
  "hot-lead": "bg-amber-accent/10 text-amber-accent border-amber-accent/40",
  "under-development": "bg-olive/15 text-olive-ink border-olive/40",
  commissioned: "bg-green-accent/10 text-green-accent border-green-accent/40",
  cancelled: "bg-muted/10 text-muted border-line",
};

export default function StageBadge({ stage }: { stage: Stage }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-medium ${STYLES[stage]}`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {STAGE_LABELS[stage]}
    </span>
  );
}
