import { NextResponse } from "next/server";
import { isProjectSummaryEnabled } from "@/lib/summary";
import type { Project } from "@/lib/types";
import {
  generateProjectSummary,
  summaryInputFromProject,
} from "@/lib/project-summary-server";

/** Lets the client check whether AI summaries are configured and feature-flagged on. */
export async function GET() {
  return NextResponse.json({
    enabled:
      isProjectSummaryEnabled() && Boolean(process.env.OPENAI_API_KEY),
  });
}

export async function POST(req: Request) {
  if (!isProjectSummaryEnabled()) {
    return NextResponse.json(
      { error: "AI project summaries are disabled" },
      { status: 503 },
    );
  }

  if (!process.env.OPENAI_API_KEY?.trim()) {
    return NextResponse.json({ error: "AI is not configured" }, { status: 503 });
  }

  let project: Project;
  try {
    project = (await req.json()) as Project;
  } catch {
    return NextResponse.json({ error: "Invalid project payload" }, { status: 400 });
  }

  try {
    const summary = await generateProjectSummary(summaryInputFromProject(project));
    return NextResponse.json({ summary });
  } catch (error) {
    console.error("Summarize API error:", error);
    return NextResponse.json(
      { error: "AI summary request failed" },
      { status: 502 },
    );
  }
}
