import { Resend } from "resend";

export type DailyBriefingRow = {
  id: string;
  briefing_type: string;
  period_start: string;
  period_end: string;
  title: string;
  summary: string;
  generated_at: string;
};

/** Calendar date in Europe/Sofia as yyyy-mm-dd. */
export function sofiaDateString(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Sofia",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/**
 * Extract the `## Project updates` section from a briefing summary.
 * Stops at the next `##` heading or end of text.
 */
export function extractProjectUpdatesSection(summary: string): string | null {
  const lines = summary.split(/\r?\n/);
  let collecting = false;
  const out: string[] = [];

  for (const raw of lines) {
    const line = raw.trimEnd();
    const heading = line.trim();
    if (/^##\s+project updates\s*$/i.test(heading)) {
      collecting = true;
      out.push("## Project updates");
      continue;
    }
    if (collecting && /^##\s+\S/.test(heading)) break;
    if (collecting) out.push(line);
  }

  const text = out.join("\n").trim();
  if (!text || text === "## Project updates") return null;
  return text;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Convert the Project updates markdown fragment to simple email HTML. */
export function projectUpdatesToHtml(section: string): string {
  const lines = section.split(/\r?\n/);
  const parts: string[] = [
    '<div style="font-family:Segoe UI,Helvetica,Arial,sans-serif;font-size:14px;line-height:1.55;color:#1a1a1a;">',
  ];
  let inList = false;

  const closeList = () => {
    if (!inList) return;
    parts.push("</ul>");
    inList = false;
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      closeList();
      continue;
    }
    if (/^##\s+/.test(line)) {
      closeList();
      parts.push(
        `<h2 style="margin:0 0 12px;font-size:18px;color:#0f3d3e;">${escapeHtml(
          line.replace(/^##\s+/, ""),
        )}</h2>`,
      );
      continue;
    }
    if (line.startsWith("- ")) {
      if (!inList) {
        parts.push('<ul style="margin:0 0 12px;padding-left:20px;">');
        inList = true;
      }
      parts.push(`<li style="margin:0 0 6px;">${escapeHtml(line.slice(2))}</li>`);
      continue;
    }
    closeList();
    parts.push(`<p style="margin:0 0 10px;">${escapeHtml(line)}</p>`);
  }
  closeList();
  parts.push("</div>");
  return parts.join("");
}

export type SendProjectUpdatesResult =
  | { ok: true; emailId: string; briefingId: string; periodEnd: string }
  | { ok: false; error: string; status?: number };

export async function sendDailyProjectUpdatesEmail(
  briefing: DailyBriefingRow,
): Promise<SendProjectUpdatesResult> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    return { ok: false, error: "RESEND_API_KEY is not configured.", status: 503 };
  }

  const section = extractProjectUpdatesSection(briefing.summary);
  if (!section) {
    return {
      ok: false,
      error:
        "Daily briefing has no usable ## Project updates section to email.",
      status: 422,
    };
  }

  const from =
    process.env.BRIEFING_EMAIL_FROM?.trim() ||
    "CRM Briefing <onboarding@resend.dev>";
  const to =
    process.env.BRIEFING_EMAIL_TO?.trim() || "i.mihaylov@hydrogenera.eu";
  const dateLabel = briefing.period_end.slice(0, 10);
  const subject =
    process.env.BRIEFING_EMAIL_SUBJECT?.trim() ||
    `CRM Project Updates — ${dateLabel}`;

  const resend = new Resend(apiKey);
  const { data, error } = await resend.emails.send(
    {
      from,
      to: [to],
      subject,
      html: projectUpdatesToHtml(section),
      text: section,
    },
    {
      idempotencyKey: `crm-daily-project-updates/${briefing.id}`,
    },
  );

  if (error) {
    return {
      ok: false,
      error: error.message || "Resend failed to send the briefing email.",
      status: 502,
    };
  }

  return {
    ok: true,
    emailId: data?.id ?? "",
    briefingId: briefing.id,
    periodEnd: dateLabel,
  };
}
