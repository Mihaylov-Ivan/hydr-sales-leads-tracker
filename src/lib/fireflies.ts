import { createServiceClient } from "@/lib/supabase-server";

const FIREFLIES_GRAPHQL_URL = "https://api.fireflies.ai/graphql";
const PAGE_SIZE = 50;

interface FirefliesTranscriptListItem {
  id: string;
  title?: string | null;
  date?: number | string | null;
}

interface FirefliesSentence {
  index?: number | null;
  speaker_name?: string | null;
  speaker_id?: number | string | null;
  text?: string | null;
  raw_text?: string | null;
  start_time?: number | null;
  end_time?: number | null;
}

interface FirefliesTranscript {
  id: string;
  title?: string | null;
  date?: number | string | null;
  host_email?: string | null;
  organizer_email?: string | null;
  participants?: string[] | null;
  meeting_attendees?: Array<Record<string, unknown>> | null;
  transcript_url?: string | null;
  sentences?: FirefliesSentence[] | null;
  summary?: Record<string, unknown> | null;
}

interface GraphqlEnvelope<T> {
  data?: T;
  errors?: Array<{ message?: string }>;
}

export interface FirefliesSyncResult {
  discovered: number;
  imported: number;
  already_present: number;
  import_limit: number;
  lookback_days: number;
}

function apiKey(): string {
  const value = process.env.FIREFLIES_API_KEY?.trim();
  if (!value) {
    throw new Error("FIREFLIES_API_KEY is not configured.");
  }
  return value;
}

function intEnv(name: string, fallback: number, min: number, max: number): number {
  const raw = Number(process.env[name]);
  if (!Number.isFinite(raw)) return fallback;
  return Math.min(max, Math.max(min, Math.round(raw)));
}

