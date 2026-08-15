import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Tables } from "@/types/database";

export type IntakeStatus = "concept" | "actief" | "verlopen";
export type IntakeSlot = Tables<"intake_slots">;
export type IntakeChoice = Tables<"intake_choices"> & {
  enrollments: { child_name: string } | null;
};
export type IntakeMoment = Tables<"intake_moments"> & {
  intake_slots: IntakeSlot[];
  intake_choices: IntakeChoice[];
};

export type IntakeSlotInput = {
  id?: string;
  date: string;
  start_time: string;
  end_time: string;
  position: number;
};

export type SaveIntakeMomentInput = {
  id?: string;
  description: string;
  duration_text: string;
  status: IntakeStatus;
  slots: IntakeSlotInput[];
};

export type PublicIntake = {
  moment: { id: string; description: string; duration_text: string };
  enrollment: { child_name: string };
  slots: Pick<IntakeSlot, "id" | "date" | "start_time" | "end_time">[];
  selection: { slot_id: string; chosen_at: string; updated_at: string } | null;
};

export type ActiveIntakeSelection = {
  enrollment_id: string;
  updated_at: string;
  intake_slots: Pick<IntakeSlot, "date" | "start_time" | "end_time"> | null;
};

export type ActiveIntakeOverview = {
  id: string;
  intake_choices: ActiveIntakeSelection[];
};

function sortMoment(moment: IntakeMoment): IntakeMoment {
  return {
    ...moment,
    intake_slots: [...(moment.intake_slots ?? [])].sort((a, b) =>
      `${a.date} ${a.start_time} ${a.position}`.localeCompare(`${b.date} ${b.start_time} ${b.position}`),
    ),
    intake_choices: [...(moment.intake_choices ?? [])].sort((a, b) =>
      (a.enrollments?.child_name ?? "").localeCompare(b.enrollments?.child_name ?? "", "nl"),
    ),
  };
}

export function useIntakeMoments() {
  return useQuery({
    queryKey: ["intake-moments"],
    queryFn: async (): Promise<IntakeMoment[]> => {
      const { data, error } = await supabase
        .from("intake_moments")
        .select("*, intake_slots(*), intake_choices(*, enrollments(child_name))")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return ((data as unknown as IntakeMoment[]) ?? []).map(sortMoment);
    },
  });
}

export function useSaveIntakeMoment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: SaveIntakeMomentInput) => {
      let momentId = input.id;
      const momentRow = {
        description: input.description.trim(),
        duration_text: input.duration_text.trim(),
        status: input.status,
      };

      if (momentId) {
        const { error } = await supabase.from("intake_moments").update(momentRow as never).eq("id", momentId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from("intake_moments")
          .insert(momentRow as never)
          .select("id")
          .single();
        if (error) throw error;
        momentId = (data as { id: string }).id;
      }

      const { data: existingData, error: existingError } = await supabase
        .from("intake_slots")
        .select("id")
        .eq("intake_moment_id", momentId);
      if (existingError) throw existingError;

      const rows = input.slots.map((slot, position) => ({
        id: slot.id ?? crypto.randomUUID(),
        intake_moment_id: momentId!,
        date: slot.date,
        start_time: slot.start_time,
        end_time: slot.end_time,
        position,
      }));

      const { error: upsertError } = await supabase
        .from("intake_slots")
        .upsert(rows as never, { onConflict: "id" });
      if (upsertError) throw upsertError;

      const keep = new Set(rows.map((row) => row.id));
      const removed = ((existingData as { id: string }[] | null) ?? [])
        .map((row) => row.id)
        .filter((id) => !keep.has(id));
      if (removed.length) {
        const { error: deleteError } = await supabase.from("intake_slots").delete().in("id", removed);
        if (deleteError) throw deleteError;
      }

      return momentId;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["intake-moments"] });
      qc.invalidateQueries({ queryKey: ["active-intake-overview"] });
    },
  });
}

export function useSetIntakeStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: IntakeStatus }) => {
      const { error } = await supabase.from("intake_moments").update({ status } as never).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["intake-moments"] });
      qc.invalidateQueries({ queryKey: ["active-intake-overview"] });
    },
  });
}

export function useDeleteIntakeMoment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("intake_moments").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["intake-moments"] });
      qc.invalidateQueries({ queryKey: ["active-intake-overview"] });
    },
  });
}

export function useActiveIntakeOverview() {
  return useQuery({
    queryKey: ["active-intake-overview"],
    queryFn: async (): Promise<ActiveIntakeOverview | null> => {
      const { data, error } = await supabase
        .from("intake_moments")
        .select("id, intake_choices(enrollment_id, updated_at, intake_slots(date, start_time, end_time))")
        .eq("status", "actief")
        .maybeSingle();
      if (error) throw error;
      return (data as unknown as ActiveIntakeOverview | null) ?? null;
    },
  });
}

export function usePublicIntake(token: string | undefined) {
  return useQuery({
    queryKey: ["public-intake", token],
    enabled: !!token,
    retry: false,
    queryFn: async (): Promise<PublicIntake | null> => {
      const { data, error } = await supabase.rpc("get_public_intake", { p_token: token! });
      if (error) throw error;
      return (data as unknown as PublicIntake | null) ?? null;
    },
  });
}

export function useSubmitPublicIntake(token: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (slotId: string): Promise<PublicIntake> => {
      const { data, error } = await supabase.rpc("submit_public_intake", {
        p_token: token,
        p_slot_id: slotId,
      });
      if (error) throw error;
      return data as unknown as PublicIntake;
    },
    onSuccess: (data) => {
      qc.setQueryData(["public-intake", token], data);
      qc.invalidateQueries({ queryKey: ["intake-moments"] });
      qc.invalidateQueries({ queryKey: ["active-intake-overview"] });
    },
  });
}
