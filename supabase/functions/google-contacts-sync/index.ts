// Supabase Edge Function: google-contacts-sync
//
// Zet de oudercontacten van Moskee Arrahma in Google Contacts, met een naam die
// het lopende schooljaar en de inschrijfstatus toont:
//   "Mohamed Belbachir AO-26 ✅"
//
// Werkwijze: volledige reconciliatie, geen wachtrij. Elke run vergelijkt de
// gewenste situatie (uit de database) met wat er in Google staat en doet het
// verschil. Daardoor is de run idempotent en zelfherstellend — een mislukte run
// haalt de volgende gewoon in.
//
// Identiteit is het telefoonnummer, genormaliseerd naar E.164. Dat is het enige
// veld dat betrouwbaar matcht met de handmatige import van vorig jaar.
//
// De naam komt uit de inschrijving in onze database, plus het achtervoegsel —
// de app is de bron van waarheid. Een naam die in Google is aangepast wordt dus
// overschreven (zie contactName.ts naast deze function).
//
// Auth: admin-JWT (vanuit de app) óf de service-role key als bearer (machine,
// bijv. vanuit fillout-intake).
//
// Staan er meerdere contacten met hetzelfde nummer (de oude import maakte per
// schooljaar een aparte kaart: AO-23, AO-24, AO-25), dan worden die SAMENGEVOEGD:
// het nieuwste contact blijft, de gegevens van de andere worden erin getrokken en
// die andere worden verwijderd. Verwijderde contacten belanden 30 dagen in de
// prullenbak van Google Contacts.
//
// Body: { dryRun?: boolean (default true), merge?: boolean (default true) }
// De AO/HF-code volgt uit het traject.
//
// Secrets: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN
//
// Deploy:
//   supabase functions deploy google-contacts-sync

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  applyToNameParts, joinNameParts, normalizePhone, bestMarker, bestCode, yearSuffix, pickPrimaryIndex,
  type Marker, type NameParts,
} from "./contactName.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "content-type": "application/json" } });

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const PEOPLE = "https://people.googleapis.com/v1";
const PERSON_FIELDS =
  "names,phoneNumbers,emailAddresses,addresses,biographies,organizations,birthdays,urls,metadata";
/** Lijstvelden die we bij samenvoegen samentrekken, met de sleutel voor "is dit dezelfde waarde?". */
const LIST_FIELDS = ["phoneNumbers", "emailAddresses", "addresses", "urls"] as const;

// ---------------------------------------------------------------------------
// Google helpers
// ---------------------------------------------------------------------------

async function accessToken(): Promise<string> {
  const client_id = Deno.env.get("GOOGLE_CLIENT_ID");
  const client_secret = Deno.env.get("GOOGLE_CLIENT_SECRET");
  const refresh_token = Deno.env.get("GOOGLE_REFRESH_TOKEN");
  if (!client_id || !client_secret || !refresh_token) {
    throw new Error("Google-secrets ontbreken (GOOGLE_CLIENT_ID / _SECRET / _REFRESH_TOKEN).");
  }
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id, client_secret, refresh_token, grant_type: "refresh_token" }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    // invalid_grant = token ingetrokken of verlopen (bv. consent screen op "Testing").
    throw new Error(`Google-token ophalen mislukt (${res.status}): ${body.error ?? ""} ${body.error_description ?? ""}`.trim());
  }
  return body.access_token as string;
}

interface GPerson {
  resourceName: string;
  etag?: string;
  names?: { givenName?: string; middleName?: string; familyName?: string; displayName?: string }[];
  phoneNumbers?: { value?: string; type?: string }[];
  emailAddresses?: { value?: string; type?: string }[];
  addresses?: { formattedValue?: string; type?: string }[];
  urls?: { value?: string; type?: string }[];
  biographies?: { value?: string; contentType?: string }[];
  organizations?: { name?: string; title?: string }[];
  birthdays?: { date?: { year?: number; month?: number; day?: number }; text?: string }[];
}

async function listConnections(token: string): Promise<GPerson[]> {
  const out: GPerson[] = [];
  let pageToken = "";
  do {
    const url = `${PEOPLE}/people/me/connections?pageSize=1000&personFields=${PERSON_FIELDS}`
      + (pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : "");
    const res = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`Contacten ophalen mislukt (${res.status}): ${body?.error?.message ?? ""}`);
    out.push(...((body.connections ?? []) as GPerson[]));
    pageToken = body.nextPageToken ?? "";
  } while (pageToken);
  return out;
}

