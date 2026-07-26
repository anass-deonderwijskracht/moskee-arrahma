import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

async function count(table: string): Promise<number | null> {
  const { count, error } = await supabase.from(table as never).select("*", { count: "exact", head: true });
  if (error) return null;
  return count ?? 0;
}

/** Nog niet afgeronde taken — het badge-getal telt wat er nog te doen is. */
async function openTasks(): Promise<number | null> {
  const { count, error } = await supabase.from("tasks").select("*", { count: "exact", head: true }).neq("status", "done");
  if (error) return null;
  return count ?? 0;
}

/** Sidebar badge counts. Returns null per-entity when the table is missing/empty. */
export function useNavCounts() {
  return useQuery({
    queryKey: ["nav-counts"],
    queryFn: async () => {
      const [kinderen, ouders, teachers, leerlingen, classes, enrollments, tasks] = await Promise.all([
        count("kinderen"),
        count("ouders"),
        count("teachers"),
        count("leerlingen"),
        count("classes"),
        count("enrollments"),
        openTasks(),
      ]);
      return { kinderen, ouders, teachers, leerlingen, classes, enrollments, tasks };
    },
    staleTime: 60_000,
  });
}
