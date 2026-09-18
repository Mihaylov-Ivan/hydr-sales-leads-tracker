import { createClient, SupabaseClient } from "@supabase/supabase-js";

/** Stub WebSocket so @supabase/supabase-js can construct on Node < 22. */
function ensureWebSocketStub() {
  if (typeof (globalThis as { WebSocket?: unknown }).WebSocket !== "undefined") {
    return;
  }
  class WebSocketStub {
    static CONNECTING = 0;
    static OPEN = 1;
    static CLOSING = 2;
    static CLOSED = 3;
    readyState = 3;
    close() {}
    send() {}
    addEventListener() {}
    removeEventListener() {}
    dispatchEvent() {
      return false;
    }
  }
  (globalThis as unknown as { WebSocket: typeof WebSocketStub }).WebSocket =
    WebSocketStub;
}

/**
 * Server-only Supabase client using the service role key.
 * Never import this from client components — it bypasses RLS and can read
 * password_hash / manage users.
 */
export function createServiceClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY and NEXT_PUBLIC_SUPABASE_URL are required for auth APIs.",
    );
  }
  ensureWebSocketStub();
  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

export function hasServiceRoleConfig(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() &&
      process.env.SUPABASE_SERVICE_ROLE_KEY?.trim(),
  );
}
