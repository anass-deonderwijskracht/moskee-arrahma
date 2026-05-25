// Supabase Edge Function: fillout-intake
// Receives a Fillout "Inschrijven weekendonderwijs" webhook and creates ONE
// enrollment per child (status 'wachtlijst'), with the two shared family
// contacts attached to each. Mirrors the admin "Nieuwe aanmelding" shape.
//
// The form has numbered children (1..5): child 1 uses unnumbered field names
// ("Voornaam", "Achternaam", …), children 2-5 use suffixes ("Voornaam kind 2").
// Parents are shared per submission. There is no track field → defaults to
// 'regulier'; the admin assigns the track + class in the Klassenindeler.
//
// Deploy:
//   supabase functions deploy fillout-intake --no-verify-jwt
//   supabase secrets set FILLOUT_WEBHOOK_SECRET=<kies-een-geheim>
// Fillout webhook URL:
//   https://<ref>.supabase.co/functions/v1/fillout-intake?secret=<zelfde-geheim>

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "content-type, x-webhook-secret" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "content-type": "application/json" } });

type Q = { id?: string; name?: string; type?: string; value?: unknown };

/** Build a label→question map (lowercased, trimmed name). */
function indexQuestions(payload: any): Map<string, Q> {
  const qs: Q[] = payload?.submission?.questions ?? payload?.questions ?? [];
  const m = new Map<string, Q>();
  for (const q of qs) {
    const name = String(q?.name ?? "").toLowerCase().trim();
    if (name) m.set(name, q);
  }
  return m;
}

const str = (q?: Q): string => {
  const v = q?.value;
  if (v == null) return "";
  if (Array.isArray(v)) return v.join(", ");
  if (typeof v === "object") return ""; // address handled separately
  return String(v).trim();
};

function addressOf(q?: Q): string | null {
  const v = q?.value as any;
  if (!v || typeof v !== "object") return null;
  const parts = [v.address, [v.zipCode, v.city].filter(Boolean).join(" ")].filter((p: any) => p && String(p).trim());
  const out = parts.join(", ").trim();
  return out || null;
}

function lesdayOf(q?: Q): string | null {
  const v = q?.value;
  const arr = Array.isArray(v) ? v.map(String) : v ? [String(v)] : [];
  const days = arr.map((s) => s.toLowerCase());
  if (days.some((d) => d.includes("geen"))) return "Geen voorkeur";
  const za = days.some((d) => d.includes("zaterdag"));
  const zo = days.some((d) => d.includes("zondag"));
  if (za && zo) return "Geen voorkeur"; // beide gekozen = flexibel
  if (za) return "Zaterdag";
  if (zo) return "Zondag";
  return null;
}

function genderOf(q?: Q): string | null {
  const s = str(q).toLowerCase();
  if (/jongen|man|male/.test(s)) return "m";
  if (/meisje|vrouw|female/.test(s)) return "f";
  return null;
}

function ageFromDate(s: string): number | null {
  if (!s) return null;
  const yr = parseInt(String(s).slice(0, 4));
  if (yr > 1990 && yr <= new Date().getFullYear()) return new Date().getFullYear() - yr;
  return null;
}

/** ISO date (YYYY-MM-DD) if the value looks like a date, else null. */
function isoDate(s: string): string | null {
  const m = String(s).match(/^\d{4}-\d{2}-\d{2}/);
  return m ? m[0] : null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const secret = Deno.env.get("FILLOUT_WEBHOOK_SECRET");
  const provided = new URL(req.url).searchParams.get("secret") ?? req.headers.get("x-webhook-secret");
  if (!secret || provided !== secret) return json({ error: "unauthorized" }, 401);

  let payload: any;
  try { payload = await req.json(); } catch { return json({ error: "invalid json" }, 400); }
  const m = indexQuestions(payload);
  const g = (name: string) => m.get(name.toLowerCase());

  // Shared parents
  const parents = [
    { role: str(g("Het primaire contactpersoon is")) || "Vader", name: str(g("Volledige naam (primair contactpersoon)")), phone: str(g("Telefoonnummer (primair contactpersoon)")), email: str(g("Emailadres (primair contactpersoon)")), is_primary: true },
    { role: str(g("Het tweede contactpersoon is")) || "Moeder", name: str(g("Volledige naam (tweede contactpersoon)")), phone: str(g("Telefoonnummer (tweede contactpersoon)")), email: str(g("Emailadres (tweede contactpersoon)")), is_primary: false },
  ].filter((p) => p.name.trim());

  // Children: child 1 unnumbered, children 2..5 suffixed "kind N".
  const children: { first: string; last: string; gender: string | null; age: number | null; birthdate: string | null; lesday: string | null; address: string | null; notes: string }[] = [];
  for (let k = 1; k <= 5; k++) {
    const sfx = k === 1 ? "" : ` kind ${k}`;
    const first = str(g(`Voornaam${sfx}`));
    const last = str(g(`Achternaam${sfx}`));
    if (!first && !last) continue;
    const dob = str(g(`Geboortedatum${sfx}`));
    children.push({
      first, last,
      gender: genderOf(g(`Geslacht${sfx}`)),
      age: ageFromDate(dob),
      birthdate: isoDate(dob),
      lesday: lesdayOf(g(`Voorkeur lesdag${sfx}`)),
      address: addressOf(g(`Woonadres${sfx}`)),
      notes: str(g(`Opmerkingen?${sfx}`)),
    });
  }
  if (children.length === 0) return json({ error: "no children found", seen: [...m.keys()] }, 422);

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

  const created: string[] = [];
  for (const c of children) {
    const { data: enr, error } = await supabase.from("enrollments").insert({
      child_name: `${c.first} ${c.last}`.trim(),
      age: c.age, birthdate: c.birthdate, gender: c.gender, track: "regulier", status: "wachtlijst",
      preferred_lesday: c.lesday, address: c.address, notes: c.notes || null,
      submitted_label: "via formulier",
    }).select("id").single();
    if (error) return json({ error: error.message, created }, 500);
    if (parents.length) {
      await supabase.from("enrollment_parents").insert(parents.map((p) => ({ enrollment_id: enr.id, ...p })));
    }
    created.push(enr.id);
  }
  await supabase.from("audit_log").insert({ action: "nieuwe aanmelding via formulier", object: `${children.length} kind(eren)`, type: "enroll", user_label: "Fillout" });

  return json({ ok: true, enrollments: created, count: created.length });
});
