import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Tables } from "@/types/database";

export type SyncRun = Tables<"google_contact_sync_runs">;

export type SyncAction = "create" | "update" | "unchanged" | "merge" | "conflict";

export interface SyncPlanRow {
  action: SyncAction;
  phone: string;
  /** Naam zoals hij nu in Google staat; null als het contact nog niet bestaat. */
  from: string | null;
  to: string;
  children: string[];
  /** Bij samenvoegen: de contacten die worden opgeruimd. */
  deletes?: string[];
  resourceName?: string;
  error?: string;
}

export interface SyncCounts {
  created: number; updated: number; unchanged: number;
  /** Gezinnen waarvan meerdere contacten tot één zijn teruggebracht. */
  merged: number;
  /** Dubbele contacten die daarbij zijn verwijderd. */
  deleted: number;
  conflicts: number; skipped: number; failed: number; total: number;
}

export interface SyncResult {
  ok: boolean;
  dryRun: boolean;
  runId: string | null;
  counts: SyncCounts;
  /** Ouders zonder bruikbaar telefoonnummer — die kunnen we niet matchen. */
  noPhone: string[];
  plan: SyncPlanRow[];
}

/**
 * Draait de reconciliatie met Google Contacts. `dryRun` (standaard) rapporteert
 * alleen wat er zou veranderen en schrijft niets.
 */
export function useContactSync() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ dryRun = true, merge = true }: { dryRun?: boolean; merge?: boolean } = {}): Promise<SyncResult> => {
      const { data, error } = await supabase.functions.invoke("google-contacts-sync", { body: { dryRun, merge } });
      if (error) {
        // De function stuurt haar eigen Nederlandse melding mee in de body.
        const ctx = (error as { context?: Response }).context;
        const body = ctx ? await ctx.json().catch(() => null) : null;
        throw new Error(body?.error ?? error.message);
      }
      const result = data as SyncResult;
      if (!result?.ok) throw new Error((result as unknown as { error?: string })?.error ?? "Sync mislukt");
      return result;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["contact-sync-runs"] }),
  });
}

/** Historie van sync-runs, nieuwste eerst. */
export function useSyncRuns(limit = 8) {
  return useQuery({
    queryKey: ["contact-sync-runs", limit],
    queryFn: async (): Promise<SyncRun[]> => {
      const { data, error } = await supabase
        .from("google_contact_sync_runs")
        .select("*")
        .order("started_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data as SyncRun[]) ?? [];
    },
  });
}
