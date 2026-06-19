import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Tables } from "@/types/database";

export function useAuditLog(limit = 50) {
  return useQuery({
    queryKey: ["audit-log", limit],
    queryFn: async (): Promise<Tables<"audit_log">[]> => {
      const { data, error } = await supabase.from("audit_log").select("*").order("at", { ascending: false }).limit(limit);
      if (error) throw error;
      return (data as Tables<"audit_log">[]) ?? [];
    },
  });
}

export function useSaveSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: { id: string } & Partial<Tables<"app_settings">>) => {
      const { id, ...rest } = patch;
      const { error } = await supabase.from("app_settings").update(rest as never).eq("id", id);
      if (error) throw error;
      await supabase.from("audit_log").insert({ action: "instellingen gewijzigd", object: "Organisatie", type: "note", user_label: "Beheerder" } as never);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["app-settings"] }),
  });
}

export function useSchooljaarCounts() {
  return useQuery({
    queryKey: ["schooljaar-counts"],
    queryFn: async () => {
      const [classesRes, expensesRes] = await Promise.all([
        supabase.from("classes").select("schooljaar_id"),
        supabase.from("expenses").select("schooljaar_id"),
      ]);
      const klassen: Record<string, number> = {};
      const uitgaven: Record<string, number> = {};
      for (const c of (classesRes.data ?? []) as { schooljaar_id: string }[]) klassen[c.schooljaar_id] = (klassen[c.schooljaar_id] ?? 0) + 1;
      for (const e of (expensesRes.data ?? []) as { schooljaar_id: string }[]) uitgaven[e.schooljaar_id] = (uitgaven[e.schooljaar_id] ?? 0) + 1;
      return { klassen, uitgaven };
    },
  });
}

export function useSchooljaarMutations() {
  const qc = useQueryClient();
  const invalidate = () => { qc.invalidateQueries({ queryKey: ["schooljaren"] }); qc.invalidateQueries({ queryKey: ["schooljaar-counts"] }); };

  const add = useMutation({
    mutationFn: async (row: { code: string; name: string; start_date: string | null; end_date: string | null; lesdagen: number | null }) => {
      const { error } = await supabase.from("schooljaren").insert(row as never);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const setCurrent = useMutation({
    mutationFn: async (id: string) => {
      // partial unique index allows only one is_current=true → clear all first.
      const e1 = await supabase.from("schooljaren").update({ is_current: false } as never).neq("id", id);
      if (e1.error) throw e1.error;
      const e2 = await supabase.from("schooljaren").update({ is_current: true, archived: false } as never).eq("id", id);
      if (e2.error) throw e2.error;
    },
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("schooljaren").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const removeMany = useMutation({
    mutationFn: async (ids: string[]) => {
      if (!ids.length) return;
      const { error } = await supabase.from("schooljaren").delete().in("id", ids);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  return { add, setCurrent, remove, removeMany };
}
