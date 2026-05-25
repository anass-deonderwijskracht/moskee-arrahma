import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Tables } from "@/types/database";

export type Schooljaar = Tables<"schooljaren">;

export function useSchooljaren() {
  return useQuery({
    queryKey: ["schooljaren"],
    queryFn: async (): Promise<Schooljaar[]> => {
      const { data, error } = await supabase
        .from("schooljaren")
        .select("*")
        .order("code", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** The single current school year (is_current = true), if any. */
export function useCurrentSchooljaar() {
  const q = useSchooljaren();
  return { ...q, data: q.data?.find((s) => s.is_current) ?? null };
}
