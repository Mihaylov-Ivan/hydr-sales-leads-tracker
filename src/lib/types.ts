export type Stage = "new-lead" | "under-development" | "commissioned";

export const STAGES: Stage[] = ["new-lead", "under-development", "commissioned"];

export const STAGE_LABELS: Record<Stage, string> = {
  "new-lead": "New Lead",
  "under-development": "Under Development",
  commissioned: "Commissioned",
};

export type Series = "Z Series" | "E Series" | "Custom";

export type Market =
  | "Cement"
  | "Power Plants"
  | "Funding"
  | "Clean H2"
  | "Burner Optimisation";

export const MARKETS: Market[] = [
  "Cement",
  "Power Plants",
  "Funding",
  "Clean H2",
  "Burner Optimisation",
];

export interface ProjectComment {
  id: string;
  text: string;
  author: string;
  createdAt: string; // ISO
  /** Present when the comment also moved the project to a new stage */
  stageChange?: Stage;
}

export type TodoKind = "question" | "our-action" | "client-action";

export const TODO_KINDS: TodoKind[] = ["question", "our-action", "client-action"];

export const TODO_KIND_LABELS: Record<TodoKind, string> = {
  question: "Questions to Clear",
  "our-action": "Action Items (Us)",
  "client-action": "Action Items (Client)",
};

export interface ProjectTodo {
  id: string;
  kind: TodoKind;
  text: string;
  /** The answer, for "question" items */
  answer?: string;
  done: boolean;
  /** Date (yyyy-mm-dd) the item should be completed by */
  dueDate?: string;
  createdAt: string; // ISO
  /** Set when the item was checked off */
  doneAt?: string; // ISO
}

export interface Project {
  id: string;
  name: string;
  client: string;
  country: string;
  city: string;
  series: Series;
  market: Market;
  /** Electrolyser system size in kW */
  sizeKw: number;
  stage: Stage;
  /** The original description written when the project was created */
  baseDescription: string;
  /** AI-generated living summary, refreshed after each new comment */
  aiSummary?: string;
  comments: ProjectComment[];
  todos: ProjectTodo[];
  createdAt: string; // ISO
}
