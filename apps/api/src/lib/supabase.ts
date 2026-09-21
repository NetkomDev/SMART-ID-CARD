import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config } from "../config.js";

const authOptions = { autoRefreshToken: false, persistSession: false } as const;

export const createPublicClient = (): SupabaseClient =>
  createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY, { auth: authOptions });

/** A user-scoped client preserves PostgreSQL RLS; never replace this with service_role. */
export const createUserClient = (accessToken: string): SupabaseClient =>
  createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY, {
    auth: authOptions,
    global: { headers: { Authorization: `Bearer ${accessToken}` } }
  });