async function graphql<T>(
  query: string,
  variables: Record<string, unknown>,
): Promise<T> {
  const response = await fetch(FIREFLIES_GRAPHQL_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey()}`,
    },
    body: JSON.stringify({ query, variables }),
    cache: "no-store",
  });

  const payload = (await response.json().catch(() => null)) as
    | GraphqlEnvelope<T>
    | null;

  if (!response.ok) {
    throw new Error(`Fireflies API request failed (${response.status}).`);
  }
  if (!payload) {
    throw new Error("Fireflies API returned an invalid response.");
  }
  if (payload.errors?.length) {
    const message = payload.errors
      .map((item) => item.message)
      .filter(Boolean)
      .join("; ");
    throw new Error(message || "Fireflies API returned a GraphQL error.");
  }
  if (!payload.data) {
    throw new Error("Fireflies API returned no data.");
  }
  return payload.data;
}

function meetingDateIso(value: number | string | null | undefined): string | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    const milliseconds = value < 100_000_000_000 ? value * 1000 : value;
    const date = new Date(milliseconds);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
  if (typeof value === "string" && value.trim()) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
  return null;
}

function transcriptText(sentences: FirefliesSentence[] | null | undefined): string {
  return (sentences ?? [])
    .map((sentence) => {
      const text = sentence.text?.trim() || sentence.raw_text?.trim();
      if (!text) return "";
      const speaker = sentence.speaker_name?.trim() || "Speaker";
      return `${speaker}: ${text}`;
    })
    .filter(Boolean)
    .join("\n");
}

async function listRecentTranscripts(
  fromDate: string,
): Promise<FirefliesTranscriptListItem[]> {
  const query = `
    query HydrRecentTranscripts($fromDate: DateTime, $limit: Int, $skip: Int) {
      transcripts(fromDate: $fromDate, limit: $limit, skip: $skip) {
        id
        title
        date
      }
    }
  `;

  const all: FirefliesTranscriptListItem[] = [];
  for (let page = 0; page < 20; page += 1) {
    const skip = page * PAGE_SIZE;
    const data = await graphql<{ transcripts?: FirefliesTranscriptListItem[] }>(
      query,
      { fromDate, limit: PAGE_SIZE, skip },
    );
    const batch = data.transcripts ?? [];
    all.push(...batch.filter((item) => Boolean(item?.id)));
    if (batch.length < PAGE_SIZE) break;
  }
  return all;
}

async function getTranscript(id: string): Promise<FirefliesTranscript> {
  const query = `
    query HydrTranscript($transcriptId: String!) {
      transcript(id: $transcriptId) {
        id
        title
        date
        host_email
        organizer_email
        participants
        transcript_url
        meeting_attendees {
          displayName
          email
          phoneNumber
          name
          location
        }
        sentences {
          index
          speaker_name
          speaker_id
          text
          raw_text
          start_time
          end_time
        }
        summary {
          keywords
          action_items
          outline
          overview
          bullet_gist
          gist
          short_summary
          short_overview
          meeting_type
          topics_discussed
        }
      }
    }
  `;
  const data = await graphql<{ transcript?: FirefliesTranscript }>(query, {
    transcriptId: id,
  });
  if (!data.transcript?.id) {
    throw new Error(`Fireflies transcript ${id} was not found.`);
  }
  return data.transcript;
}

export async function syncFirefliesMeetings(): Promise<FirefliesSyncResult> {
  const lookbackDays = intEnv("FIREFLIES_IMPORT_LOOKBACK_DAYS", 30, 1, 3650);
  const importLimit = intEnv("FIREFLIES_IMPORT_BATCH_SIZE", 10, 1, 50);
  const fromDate = new Date(
    Date.now() - lookbackDays * 24 * 60 * 60 * 1000,
  ).toISOString();

  const discovered = await listRecentTranscripts(fromDate);
  const unique = Array.from(
    new Map(discovered.map((item) => [item.id, item])).values(),
  );

  const db = createServiceClient();
  const ids = unique.map((item) => item.id);
  const existingIds = new Set<string>();

  for (let offset = 0; offset < ids.length; offset += 100) {
    const chunk = ids.slice(offset, offset + 100);
    if (chunk.length === 0) continue;
    const { data, error } = await db
      .from("fireflies_meeting_inbox")
      .select("fireflies_transcript_id")
      .in("fireflies_transcript_id", chunk);
    if (error) {
      throw new Error(`Could not read Fireflies meeting inbox: ${error.message}`);
    }
    for (const row of data ?? []) {
      if (typeof row.fireflies_transcript_id === "string") {
        existingIds.add(row.fireflies_transcript_id);
      }
    }
  }

  const missing = unique
    .filter((item) => !existingIds.has(item.id))
    .sort((a, b) => {
      const aTime = meetingDateIso(a.date)
        ? new Date(meetingDateIso(a.date) as string).getTime()
        : Number.MAX_SAFE_INTEGER;
      const bTime = meetingDateIso(b.date)
        ? new Date(meetingDateIso(b.date) as string).getTime()
        : Number.MAX_SAFE_INTEGER;
      return aTime - bTime;
    })
    .slice(0, importLimit);

  let imported = 0;
  for (const item of missing) {
    const transcript = await getTranscript(item.id);
    const now = new Date().toISOString();
    const row = {
      fireflies_transcript_id: transcript.id,
      title: transcript.title?.trim() || "Untitled meeting",
      meeting_date: meetingDateIso(transcript.date),
      host_email: transcript.host_email?.trim() || null,
      organizer_email: transcript.organizer_email?.trim() || null,
      participants: transcript.participants ?? [],
      attendees: transcript.meeting_attendees ?? [],
      transcript_url: transcript.transcript_url?.trim() || null,
      transcript_text: transcriptText(transcript.sentences),
      sentences: transcript.sentences ?? [],
      summary: transcript.summary ?? {},
      status: "pending",
      imported_at: now,
      updated_at: now,
    };

    const { error } = await db
      .from("fireflies_meeting_inbox")
      .upsert(row, {
        onConflict: "fireflies_transcript_id",
        ignoreDuplicates: true,
      });
    if (error) {
      throw new Error(
        `Could not store Fireflies transcript ${transcript.id}: ${error.message}`,
      );
    }
    imported += 1;
  }

  return {
    discovered: unique.length,
    imported,
    already_present: existingIds.size,
    import_limit: importLimit,
    lookback_days: lookbackDays,
  };
}
