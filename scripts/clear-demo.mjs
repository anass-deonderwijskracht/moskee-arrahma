// Wipe all operational/demo data, keeping the schema, reference data
// (schooljaren, surahs), app_settings and admin profiles/users.
//   node scripts/clear-demo.mjs
import { createClient } from "@supabase/supabase-js";
import { loadEnv } from "./lib/env.mjs";

const { url, serviceKey } = loadEnv();
const db = createClient(url, serviceKey, { auth: { persistSession: false } });

// Child → parent order. kind_ouder has a composite PK (no `id`).
const tables = [
  "audit_log", "payments", "incomes", "expenses", "budget_categories",
  "enrollment_placements", "enrollment_parents", "enrollments",
  "leerling_surah_progress", "quran_assignments", "lesson_notes",
  "attendance_records", "lessons", "leerlingen", "kind_ouder",
  "kinderen", "ouders", "classes", "teachers",
];

let total = 0;
for (const t of tables) {
  const col = t === "kind_ouder" ? "kind_id" : "id";
  const { count } = await db.from(t).select("*", { count: "exact", head: true });
  const { error } = await db.from(t).delete().not(col, "is", null);
  if (error && !/does not exist|schema cache/i.test(error.message)) {
    console.error(`✗ ${t}: ${error.message}`); process.exit(1);
  }
  console.log(`✓ ${t}: ${count ?? 0} verwijderd`);
  total += count ?? 0;
}
console.log(`\nKlaar — ${total} rijen verwijderd. Behouden: schooljaren, surahs, app_settings, profiles (admin).`);
