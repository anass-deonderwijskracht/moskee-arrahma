import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

async function count(table: string): Promise<number | null> {
  const { count, error } = await supabase.from(table as never).select("*", { count: "exact", head: true });
  if (error) return null;
  return count ?? 0;
}

/** Sidebar badge counts. Returns null per-entity when the table is missing/empty. */
export function useNavCounts() {
  return useQuery({
    queryKey: ["nav-counts"],
    queryFn: async () => {
      const [kinderen, ouders, teachers, leerlingen, classes, enrollments] = await Promise.all([
        count("kinderen"),
        count("ouders"),
        count("teachers"),
        count("leerlingen"),
        count("classes"),
        count("enrollments"),
      ]);
      return { kinderen, ouders, teachers, leerlingen, classes, enrollments };
    },
    staleTime: 60_000,
  });
}
