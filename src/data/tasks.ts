import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Tables } from "@/types/database";

export type Subtask = Tables<"task_subtasks">;
export type Task = Tables<"tasks"> & { task_subtasks: Subtask[] };

export const TASK_COLUMNS = [
  { id: "todo", title: "To-do", color: "var(--fg-faint)" },
  { id: "doing", title: "Mee bezig", color: "var(--info)" },
  { id: "done", title: "Klaar", color: "var(--success)" },
] as const;

export const PRIORITIES = ["laag", "normaal", "hoog"] as const;
export type Priority = (typeof PRIORITIES)[number];

export const PRIORITY_LABEL: Record<string, string> = { laag: "Laag", normaal: "Normaal", hoog: "Hoog" };

/** Alle taken met hun subtaken. Eén gedeeld bord, dus geen filter op gebruiker. */
export function useTasks() {
  return useQuery({
    queryKey: ["tasks"],
    queryFn: async (): Promise<Task[]> => {
      const { data, error } = await supabase
        .from("tasks")
        .select("*, task_subtasks(*)")
        .order("created_at");
      if (error) throw error;
      const rows = (data as unknown as Task[]) ?? [];
      for (const t of rows) t.task_subtasks?.sort((a, b) => a.position - b.position);
      return rows;
    },
  });
}

const invalidate = (qc: ReturnType<typeof useQueryClient>) => {
  qc.invalidateQueries({ queryKey: ["tasks"] });
  qc.invalidateQueries({ queryKey: ["nav-counts"] });
};

export interface NewTask {
  title: string; description: string | null; status: string; priority: string;
  due_date: string | null; assignee_id: string | null;
}

export function useCreateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: NewTask) => {
      const { data: session } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from("tasks")
        .insert({ ...input, created_by: session.user?.id ?? null } as never)
        .select("id")
        .single();
      if (error) throw error;
      return (data as { id: string }).id;
    },
    onSuccess: () => invalidate(qc),
  });
}

export function useUpdateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<Tables<"tasks">> }) => {
      const { error } = await supabase.from("tasks").update(patch as never).eq("id", id);
      if (error) throw error;
    },
    // Slepen moet direct voelen: de kaart verspringt meteen en rolt terug bij een fout.
    onMutate: async ({ id, patch }) => {
      await qc.cancelQueries({ queryKey: ["tasks"] });
      const prev = qc.getQueryData<Task[]>(["tasks"]);
      qc.setQueryData<Task[]>(["tasks"], (old) => old?.map((t) => (t.id === id ? { ...t, ...patch } : t)));
      return { prev };
    },
    onError: (_e, _v, ctx) => { if (ctx?.prev) qc.setQueryData(["tasks"], ctx.prev); },
    onSettled: () => invalidate(qc),
  });
}

export function useDeleteTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("tasks").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => invalidate(qc),
  });
}

// ---- Subtaken --------------------------------------------------------------

export function useAddSubtask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ taskId, label, position }: { taskId: string; label: string; position: number }) => {
      const { error } = await supabase.from("task_subtasks").insert({ task_id: taskId, label, position } as never);
      if (error) throw error;
    },
    onSuccess: () => invalidate(qc),
  });
}

export function useUpdateSubtask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<Subtask> }) => {
      const { error } = await supabase.from("task_subtasks").update(patch as never).eq("id", id);
      if (error) throw error;
    },
    onMutate: async ({ id, patch }) => {
      await qc.cancelQueries({ queryKey: ["tasks"] });
      const prev = qc.getQueryData<Task[]>(["tasks"]);
      qc.setQueryData<Task[]>(["tasks"], (old) =>
        old?.map((t) => ({ ...t, task_subtasks: t.task_subtasks?.map((s) => (s.id === id ? { ...s, ...patch } : s)) })));
      return { prev };
    },
    onError: (_e, _v, ctx) => { if (ctx?.prev) qc.setQueryData(["tasks"], ctx.prev); },
    onSettled: () => invalidate(qc),
  });
}

export function useDeleteSubtask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("task_subtasks").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => invalidate(qc),
  });
}
