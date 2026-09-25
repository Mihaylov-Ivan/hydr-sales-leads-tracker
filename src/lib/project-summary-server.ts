import type { Project } from "@/lib/types";
import { STAGE_LABELS, trackOfProject } from "@/lib/types";

const BASE_URL = (
  process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1"
).replace(/\/$/, "");
const MODEL = process.env.OPENAI_MODEL ?? "gpt-5.4-mini";

export interface ProjectSummaryInput {
  id: string;
  name: string;
  client: string;
  country: string;
  city: string;
  series: string;
  market: string;
  sizeKw: number;
  stage: string;
  track?: string;
  baseDescription: string;
  lastMeaningfulActivityAt?: string | null;
  comments: Array<{
    text: string;
    author?: string | null;
    createdAt: string;
    stageChange?: string | null;
  }>;
  todos: Array<{
    text: string;
    answer?: string | null;
    done: boolean;
    dueDate?: string | null;
    startDate?: string | null;
    endDate?: string | null;
    ownerUserId?: string | null;
    createdAt?: string | null;
    doneAt?: string | null;
  }>;
  contacts: Array<{
    name?: string | null;
    email?: string | null;
    phone?: string | null;
    position?: string | null;
  }>;
  files: Array<{
    name: string;
    kind?: string | null;
    note?: string | null;
    createdAt?: string | null;
  }>;
  schedule: {
    phases: Array<{
      name: string;
      startDate: string;
      durationDays: number;
      actualStartDate?: string | null;
      actualDurationDays?: number | null;
      owner?: string | null;
      wbs?: string | null;
    }>;
    activities: Array<{
      name: string;
      phaseId?: string | null;
      startDate: string;
      durationDays: number;
      actualStartDate?: string | null;
      actualDurationDays?: number | null;
      owner?: string | null;
      wbs?: string | null;
      status?: string | null;
    }>;
    deadlines: Array<{
      name: string;
      phaseId?: string | null;
      date: string;
      actualDate?: string | null;
      owner?: string | null;
      wbs?: string | null;
      note?: string | null;
    }>;
  };
}

export function summaryInputFromProject(project: Project): ProjectSummaryInput {
  return {
    id: project.id,
    name: project.name,
    client: project.client,
    country: project.country,
    city: project.city,
    series: project.series,
    market: project.market,
    sizeKw: project.sizeKw,
    stage: project.stage,
    track: trackOfProject(project),
    baseDescription: project.baseDescription,
    lastMeaningfulActivityAt: project.lastMeaningfulActivityAt,
    comments: (project.comments ?? []).map((comment) => ({
      text: comment.text,
      author: comment.author,
      createdAt: comment.createdAt,
      stageChange: comment.stageChange ?? null,
    })),
    todos: (project.todos ?? []).map((todo) => ({
      text: todo.text,
      answer: todo.answer ?? null,
      done: todo.done,
      dueDate: todo.dueDate ?? null,
      startDate: todo.startDate ?? null,
      endDate: todo.endDate ?? null,
      ownerUserId: todo.ownerUserId ?? null,
      createdAt: todo.createdAt,
      doneAt: todo.doneAt ?? null,
    })),
    contacts: (project.contacts ?? []).map((contact) => ({
      name: contact.name ?? null,
      email: contact.email ?? null,
      phone: contact.phone ?? null,
      position: contact.position ?? null,
    })),
    files: (project.files ?? []).map((file) => ({
      name: file.name,
      kind: file.kind,
      note: file.note ?? null,
      createdAt: file.createdAt,
    })),
    schedule: {
      phases: (project.schedule?.phases ?? []).map((phase) => ({
        name: phase.name,
        startDate: phase.startDate,
        durationDays: phase.durationDays,
        actualStartDate: phase.actualStartDate ?? null,
        actualDurationDays: phase.actualDurationDays ?? null,
        owner: phase.owner ?? null,
        wbs: phase.wbs ?? null,
      })),
      activities: (project.schedule?.activities ?? []).map((activity) => ({
        name: activity.name,
        phaseId: activity.phaseId,
        startDate: activity.startDate,
        durationDays: activity.durationDays,
        actualStartDate: activity.actualStartDate ?? null,
        actualDurationDays: activity.actualDurationDays ?? null,
        owner: activity.owner ?? null,
        wbs: activity.wbs ?? null,
        status: activity.status ?? null,
      })),
      deadlines: (project.schedule?.deadlines ?? []).map((deadline) => ({
        name: deadline.name,
        phaseId: deadline.phaseId,
        date: deadline.date,
        actualDate: deadline.actualDate ?? null,
        owner: deadline.owner ?? null,
        wbs: deadline.wbs ?? null,
        note: deadline.note ?? null,
      })),
    },
  };
}

function line(value: unknown): string {
  if (value == null || value === "") return "—";
  return String(value);
}

