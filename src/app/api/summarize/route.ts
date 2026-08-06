import { NextResponse } from "next/server";
import { Project, STAGE_LABELS } from "@/lib/types";

const BASE_URL = process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1";
const MODEL = process.env.OPENAI_MODEL ?? "gpt-5.4-mini";

/** Lets the client check whether AI summaries are configured. */
export async function GET() {
  return NextResponse.json({ enabled: Boolean(process.env.OPENAI_API_KEY) });
}

function buildPrompt(project: Project): string {
  const comments = [...project.comments]
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    .map((c) => {
      const date = new Date(c.createdAt).toISOString().slice(0, 10);
      const stage = c.stageChange
        ? ` [stage changed to: ${STAGE_LABELS[c.stageChange]}]`
        : "";
      return `- ${date}${stage}: ${c.text}`;
    })
    .join("\n");

  return `Project: ${project.name}
Client: ${project.client}
Location: ${project.city}, ${project.country}
System: ${project.sizeKw > 0 ? `${project.sizeKw} kW ` : ""}${project.series} electrolyser
Current stage: ${STAGE_LABELS[project.stage]}

Original description:
${project.baseDescription || "(none)"}

Update history (chronological):
${comments || "(no updates yet)"}`;
}

export async function POST(req: Request) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "AI is not configured" }, { status: 503 });
  }

  const project = (await req.json()) as Project;

  const res = await fetch(`${BASE_URL}/chat/completions`, {
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
            "You maintain status summaries for a sales engineer's electrolyser project tracker at Hydrogenera. " +
            "Given a project's details and its full update history, output 3-6 bullet points describing ONLY the current state of the project: " +
            "what it is and for whom, the key system facts (size, series), the current stage/status, and any stated next steps or open items. " +
            "Each bullet is one short, concise sentence. " +
            "Never describe history or changes — if an update changed a fact (e.g. system size changed from 250 to 500 kW), state only the latest value (500 kW) with no mention of the change. " +
            "When updates contradict the original facts, the most recent update wins. " +
            "Output plain text lines starting with '- '. No headings, no preamble, no markdown formatting other than the dashes. Do not invent facts that are not in the input.",
        },
        { role: "user", content: buildPrompt(project) },
      ],
    }),
  });

  if (!res.ok) {
    const detail = await res.text();
    console.error("Summarize API error:", res.status, detail);
    return NextResponse.json(
      { error: `AI request failed (${res.status})` },
      { status: 502 },
    );
  }

  const data = await res.json();
  const summary: string | undefined = data.choices?.[0]?.message?.content?.trim();
  if (!summary) {
    return NextResponse.json({ error: "Empty AI response" }, { status: 502 });
  }

  return NextResponse.json({ summary });
}
