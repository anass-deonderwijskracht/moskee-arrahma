import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

if (!url || !anonKey) {
  throw new Error(
    "Supabase niet geconfigureerd: zet VITE_SUPABASE_URL en VITE_SUPABASE_ANON_KEY in .env",
  );
}

/**
 * Browser Supabase client. Uses the anon key only — every table is protected
 * by RLS and gated to authenticated admins. The service_role key never reaches
 * this bundle (it lives outside VITE_* and is dev-tooling only).
 */
export const supabase = createClient<Database>(url, anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