async function createContact(token: string, parts: NameParts, phone: string, email: string | null): Promise<GPerson> {
  const res = await fetch(`${PEOPLE}/people:createContact`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({
      names: [{ givenName: parts.givenName, middleName: parts.middleName, familyName: parts.familyName }],
      phoneNumbers: [{ value: phone }],
      ...(email ? { emailAddresses: [{ value: email }] } : {}),
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Aanmaken mislukt (${res.status}): ${body?.error?.message ?? ""}`);
  return body as GPerson;
}

async function updatePerson(
  token: string, resourceName: string, etag: string, fields: string[], patch: Record<string, unknown>,
): Promise<GPerson> {
  const res = await fetch(`${PEOPLE}/${resourceName}:updateContact?updatePersonFields=${fields.join(",")}`, {
    method: "PATCH",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ etag, ...patch }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Bijwerken mislukt (${res.status}): ${body?.error?.message ?? ""}`);
  return body as GPerson;
}

async function deleteContact(token: string, resourceName: string): Promise<void> {
  const res = await fetch(`${PEOPLE}/${resourceName}:deleteContact`, {
    method: "DELETE",
    headers: { authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(`Verwijderen mislukt (${res.status}): ${body?.error?.message ?? ""}`);
  }
}

const nameOf = (p: GPerson) => joinNameParts(p.names?.[0] ?? {});

/** Hoeveel losse gegevens een contact bevat — gebruikt om de rijkste te behouden. */
function richness(p: GPerson): number {
  return (p.phoneNumbers?.length ?? 0) + (p.emailAddresses?.length ?? 0) + (p.addresses?.length ?? 0)
    + (p.urls?.length ?? 0) + (p.biographies?.length ?? 0) + (p.organizations?.length ?? 0)
    + (p.birthdays?.length ?? 0);
}

/** Sleutel waarop we bepalen of twee waarden hetzelfde zijn. */
function listKey(field: string, entry: Record<string, unknown>): string {
  const raw = String((field === "addresses" ? entry.formattedValue : entry.value) ?? "").trim();
  if (field === "phoneNumbers") return normalizePhone(raw) ?? raw.toLowerCase();
  return raw.toLowerCase();
}

/**
 * Trekt de gegevens van de dubbelen in het te behouden contact.
 *
 * De import van vorig jaar maakte per schooljaar een apart contact, dus de oude
 * exemplaren kunnen gegevens bevatten (een tweede nummer, een e-mailadres, een
 * notitie) die het nieuwste mist. We nemen de vereniging, zodat samenvoegen
 * nooit informatie kost. Alleen velden die echt wijzigen gaan mee in de patch.
 */
function mergeFields(primary: GPerson, others: GPerson[]): { fields: string[]; patch: Record<string, unknown> } {
  const fields: string[] = [];
  const patch: Record<string, unknown> = {};

  for (const field of LIST_FIELDS) {
    const own = (primary[field] ?? []) as Record<string, unknown>[];
    const seen = new Set(own.map((e) => listKey(field, e)).filter(Boolean));
    const extra: Record<string, unknown>[] = [];
    for (const o of others) {
      for (const e of ((o[field] ?? []) as Record<string, unknown>[])) {
        const key = listKey(field, e);
        if (!key || seen.has(key)) continue;
        seen.add(key);
        // Zonder metadata overnemen; die hoort bij het contact van herkomst.
        extra.push(field === "addresses"
          ? { formattedValue: e.formattedValue, type: e.type }
          : { value: e.value, type: e.type });
      }
    }
    if (extra.length) {
      fields.push(field);
      patch[field] = [...own.map((e) => (field === "addresses"
        ? { formattedValue: e.formattedValue, type: e.type }
        : { value: e.value, type: e.type })), ...extra];
    }
  }

  // Notities: alle verschillende teksten onder elkaar, zodat er niets verdwijnt.
  const notes: string[] = [];
  for (const p of [primary, ...others]) {
    for (const b of p.biographies ?? []) {
      const v = (b.value ?? "").trim();
      if (v && !notes.includes(v)) notes.push(v);
    }
  }
  if (notes.length && notes.join("\n") !== (primary.biographies?.[0]?.value ?? "")) {
    fields.push("biographies");
    patch.biographies = [{ value: notes.join("\n"), contentType: "TEXT_PLAIN" }];
  }

  // Enkelvoudige velden alleen aanvullen als het behouden contact ze mist.
  if (!primary.organizations?.length) {
    const from = others.find((o) => o.organizations?.length);
    if (from) { fields.push("organizations"); patch.organizations = from.organizations; }
  }
  if (!primary.birthdays?.length) {
    const from = others.find((o) => o.birthdays?.length);
    if (from) { fields.push("birthdays"); patch.birthdays = from.birthdays; }
  }

  return { fields, patch };
}

// ---------------------------------------------------------------------------
// Gewenste situatie uit de database
// ---------------------------------------------------------------------------

interface Desired {
  phone: string;
  name: string;
  email: string | null;
  year: number;
  /** AO of HF — hifdh wint als een gezin kinderen in beide trajecten heeft. */
  code: string;
  marker: Marker;
  children: string[];
}

/** Splitst "Mohamed Belbachir" in voor- en achternaam voor een nieuw contact. */
function splitName(full: string): NameParts {
  const words = (full ?? "").replace(/\s+/g, " ").trim().split(" ");
  if (words.length <= 1) return { givenName: words[0] ?? "", middleName: "", familyName: "" };
  return { givenName: words.slice(0, -1).join(" "), middleName: "", familyName: words[words.length - 1] };
}

// deno-lint-ignore no-explicit-any
async function buildDesired(service: any): Promise<{ desired: Desired[]; noPhone: string[] }> {
  const [{ data: enrollments }, { data: parents }, { data: placements }, { data: years }] = await Promise.all([
    service.from("enrollments").select("id, child_name, status, track"),
    service.from("enrollment_parents").select("enrollment_id, name, phone, email, is_primary"),
    service.from("enrollment_placements").select("enrollment_id, schooljaar_id"),
    service.from("schooljaren").select("id, code, is_current, archived"),
  ]);

  // Jaartal per inschrijving: het schooljaar van de plaatsing, en zolang die er
  // niet is het eerstvolgende niet-gearchiveerde jaar — dezelfde regel die de
  // Klassenindeler gebruikt om "het nieuwe jaar" te bepalen.
  // deno-lint-ignore no-explicit-any
  const yearRows = (years ?? []) as any[];
  const yearById = new Map<string, number>();
  for (const y of yearRows) yearById.set(y.id, yearSuffix(y.code) ?? 0);
  const current = yearRows.find((y) => y.is_current);
  const next = yearRows
    .filter((y) => !y.archived && current && y.code > current.code)
    .sort((a, b) => String(a.code).localeCompare(String(b.code)))[0] ?? current;
  const intakeYear = next ? (yearSuffix(next.code) ?? 0) : 0;

  const placementYear = new Map<string, number>();
  // deno-lint-ignore no-explicit-any
  for (const p of ((placements ?? []) as any[])) {
    const y = yearById.get(p.schooljaar_id);
    if (y != null) placementYear.set(p.enrollment_id, y);
  }

  // deno-lint-ignore no-explicit-any
  const enrollById = new Map<string, any>();
  // deno-lint-ignore no-explicit-any
  for (const e of ((enrollments ?? []) as any[])) enrollById.set(e.id, e);

  interface Acc { phone: string; names: string[]; emails: string[]; rows: { year: number; status: string; track: string; child: string }[] }
  const byPhone = new Map<string, Acc>();
  const noPhone: string[] = [];

  // deno-lint-ignore no-explicit-any
  for (const p of ((parents ?? []) as any[])) {
    const e = enrollById.get(p.enrollment_id);
    if (!e) continue;
    const phone = normalizePhone(p.phone);
    if (!phone) { if (p.name?.trim()) noPhone.push(p.name.trim()); continue; }
    const acc = byPhone.get(phone) ?? { phone, names: [], emails: [], rows: [] };
    byPhone.set(phone, acc);
    if (p.name?.trim()) acc.names.push(p.name.trim());
    if (p.email?.trim()) acc.emails.push(p.email.trim());
    acc.rows.push({
      year: placementYear.get(e.id) ?? intakeYear,
      status: e.status,
      track: e.track,
      child: e.child_name,
    });
  }

  const desired: Desired[] = [];
  for (const acc of byPhone.values()) {
    if (!acc.names.length) continue; // zonder naam kunnen we niets zinnigs zetten
    const year = Math.max(...acc.rows.map((r) => r.year));
    // Alleen het meest recente jaar bepaalt code en markering: een afwijzing (of
    // een traject) van twee jaar geleden mag het huidige beeld niet sturen.
    const currentRows = acc.rows.filter((r) => r.year === year);
    desired.push({
      phone: acc.phone,
      name: acc.names[0],
      email: acc.emails[0] ?? null,
      year,
      code: bestCode(currentRows.map((r) => r.track)),
      marker: bestMarker(currentRows.map((r) => r.status)),
      children: [...new Set(acc.rows.map((r) => r.child))],
    });
  }
  desired.sort((a, b) => a.name.localeCompare(b.name));
  return { desired, noPhone };
}

// ---------------------------------------------------------------------------

type Action = "create" | "update" | "unchanged" | "merge" | "conflict";
interface PlanRow {
  action: Action;
  phone: string;
  from: string | null;
  to: string;
  children: string[];
  /** Bij samenvoegen: de namen van de contacten die worden opgeruimd. */
  deletes?: string[];
  resourceName?: string;
  error?: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const service = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

  // --- Auth: admin-JWT of de service-role key (machine-aanroep) --------------
  const authHeader = req.headers.get("Authorization") ?? "";
  const bearer = authHeader.replace(/^Bearer\s+/i, "").trim();
  let runBy: string | null = null;
  let runByName: string | null = "Automatisch";

  if (bearer !== SERVICE_KEY) {
    const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });
    const { data: { user }, error: userErr } = await userClient.auth.getUser();
    if (userErr || !user) return json({ error: "unauthorized" }, 401);
    const { data: me } = await service.from("profiles").select("role, full_name").eq("id", user.id).single();
    if (me?.role !== "admin") return json({ error: "forbidden" }, 403);
    runBy = user.id;
    runByName = me.full_name ?? user.email ?? null;
  }

  // deno-lint-ignore no-explicit-any
  let body: any = {};
  try { body = await req.json(); } catch { /* lege body = dry-run */ }
  const dryRun = body?.dryRun !== false; // standaard NIET schrijven
  // Dubbelen samenvoegen tot één contact. De handmatige import maakte per
  // schooljaar een aparte kaart, dus dit is de normale situatie, niet de fout.
  const doMerge = body?.merge !== false;

  const { data: runRow } = await service.from("google_contact_sync_runs")
    .insert({ dry_run: dryRun, run_by: runBy, run_by_name: runByName })
    .select("id").single();
  const runId = (runRow as { id: string } | null)?.id ?? null;

  const finish = async (patch: Record<string, unknown>) => {
    if (runId) await service.from("google_contact_sync_runs").update({ finished_at: new Date().toISOString(), ...patch }).eq("id", runId);
  };

  try {
    const { desired, noPhone } = await buildDesired(service);
    const token = await accessToken();
    const connections = await listConnections(token);

    // Google-contacten indexeren op elk telefoonnummer dat ze hebben.
    const byPhone = new Map<string, GPerson[]>();
    for (const p of connections) {
      for (const n of p.phoneNumbers ?? []) {
        const key = normalizePhone(n.value);
        if (!key) continue;
        const list = byPhone.get(key) ?? [];
        list.push(p);
        byPhone.set(key, list);
      }
    }

    const plan: PlanRow[] = [];
    let created = 0, updated = 0, unchanged = 0, merged = 0, deleted = 0, conflicts = 0;

    for (const d of desired) {
      // Eén contact kan meerdere nummers hebben en dus vaker in de index staan;
      // op resourceName ontdubbelen voorkomt een vals "dubbel contact".
      const matches = [...new Map((byPhone.get(d.phone) ?? []).map((p) => [p.resourceName, p])).values()];

      let match: GPerson | undefined = matches[0];
      let dupes: GPerson[] = [];

      if (matches.length > 1) {
        if (!doMerge) {
          conflicts++;
          plan.push({
            action: "conflict", phone: d.phone, children: d.children,
            from: matches.map(nameOf).join(" / "),
            to: joinNameParts(applyToNameParts(splitName(d.name), { code: d.code, year: d.year, marker: d.marker })),
            error: `${matches.length} contacten met dit nummer`,
          });
          continue;
        }
        const idx = pickPrimaryIndex(matches.map((p) => ({ name: nameOf(p), richness: richness(p) })));
        match = matches[idx];
        dupes = matches.filter((_, i) => i !== idx);
      }

      // De naam komt uit ONS systeem, niet uit Google: de inschrijving is de bron
      // van waarheid. Een eventueel oud achtervoegsel wordt eraf gestript, dus
      // "Oumaima Hassani" + AO-26 ✅ — nooit een stapeling van oude jaren.
      const nextParts = applyToNameParts(splitName(d.name), { code: d.code, year: d.year, marker: d.marker });
      const from = match ? nameOf(match) : null;
      const to = joinNameParts(nextParts);

      // ---- Samenvoegen: gegevens optrekken, hernoemen, dubbelen opruimen ----
      if (match && dupes.length) {
        merged++;
        deleted += dupes.length;
        const row: PlanRow = {
          action: "merge", phone: d.phone, from, to, children: d.children,
          deletes: dupes.map(nameOf), resourceName: match.resourceName,
        };
        plan.push(row);
        if (!dryRun) {
          try {
            const { fields, patch } = mergeFields(match, dupes);
            const person = await updatePerson(token, match.resourceName, match.etag ?? "", ["names", ...fields], {
              ...patch,
              names: [{ givenName: nextParts.givenName, middleName: nextParts.middleName, familyName: nextParts.familyName }],
            });
            // Pas verwijderen als het samenvoegen is gelukt — anders raken we gegevens kwijt.
            for (const dup of dupes) await deleteContact(token, dup.resourceName);
            await service.from("google_contacts").upsert({
              phone_e164: d.phone, resource_name: person.resourceName, etag: person.etag ?? null,
              display_name: to, synced_at: new Date().toISOString(),
            });
          } catch (err) {
            row.error = err instanceof Error ? err.message : String(err);
          }
        }
        continue;
      }

      if (!match) {
        plan.push({ action: "create", phone: d.phone, from: null, to, children: d.children });
        created++;
        if (!dryRun) {
          try {
            const person = await createContact(token, nextParts, d.phone, d.email);
            await service.from("google_contacts").upsert({
              phone_e164: d.phone, resource_name: person.resourceName, etag: person.etag ?? null,
              display_name: to, synced_at: new Date().toISOString(),
            });
            plan[plan.length - 1].resourceName = person.resourceName;
          } catch (err) {
            plan[plan.length - 1].error = err instanceof Error ? err.message : String(err);
          }
        }
        continue;
      }

      if (from === to) {
        unchanged++;
        plan.push({ action: "unchanged", phone: d.phone, from, to, children: d.children, resourceName: match.resourceName });
        continue;
      }

      plan.push({ action: "update", phone: d.phone, from, to, children: d.children, resourceName: match.resourceName });
      updated++;
      if (!dryRun) {
        try {
          const person = await updatePerson(token, match.resourceName, match.etag ?? "", ["names"], {
            names: [{ givenName: nextParts.givenName, middleName: nextParts.middleName, familyName: nextParts.familyName }],
          });
          await service.from("google_contacts").upsert({
            phone_e164: d.phone, resource_name: person.resourceName, etag: person.etag ?? null,
            display_name: to, synced_at: new Date().toISOString(),
          });
        } catch (err) {
          plan[plan.length - 1].error = err instanceof Error ? err.message : String(err);
        }
      }
    }

    const failed = plan.filter((r) => r.error && r.action !== "conflict").length;
    const result = {
      ok: true, dryRun, runId,
      counts: {
        created, updated, unchanged, merged, deleted, conflicts,
        skipped: noPhone.length, failed, total: desired.length,
      },
      noPhone,
      plan,
    };
    await finish({ ok: true, created, updated, unchanged, merged, deleted, conflicts, skipped: noPhone.length, plan });
    return json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await finish({ ok: false, error: message });
    return json({ ok: false, error: message, runId }, 500);
  }
});
