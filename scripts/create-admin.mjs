// Create (or confirm) the first admin user via the service_role key.
// Usage: node scripts/create-admin.mjs <email> <password> ["Full Name"]
// Dev-only. The on_auth_user_created trigger creates the matching profiles row.
import { createClient } from "@supabase/supabase-js";
import { loadEnv } from "./lib/env.mjs";

const [, , email, password, ...nameParts] = process.argv;
if (!email || !password) {
  console.error('Gebruik: node scripts/create-admin.mjs <email> <wachtwoord> ["Volledige naam"]');
  process.exit(1);
}
const fullName = nameParts.join(" ") || email;

const { url, serviceKey } = loadEnv();
const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

const { data, error } = await admin.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
  user_metadata: { full_name: fullName },
});

if (error) {
  console.error("Aanmaken mislukt:", error.message);
  process.exit(1);
}
console.log(`✓ Admin aangemaakt: ${data.user?.email} (${data.user?.id})`);
console.log("  Profielrij wordt automatisch aangemaakt door de on_auth_user_created trigger.");
