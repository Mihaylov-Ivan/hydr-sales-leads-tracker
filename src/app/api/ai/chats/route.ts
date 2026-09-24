import { NextRequest, NextResponse } from "next/server";
import {
  AUTH_COOKIE,
  isAuthEnabled,
  parseSessionToken,
} from "@/lib/auth";
import {
  createDefaultStore,
  normalizeIncomingStore,
  type HydrAiChatStore,
  type HydrAiLogEntry,
} from "@/lib/hydr-ai-chats";
import {
  createServiceClient,
  hasServiceRoleConfig,
} from "@/lib/supabase-server";

interface ChatRow {
  id: string;
  user_id: string;
  title: string;
  logs: HydrAiLogEntry[] | null;
  tab_open: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

async function requireUserId(request: NextRequest) {
  if (!isAuthEnabled()) {
    return {
      error: NextResponse.json(
        { error: "Authentication is not configured." },
        { status: 503 },
      ),
    };
  }
  if (!hasServiceRoleConfig()) {
    return {
      error: NextResponse.json(
        { error: "Database is not configured." },
        { status: 503 },
      ),
    };
  }
  const payload = await parseSessionToken(
    request.cookies.get(AUTH_COOKIE)?.value,
  );
  if (!payload) {
    return {
      error: NextResponse.json({ error: "Not signed in." }, { status: 401 }),
    };
  }
  return { userId: payload.userId };
}

function rowsToStore(rows: ChatRow[]): HydrAiChatStore {
  if (rows.length === 0) return createDefaultStore();

  const chats = rows.map((row) => ({
    id: row.id,
    title: row.title || "New chat",
    createdAt: new Date(row.created_at).getTime(),
    updatedAt: new Date(row.updated_at).getTime(),
    logs: Array.isArray(row.logs) ? row.logs : [],
  }));

  const openIds = rows.filter((r) => r.tab_open).map((r) => r.id);
  const activeRow = rows.find((r) => r.is_active);
  let activeId = activeRow?.id ?? openIds[0] ?? chats[0].id;
  const ensuredOpen =
    openIds.length > 0
      ? openIds.includes(activeId)
        ? openIds
        : [activeId, ...openIds]
      : [activeId];

  return { chats, openIds: ensuredOpen, activeId };
}

export async function GET(request: NextRequest) {
  const auth = await requireUserId(request);
  if (auth.error) return auth.error;

  try {
    const db = createServiceClient();
    const { data, error } = await db
      .from("hydr_ai_chats")
      .select("*")
      .eq("user_id", auth.userId)
      .order("updated_at", { ascending: false });

    if (error) {
      console.error("hydr_ai_chats list failed:", error);
      return NextResponse.json(
        { error: "Could not load chat history." },
        { status: 500 },
      );
    }

    return NextResponse.json({ store: rowsToStore((data ?? []) as ChatRow[]) });
  } catch (e) {
    console.error("hydr_ai_chats GET failed:", e);
    return NextResponse.json(
      { error: "Could not load chat history." },
      { status: 500 },
    );
  }
}

/** Replace the signed-in user's chat store with the provided snapshot. */
export async function PUT(request: NextRequest) {
  const auth = await requireUserId(request);
  if (auth.error) return auth.error;

  let body: { store?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const store = normalizeIncomingStore(body.store);
  if (!store) {
    return NextResponse.json({ error: "Invalid chat store." }, { status: 400 });
  }

  try {
    const db = createServiceClient();
    const openSet = new Set(store.openIds);
    const nowIso = new Date().toISOString();

    const rows = store.chats.map((chat) => ({
      id: chat.id,
      user_id: auth.userId,
      title: chat.title.slice(0, 200) || "New chat",
      logs: chat.logs,
      tab_open: openSet.has(chat.id),
      is_active: chat.id === store.activeId,
      created_at: new Date(chat.createdAt).toISOString(),
      updated_at: new Date(chat.updatedAt || Date.now()).toISOString(),
    }));

    // Ensure at least one active when possible
    if (rows.length > 0 && !rows.some((r) => r.is_active)) {
      rows[0].is_active = true;
      rows[0].tab_open = true;
    }

    const { data: existing, error: listError } = await db
      .from("hydr_ai_chats")
      .select("id")
      .eq("user_id", auth.userId);

    if (listError) {
      console.error("hydr_ai_chats list for sync failed:", listError);
      return NextResponse.json(
        { error: "Could not save chat history." },
        { status: 500 },
      );
    }

    const keepIds = new Set(rows.map((r) => r.id));
    const toDelete = (existing ?? [])
      .map((r) => r.id as string)
      .filter((id) => !keepIds.has(id));

    if (toDelete.length > 0) {
      const { error: delError } = await db
        .from("hydr_ai_chats")
        .delete()
        .eq("user_id", auth.userId)
        .in("id", toDelete);
      if (delError) {
        console.error("hydr_ai_chats delete failed:", delError);
        return NextResponse.json(
          { error: "Could not save chat history." },
          { status: 500 },
        );
      }
    }

    if (rows.length > 0) {
      const { error: upsertError } = await db.from("hydr_ai_chats").upsert(
        rows.map((r) => ({
          ...r,
          // Touch updated_at on sync so ordering stays fresh for active edits
          updated_at: r.id === store.activeId ? nowIso : r.updated_at,
        })),
        { onConflict: "id" },
      );
      if (upsertError) {
        console.error("hydr_ai_chats upsert failed:", upsertError);
        return NextResponse.json(
          { error: "Could not save chat history." },
          { status: 500 },
        );
      }
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("hydr_ai_chats PUT failed:", e);
    return NextResponse.json(
      { error: "Could not save chat history." },
      { status: 500 },
    );
  }
}
