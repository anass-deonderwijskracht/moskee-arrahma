// Seed the dev database with a deterministic dataset mirroring the design
// prototype (9 classes, ~137 leerlingen, parents/siblings, lessons, attendance,
// Qur'an assignments, enrollments, finance). Dev-only: uses the service_role
// key (bypasses RLS). Re-runnable: clears the seeded tables first.
//
//   node scripts/seed.mjs
//
import { createClient } from "@supabase/supabase-js";
import { loadEnv } from "./lib/env.mjs";

const { url, serviceKey } = loadEnv();
const db = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

// ---- helpers ---------------------------------------------------------------
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
const pick = (r, arr) => arr[Math.floor(r() * arr.length)];

async function insert(table, rows, { select = "id" } = {}) {
  if (!rows.length) return [];
  const out = [];
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500);
    const q = db.from(table).insert(chunk);
    const { data, error } = select ? await q.select(select) : await q;
    if (error) throw new Error(`insert ${table}: ${error.message}`);
    if (data) out.push(...data);
  }
  return out;
}

async function clearAll() {
  // Child → parent order. enrollment_placements before enrollments; etc.
  const tables = [
    "audit_log", "payments", "expenses", "budget_categories",
    "enrollment_placements", "enrollment_parents", "enrollments",
    "leerling_surah_progress", "quran_assignments", "lesson_notes",
    "attendance_records", "lessons", "leerlingen", "kind_ouder",
    "kinderen", "ouders", "classes", "teachers",
  ];
  for (const t of tables) {
    const { error } = await db.from(t).delete().not("id", "is", null);
    if (error && !/does not exist|schema cache/i.test(error.message)) {
      throw new Error(`clear ${t}: ${error.message}`);
    }
  }
}

// ---- source data (ported from the prototype data.js) ----------------------
const FIRST_BOY = ["Ayoub","Yusuf","Ibrahim","Hamza","Mohammed","Omar","Idriss","Bilal","Adam","Zakaria","Ismail","Mehmet","Emir","Yasin","Ali","Mustafa","Sami","Anas","Nourdine","Salah","Walid","Kerim","Said","Hicham","Othman","Younes","Karim","Rayan","Tarik","Hashim"];
const FIRST_GIRL = ["Fatima","Aisha","Maryam","Khadija","Sara","Lina","Yasmin","Amina","Salma","Sumaya","Zeynep","Esma","Nour","Hafsa","Imane","Rania","Hanan","Soumaya","Selma","Asma","Latifa","Naima","Houda","Samira","Ouafa","Karima"];
const LAST = ["El Amrani","Benzakour","Bouchikhi","El Ouali","El Hadri","Yilmaz","Demir","Aydin","Çelik","Kaya","Öztürk","El Idrissi","Bensaïd","El Khattabi","Tahiri","El Mansouri","Bakkali","Bourkadi","Ouahabi","Hamdaoui","Boukhriss","Lahlou","Ziani","Bakir","Akdag","Saidi","El Fassi","Chakir","Boulaich","Ennassiri"];
const ADDRESSES = ["Wagenmakerstraat 24, 1313 BG Almere","Esdoornlaan 17, 1326 HC Almere","Stedendreef 144, 1318 BG Almere","Operaweg 88, 1323 VR Almere","Spectrumdreef 5, 1325 GD Almere"];
const NIVEAUS = ["0", "0,5", "1", "1,5", "2"];

const TEACHERS = [
  { key: "t1", name: "Ustadh Mohammed Bakkali", short: "M. Bakkali", role: "les", specialty: "Onderbouw, leesvaardigheid" },
  { key: "t2", name: "Ustadha Fatima Ziani", short: "F. Ziani", role: "les", specialty: "Onderbouw" },
  { key: "t3", name: "Ustadh Idriss El Amrani", short: "I. El Amrani", role: "les", specialty: "Arabisch & Qur'an" },
  { key: "t4", name: "Ustadha Khadija Tahiri", short: "K. Tahiri", role: "les", specialty: "Middenbouw" },
  { key: "t5", name: "Ustadh Hamza Demir", short: "H. Demir", role: "les", specialty: "Tajwid & memorisatie" },
  { key: "t6", name: "Ustadha Amina Bensaïd", short: "A. Bensaïd", role: "les", specialty: "Bovenbouw" },
  { key: "t7", name: "Ustadh Yusuf Aydin", short: "Y. Aydin", role: "both", specialty: "Hifdh-traject (Klein)" },
  { key: "t8", name: "Ustadh Anas El Khattabi", short: "A. El Khattabi", role: "les", specialty: "Bovenbouw, Qur'an" },
  { key: "t9", name: "Ustadh Said Boulaich", short: "S. Boulaich", role: "both", specialty: "Hifdh-traject (Bovenbouw)" },
  { key: "t10", name: "Ustadh Salim Bouchikhi", short: "S. Bouchikhi", role: "quran", specialty: "Qur'an docent — onderbouw" },
  { key: "t11", name: "Ustadha Ouafa El Hadri", short: "O. El Hadri", role: "quran", specialty: "Qur'an docent — middenbouw" },
  { key: "t12", name: "Ustadh Tarik Lahlou", short: "T. Lahlou", role: "quran", specialty: "Qur'an docent — bovenbouw" },
  { key: "t13", name: "Ustadh Othman El Mansouri", short: "O. El Mansouri", role: "quran", specialty: "Qur'an docent — bovenbouw" },
];

