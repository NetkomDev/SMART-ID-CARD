import type { SupabaseClient, User } from "@supabase/supabase-js";

declare global {
  namespace Express {
    interface Request {
      auth?: {
        accessToken: string;
        user: User;
        client: SupabaseClient;
      };
      tenant?: {
        schoolId: string;
        membershipId: string;
        roles: string[];
        permissions: string[];
      };
      requestId: string;
    }
  }
}

export {};
