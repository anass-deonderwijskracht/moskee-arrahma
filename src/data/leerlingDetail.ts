import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Tables, Views } from "@/types/database";

export function useAddPayment(leerlingId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (row: { date: string; description: string; amount: number; status: string; method: string | null }) => {
      const { error } = await supabase.from("payments").insert({ leerling_id: leerlingId, ...row } as never);
      if (error) throw error;
      await supabase.from("audit_log").insert({ action: "registreerde betaling", object: `€${row.amount} — ${row.description}`, type: "fin", user_label: "Beheerder" } as never);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["leerling-detail", leerlingId] }),
  });
}

export interface LeerlingDetail {
  leerling: Tables<"leerlingen"> & {
    kinderen: Tables<"kinderen"> | null;
    classes: (Tables<"classes"> & { teachers: { name: string; short: string | null } | null }) | null;
    schooljaren: { name: string } | null;
  };
  metrics: Views<"leerling_metrics"> | null;
  payments: Tables<"payments">[];
  assignments: (Tables<"quran_assignments"> & { lessonDate: string | null })[];
  progress: { surah_n: number; status: string }[];
  ouders: Tables<"ouders">[];
  notes: { id: string; author: string | null; body: string | null; created_at: string; lessonDate: string | null; topic: string | null }[];
}

export function useLeerlingDetail(id: string | undefined) {
  return useQuery({
    queryKey: ["leerling-detail", id],
    enabled: !!id,
    queryFn: async (): Promise<LeerlingDetail> => {
      const { data: leerling, error } = await supabase
        .from("leerlingen")
        .select("*, kinderen(*), classes(*, teachers:teachers!classes_teacher_id_fkey(name,short)), schooljaren(name)")
        .eq("id", id!)
        .single();
      if (error) throw error;
      const l = leerling as unknown as LeerlingDetail["leerling"];
      const kindId = l.kinderen?.id;
      const classId = l.class_id;

      const [metricsRes, paymentsRes, assignRes, progressRes, lessonsRes] = await Promise.all([
        supabase.from("leerling_metrics").select("*").eq("leerling_id", id!).maybeSingle(),
        supabase.from("payments").select("*").eq("leerling_id", id!).order("date"),
        supabase.from("quran_assignments").select("*").eq("leerling_id", id!),
        supabase.from("leerling_surah_progress").select("surah_n,status").eq("leerling_id", id!),
        supabase.from("lessons").select("id,date,topic").eq("class_id", classId),
      ]);

      const lessonMap = new Map<string, { date: string; topic: string | null }>();
      for (const ls of (lessonsRes.data ?? []) as { id: string; date: string; topic: string | null }[]) lessonMap.set(ls.id, { date: ls.date, topic: ls.topic });

      const assignments = ((assignRes.data ?? []) as Tables<"quran_assignments">[])
        .map((a) => ({ ...a, lessonDate: a.assigned_at_lesson_id ? lessonMap.get(a.assigned_at_lesson_id)?.date ?? null : null }))
        .sort((a, b) => (a.lessonDate ?? "").localeCompare(b.lessonDate ?? ""));

      // ouders via kind_ouder
      let ouders: Tables<"ouders">[] = [];
      if (kindId) {
        const { data } = await supabase.from("kind_ouder").select("ouders(*)").eq("kind_id", kindId);
        ouders = ((data ?? []) as unknown as { ouders: Tables<"ouders"> }[]).map((r) => r.ouders).filter(Boolean);
      }

      // lesson notes for the class
      const lessonIds = [...lessonMap.keys()];
      let notes: LeerlingDetail["notes"] = [];
      if (lessonIds.length) {
        const { data } = await supabase
          .from("lesson_notes")
          .select("id,author,body,created_at,lesson_id")
          .in("lesson_id", lessonIds)
          .order("created_at", { ascending: false });
        notes = ((data ?? []) as { id: string; author: string | null; body: string | null; created_at: string; lesson_id: string }[]).map((n) => ({
          id: n.id, author: n.author, body: n.body, created_at: n.created_at,
          lessonDate: lessonMap.get(n.lesson_id)?.date ?? null, topic: lessonMap.get(n.lesson_id)?.topic ?? null,
        }));
      }

      return {
        leerling: l,
        metrics: (metricsRes.data as Views<"leerling_metrics"> | null) ?? null,
        payments: (paymentsRes.data as Tables<"payments">[]) ?? [],
        assignments,
        progress: (progressRes.data as { surah_n: number; status: string }[]) ?? [],
        ouders,
        notes,
      };
    },
  });
}