const CLASS_DEFS = [
  { key: "k1", code: "Klas 1", grade: 1, teacher: "t1", quran: "t10", color: "primary", day: "Zaterdag", time: "09:30 - 11:30", capacity: 22, track: "regulier" },
  { key: "k2", code: "Klas 2", grade: 2, teacher: "t2", quran: "t10", color: "info", day: "Zaterdag", time: "09:30 - 11:30", capacity: 22, track: "regulier" },
  { key: "k3", code: "Klas 3", grade: 3, teacher: "t3", quran: "t11", color: "accent", day: "Zaterdag", time: "11:45 - 13:45", capacity: 22, track: "regulier" },
  { key: "k4", code: "Klas 4", grade: 4, teacher: "t4", quran: "t11", color: "success", day: "Zaterdag", time: "11:45 - 13:45", capacity: 22, track: "regulier" },
  { key: "k5", code: "Klas 5", grade: 5, teacher: "t5", quran: "t12", color: "warn", day: "Zondag", time: "09:30 - 11:30", capacity: 22, track: "regulier" },
  { key: "k6", code: "Klas 6", grade: 6, teacher: "t6", quran: "t13", color: "danger", day: "Zondag", time: "11:45 - 13:45", capacity: 22, track: "regulier" },
  { key: "k7", code: "Klas 7", grade: 7, teacher: "t8", quran: "t13", color: "info", day: "Zondag", time: "09:30 - 11:30", capacity: 18, track: "regulier" },
  { key: "khk", code: "Klas Hifdh-K", grade: 6, teacher: "t7", quran: "t7", color: "primary", day: "Zondag", time: "14:00 - 17:00", capacity: 12, track: "hifdh" },
  { key: "khb", code: "Klas Hifdh-B", grade: 7, teacher: "t9", quran: "t9", color: "accent", day: "Zaterdag", time: "14:00 - 17:00", capacity: 12, track: "hifdh" },
];
const SIZES = [22, 21, 20, 22, 19, 19, 16, 8, 7];

const LESSON_DATES = ["2025-08-30","2025-09-06","2025-09-13","2025-09-20","2025-09-27","2025-10-04","2025-10-11","2025-10-18","2025-10-25","2025-11-01","2025-11-08"];
const TODAY = "2025-10-18";

const EXPENSES = [
  ["2025-09-05","Materialen","Werkboeken niveau 1-3 (75 stuks)",1125,"Dar Al-Kotob NL"],
  ["2025-09-08","Materialen","Schriften, pennen, markers",248,"Bruna Zakelijk"],
  ["2025-09-15","Salaris","Vergoeding docenten Q3",4900,"Loonbetaling"],
  ["2025-09-21","Faciliteit","Schoonmaak september",320,"Reinclean BV"],
  ["2025-10-04","Catering","Iftar afsluiting blok 1",410,"Restaurant Najwa"],
  ["2025-10-12","Faciliteit","Verwarming bijdrage Q4",580,"Energieleverancier"],
  ["2025-10-18","Materialen","Whiteboard markers + papier",87,"Action"],
  ["2025-11-02","Activiteit","Excursie bovenbouw",640,"Reisbureau Yasmin"],
  ["2025-11-15","Salaris","Vergoeding docenten Q4 (deel 1)",2450,"Loonbetaling"],
  ["2025-11-22","Materialen","Qur'an-edities mushaf (set van 10)",295,"Dar Al-Kotob NL"],
  ["2025-12-01","Software","Jaarlicentie beheerapp",480,"Cloud Provider"],
];
const BUDGET = [
  ["Salaris docenten", 18500, "primary"],
  ["Materialen", 4500, "accent"],
  ["Faciliteit", 3800, "info"],
  ["Activiteiten", 2400, "success"],
  ["Software & admin", 900, "warn"],
];

