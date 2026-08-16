import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Tables } from "@/types/database";

export const FIXED_INTAKE_START = "09:00";
export const FIXED_INTAKE_END = "12:00";
export const DEFAULT_INTAKE_MESSAGE = "Beste ouder,\n\nHierbij uw persoonlijke link voor het intakeformulier: [link]";
export const DEFAULT_INTAKE_THANK_YOU_TEXT = "De intakevoorkeur is ontvangen.";

export type IntakeStatus = "concept" | "actief" | "verlopen";
export type LessonDayPreference = "Zaterdag" | "Zondag" | "Geen voorkeur";
export type IntakeSlot = Tables<"intake_slots">;
export type IntakeChoice = Tables<"intake_choices"> & {
  enrollments: { child_name: string } | null;
  intake_slots: Pick<IntakeSlot, "date" | "start_time" | "end_time"> | null;
};
export type IntakeAttendance = Tables<"intake_attendance"> & {
  enrollments: { child_name: string } | null;
};
export type IntakeMoment = Tables<"intake_moments"> & {
  intake_slots: IntakeSlot[];
  intake_choices: IntakeChoice[];
  intake_attendance: IntakeAttendance[];
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
  allow_other: boolean;
  message_template: string;
  thank_you_text: string;
  slots: IntakeSlotInput[];
};

export type PublicIntake = {
  moment: {
    id: string;
    description: string;
    duration_text: string;
    allow_other: boolean;
    thank_you_text: string;
  };
  enrollments: { id: string; first_name: string; preferred_lesday: LessonDayPreference }[];
  slots: Pick<IntakeSlot, "id" | "date" | "start_time" | "end_time">[];
  selection: {
    enrollment_ids: string[];
    slot_id: string | null;
    other_text: string | null;
    note: string | null;
    chosen_at: string;
    updated_at: string;
  } | null;
};

export type ActiveIntakeSelection = {
  enrollment_id: string;
  updated_at: string;
  other_text: string | null;
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
    intake_attendance: [...(moment.intake_attendance ?? [])].sort((a, b) =>
      (a.enrollments?.child_name ?? "").localeCompare(b.enrollments?.child_name ?? "", "nl"),
    ),
  };
}

/** Vervangt iedere [link]-variabele, zodat dezelfde template meermaals kan linken. */
export function renderIntakeMessage(template: string, link: string): string {
  return template.replaceAll("[link]", link);
}

export function useIntakeMoments() {
  return useQuery({
    queryKey: ["intake-moments"],
    queryFn: async (): Promise<IntakeMoment[]> => {
      const { data, error } = await supabase
        .from("intake_moments")
        .select("*, intake_slots(*), intake_choices(*, enrollments(child_name), intake_slots(date, start_time, end_time)), intake_attendance(*, enrollments(child_name))")
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
        allow_other: input.allow_other,
        message_template: input.message_template.trim(),
        thank_you_text: input.thank_you_text.trim(),
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
        start_time: FIXED_INTAKE_START,
        end_time: FIXED_INTAKE_END,
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

/** Verwijdert één volledige afspraak; de inschrijvingen en links blijven bestaan. */
export function useDeleteIntakeChoices() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await supabase.from("intake_choices").delete().in("id", ids);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["intake-moments"] });
      qc.invalidateQueries({ queryKey: ["active-intake-overview"] });
    },
  });
}

export function useSetIntakeAttendance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ intakeMomentId, enrollmentId, attended }: {
      intakeMomentId: string;
      enrollmentId: string;
      attended: boolean;
    }) => {
      const { error } = await supabase.from("intake_attendance").upsert({
        intake_moment_id: intakeMomentId,
        enrollment_id: enrollmentId,
        attended,
      } as never, { onConflict: "intake_moment_id,enrollment_id" });
      if (error) throw error;
    },
    onMutate: async ({ intakeMomentId, enrollmentId, attended }) => {
      await qc.cancelQueries({ queryKey: ["intake-moments"] });
      const previous = qc.getQueryData<IntakeMoment[]>(["intake-moments"]);
      qc.setQueryData<IntakeMoment[]>(["intake-moments"], (moments) => moments?.map((moment) => {
        if (moment.id !== intakeMomentId) return moment;
        const existing = moment.intake_attendance.find((row) => row.enrollment_id === enrollmentId);
        const nextRow: IntakeAttendance = existing
          ? { ...existing, attended, updated_at: new Date().toISOString() }
          : {
              intake_moment_id: intakeMomentId,
              enrollment_id: enrollmentId,
              attended,
              updated_at: new Date().toISOString(),
              enrollments: null,
            };
        return {
          ...moment,
          intake_attendance: existing
            ? moment.intake_attendance.map((row) => row.enrollment_id === enrollmentId ? nextRow : row)
            : [...moment.intake_attendance, nextRow],
        };
      }));
      return { previous };
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) qc.setQueryData(["intake-moments"], context.previous);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["intake-moments"] }),
  });
}

export function useActiveIntakeOverview() {
  return useQuery({
    queryKey: ["active-intake-overview"],
    queryFn: async (): Promise<ActiveIntakeOverview | null> => {
      const { data, error } = await supabase
        .from("intake_moments")
        .select("id, intake_choices(enrollment_id, updated_at, other_text, intake_slots(date, start_time, end_time))")
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
      const { data, error } = await supabase.rpc("get_public_intake_with_preferences", { p_token: token! });
      if (error) throw error;
      return (data as unknown as PublicIntake | null) ?? null;
    },
  });
}

export function useSubmitPublicIntake(token: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ enrollmentIds, slotId, otherText, note, lessonDayPreferences }: {
      enrollmentIds: string[];
      slotId: string | null;
      otherText: string | null;
      note: string | null;
      lessonDayPreferences: Record<string, LessonDayPreference>;
    }): Promise<PublicIntake> => {
      const { data, error } = await supabase.rpc("submit_public_intake_with_preferences", {
        p_token: token,
        p_enrollment_ids: enrollmentIds,
        p_slot_id: slotId,
        p_other_text: otherText,
        p_note: note,
        p_lesson_day_preferences: lessonDayPreferences,
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
