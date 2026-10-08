/* eslint-disable @typescript-eslint/no-explicit-any */
import { createClient, SupabaseClient } from "@supabase/supabase-js";

let supabaseInstance: SupabaseClient | null = null;

function getWsTransport(): any {
  // ws is only needed in Node.js < 22 which lacks native WebSocket
  // In Next.js 14 API routes (Node.js 20), we need to supply ws
  if (typeof globalThis.WebSocket === "undefined") {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      return require("ws");
    } catch {
      return undefined;
    }
  }
  return undefined;
}

export function getSupabaseClient(): SupabaseClient | null {
  const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const url = rawUrl ? rawUrl.replace(/\/rest\/v1\/?$/, "").replace(/\/+$/, "") : "";
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_ANON_KEY;

  if (!url || !key) {
    return null;
  }

  if (!supabaseInstance) {
    const wsTransport = getWsTransport();
    supabaseInstance = createClient(url, key, {
      auth: { persistSession: false },
      ...(wsTransport
        ? { realtime: { transport: wsTransport as typeof WebSocket } }
        : {}),
    });
  }

  return supabaseInstance;
}

export function isSupabaseConfigured(): boolean {
  return !!getSupabaseClient();
}

export function requireSupabase(): SupabaseClient {
  const client = getSupabaseClient();
  if (!client) {
    throw new Error(
      "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY."
    );
  }
  return client;
}