// ---- run -------------------------------------------------------------------
async function main() {
  console.log("→ Verbinden met", url);
  // sanity: tables exist?
  const probe = await db.from("schooljaren").select("code,id");
  if (probe.error) {
    throw new Error(
      `Kon 'schooljaren' niet lezen (${probe.error.message}). ` +
      "Pas eerst de migraties toe (supabase/apply_all.sql) in de Supabase SQL editor.",
    );
  }
  const sjByCode = Object.fromEntries(probe.data.map((s) => [s.code, s.id]));
  const surahsRes = await db.from("surahs").select("n,name,verses");
  if (surahsRes.error) throw new Error(surahsRes.error.message);
  const SURAHS = surahsRes.data;
  const orderedSurahs = [...SURAHS].sort((a, b) => b.n - a.n); // memorisation order

  console.log("→ Leegmaken bestaande seed-data…");
  await clearAll();

  // Teachers
  console.log("→ Docenten…");
  const teacherRows = await insert("teachers", TEACHERS.map((t) => ({
    name: t.name, short: t.short, role: t.role, specialty: t.specialty,
    email: t.short.toLowerCase().replace(/[^a-z]/g, ".").replace(/\.+/g, ".") + "@moskee-arrahma.nl",
    joined: "2022-09-01",
  })), { select: "id,name" });
  const tId = {};
  TEACHERS.forEach((t, i) => { tId[t.key] = teacherRows[i].id; });

  // Classes: current (y2025), historic (y2024), next (y2026)
  console.log("→ Klassen…");
  const classInserts = [];
  const classKeyOrder = [];
  // Keep every row the same shape — PostgREST nulls missing keys instead of
  // applying column defaults when an insert array is heterogeneous.
  const classRow = (c, schooljaarId, { historic = false, is_next = false } = {}) => ({
    code: c.code, grade: c.grade, teacher_id: tId[c.teacher], quran_teacher_id: tId[c.quran],
    color: c.color, day: c.day, time: c.time, location: "Moskee Arrahma", capacity: c.capacity,
    schooljaar_id: schooljaarId, track: c.track, historic, is_next,
  });
  for (const c of CLASS_DEFS) { classInserts.push(classRow(c, sjByCode.y2025)); classKeyOrder.push(c.key); }
  for (const c of CLASS_DEFS.slice(0, 7)) { classInserts.push(classRow(c, sjByCode.y2024, { historic: true })); classKeyOrder.push(c.key + "_y24"); }
  for (const c of CLASS_DEFS) { classInserts.push(classRow(c, sjByCode.y2026, { is_next: true })); classKeyOrder.push(c.key + "_y26"); }
  const classRows = await insert("classes", classInserts, { select: "id" });
  const cId = {};
  classKeyOrder.forEach((k, i) => { cId[k] = classRows[i].id; });

  // Students → kinderen, ouders, leerlingen (current year)
  console.log("→ Leerlingen, kinderen & ouders genereren…");
  const r = rng(42);
  const students = [];
  let sNum = 1;
  CLASS_DEFS.forEach((cls, ci) => {
    for (let i = 0; i < SIZES[ci]; i++) {
      const isGirl = r() > 0.52;
      const first = pick(r, isGirl ? FIRST_GIRL : FIRST_BOY);
      const last = pick(r, LAST);
      const age = 5 + cls.grade + Math.floor(r() * 2);
      const fF = pick(r, FIRST_BOY), mF = pick(r, FIRST_GIRL);
      const parents = [
        { role: "Vader", name: fF + " " + last, phone: "06 " + Math.floor(10000000 + r() * 89999999), email: `${fF.toLowerCase()}.${last.toLowerCase().replace(/[^a-z]/g, "")}@gmail.com`, primary: true },
        { role: "Moeder", name: mF + " " + last, phone: "06 " + Math.floor(10000000 + r() * 89999999), email: `${mF.toLowerCase()}.${last.toLowerCase().replace(/[^a-z]/g, "")}@gmail.com`, primary: false },
      ];
      const attendanceRate = 0.78 + r() * 0.21;
      students.push({
        key: "s" + sNum, first, last, gender: isGirl ? "f" : "m", age,
        classKey: cls.key, grade: cls.grade, parents, address: pick(r, ADDRESSES),
        leerlingnummer: "M" + (1000 + sNum),
        niveau: NIVEAUS[Math.min(4, Math.floor(r() * 5))],
        attendanceRate,
        arabicHw: Math.max(0.55, Math.min(0.98, attendanceRate - 0.05 + (r() - 0.5) * 0.15)),
        quranLearned: Math.max(0.5, Math.min(0.98, attendanceRate - 0.02 + (r() - 0.5) * 0.2)),
        surahsKnown: Math.min(38, Math.floor(cls.grade * 6 + r() * 4)),
        notes: r() > 0.7 ? pick(r, ["Heeft extra ondersteuning bij tajwid.","Snelle leerling, klaar voor uitdaging.","Soms onrustig, gesprek met ouders gevoerd.","Heel toegewijd, oefent thuis dagelijks."]) : "",
      });
      sNum++;
    }
  });

  // Sibling linking: within a last name, cluster 1-3 sharing parent objects.
  const rs = rng(99);
  const byLast = {};
  students.forEach((s) => { (byLast[s.last] ||= []).push(s); });
  Object.values(byLast).forEach((group) => {
    let i = 0;
    while (i < group.length) {
      let n = 1;
      if (group.length - i >= 2 && rs() < 0.45) n = 2;
      if (n === 2 && group.length - i >= 3 && rs() < 0.2) n = 3;
      if (n > 1) {
        const shared = group[i].parents, addr = group[i].address;
        for (let j = i + 1; j < i + n; j++) { group[j].parents = shared; group[j].address = addr; }
      }
      i += n;
    }
  });

  // Dedup ouders by object identity.
  const ouderObjs = [];
  const ouderIdx = new Map();
  students.forEach((s) => s.parents.forEach((p) => {
    if (!ouderIdx.has(p)) { ouderIdx.set(p, ouderObjs.length); ouderObjs.push(p); }
  }));
  console.log(`→ Ouders (${ouderObjs.length}) invoegen…`);
  const ro = rng(17);
  const ouderRows = await insert("ouders", ouderObjs.map((p) => ({
    role: p.role, name: p.name, phone: p.phone, email: p.email, primary: p.primary,
    bereik: pick(ro, ["Werkdagen na 17:00", "Werkdagen ochtend", "Weekend", "Altijd bereikbaar"]),
  })), { select: "id" });
  const ouderUuid = ouderObjs.map((_, i) => ouderRows[i].id);

  console.log(`→ Kinderen (${students.length}) invoegen…`);
  const kindRows = await insert("kinderen", students.map((s) => ({
    first_name: s.first, last_name: s.last,
    initials: (s.first[0] + (s.last.replace(/[^A-Za-z]/g, "")[0] || s.last[0])).toUpperCase(),
    gender: s.gender, birth_year: 2025 - s.age, address: s.address, notes: s.notes,
  })), { select: "id" });
  students.forEach((s, i) => { s.kindId = kindRows[i].id; });

  // kind_ouder
  const ko = [];
  students.forEach((s) => s.parents.forEach((p) => {
    ko.push({ kind_id: s.kindId, ouder_id: ouderUuid[ouderIdx.get(p)], is_primary: p.primary });
  }));
  // dedup (kind,ouder)
  const koSeen = new Set();
  const koRows = ko.filter((x) => { const k = x.kind_id + x.ouder_id; if (koSeen.has(k)) return false; koSeen.add(k); return true; });
  await insert("kind_ouder", koRows, { select: null });

  // leerlingen (current year)
  console.log("→ Leerling-inschrijvingen (huidig jaar)…");
  const leerlingRows = await insert("leerlingen", students.map((s) => ({
    kind_id: s.kindId, class_id: cId[s.classKey], schooljaar_id: sjByCode.y2025,
    leerlingnummer: s.leerlingnummer, niveau: s.niveau, joined: "2025-09-06",
  })), { select: "id" });
  students.forEach((s, i) => { s.leerlingId = leerlingRows[i].id; });

  // Historic leerlingen (snapshots) — 60% have 1-3 prior years
  console.log("→ Historische leerling-records…");
  const rh = rng(31);
  const histRows = [];
  for (const s of students) {
    let yearsBack = 0; const roll = rh();
    if (roll < 0.4) yearsBack = 1; else if (roll < 0.55) yearsBack = 2; else if (roll < 0.62) yearsBack = 3;
    for (let y = 1; y <= yearsBack && y <= 1; y++) {
      // Only y2024 is modelled with classes; one prior snapshot per kind.
      const priorGrade = Math.max(1, s.grade - y);
      const priorClassKey = (CLASS_DEFS.find((c) => c.grade === priorGrade)?.key ?? "k1") + "_y24";
      if (!cId[priorClassKey]) continue;
      histRows.push({
        kind_id: s.kindId, class_id: cId[priorClassKey], schooljaar_id: sjByCode.y2024,
        leerlingnummer: s.leerlingnummer, niveau: s.niveau, joined: "2024-09-07",
        final_grade: pick(rh, ["Zeer goed", "Goed", "Goed", "Voldoende"]),
        notes_end_of_year: pick(rh, ["Stabiel jaar, mooie groei in tajwid.", "Strakke memorisatie-discipline.", "Doorgegroeid naar volgend niveau.", "Voorbeeldige inzet."]),
        hist_attendance_pct: Math.max(0.72, s.attendanceRate - 0.03),
        hist_surahs_known: Math.max(0, s.surahsKnown - 5),
      });
    }
  }
  await insert("leerlingen", histRows, { select: null });

  // Lessons for current classes
  console.log("→ Lessen…");
  const lessonInserts = [];
  for (const c of CLASS_DEFS) {
    LESSON_DATES.forEach((d, idx) => {
      lessonInserts.push({ class_id: cId[c.key], date: d, week_nr: 35 + idx, topic: "Wekelijkse les", time: c.time, location: "Moskee Arrahma", _classKey: c.key });
    });
  }
  const lessonRows = await insert("lessons", lessonInserts.map(({ _classKey, ...x }) => x), { select: "id,class_id,date" });
  // index lessons by class+date
  const lessonByClassDate = {};
  lessonRows.forEach((l) => { lessonByClassDate[l.class_id + "|" + l.date] = l.id; });
  const completedDates = LESSON_DATES.filter((d) => d < TODAY);

  // Attendance records for completed lessons (drives metrics)
  console.log("→ Aanwezigheids- & huiswerkregistratie…");
  const ra = rng(55);
  const attInserts = [];
  for (const s of students) {
    for (const d of completedDates) {
      const lessonId = lessonByClassDate[cId[s.classKey] + "|" + d];
      if (!lessonId) continue;
      const present = ra() < s.attendanceRate;
      const status = present ? "A" : pick(ra, ["Z", "L", "O"]);
      const hwRoll = ra();
      const homework = !present ? null : hwRoll < s.arabicHw ? "yes" : hwRoll < s.arabicHw + 0.12 ? "partial" : "no";
      attInserts.push({ leerling_id: s.leerlingId, lesson_id: lessonId, status, homework, materials_issue: ra() < 0.04, note: null });
    }
  }
  await insert("attendance_records", attInserts, { select: null });

  // Surah progress + quran assignments
  console.log("→ Qur'an-voortgang & toewijzingen…");
  const progressInserts = [];
  const quranInserts = [];
  const rq = rng(101);
  for (const s of students) {
    // mark `surahsKnown` surahs as done (back-to-front), next as progress
    for (let i = 0; i < orderedSurahs.length; i++) {
      const surahN = orderedSurahs[i].n;
      let status = null;
      if (i < s.surahsKnown - 2) status = "done";
      else if (i < s.surahsKnown) status = "progress";
      else if (i < s.surahsKnown + 1 && rq() > 0.6) status = "review";
      if (status) progressInserts.push({ leerling_id: s.leerlingId, surah_n: surahN, status });
    }
    // current homework at the "progress" boundary
    const baseIdx = Math.max(0, Math.min(orderedSurahs.length - 1, s.surahsKnown));
    const surah = orderedSurahs[baseIdx];
    if (surah) {
      const start = 1 + Math.floor(rq() * Math.max(0, surah.verses - 5));
      const end = Math.min(surah.verses, start + 3 + Math.floor(rq() * 4));
      const lastCompleted = lessonByClassDate[cId[s.classKey] + "|" + completedDates[completedDates.length - 1]];
      // Some are already evaluated (drives quran_learned_pct)
      const evalRoll = rq();
      const evaluation = evalRoll < s.quranLearned ? "yes" : evalRoll < s.quranLearned + 0.12 ? "partial" : "no";
      quranInserts.push({
        leerling_id: s.leerlingId, class_id: cId[s.classKey], assigned_at_lesson_id: lastCompleted,
        surah_n: surah.n, start_ayah: start, end_ayah: end, type: "new", evaluation,
      });
    }
  }
  await insert("leerling_surah_progress", progressInserts, { select: null });
  await insert("quran_assignments", quranInserts, { select: null });

  // Payments (collegegeld) — one termijn per leerling
  console.log("→ Betalingen…");
  const rp = rng(77);
  const payInserts = students.map((s) => {
    const roll = rp();
    const status = roll > 0.12 ? "paid" : roll > 0.06 ? "open" : "expected";
    return { leerling_id: s.leerlingId, date: "2025-09-20", description: "Termijn 1 — collegegeld", amount: status === "paid" ? 220 : 0, status, method: status === "paid" ? "iDEAL" : null };
  });
  await insert("payments", payInserts, { select: null });

  // Enrollments + parents
  console.log("→ Inschrijvingen…");
  const re = rng(7);
  const buckets = { wachtlijst: 12, intake: 8, toegezegd: 6, afgewezen: 3 };
  const enrollInserts = [];
  for (const [status, count] of Object.entries(buckets)) {
    for (let i = 0; i < count; i++) {
      const isGirl = re() > 0.5;
      const first = pick(re, isGirl ? FIRST_GIRL : FIRST_BOY);
      const last = pick(re, LAST);
      enrollInserts.push({
        child_name: first + " " + last, age: 6 + Math.floor(re() * 8), gender: isGirl ? "f" : "m",
        track: re() > 0.78 ? "hifdh" : "regulier", status,
        target_class: pick(re, CLASS_DEFS).code,
        submitted_label: Math.floor(re() * 30) + " dagen geleden",
        rejection_reason: status === "afgewezen" ? pick(re, ["Geen plek beschikbaar", "Past niet bij niveau", "Ouders zagen af van inschrijving"]) : null,
        _last: last,
      });
    }
  }
  const enrollRows = await insert("enrollments", enrollInserts.map(({ _last, ...x }) => x), { select: "id" });
  const parentInserts = [];
  enrollInserts.forEach((e, i) => {
    const last = e._last;
    const fF = pick(re, ["Hassan", "Karim", "Brahim", "Omar", "Said", "Younes", "Mehmet", "Mustafa"]);
    const mF = pick(re, ["Mounia", "Saliha", "Najat", "Latifa", "Khadija", "Houda", "Zeynep", "Esma"]);
    parentInserts.push(
      { enrollment_id: enrollRows[i].id, role: "Vader", name: fF + " " + last, phone: "06 " + Math.floor(10000000 + re() * 89999999), email: `${fF.toLowerCase()}.${last.toLowerCase().replace(/[^a-z]/g, "")}@gmail.com`, is_primary: true },
      { enrollment_id: enrollRows[i].id, role: "Moeder", name: mF + " " + last, phone: "06 " + Math.floor(10000000 + re() * 89999999), email: `${mF.toLowerCase()}.${last.toLowerCase().replace(/[^a-z]/g, "")}@gmail.com`, is_primary: false },
    );
  });
  await insert("enrollment_parents", parentInserts, { select: null });

  // Finance: expenses + budget
  console.log("→ Financiën…");
  await insert("expenses", EXPENSES.map(([date, category, description, amount, vendor]) => ({
    schooljaar_id: sjByCode.y2025, date, category, description, amount, vendor,
  })), { select: null });
  await insert("budget_categories", BUDGET.map(([name, planned, color]) => ({
    schooljaar_id: sjByCode.y2025, name, planned, color,
  })), { select: null });

  // Audit log sample
  await insert("audit_log", [
    { user_label: "Ustadh Mohammed", action: "voltooide Qur'an-toets", object: "Klas 1", type: "quran" },
    { user_label: "Ustadha Fatima", action: "voerde aanwezigheid in voor", object: "Klas 2 — zaterdag", type: "att" },
    { user_label: "Systeem", action: "nieuwe aanmelding ontvangen voor", object: "Hamza Boulaich (8 jr)", type: "enroll" },
    { user_label: "Bestuur", action: "registreerde betaling", object: "€220 — collegegeld", type: "fin" },
    { user_label: "Ustadh Idriss", action: "plaatste opmerking bij", object: "Rayan Çelik", type: "note" },
  ], { select: null });

  console.log(`\n✓ Seed klaar: ${TEACHERS.length} docenten, ${classInserts.length} klassen, ${students.length} leerlingen, ${ouderObjs.length} ouders, ${enrollInserts.length} inschrijvingen.`);
}

main().catch((e) => { console.error("\n✗ Seed mislukt:", e.message); process.exit(1); });
