import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Tables } from "@/types/database";

export type EnrollmentParent = Tables<"enrollment_parents">;
export type Enrollment = Tables<"enrollments"> & { enrollment_parents: EnrollmentParent[] };
export type Placement = Tables<"enrollment_placements">;

export const ENROLL_STATUSES = ["wachtlijst", "intake", "toegezegd", "definitief", "afgewezen"] as const;
export const NIVEAUS = ["0 (beginner)", "0,5", "1", "1,5", "2"] as const;

export function useEnrollments() {
  return useQuery({
    queryKey: ["enrollments-full"],
    queryFn: async (): Promise<Enrollment[]> => {
      const { data, error } = await supabase
        .from("enrollments")
        .select("*, enrollment_parents(*)")
        .order("created_at");
      if (error) throw error;
      return (data as unknown as Enrollment[]) ?? [];
    },
  });
}

export function useUpdateEnrollmentStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase.from("enrollments").update({ status } as never).eq("id", id);
      if (error) throw error;
    },
    onMutate: async ({ id, status }) => {
      await qc.cancelQueries({ queryKey: ["enrollments-full"] });
      const prev = qc.getQueryData<Enrollment[]>(["enrollments-full"]);
      qc.setQueryData<Enrollment[]>(["enrollments-full"], (old) => old?.map((e) => (e.id === id ? { ...e, status } : e)));
      return { prev };
    },
    onError: (_e, _v, ctx) => { if (ctx?.prev) qc.setQueryData(["enrollments-full"], ctx.prev); },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["enrollments-full"] });
      qc.invalidateQueries({ queryKey: ["enrollment-counts"] });
    },
  });
}

export interface NewEnrollmentInput {
  child_name: string; age: number | null; gender: string | null; track: string;
  target_class: string | null; preferred_lesday: string | null;
  parents: { role: string; name: string; phone: string; email: string; is_primary: boolean }[];
}

export function useCreateEnrollment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: NewEnrollmentInput) => {
      const { data, error } = await supabase
        .from("enrollments")
        .insert({
          child_name: input.child_name, age: input.age, gender: input.gender, track: input.track,
          status: "wachtlijst", target_class: input.target_class, preferred_lesday: input.preferred_lesday,
          submitted_label: "zojuist",
        } as never)
        .select("id")
        .single();
      if (error) throw error;
      const enrollmentId = (data as { id: string }).id;
      const parents = input.parents.filter((p) => p.name.trim());
      if (parents.length) {
        const { error: pe } = await supabase.from("enrollment_parents").insert(
          parents.map((p) => ({ enrollment_id: enrollmentId, role: p.role, name: p.name, phone: p.phone, email: p.email, is_primary: p.is_primary })) as never,
        );
        if (pe) throw pe;
      }
      await supabase.from("audit_log").insert({ action: "nieuwe aanmelding ontvangen voor", object: `${input.child_name} (${input.age ?? "?"} jr)`, type: "enroll", user_label: "Beheerder" } as never);
      return enrollmentId;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["enrollments-full"] });
      qc.invalidateQueries({ queryKey: ["enrollment-counts"] });
      qc.invalidateQueries({ queryKey: ["nav-counts"] });
    },
  });
}

export function usePlacements(schooljaarId: string | null) {
  return useQuery({
    queryKey: ["placements", schooljaarId],
    enabled: !!schooljaarId,
    queryFn: async (): Promise<Record<string, Placement>> => {
      const { data, error } = await supabase.from("enrollment_placements").select("*").eq("schooljaar_id", schooljaarId!);
      if (error) throw error;
      const map: Record<string, Placement> = {};
      for (const p of (data as Placement[]) ?? []) map[p.enrollment_id] = p;
      return map;
    },
  });
}

export function useUpsertPlacement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (row: { enrollment_id: string; schooljaar_id: string; class_id?: string | null; niveau?: string | null; lesgeld_bedrag?: number | null }): Promise<Placement> => {
      const { data, error } = await supabase
        .from("enrollment_placements")
        .upsert(row as never, { onConflict: "enrollment_id,schooljaar_id" })
        .select("*")
        .single();
      if (error) throw error;
      return data as Placement;
    },
    onSuccess: (_d, row) => qc.invalidateQueries({ queryKey: ["placements", row.schooljaar_id] }),
  });
}

/** Apply class/niveau changes to a leerling that was already finalised. */
export function useUpdateFinalizedLeerling() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ leerlingId, patch }: { leerlingId: string; patch: { class_id?: string | null; niveau?: string | null } }) => {
      const clean: Record<string, unknown> = {};
      if (patch.class_id !== undefined && patch.class_id !== null) clean.class_id = patch.class_id;
      if (patch.niveau !== undefined && patch.niveau !== null) clean.niveau = patch.niveau;
      if (!Object.keys(clean).length) return;
      const { error } = await supabase.from("leerlingen").update(clean as never).eq("id", leerlingId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["leerlingen"] });
      qc.invalidateQueries({ queryKey: ["class-leerlingen"] });
      qc.invalidateQueries({ queryKey: ["class-metrics"] });
    },
  });
}

export function useFinalizeEnrollment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (placementId: string) => {
      const { data, error } = await supabase.rpc("finalize_enrollment", { p_placement_id: placementId });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["placements"] });
      qc.invalidateQueries({ queryKey: ["enrollments-full"] });
      qc.invalidateQueries({ queryKey: ["nav-counts"] });
      qc.invalidateQueries({ queryKey: ["leerlingen"] });
    },
  });
}
