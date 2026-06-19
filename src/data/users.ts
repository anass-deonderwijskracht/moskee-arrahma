import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export type AppUser = {
  id: string;
  full_name: string | null;
  email: string | null;
  role: string;
  class_id: string | null;
  class_code: string | null;
  class_schooljaar_id: string | null;
};

/** All admins + docenten, with the docent's linked class code + year. Admin-gated by RLS. */
export function useUsers() {
  return useQuery({
    queryKey: ["app-users"],
    queryFn: async (): Promise<AppUser[]> => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, email, role, class_id, classes(code, schooljaar_id)")
        .order("role", { ascending: true })
        .order("full_name", { ascending: true });
      if (error) throw error;
      type Row = { id: string; full_name: string | null; email: string | null; role: string; class_id: string | null; classes: { code: string; schooljaar_id: string } | null };
      return ((data as unknown as Row[]) ?? []).map((r) => ({
        id: r.id, full_name: r.full_name, email: r.email, role: r.role,
        class_id: r.class_id, class_code: r.classes?.code ?? null,
        class_schooljaar_id: r.classes?.schooljaar_id ?? null,
      }));
    },
  });
}

/** Turn a functions.invoke() error into its server-provided Dutch message. */
async function fnError(error: unknown): Promise<string> {
  const ctx = (error as { context?: Response })?.context;
  if (ctx && typeof ctx.json === "function") {
    try { const body = await ctx.json(); if (body?.error) return String(body.error); } catch { /* ignore */ }
  }
  return error instanceof Error ? error.message : "Onbekende fout";
}

export type NewUser = { email: string; full_name: string; role: "admin" | "docent"; class_id: string | null };

export function useCreateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: NewUser) => {
      const { data, error } = await supabase.functions.invoke("manage-users", {
        body: {
          action: "create",
          email: input.email,
          full_name: input.full_name,
          role: input.role,
          class_id: input.class_id,
          redirect_to: window.location.origin + "/wachtwoord-herstellen",
        },
      });
      if (error) throw new Error(await fnError(error));
      return data as { ok: boolean; email_sent: boolean };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["app-users"] }),
  });
}

export type EditUser = { id: string; full_name: string; role: "admin" | "docent"; class_id: string | null };

export function useUpdateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: EditUser) => {
      const { error } = await supabase.functions.invoke("manage-users", {
        body: {
          action: "update",
          id: input.id,
          full_name: input.full_name,
          role: input.role,
          class_id: input.class_id,
        },
      });
      if (error) throw new Error(await fnError(error));
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["app-users"] }),
  });
}

export function useDeleteUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.functions.invoke("manage-users", { body: { action: "delete", id } });
      if (error) throw new Error(await fnError(error));
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["app-users"] }),
  });
}
