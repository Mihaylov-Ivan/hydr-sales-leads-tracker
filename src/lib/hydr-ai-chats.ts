/** Hydr AI multi-chat session types + helpers (DB-backed when signed in). */

export type HydrAiLogKind = "user" | "assistant" | "action" | "error";

export interface HydrAiLogEntry {
  id: string;
  kind: HydrAiLogKind;
  text: string;
}

export interface HydrAiChat {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  logs: HydrAiLogEntry[];
}

export interface HydrAiChatStore {
  chats: HydrAiChat[];
  openIds: string[];
  activeId: string;
}

const MAX_CHATS = 40;
const MAX_LOGS = 80;
const LOCAL_PREFIX = "hydr-ai-chats:v1:";

export function newChatId() {
  return `chat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function createEmptyChat(partial?: Partial<HydrAiChat>): HydrAiChat {
  const now = Date.now();
  return {
    id: partial?.id ?? newChatId(),
    title: partial?.title ?? "New chat",
    createdAt: partial?.createdAt ?? now,
    updatedAt: partial?.updatedAt ?? now,
    logs: partial?.logs ?? [],
  };
}

export function titleFromLogs(logs: HydrAiLogEntry[]): string {
  const firstUser = logs.find((l) => l.kind === "user");
  if (!firstUser) return "New chat";
  const text = firstUser.text.replace(/\s+/g, " ").trim();
  if (text.length <= 28) return text;
  return `${text.slice(0, 27)}…`;
}

export function createDefaultStore(): HydrAiChatStore {
  const chat = createEmptyChat();
  return { chats: [chat], openIds: [chat.id], activeId: chat.id };
}

function isLogEntry(v: unknown): v is HydrAiLogEntry {
  if (!v || typeof v !== "object") return false;
  const e = v as Partial<HydrAiLogEntry>;
  return (
    typeof e.id === "string" &&
    typeof e.text === "string" &&
    (e.kind === "user" ||
      e.kind === "assistant" ||
      e.kind === "action" ||
      e.kind === "error")
  );
}

export function normalizeIncomingStore(raw: unknown): HydrAiChatStore | null {
  if (!raw || typeof raw !== "object") return null;
  const data = raw as Partial<HydrAiChatStore>;
  if (!Array.isArray(data.chats) || data.chats.length === 0) return null;

  const chats = data.chats
    .filter(
      (c): c is HydrAiChat =>
        Boolean(c) &&
        typeof c.id === "string" &&
        typeof c.title === "string" &&
        Array.isArray(c.logs),
    )
    .map((c) => ({
      id: c.id.slice(0, 80),
      title: (c.title || "New chat").slice(0, 200),
      createdAt: typeof c.createdAt === "number" ? c.createdAt : Date.now(),
      updatedAt: typeof c.updatedAt === "number" ? c.updatedAt : Date.now(),
      logs: c.logs.filter(isLogEntry).slice(-MAX_LOGS),
    }))
    .slice(0, MAX_CHATS);

  if (chats.length === 0) return null;

  const ids = new Set(chats.map((c) => c.id));
  let openIds = Array.isArray(data.openIds)
    ? data.openIds.filter((id) => typeof id === "string" && ids.has(id))
    : [];
  if (openIds.length === 0) openIds = [chats[0].id];

  let activeId =
    typeof data.activeId === "string" && ids.has(data.activeId)
      ? data.activeId
      : openIds[0];
  if (!openIds.includes(activeId)) openIds = [activeId, ...openIds];

  return { chats, openIds, activeId };
}

function localKey(userId: string | null | undefined) {
  return `${LOCAL_PREFIX}${userId || "anon"}`;
}

/** Offline / auth-off fallback only. */
export function loadLocalChatStore(
  userId: string | null | undefined,
): HydrAiChatStore {
  if (typeof window === "undefined") return createDefaultStore();
  try {
    const raw = window.localStorage.getItem(localKey(userId));
    if (!raw) return createDefaultStore();
    return normalizeIncomingStore(JSON.parse(raw)) ?? createDefaultStore();
  } catch {
    return createDefaultStore();
  }
}

export function saveLocalChatStore(
  userId: string | null | undefined,
  store: HydrAiChatStore,
) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(localKey(userId), JSON.stringify(store));
  } catch {
    // ignore quota
  }
}

export async function fetchChatStore(): Promise<HydrAiChatStore | null> {
  try {
    const res = await fetch("/api/ai/chats", { credentials: "same-origin" });
    if (!res.ok) return null;
    const data = (await res.json()) as { store?: unknown };
    return normalizeIncomingStore(data.store);
  } catch {
    return null;
  }
}

export async function persistChatStore(store: HydrAiChatStore): Promise<boolean> {
  try {
    const res = await fetch("/api/ai/chats", {
      method: "PUT",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ store }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
