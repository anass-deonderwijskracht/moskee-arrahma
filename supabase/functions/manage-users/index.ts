// Supabase Edge Function: manage-users
// Admin-only user management for Gebruikersbeheer. Creates admins/docenten and
// deletes users. Creating a user provisions an auth account (no password) and
// sends a "stel je wachtwoord" recovery e-mail — no magic-link login.
//
// Auth: requires a valid JWT (deploy with verify_jwt). The caller must have an
// 'admin' profile; otherwise 403. Uses the service_role key (server-side only).
//
// Deploy:
//   supabase functions deploy manage-users
// (SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are injected
//  automatically by the Edge runtime.)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  // --- Authenticate caller + require admin -----------------------------------
  const authHeader = req.headers.get("Authorization") ?? "";
  const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });
  const { data: { user }, error: userErr } = await userClient.auth.getUser();
  if (userErr || !user) return json({ error: "unauthorized" }, 401);

  const service = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
  const { data: me } = await service.from("profiles").select("role").eq("id", user.id).single();
  if (me?.role !== "admin") return json({ error: "forbidden" }, 403);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "invalid json" }, 400); }
  const action = String(body?.action ?? "");

  // --- create ----------------------------------------------------------------
  if (action === "create") {
    const email = String(body.email ?? "").trim().toLowerCase();
    const fullName = String(body.full_name ?? "").trim();
    const role = String(body.role ?? "");
    const classId: string | null = body.class_id ?? null;
    const redirectTo = String(body.redirect_to ?? "");

    if (!email || !fullName) return json({ error: "Naam en e-mailadres zijn verplicht." }, 400);
    if (role !== "admin" && role !== "docent") return json({ error: "Ongeldige rol." }, 400);
    if (role === "docent" && !classId) return json({ error: "Kies een klas voor de docent." }, 400);

    const { data: created, error: createErr } = await service.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    });
    if (createErr || !created?.user) {
      const msg = createErr?.message ?? "Aanmaken mislukt";
      const taken = /already|registered|exists/i.test(msg);
      return json({ error: taken ? "Er bestaat al een account met dit e-mailadres." : msg }, taken ? 409 : 400);
    }

    // The on_auth_user_created trigger inserts the profile (role default 'admin');
    // set the chosen role + class link explicitly.
    const { error: profErr } = await service.from("profiles")
      .update({ role, class_id: role === "docent" ? classId : null, full_name: fullName, email })
      .eq("id", created.user.id);
    if (profErr) {
      // Roll back the half-created account so the admin can retry cleanly.
      await service.auth.admin.deleteUser(created.user.id);
      return json({ error: "Profiel instellen mislukt: " + profErr.message }, 500);
    }

    // Send the "stel je wachtwoord" e-mail (recovery flow, not a magic link).
    const anon = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
    const { error: mailErr } = await anon.auth.resetPasswordForEmail(email, redirectTo ? { redirectTo } : undefined);

    await service.from("audit_log").insert({
      action: `gebruiker toegevoegd (${role})`,
      object: `${fullName} <${email}>`,
      type: "note",
      user_label: "Beheerder",
    });

    return json({ ok: true, user_id: created.user.id, email_sent: !mailErr, mail_error: mailErr?.message ?? null });
  }

  // --- update ----------------------------------------------------------------
  if (action === "update") {
    const id = String(body.id ?? "");
    const fullName = String(body.full_name ?? "").trim();
    const role = String(body.role ?? "");
    const classId: string | null = body.class_id ?? null;

    if (!id) return json({ error: "Geen gebruiker opgegeven." }, 400);
    if (!fullName) return json({ error: "Naam is verplicht." }, 400);
    if (role !== "admin" && role !== "docent") return json({ error: "Ongeldige rol." }, 400);
    if (role === "docent" && !classId) return json({ error: "Kies een klas voor de docent." }, 400);

    const { error: profErr } = await service.from("profiles")
      .update({ role, class_id: role === "docent" ? classId : null, full_name: fullName })
      .eq("id", id);
    if (profErr) return json({ error: "Bijwerken mislukt: " + profErr.message }, 500);

    // Keep the auth metadata name in sync (fallback display name).
    await service.auth.admin.updateUserById(id, { user_metadata: { full_name: fullName } });

    await service.from("audit_log").insert({
      action: `gebruiker bijgewerkt (${role})`,
      object: fullName,
      type: "note",
      user_label: "Beheerder",
    });
    return json({ ok: true });
  }

  // --- delete ----------------------------------------------------------------
  if (action === "delete") {
    const id = String(body.id ?? "");
    if (!id) return json({ error: "Geen gebruiker opgegeven." }, 400);
    if (id === user.id) return json({ error: "Je kunt je eigen account niet verwijderen." }, 400);

    const { data: target } = await service.from("profiles").select("full_name, email").eq("id", id).single();
    const { error: delErr } = await service.auth.admin.deleteUser(id);
    if (delErr) return json({ error: "Verwijderen mislukt: " + delErr.message }, 500);

    await service.from("audit_log").insert({
      action: "gebruiker verwijderd",
      object: target ? `${target.full_name} <${target.email}>` : id,
      type: "note",
      user_label: "Beheerder",
    });
    return json({ ok: true });
  }

  return json({ error: "unknown action" }, 400);
});
