import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Tables, Views } from "@/types/database";

/** Enroll an existing kind into a class for a school year (mid-year additions). */
export function useCreateLeerling() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (row: { kind_id: string; class_id: string; schooljaar_id: string; niveau: string | null; joined: string }) => {
      // next leerlingnummer
      const { data: maxRow } = await supabase.from("leerlingen").select("leerlingnummer").like("leerlingnummer", "M%").order("leerlingnummer", { ascending: false }).limit(1).maybeSingle();
      const lastNum = maxRow?.leerlingnummer ? parseInt(String(maxRow.leerlingnummer).slice(1)) : 1000;
      const leerlingnummer = "M" + (lastNum + 1);
      const { error } = await supabase.from("leerlingen").insert({ ...row, leerlingnummer } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["leerlingen"] });
      qc.invalidateQueries({ queryKey: ["class-leerlingen"] });
      qc.invalidateQueries({ queryKey: ["nav-counts"] });
    },
  });
}

export type LeerlingRow = Tables<"leerlingen"> & {
  kinderen: { id: string; full_name: string; initials: string | null; gender: string | null; birth_year: number | null } | null;
  classes: { id: string; code: string; color: string | null } | null;
};
export type LeerlingMetrics = Views<"leerling_metrics">;

/** Leerlingen (per-year enrollments) for a school year, with kind + class joined. */
export function useLeerlingen(schooljaarId: string | null) {
  return useQuery({
    queryKey: ["leerlingen", schooljaarId],
    enabled: schooljaarId !== undefined,
    queryFn: async (): Promise<LeerlingRow[]> => {
      let q = supabase
        .from("leerlingen")
        .select(
          "*, kinderen(id, full_name, initials, gender, birth_year), classes(id, code, color)",
        );
      if (schooljaarId) q = q.eq("schooljaar_id", schooljaarId);
      const { data, error } = await q;
      if (error) throw error;
      const rows = (data as unknown as LeerlingRow[]) ?? [];
      rows.sort((a, b) => (a.kinderen?.full_name ?? "").localeCompare(b.kinderen?.full_name ?? ""));
      return rows;
    },
  });
}

export function useLeerlingMetrics() {
  return useQuery({
    queryKey: ["leerling-metrics"],
    queryFn: async (): Promise<Record<string, LeerlingMetrics>> => {
      const { data, error } = await supabase.from("leerling_metrics").select("*");
      if (error) throw error;
      const map: Record<string, LeerlingMetrics> = {};
      for (const m of (data ?? []) as LeerlingMetrics[]) map[m.leerling_id] = m;
      return map;
    },
  });
}
