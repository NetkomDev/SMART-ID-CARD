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

/** Service-role client for admin operations (e.g. creating users). Use sparingly. */
export const createServiceClient = (): SupabaseClient => {
  if (!config.SUPABASE_SERVICE_ROLE_KEY) throw new Error("SUPABASE_SERVICE_ROLE_KEY is required for platform provisioning");
  return createClient(config.SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY, { auth: authOptions });
};