export function buildProjectSummaryPrompt(project: ProjectSummaryInput): string {
  const comments = [...project.comments]
    .sort(
      (a, b) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    )
    .map((comment) => {
      const date = comment.createdAt.slice(0, 10);
      const stage = comment.stageChange
        ? ` [stage -> ${STAGE_LABELS[comment.stageChange as keyof typeof STAGE_LABELS] ?? comment.stageChange}]`
        : "";
      return `- ${date}${stage}: ${comment.text}`;
    })
    .join("\n");

  const tasks = [...project.todos]
    .sort((a, b) => {
      if (a.done !== b.done) return a.done ? 1 : -1;
      return (a.dueDate ?? "9999-12-31").localeCompare(
        b.dueDate ?? "9999-12-31",
      );
    })
    .map(
      (todo) =>
        `- [${todo.done ? "done" : "open"}] ${todo.text}` +
        (todo.dueDate ? ` | due ${todo.dueDate}` : "") +
        (todo.startDate ? ` | start ${todo.startDate}` : "") +
        (todo.endDate ? ` | end ${todo.endDate}` : "") +
        (todo.answer ? ` | resolution: ${todo.answer}` : ""),
    )
    .join("\n");

  const contacts = project.contacts
    .map(
      (contact) =>
        `- ${line(contact.name)} | ${line(contact.position)} | ${line(contact.email)} | ${line(contact.phone)}`,
    )
    .join("\n");

  const files = project.files
    .map(
      (file) =>
        `- ${file.name}${file.kind ? ` [${file.kind}]` : ""}${file.note ? `: ${file.note}` : ""}`,
    )
    .join("\n");

  const phases = project.schedule.phases
    .map(
      (phase) =>
        `- ${phase.name}: planned ${phase.startDate} for ${phase.durationDays}d` +
        (phase.actualStartDate ? ` | actual start ${phase.actualStartDate}` : "") +
        (phase.owner ? ` | owner ${phase.owner}` : ""),
    )
    .join("\n");

  const activities = project.schedule.activities
    .map(
      (activity) =>
        `- ${activity.name}: ${activity.startDate} for ${activity.durationDays}d` +
        (activity.status ? ` | ${activity.status}` : "") +
        (activity.owner ? ` | owner ${activity.owner}` : ""),
    )
    .join("\n");

  const deadlines = project.schedule.deadlines
    .map(
      (deadline) =>
        `- ${deadline.name}: ${deadline.date}` +
        (deadline.actualDate ? ` | actual ${deadline.actualDate}` : "") +
        (deadline.owner ? ` | owner ${deadline.owner}` : "") +
        (deadline.note ? ` | ${deadline.note}` : ""),
    )
    .join("\n");

  return `Project: ${project.name}
Client: ${project.client}
Location: ${[project.city, project.country].filter(Boolean).join(", ")}
Track: ${project.track ?? "sales"}
System: ${project.sizeKw > 0 ? `${project.sizeKw} kW ` : ""}${project.series}
Market: ${project.market}
Current stage: ${STAGE_LABELS[project.stage as keyof typeof STAGE_LABELS] ?? project.stage}
Last meaningful activity: ${project.lastMeaningfulActivityAt ?? "—"}

Original/current project description:
${project.baseDescription || "(none)"}

CRM update history, chronological:
${comments || "(none)"}

Project action items:
${tasks || "(none)"}

Project contacts:
${contacts || "(none)"}

Project file metadata:
${files || "(none)"}

Schedule phases:
${phases || "(none)"}

Schedule activities:
${activities || "(none)"}

Schedule deadlines:
${deadlines || "(none)"}`;
}

export async function generateProjectSummary(
  project: ProjectSummaryInput,
): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new Error("OPENAI_API_KEY is not configured");

  const response = await fetch(`${BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        {
          role: "system",
          content:
            "You maintain the stored current-state project summary for Hydrogenera's CRM. " +
            "Use ONLY the CRM data supplied in the prompt. Do not use external knowledge and do not invent missing facts. " +
            "Output 4-8 concise bullet points describing the current state, not a history recap. " +
            "Prioritize: project/client and scope, latest technical/commercial requirements recorded in CRM, current stage/status, " +
            "material open action items, upcoming dates/deadlines, and genuine blockers/uncertainties. " +
            "When later CRM updates clearly supersede earlier statements, state only the latest value. " +
            "If the CRM itself still contains an unresolved material contradiction, state that briefly rather than choosing one side. " +
            "Do not expose finance or warehouse information; those datasets are intentionally not provided to this summarizer. " +
            "Do not treat the existing AI summary as source data. Output plain text lines beginning with '- ' only.",
        },
        { role: "user", content: buildProjectSummaryPrompt(project) },
      ],
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(
      `Project summary request failed (${response.status}): ${detail.slice(0, 500)}`,
    );
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const summary = data.choices?.[0]?.message?.content?.trim();
  if (!summary) throw new Error("Project summary model returned an empty response");
  return summary;
}
