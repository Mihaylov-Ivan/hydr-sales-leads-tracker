export type Stage = "new-lead" | "under-development" | "commissioned";

export const STAGES: Stage[] = ["new-lead", "under-development", "commissioned"];

export const STAGE_LABELS: Record<Stage, string> = {
  "new-lead": "New Lead",
  "under-development": "Under Development",
  commissioned: "Commissioned",
};

export type Series = "Z Series" | "E Series" | "Custom";

export interface ProjectComment {
  id: string;
  text: string;
  author: string;
  createdAt: string; // ISO
  /** Present when the comment also moved the project to a new stage */
  stageChange?: Stage;
}

export interface Project {
  id: string;
  name: string;
  client: string;
  country: string;
  city: string;
  series: Series;
  /** Electrolyser system size in kW */
  sizeKw: number;
  stage: Stage;
  /** The original description written when the project was created */
  baseDescription: string;
  /** AI-generated living summary, refreshed after each new comment */
  aiSummary?: string;
  comments: ProjectComment[];
  createdAt: string; // ISO
}
