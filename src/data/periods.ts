import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Tables } from "@/types/database";

export type SchoolPeriod = Tables<"school_periods">;

export const PERIOD_KINDS = ["vakantie", "feestdag", "ramadan"] as const;
export const PERIOD_KIND_LABEL: Record<string, string> = {
  vakantie: "Schoolvakantie",
  feestdag: "Feestdag",
  ramadan: "Ramadan",
};

/** Vakanties en feestdagen van één schooljaar, op datum gesorteerd. */
export function useSchoolPeriods(schooljaarId: string | null) {
  return useQuery({
    queryKey: ["school-periods", schooljaarId],
    enabled: !!schooljaarId,
    queryFn: async (): Promise<SchoolPeriod[]> => {
      const { data, error } = await supabase
        .from("school_periods")
        .select("*")
        .eq("schooljaar_id", schooljaarId!)
        .order("start_date");
      if (error) throw error;
      return (data as SchoolPeriod[]) ?? [];
    },
  });
}

const invalidate = (qc: ReturnType<typeof useQueryClient>) => {
  qc.invalidateQueries({ queryKey: ["school-periods"] });
};

export function usePeriodMutations(schooljaarId: string | null) {
  const qc = useQueryClient();

  const addPeriod = useMutation({
    mutationFn: async (row: { name: string; kind: string; start_date: string; end_date: string; blocks_lessons: boolean; note: string | null }) => {
      const { error } = await supabase.from("school_periods").insert({ schooljaar_id: schooljaarId!, ...row } as never);
      if (error) throw error;
    },
    onSuccess: () => invalidate(qc),
  });

  const updatePeriod = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<SchoolPeriod> }) => {
      const { error } = await supabase.from("school_periods").update(patch as never).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => invalidate(qc),
  });

  const removePeriod = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("school_periods").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => invalidate(qc),
  });

  return { addPeriod, updatePeriod, removePeriod };
}

export interface ApplyPeriodsResult {
  updated: number;
  /** Lessen die al op vrij stonden met dezelfde reden — die zijn overgeslagen. */
  unchanged: number;
  perPeriod: { name: string; lessons: number }[];
}

/**
 * Zet elke les die binnen een blokkerende periode valt op type 'vrij', met de
 * naam van die periode als onderwerp. Lessen buiten die periodes blijven staan,
 * ook als ze al vrij zijn — dit draait één kant op en zet niets terug op 'les'.
 */
export function useApplyPeriodsToLessons(schooljaarId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (periods: SchoolPeriod[]): Promise<ApplyPeriodsResult> => {
      const blocking = periods.filter((p) => p.blocks_lessons);
      if (!blocking.length) throw new Error("Geen periodes aangevinkt om vrij te zetten");

      const { data: classRows, error: cErr } = await supabase
        .from("classes").select("id").eq("schooljaar_id", schooljaarId!);
      if (cErr) throw cErr;
      const classIds = ((classRows ?? []) as { id: string }[]).map((c) => c.id);
      if (!classIds.length) throw new Error("Dit schooljaar heeft nog geen klassen");

      const { data: lessonRows, error: lErr } = await supabase
        .from("lessons").select("id, date, type, topic").in("class_id", classIds);
      if (lErr) throw lErr;
      const lessons = (lessonRows ?? []) as { id: string; date: string; type: string; topic: string | null }[];

      // Eerste passende periode wint, zodat een les nooit twee redenen krijgt.
      const targets = new Map<string, { ids: string[]; name: string }>();
      let unchanged = 0;
      for (const les of lessons) {
        const hit = blocking.find((p) => les.date >= p.start_date && les.date <= p.end_date);
        if (!hit) continue;
        if (les.type === "vrij" && les.topic === hit.name) { unchanged++; continue; }
        const cur = targets.get(hit.id) ?? { ids: [], name: hit.name };
        cur.ids.push(les.id);
        targets.set(hit.id, cur);
      }

      const perPeriod: ApplyPeriodsResult["perPeriod"] = [];
      let updated = 0;
      for (const [, { ids, name }] of targets) {
        if (!ids.length) continue;
        // 'vrij' betekent geen docenten — gelijk aan wat het rooster zelf doet.
        const { error } = await supabase
          .from("lessons")
          .update({ type: "vrij", topic: name, teacher_id: null, quran_teacher_id: null, teacher_na: false, quran_na: false } as never)
          .in("id", ids);
        if (error) throw error;
        updated += ids.length;
        perPeriod.push({ name, lessons: ids.length });
      }

      if (updated) {
        await supabase.from("audit_log").insert({
          action: "lessen op vrij gezet", object: `${updated} les(sen) · vakanties en feestdagen`,
          type: "plan", user_label: "Beheerder",
        } as never);
      }
      return { updated, unchanged, perPeriod };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["planning-matrix"] });
      qc.invalidateQueries({ queryKey: ["lessons"] });
    },
  });
}

/** Periode waarin een datum valt — voor het markeren van weken in het rooster. */
export function periodFor(periods: SchoolPeriod[], date: string): SchoolPeriod | null {
  return periods.find((p) => date >= p.start_date && date <= p.end_date) ?? null;
}
