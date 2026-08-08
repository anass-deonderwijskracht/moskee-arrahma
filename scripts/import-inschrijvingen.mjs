// Eenmalige import van de inschrijvingen uit het Google Formulier-export
// "Administratie - 2025_2026 - Kinderen weekendonderwijs - Inschrijving".
//
// Elke regel wordt één `enrollment` met status **wachtlijst**, de ouders in
// `enrollment_parents`, en een `enrollment_placement` voor het schooljaar
// hieronder met het niveau al ingevuld — zodat ze meteen met niveau in de
// Klassenindeler staan, klaar om in te delen.
//
//   node scripts/import-inschrijvingen.mjs           → toont alleen wat er zou gebeuren
//   node scripts/import-inschrijvingen.mjs --apply   → schrijft echt weg
//
// Herhaalbaar: een kind dat al bestaat (zelfde naam + geboortedatum, of zelfde
// naam als de geboortedatum onbekend is) wordt overgeslagen.
//
// De brondata is hieronder handmatig opgeschoond; per aanpassing staat een
// `bron`-notitie zodat je kunt terugzien wat er is gewijzigd. Dev-only: gebruikt
// de service_role key en omzeilt dus RLS.
import { createClient } from "@supabase/supabase-js";
import { loadEnv } from "./lib/env.mjs";

const APPLY = process.argv.includes("--apply");
const SCHOOLJAAR_CODE = "y2026"; // 2026/27 — het jaar waarvoor is ingeschreven

const { url, serviceKey } = loadEnv();
const db = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

// ---- helpers ---------------------------------------------------------------

/** "0634594969", "(06) 39 56 66 25", "+31 6 41 26 64 86" → "+31634594969". */
function phone(raw) {
  if (!raw) return null;
  let s = String(raw).replace(/[^\d+]/g, "");
  if (!s) return null;
  if (s.startsWith("+")) s = s.slice(1);
  else if (s.startsWith("00")) s = s.slice(2);
  else if (s.startsWith("0")) s = "31" + s.slice(1);
  else if (!s.startsWith("31")) s = "31" + s;
  return s.length >= 8 && s.length <= 15 ? "+" + s : null;
}

/** "7-10-2015" → "2015-10-07". */
function isoDate(d) {
  if (!d) return null;
  const [day, month, year] = d.split("-").map(Number);
  const p = (n) => String(n).padStart(2, "0");
  return `${year}-${p(month)}-${p(day)}`;
}

/** "25-8-2025 18:12:26" → ISO-timestamp in lokale tijd. */
function isoStamp(s) {
  const [date, time = "00:00:00"] = s.split(" ");
  const [day, month, year] = date.split("-").map(Number);
  const [h, m, sec] = time.split(":").map(Number);
  return new Date(year, month - 1, day, h, m, sec).toISOString();
}

const NL_MONTHS = ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];
/** Label zoals het op de kaart in de pijplijn staat: "25 aug 2025". */
function stampLabel(s) {
  const [date] = s.split(" ");
  const [day, month, year] = date.split("-").map(Number);
  return `${day} ${NL_MONTHS[month - 1]} ${year}`;
}

// Niveau uit de kolom "Niveau van uw kind m.b.t. Arabisch lezen".
const N0 = "0 (beginner)";   // Kent niks, begint vanaf 0
const N05 = "0,5";           // Kent de letters
const N1 = "1";              // Kan simpele woorden lezen

const V = "Vader", M = "Moeder";

// ---- de inschrijvingen -----------------------------------------------------
// `p`: [rol, naam, telefoon]. De eerste is het primaire contact.
// `let`: notitie die als opmerking bij de inschrijving komt (naast de opmerking
//        van de ouder zelf), voor alles wat handmatig is rechtgezet.

