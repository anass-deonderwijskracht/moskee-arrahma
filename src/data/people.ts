import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Tables } from "@/types/database";

export type Teacher = Tables<"teachers">;

export function useSaveTeacher() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...row }: { id?: string; name: string; short: string; email: string; phone: string; specialty: string; role: string }) => {
      if (id) { const { error } = await supabase.from("teachers").update(row as never).eq("id", id); if (error) throw error; }
      else { const { error } = await supabase.from("teachers").insert(row as never); if (error) throw error; }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["teachers"] }); qc.invalidateQueries({ queryKey: ["nav-counts"] }); },
  });
}

export function useCreateOuder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (row: { role: string; name: string; phone: string; email: string; bereik: string; primary: boolean }) => {
      const { data, error } = await supabase.from("ouders").insert(row as never).select("id").single();
      if (error) throw error;
      return (data as { id: string }).id;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["ouders"] }); qc.invalidateQueries({ queryKey: ["nav-counts"] }); },
  });
}

export function useCreateKind() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (row: { first_name: string; last_name: string; gender: string | null; birth_year: number | null; address: string | null; notes: string | null }) => {
      const initials = (row.first_name[0] ?? "").toUpperCase() + (row.last_name.replace(/[^A-Za-z]/g, "")[0] ?? "").toUpperCase();
      const { data, error } = await supabase.from("kinderen").insert({ ...row, initials } as never).select("id").single();
      if (error) throw error;
      return (data as { id: string }).id;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["kinderen"] }); qc.invalidateQueries({ queryKey: ["nav-counts"] }); },
  });
}
export type Ouder = Tables<"ouders">;
export type Kind = Tables<"kinderen">;

export function useDeleteTeachers() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (ids: string[]) => {
      if (!ids.length) return;
      const { error } = await supabase.from("teachers").delete().in("id", ids);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["teachers"] }); qc.invalidateQueries({ queryKey: ["classes"] }); qc.invalidateQueries({ queryKey: ["nav-counts"] }); },
  });
}

export function useDeleteOuders() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (ids: string[]) => {
      if (!ids.length) return;
      const { error } = await supabase.from("ouders").delete().in("id", ids);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["ouders"] }); qc.invalidateQueries({ queryKey: ["kinderen"] }); qc.invalidateQueries({ queryKey: ["nav-counts"] }); },
  });
}

export function useDeleteKinderen() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (ids: string[]) => {
      if (!ids.length) return;
      const { error } = await supabase.from("kinderen").delete().in("id", ids);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["kinderen"] });
      qc.invalidateQueries({ queryKey: ["ouders"] });
      qc.invalidateQueries({ queryKey: ["leerlingen"] });
      qc.invalidateQueries({ queryKey: ["nav-counts"] });
    },
  });
}

export function useTeachers() {
  return useQuery({
    queryKey: ["teachers"],
    queryFn: async (): Promise<Teacher[]> => {
      const { data, error } = await supabase.from("teachers").select("*").order("name");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export interface OuderWithKinderen extends Ouder {
  kind_ouder: { kind_id: string; kinderen: { id: string; full_name: string; initials: string | null } | null }[];
}

export function useOuders() {
  return useQuery({
    queryKey: ["ouders"],
    queryFn: async (): Promise<OuderWithKinderen[]> => {
      const { data, error } = await supabase
        .from("ouders")
        .select("*, kind_ouder(kind_id, kinderen(id, full_name, initials))")
        .order("name");
      if (error) throw error;
      return (data as unknown as OuderWithKinderen[]) ?? [];
    },
  });
}

export interface KindRow extends Kind {
  leerlingen: { id: string; schooljaar_id: string; class_id: string; classes: { code: string } | null }[];
  kind_ouder: { ouder_id: string; ouders: { id: string; name: string; phone: string | null } | null }[];
}

export function useKinderen() {
  return useQuery({
    queryKey: ["kinderen"],
    queryFn: async (): Promise<KindRow[]> => {
      const { data, error } = await supabase
        .from("kinderen")
        .select(
          "*, leerlingen(id, schooljaar_id, class_id, classes(code)), kind_ouder(ouder_id, ouders(id, name, phone))",
        )
        .order("last_name");
      if (error) throw error;
      return (data as unknown as KindRow[]) ?? [];
    },
  });
}
