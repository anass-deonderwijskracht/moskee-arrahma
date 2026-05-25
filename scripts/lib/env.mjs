// Minimal .env loader for dev tooling (no dependency). Reads the project .env
// and returns the Supabase URL + service_role key. The service_role key bypasses
// RLS and must NEVER be used in the browser — these scripts are dev-only.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..");

function parseEnv(text) {
  const out = {};
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return out;
}

export function loadEnv() {
  let env = {};
  try {
    env = parseEnv(readFileSync(join(root, ".env"), "utf8"));
  } catch {
    throw new Error("Geen .env gevonden in de projectroot.");
  }
  const url = env.VITE_SUPABASE_URL;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) throw new Error("VITE_SUPABASE_URL ontbreekt in .env");
  if (!serviceKey) throw new Error("SUPABASE_SERVICE_ROLE_KEY ontbreekt in .env");
  return { url, serviceKey };
}