const ROWS = [
  { at: "25-8-2025 18:12:26", kind: "Nour Lhadi", geb: "7-10-2015", g: "f", dag: "Zaterdag", niveau: N05,
    adres: "Aakpad 5",
    p: [[V, "Abdenour Lhadi", "0634594969"], [M, "Fatima Stitou", "(06) 39 56 66 25"]] },

  { at: "25-8-2025 19:45:45", kind: "Abdur-Rahiem El Haddaoui", geb: "8-12-2016", g: "m", dag: "Zaterdag", niveau: N05,
    adres: "Amaterdam", opm: "Liefst zondag anders zaterdag middag",
    p: [[V, "Mohammed El Haddaoui", "0647066664"], [M, "Ikram Hamdi", "0647066664"]] },

  { at: "25-8-2025 19:57:49", kind: "Imrane Maazouze", geb: "16-1-2020", g: "m", dag: "Zaterdag", niveau: N0,
    adres: "Koopvaardersplantsoen 3-B", opm: "Voorkeur lesdag Zaterdag!",
    p: [[V, "Samir Maazouze", "0611216236"], [M, "Ouafae Abbassi", "0640269819"]] },

  { at: "25-8-2025 20:05:43", kind: "Inaya", geb: "13-10-2015", g: "f", dag: "Zaterdag", niveau: N0,
    adres: "Fluitschipstraat 12",
    opm: "Helaas kan ik de weekend niet aanwezig zijn omdat ik dan moet werken. Kan ik op een andere dag? Of dat ik het overmaak en dat we de intake telefonisch doen?",
    p: [[M, "Aicha", "0611589953"], [V, "Imran", "0615011532"]] },

  { at: "26-8-2025 5:17:54", kind: "Bilal", geb: "7-9-2015", g: "m", dag: "Zaterdag", niveau: N05,
    adres: "Pieter A van Heijningestraat 25", opm: "Zoon heeft ADHD",
    p: [[V, "Mohamed Abdeslami", "+31 6 41 26 64 86"], [M, "Karima Talhaoui", "0614977130"]] },

  { at: "31-8-2025 15:56:32", kind: "Maryam Assouali", geb: "2-6-2017", g: "f", dag: "Geen voorkeur", niveau: N0,
    adres: "Juttepeerpad 36",
    let: "Tweede ouder stond in het formulier als 'Moeder' met hetzelfde nummer als de vader — als één ouder overgenomen.",
    p: [[V, "Hakim Assouali", "0646033065"]] },

  { at: "9-9-2025 14:27:07", kind: "Ouways", geb: "24-6-2014", g: "m", dag: "Zondag", niveau: N1,
    adres: "Akbarstraat 74H",
    p: [[V, "Jamal", "+31628124493"], [M, "Moeder", "+31644543725"]] },

  { at: "10-9-2025 19:03:48", kind: "Nisrine elyarrodi", geb: "4-8-2019", g: "f", dag: "Zaterdag", niveau: N0,
    adres: "Pettenstraat 3",
    p: [[V, "Fouad elyarrodi", "0642176596"], [M, "Fatima", "0628105237"]] },

  { at: "27-9-2025 13:55:53", kind: "Aseel Elharidy", geb: "9-6-2017", g: "f", dag: "Geen voorkeur", niveau: N1,
    adres: "1034 SE",
    let: "Adres is alleen een postcode.",
    p: [[V, "Ayman Elharidy", "0617988047"], [M, "Amal", "0639502667"]] },

  { at: "5-10-2025 13:21:56", kind: "Zayd Bouharrou", geb: "28-6-2020", g: "m", dag: "Zaterdag", niveau: N0,
    adres: "noorderbreedte 98.",
    p: [[V, "Abderrahman Bouharrou", "0622242443"], [M, "Moeder Zayd", "0650812874"]] },

  { at: "2-11-2025 18:55:34", kind: "Hudayfa", geb: "3-5-2019", g: "m", dag: "Zaterdag", niveau: N0,
    adres: "Bezaanjachtplein 165",
    let: "Tweede ouder was dezelfde persoon als de eerste — als één ouder overgenomen.",
    p: [[V, "M'hamed Redouan", "0684915218"]] },

  { at: "2-11-2025 18:58:52", kind: "Maher", geb: "2-4-2020", g: "m", dag: "Zaterdag", niveau: N0,
    adres: "Bezaanjachtplein 165",
    let: "Tweede ouder was dezelfde persoon als de eerste — als één ouder overgenomen.",
    p: [[V, "M'hamed Redouan", "0684915218"]] },

  // Twee keer ingediend (3-11-2025 en 6-12-2025). Eerste inschrijfdatum
  // aangehouden; de naam van de moeder komt uit de tweede inzending.
  { at: "3-11-2025 16:56:14", kind: "Mohamed Damin Ben Hmidou", geb: "17-5-2018", g: "m", dag: "Zaterdag", niveau: N0,
    adres: "Koopvaardersplantsoen 5",
    let: "Twee keer ingediend (3-11-2025 en 6-12-2025); eerste inschrijfdatum aangehouden.",
    p: [[V, "Said Ben Hmidou", "0626725761"], [M, "Mirela Suljic", "0622304728"]] },

  { at: "3-11-2025 23:34:42", kind: "Nouraine EL Baghdadi", geb: "22-1-2020", g: "f", dag: "Zaterdag", niveau: N0,
    adres: "Lucien gaudinstraat 170",
    p: [[V, "Rachid", "0615423435"], [M, "Moeder", "0615511086"]] },

  { at: "5-12-2025 10:43:49", kind: "Muhammad Hazim", geb: "20-6-2020", g: "m", dag: "Zondag", niveau: N0,
    adres: "J.P. Kloosstraat 85, 1022 KD, Amsterdam",
    opm: "Our son is turning 6 in 6 months so we want to register him earlier so he can start as soon he is 6. Do let us know if there is any other procedure.",
    p: [[V, "Ahmad Hussain", "+31687871411"], [M, "Mahak Tariq", "+31649505100"]] },

  { at: "6-2-2026 20:34:31", kind: "Sabir Bourti", geb: "7-11-2019", g: "m", dag: "Zondag", niveau: N0,
    adres: "Stenghof 134",
    p: [[V, "Aziz", "0684989157"], [M, "Naima", "0687900020"]] },

  { at: "19-2-2026 17:16:20", kind: "Nouraine Assouali", geb: "16-5-2020", g: "f", dag: "Zondag", niveau: N0,
    adres: "Bezaanjachtplein 238",
    p: [[V, "Mohamed Assouali", "0645541350"], [M, "Chaima Saddik", "0687348990"]] },

  { at: "2-3-2026 19:26:03", kind: "Zakaria makhloufi", geb: "30-7-2018", g: "m", dag: "Zondag", niveau: N05,
    adres: "Aurikelstraat 38", opm: "Nee",
    let: "In het formulier stond bij de naam van de tweede ouder een telefoonnummer; naam onbekend, nummer overgenomen.",
    p: [[M, "Fatima Ait Ali", "0636197322"], [V, "Vader", "0646075871"]] },

  { at: "5-3-2026 5:34:21", kind: "Junaid Yagoubi", geb: "24-8-2018", g: "m", dag: "Geen voorkeur", niveau: N0,
    adres: "Botterstraat 30", opm: "Junaid heeft een ontwikkelingsachterstand.",
    p: [[M, "Saliha assaidi", "0636325297"], [V, "Mourad yagoubi", "0640325539"]] },

  { at: "5-3-2026 5:36:28", kind: "Jaser yagoubi", geb: "21-7-2021", g: "m", dag: "Geen voorkeur", niveau: N05,
    adres: "Botterstraat 30",
    p: [[M, "Saliha assaidi", "0636325297"], [V, "Mourad yagoubi", "0640325539"]] },

  { at: "12-3-2026 21:11:39", kind: "Adam karami", geb: "9-12-2020", g: "m", dag: "Zondag", niveau: N0,
    adres: "Elzenhagensingel 669",
    p: [[V, "Khalid Karami", "0640669979"], [M, "Moeder", "+31 6 14465800"]] },

  { at: "17-3-2026 4:27:06", kind: "Adam", geb: null, g: "m", dag: "Zondag", niveau: N0,
    adres: "Noorderbeerdte 138", opm: "Ik wil mijn kind inschrijven",
    let: "Formulier was rommelig ingevuld: ouder- en kindnaam stonden door elkaar en bij het tweede telefoonnummer stond een naam. Ouder samengevoegd tot Rachid Allati. GEBOORTEDATUM ONBEKEND — in het formulier stond de inschrijfdatum.",
    p: [[V, "Rachid Allati", "0616196683"]] },

  { at: "17-3-2026 7:58:00", kind: "Salim haddouch", geb: "17-8-2019", g: "m", dag: "Geen voorkeur", niveau: N0,
    adres: "Masthof", opm: "Niks",
    p: [[V, "Rachid haddouch", "0610212195"], [M, "Hanane Daoud", "0636591677"]] },

  { at: "25-3-2026 18:52:44", kind: "Salaheddine Akhatou", geb: "4-10-2014", g: "m", dag: "Zondag", niveau: N05,
    adres: "Notarisappelstraat 33",
    let: "Tweede ouder stond als 'Moeder' met hetzelfde nummer als de vader — als één ouder overgenomen.",
    p: [[V, "Abdelali Akhatou", "0642232380"]] },

  { at: "25-3-2026 18:54:50", kind: "Falak Akhatou", geb: "4-10-2019", g: "f", dag: "Zondag", niveau: N05,
    adres: "Notarisappelstraat 33",
    let: "Tweede ouder stond als 'Moeder' met hetzelfde nummer als de vader — als één ouder overgenomen.",
    p: [[V, "Abdelali Akhatou", "0642232380"]] },

  { at: "3-4-2026 11:32:43", kind: "Ayah rahaui", geb: "8-4-2020", g: "f", dag: "Zondag", niveau: N0,
    adres: "Spinakerhof 46",
    let: "Tweede ouder was dezelfde persoon als de eerste — als één ouder overgenomen.",
    p: [[V, "Omar rahaui", "0628471634"]] },

  { at: "4-4-2026 17:44:45", kind: "Redouane Rafiq", geb: "25-12-2019", g: "m", dag: "Geen voorkeur", niveau: N1,
    adres: "Schutterweg 101",
    p: [[V, "Abdullah", "0637297841"], [M, "Latifa", "06 37164013"]] },

  { at: "10-4-2026 20:27:04", kind: "Imran en Alaoui el Belghiti", geb: "15-9-2014", g: "m", dag: "Zondag", niveau: N0,
    adres: "Adelaarsweg",
    let: "Kindnaam letterlijk overgenomen uit het formulier ('en' is vermoedelijk 'el'). Adres zonder huisnummer.",
    p: [[M, "Fadila el Afoue", "0684904225"], [V, "Ali el Alaoui el Belghiti", "0615444700"]] },

  { at: "12-4-2026 12:32:44", kind: "Norah Ahbari", geb: "14-2-2021", g: "f", dag: "Zondag", niveau: N05,
    adres: "Bramzeil 15",
    p: [[V, "Abdelghafour Ahbari", "0639595396"], [M, "Moeder", "0626224003"]] },

  { at: "12-5-2026 10:28:48", kind: "Mohamed", geb: "30-12-2018", g: "m", dag: "Zondag", niveau: N1,
    adres: "p.l. Takstraat 36",
    p: [[V, "Omar Khouna", "0611598306"], [M, "chaimae Benali", "0687277275"]] },

  { at: "23-5-2026 7:54:28", kind: "Sirine", geb: "31-7-2020", g: "f", dag: "Geen voorkeur", niveau: N05,
    adres: "Zuiderzeelaan 78",
    p: [[M, "Sirine al khoumssi", "0687044001"], [V, "Ali", "0642095225"]] },

  { at: "14-6-2026 8:13:30", kind: "Bilal Arbib", geb: "1-5-2018", g: "m", dag: "Zaterdag", niveau: N0,
    adres: "Elzenhagensingel 84",
    let: "Tweede ouder stond als 'Moeder' met hetzelfde nummer als de vader — als één ouder overgenomen.",
    p: [[V, "Mouad Arbib", "0653381125"]] },

  // Twee inzendingen van hetzelfde gezin waarin ouder- en kindnamen door elkaar
  // staan. De telefoonnummers zijn wél consistent, dus het is één gezin met twee
  // kinderen; oudernamen op onbekend gezet.
  { at: "16-6-2026 8:34:07", kind: "Rayan", geb: "2-6-2016", g: "m", dag: "Zaterdag", niveau: N1,
    adres: "Amsterdam",
    let: "OUDERNAMEN CONTROLEREN: in het formulier stonden ouder- en kindnamen door elkaar. De telefoonnummers zijn wel consistent met de inzending voor Asenai.",
    p: [[V, "Onbekend", "0638598514"], [M, "Onbekend", "0638681885"]] },

  { at: "16-6-2026 8:36:19", kind: "Asenai", geb: "14-8-2018", g: null, dag: "Zaterdag", niveau: N1,
    adres: "Amsterdam",
    let: "OUDERNAMEN CONTROLEREN: in het formulier stonden ouder- en kindnamen door elkaar. De telefoonnummers zijn wel consistent met de inzending voor Rayan.",
    p: [[V, "Onbekend", "0638598514"], [M, "Onbekend", "0638681885"]] },

  { at: "22-6-2026 16:05:39", kind: "Intissar El Assali", geb: "11-1-2016", g: "f", dag: "Zondag", niveau: N1,
    adres: "Waterlandplein 288E",
    let: "TELEFOONNUMMER MOEDER CONTROLEREN: stond bij dit kind als ...049 en bij Noussair als ...048; ...048 aangehouden.",
    p: [[V, "Abdelaziz el Assali", "0634021038"], [M, "Malika Moutar-el Assali", "0648081048"]] },

  { at: "22-6-2026 16:07:30", kind: "Noussair el Assali", geb: "28-11-2018", g: "m", dag: "Zondag", niveau: N05,
    adres: "Waterlandplein 288E",
    let: "TELEFOONNUMMER MOEDER CONTROLEREN: stond bij Intissar als ...049 en hier als ...048; ...048 aangehouden.",
    p: [[V, "Abdelaziz el Assali", "0634021038"], [M, "Malika Moutar-el Assali", "0648081048"]] },

  { at: "24-6-2026 21:08:22", kind: "Dario Rodriguez", geb: "19-6-2020", g: "m", dag: "Zondag", niveau: N0,
    adres: "Elzenhagensingel 437", opm: "Dankjulliewel",
    p: [[V, "Mohamad Alhaj", "0685476874"], [M, "Patricia Rodriguez", "+31 6 15885372"]] },

  { at: "10-7-2026 12:33:07", kind: "Ouail", geb: "6-10-2016", g: "m", dag: "Zondag", niveau: N05,
    adres: "Amsterdam", opm: "Ne",
    let: "Tweede ouder was dezelfde persoon als de eerste — als één ouder overgenomen.",
    p: [[V, "Aziz", "0681480184"]] },

  { at: "14-7-2026 9:08:36", kind: "Reema M. Alsabe", geb: "9-7-2020", g: "f", dag: "Geen voorkeur", niveau: N0,
    adres: "Landsmeer, sportlaan 16, 1121CB",
    let: "OPMERKING ONLEESBAAR: de ouder schreef een toelichting in het Arabisch die bij het exporteren onleesbaar is geworden. Origineel opnieuw opvragen.",
    p: [[M, "Islam", "0684618939"], [V, "Montaser", "+31 6 87 67 91 10"]] },

  { at: "23-7-2026 11:30:06", kind: "Zayd Bakhallakh", geb: "9-1-2021", g: "m", dag: "Zaterdag", niveau: N0,
    adres: "Elzenhagensingel 68",
    p: [[V, "Khalid Bakhallakh", "0619124467"], [M, "N. Azannay", "+31 6 48 12 87 92"]] },

  { at: "30-7-2026 17:36:52", kind: "Surat", geb: "26-6-2019", g: null, dag: "Geen voorkeur", niveau: N0,
    adres: "Overslaghof 81",
    let: "Tweede ouder stond in het formulier als '.' met hetzelfde nummer — als één ouder overgenomen.",
    p: [[M, "Madina", "+31 6 38 57 34 52"]] },

  { at: "7-8-2026 15:54:06", kind: "Ayden Klooster", geb: "16-12-2017", g: "m", dag: "Zondag", niveau: N05,
    adres: "Laarderweg 201, 1403 RJ, Bussum",
    p: [[M, "Chaimae Betti", "0629221892"], [V, "Vincent Klooster", "0641955111"]] },

  { at: "7-8-2026 15:56:36", kind: "Aliya Klooster", geb: "11-11-2019", g: "f", dag: "Zondag", niveau: N1,
    adres: "Laarderweg 201, 1403 RJ, Bussum",
    p: [[M, "Chaimae Betti", "0629221892"], [V, "Vincent Klooster", "0641955111"]] },
];

