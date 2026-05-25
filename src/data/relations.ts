import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Tables, Views } from "@/types/database";

export interface KindYear extends Tables<"leerlingen"> {
  classes: { code: string; color: string | null; teachers: { short: string | null } | null } | null;
  schooljaren: { name: string; is_current: boolean } | null;
}
export interface KindDetailData {
  kind: Tables<"kinderen">;
  years: KindYear[];
  metrics: Record<string, Views<"leerling_metrics">>;
  ouders: Tables<"ouders">[];
  siblings: { id: string; full_name: string; initials: string | null; class_code: string | null }[];
}

export function useKindDetail(id: string | undefined) {
  return useQuery({
    queryKey: ["kind-detail", id],
    enabled: !!id,
    queryFn: async (): Promise<KindDetailData> => {
      const { data: kind, error } = await supabase.from("kinderen").select("*").eq("id", id!).single();
      if (error) throw error;

      const { data: years } = await supabase
        .from("leerlingen")
        .select("*, classes(code, color, teachers:teachers!classes_teacher_id_fkey(short)), schooljaren(name, is_current)")
        .eq("kind_id", id!);
      const yearRows = ((years ?? []) as unknown as KindYear[]).sort((a, b) => (b.schooljaren?.name ?? "").localeCompare(a.schooljaren?.name ?? ""));

      const ids = yearRows.map((y) => y.id);
      const metrics: Record<string, Views<"leerling_metrics">> = {};
      if (ids.length) {
        const { data: mm } = await supabase.from("leerling_metrics").select("*").in("leerling_id", ids);
        for (const m of (mm ?? []) as Views<"leerling_metrics">[]) metrics[m.leerling_id] = m;
      }

      const { data: ko } = await supabase.from("kind_ouder").select("ouder_id, ouders(*)").eq("kind_id", id!);
      const ouders = ((ko ?? []) as unknown as { ouder_id: string; ouders: Tables<"ouders"> }[]).map((r) => r.ouders).filter(Boolean);
      const ouderIds = ouders.map((o) => o.id);

      // siblings: other kinderen sharing any ouder
      let siblings: KindDetailData["siblings"] = [];
      if (ouderIds.length) {
        const { data: sib } = await supabase
          .from("kind_ouder")
          .select("kind_id, kinderen(id, full_name, initials)")
          .in("ouder_id", ouderIds)
          .neq("kind_id", id!);
        const seen = new Set<string>();
        const sibKinder = ((sib ?? []) as unknown as { kind_id: string; kinderen: { id: string; full_name: string; initials: string | null } | null }[]);
        for (const s of sibKinder) {
          if (!s.kinderen || seen.has(s.kinderen.id)) continue;
          seen.add(s.kinderen.id);
          siblings.push({ id: s.kinderen.id, full_name: s.kinderen.full_name, initials: s.kinderen.initials, class_code: null });
        }
        // class for each sibling (current year, best-effort)
        if (siblings.length) {
          const { data: sl } = await supabase.from("leerlingen").select("kind_id, classes(code)").in("kind_id", siblings.map((s) => s.id));
          const cmap = new Map<string, string>();
          for (const r of (sl ?? []) as unknown as { kind_id: string; classes: { code: string } | null }[]) if (r.classes) cmap.set(r.kind_id, r.classes.code);
          siblings = siblings.map((s) => ({ ...s, class_code: cmap.get(s.id) ?? null }));
        }
      }

      return { kind: kind as Tables<"kinderen">, years: yearRows, metrics, ouders, siblings };
    },
  });
}

export interface OuderDetailData {
  ouder: Tables<"ouders">;
  kinderen: { id: string; full_name: string; initials: string | null; class_code: string | null }[];
  coOuders: Tables<"ouders">[];
}

export function useOuderDetail(id: string | undefined) {
  return useQuery({
    queryKey: ["ouder-detail", id],
    enabled: !!id,
    queryFn: async (): Promise<OuderDetailData> => {
      const { data: ouder, error } = await supabase.from("ouders").select("*").eq("id", id!).single();
      if (error) throw error;

      const { data: ko } = await supabase.from("kind_ouder").select("kind_id, kinderen(id, full_name, initials)").eq("ouder_id", id!);
      const kindRows = ((ko ?? []) as unknown as { kind_id: string; kinderen: { id: string; full_name: string; initials: string | null } | null }[]);
      const kinderen = kindRows.map((r) => r.kinderen).filter(Boolean).map((k) => ({ id: k!.id, full_name: k!.full_name, initials: k!.initials, class_code: null as string | null }));
      const kindIds = kinderen.map((k) => k.id);

      if (kindIds.length) {
        const { data: sl } = await supabase.from("leerlingen").select("kind_id, classes(code)").in("kind_id", kindIds);
        const cmap = new Map<string, string>();
        for (const r of (sl ?? []) as unknown as { kind_id: string; classes: { code: string } | null }[]) if (r.classes) cmap.set(r.kind_id, r.classes.code);
        for (const k of kinderen) k.class_code = cmap.get(k.id) ?? null;
      }

      // co-ouders: other ouders sharing a kind
      let coOuders: Tables<"ouders">[] = [];
      if (kindIds.length) {
        const { data: co } = await supabase.from("kind_ouder").select("ouder_id, ouders(*)").in("kind_id", kindIds).neq("ouder_id", id!);
        const seen = new Set<string>();
        for (const r of (co ?? []) as unknown as { ouder_id: string; ouders: Tables<"ouders"> }[]) {
          if (!r.ouders || seen.has(r.ouders.id)) continue;
          seen.add(r.ouders.id);
          coOuders.push(r.ouders);
        }
      }

      return { ouder: ouder as Tables<"ouders">, kinderen, coOuders };
    },
  });
}
