import { NextRequest, NextResponse } from "next/server";
import {
  AUTH_COOKIE,
  isAuthEnabled,
  parseSessionToken,
  sessionUserFromPayload,
} from "@/lib/auth";
import { isViewerUser } from "@/lib/permissions";

export const runtime = "nodejs";

const BASE_URL = (
  process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1"
).replace(/\/$/, "");
const REALTIME_MODEL =
  process.env.OPENAI_REALTIME_MODEL ?? "gpt-realtime-2.1";
const REALTIME_VOICE = process.env.OPENAI_REALTIME_VOICE ?? "marin";

async function safetyIdentifier(userId: string): Promise<string> {
  const bytes = new TextEncoder().encode(`hydr-sales-tracker:${userId}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function POST(request: NextRequest) {
  if (process.env.NEXT_PUBLIC_AI_VOICE !== "true") {
    return NextResponse.json(
      { error: "AI voice assistant is disabled" },
      { status: 503 },
    );
  }

  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json(
      { error: "OPENAI_API_KEY is not configured" },
      { status: 503 },
    );
  }

  let safetyId: string | null = null;

  if (isAuthEnabled()) {
    const payload = await parseSessionToken(
      request.cookies.get(AUTH_COOKIE)?.value,
    );
    if (!payload) {
      return NextResponse.json({ error: "Not signed in" }, { status: 401 });
    }

    const user = sessionUserFromPayload(payload);

    // Hydr AI mirrors the signed-in user's permissions. Any authenticated
    // non-viewer may use it (including finance/warehouse/production-only users);
    // individual CRM tools enforce the same area permissions as the UI.
    if (isViewerUser(user)) {
      return NextResponse.json(
        { error: "This account cannot use the CRM voice assistant" },
        { status: 403 },
      );
    }

    safetyId = await safetyIdentifier(user.userId);
  }

  const offerSdp = await request.text();
  if (!offerSdp.trim()) {
    return NextResponse.json(
      { error: "Missing WebRTC SDP offer" },
      { status: 400 },
    );
  }

  const sessionConfig = {
    type: "realtime",
    model: REALTIME_MODEL,
    output_modalities: ["audio"],
    audio: {
      input: {
        turn_detection: {
          type: "semantic_vad",
        },
        transcription: {
          model: "gpt-4o-mini-transcribe",
        },
      },
      output: {
        voice: REALTIME_VOICE,
      },
    },
  };

  const form = new FormData();
  form.set("sdp", offerSdp);
  form.set("session", JSON.stringify(sessionConfig));

  try {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${apiKey}`,
    };
    if (safetyId) headers["OpenAI-Safety-Identifier"] = safetyId;

    const upstream = await fetch(`${BASE_URL}/realtime/calls`, {
      method: "POST",
      headers,
      body: form,
    });

    const body = await upstream.text();
    if (!upstream.ok) {
      console.error("Realtime session creation failed:", upstream.status, body);
      return NextResponse.json(
        { error: `Voice session failed (${upstream.status})` },
        { status: 502 },
      );
    }

    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": "application/sdp",
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("Realtime session error:", error);
    return NextResponse.json(
      { error: "Failed to connect to the voice service" },
      { status: 502 },
    );
  }
}
