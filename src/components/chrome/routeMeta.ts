export interface RouteMeta { title: string; crumbs: string[]; }

/** Title + breadcrumb per top-level route segment. */
export const ROUTE_META: Record<string, RouteMeta> = {
  dashboard: { title: "Dashboard", crumbs: ["Overzicht"] },
  planning: { title: "Planning", crumbs: ["Overzicht", "Planning"] },
  kinderen: { title: "Kinderen", crumbs: ["Mensen", "Kinderen"] },
  ouders: { title: "Ouders & voogden", crumbs: ["Mensen", "Ouders"] },
  teachers: { title: "Docenten", crumbs: ["Mensen", "Docenten"] },
  students: { title: "Leerlingen", crumbs: ["Onderwijs", "Leerlingen"] },
  classes: { title: "Klassen", crumbs: ["Onderwijs", "Klassen"] },
  enrollments: { title: "Inschrijvingen", crumbs: ["Administratie", "Inschrijvingen"] },
  finance: { title: "Financiën", crumbs: ["Administratie", "Financiën"] },
  settings: { title: "Instellingen", crumbs: ["Systeem", "Instellingen"] },
};

export const DETAIL_META: Record<string, RouteMeta> = {
  kinderen: { title: "Kind", crumbs: ["Mensen", "Kinderen", "Detail"] },
  ouders: { title: "Ouder/voogd", crumbs: ["Mensen", "Ouders", "Detail"] },
  students: { title: "Leerling", crumbs: ["Onderwijs", "Leerlingen", "Detail"] },
  classes: { title: "Klas", crumbs: ["Onderwijs", "Klassen", "Detail"] },
};

export function metaFor(pathname: string): RouteMeta {
  const parts = pathname.split("/").filter(Boolean);
  const base = parts[0] ?? "dashboard";
  if (parts.length > 1 && DETAIL_META[base]) return DETAIL_META[base];
  return ROUTE_META[base] ?? ROUTE_META.dashboard;
}
