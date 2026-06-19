import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Tables, Views } from "@/types/database";

export function useCreateClass() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (row: { code: string; grade: number; track: string; day: string; time: string; location: string; capacity: number; teacher_id: string | null; quran_teacher_id: string | null; schooljaar_id: string; color: string }) => {
      const { error } = await supabase.from("classes").insert(row as never);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["classes"] }); qc.invalidateQueries({ queryKey: ["nav-counts"] }); },
  });
}

export function useDeleteClasses() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (ids: string[]) => {
      if (!ids.length) return;
      const { error } = await supabase.from("classes").delete().in("id", ids);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["classes"] });
      qc.invalidateQueries({ queryKey: ["class-metrics"] });
      qc.invalidateQueries({ queryKey: ["nav-counts"] });
    },
  });
}

export type ClassRow = Tables<"classes"> & {
  teacher: { id: string; name: string; short: string | null } | null;
  quran_teacher: { id: string; name: string; short: string | null } | null;
};
export type ClassMetrics = Views<"class_metrics">;

/** Classes for a given school year (or all when schooljaarId is null), with teacher names. */
export function useClasses(schooljaarId: string | null) {
  return useQuery({
    queryKey: ["classes", schooljaarId],
    enabled: schooljaarId !== undefined,
    queryFn: async (): Promise<ClassRow[]> => {
      let q = supabase
        .from("classes")
        .select(
          "*, teacher:teachers!classes_teacher_id_fkey(id,name,short), quran_teacher:teachers!classes_quran_teacher_id_fkey(id,name,short)",
        )
        .order("grade", { ascending: true });
      if (schooljaarId) q = q.eq("schooljaar_id", schooljaarId);
      const { data, error } = await q;
      if (error) throw error;
      return (data as unknown as ClassRow[]) ?? [];
    },
  });
}

export function useClassMetrics() {
  return useQuery({
    queryKey: ["class-metrics"],
    queryFn: async (): Promise<Record<string, ClassMetrics>> => {
      const { data, error } = await supabase.from("class_metrics").select("*");
      if (error) throw error;
      const map: Record<string, ClassMetrics> = {};
      for (const m of (data ?? []) as ClassMetrics[]) map[m.class_id] = m;
      return map;
    },
  });
}