// ---- uitvoeren -------------------------------------------------------------

async function main() {
  const { data: sj, error: sjErr } = await db
    .from("schooljaren").select("id, name").eq("code", SCHOOLJAAR_CODE).single();
  if (sjErr || !sj) throw new Error(`Schooljaar ${SCHOOLJAAR_CODE} niet gevonden: ${sjErr?.message ?? "geen rij"}`);

  const { data: existing, error: exErr } = await db.from("enrollments").select("child_name, birthdate");
  if (exErr) throw new Error(`Bestaande inschrijvingen lezen mislukt: ${exErr.message}`);
  const seen = new Set((existing ?? []).map((e) => `${e.child_name.trim().toLowerCase()}|${e.birthdate ?? ""}`));

  console.log(`Schooljaar: ${sj.name}`);
  console.log(APPLY ? "Modus: SCHRIJVEN\n" : "Modus: proefdraaien (voeg --apply toe om echt weg te schrijven)\n");

  let added = 0, skipped = 0;
  const flags = [];

  for (const r of ROWS) {
    const birthdate = isoDate(r.geb);
    const key = `${r.kind.trim().toLowerCase()}|${birthdate ?? ""}`;
    if (seen.has(key)) {
      console.log(`  overslaan  ${r.kind} — bestaat al`);
      skipped++;
      continue;
    }
    seen.add(key);

    const parents = r.p
      .map(([role, name, tel], i) => ({ role, name, phone: phone(tel), email: "", is_primary: i === 0 }))
      .filter((p) => p.name);
    const notes = [r.opm, r.let].filter(Boolean).join("\n\n") || null;
    if (r.let) flags.push(`${r.kind}: ${r.let}`);

    console.log(`  toevoegen  ${r.kind}${birthdate ? ` (${birthdate})` : " (geboortedatum onbekend)"} · `
      + `${r.dag} · niveau ${r.niveau} · ${parents.map((p) => `${p.role} ${p.name} ${p.phone ?? "?"}`).join(" | ")}`);
    added++;
    if (!APPLY) continue;

    const { data: enr, error: enrErr } = await db.from("enrollments").insert({
      child_name: r.kind,
      birthdate,
      gender: r.g,
      track: "regulier",
      status: "wachtlijst",
      preferred_lesday: r.dag,
      address: r.adres || null,
      notes,
      submitted_at: isoStamp(r.at),
      submitted_label: stampLabel(r.at),
    }).select("id").single();
    if (enrErr) throw new Error(`inschrijving ${r.kind}: ${enrErr.message}`);

    if (parents.length) {
      const { error: pErr } = await db.from("enrollment_parents")
        .insert(parents.map((p) => ({ enrollment_id: enr.id, ...p })));
      if (pErr) throw new Error(`ouders ${r.kind}: ${pErr.message}`);
    }

    // Plaatsing zonder klas, mét niveau — zo staat het niveau voorgevuld in de
    // Klassenindeler en hoef je alleen nog een klas te kiezen.
    const { error: plErr } = await db.from("enrollment_placements")
      .insert({ enrollment_id: enr.id, schooljaar_id: sj.id, niveau: r.niveau });
    if (plErr) throw new Error(`plaatsing ${r.kind}: ${plErr.message}`);
  }

  console.log(`\n${added} toe te voegen, ${skipped} overgeslagen (bestond al).`);
  if (flags.length) {
    console.log(`\nHandmatig nagekeken (${flags.length}) — deze notities staan ook bij de inschrijving:`);
    for (const f of flags) console.log(`  - ${f}`);
  }
  if (!APPLY) console.log("\nEr is niets weggeschreven. Draai opnieuw met --apply.");
}

main().catch((e) => { console.error("\nMislukt:", e.message); process.exit(1); });
