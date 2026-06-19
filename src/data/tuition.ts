import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Tables } from "@/types/database";

export type TuitionTier = Tables<"tuition_tiers">;
export const TRACKS = ["regulier", "hifdh"] as const;
export type Track = (typeof TRACKS)[number];

/** Tiers for one school year, both tracks, sorted by rang. */
export function useTuitionTiers(schooljaarId: string | null) {
  return useQuery({
    queryKey: ["tuition-tiers", schooljaarId],
    enabled: !!schooljaarId,
    queryFn: async (): Promise<TuitionTier[]> => {
      const { data, error } = await supabase
        .from("tuition_tiers")
        .select("*")
        .eq("schooljaar_id", schooljaarId!)
        .order("track")
        .order("rang");
      if (error) throw error;
      return (data as TuitionTier[]) ?? [];
    },
  });
}

export function useTuitionTierMutations(schooljaarId: string | null) {
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["tuition-tiers", schooljaarId] });
    qc.invalidateQueries({ queryKey: ["finance", schooljaarId] });
  };

  const addTier = useMutation({
    mutationFn: async ({ track, rang, bedrag }: { track: Track; rang: number; bedrag: number }) => {
      const { error } = await supabase.from("tuition_tiers").insert({ schooljaar_id: schooljaarId!, track, rang, bedrag } as never);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const setBedrag = useMutation({
    mutationFn: async ({ id, bedrag }: { id: string; bedrag: number }) => {
      const { error } = await supabase.from("tuition_tiers").update({ bedrag } as never).eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const removeTier = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("tuition_tiers").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  return { addTier, setBedrag, removeTier };
}

/** All kind↔ouder links — used to group siblings into families. */
export function useFamilyLinks() {
  return useQuery({
    queryKey: ["family-links"],
    queryFn: async (): Promise<{ kind_id: string; ouder_id: string }[]> => {
      const { data, error } = await supabase.from("kind_ouder").select("kind_id, ouder_id");
      if (error) throw error;
      return (data as { kind_id: string; ouder_id: string }[]) ?? [];
    },
  });
}

export function useSetLesgeldOverride() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ leerlingId, value }: { leerlingId: string; value: number | null }) => {
      const { error } = await supabase.from("leerlingen").update({ lesgeld_override: value } as never).eq("id", leerlingId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["leerlingen"] });
      qc.invalidateQueries({ queryKey: ["finance"] });
    },
  });
}

// ---------------------------------------------------------------------------
// Pure resolver: per leerling → verschuldigd lesgeld.
// ---------------------------------------------------------------------------
export interface ResolveInput { id: string; kind_id: string; birth_year: number | null; track: Track | string | null; override: number | null }
export interface ResolvedTuition { amount: number; rang: number; track: string | null; overridden: boolean; tierAmount: number | null }

/**
 * Resolves the tuition owed per leerling. Siblings (kinderen sharing any ouder)
 * are grouped per family; within a family the enrolled children are ranked by
 * age (oldest = rang 1). Each child takes the tier amount of its OWN track at
 * that rang (the last tier repeats beyond the configured ranks). A manual
 * override always wins.
 */
export function resolveTuition(
  items: ResolveInput[],
  links: { kind_id: string; ouder_id: string }[],
  tiers: TuitionTier[],
): Map<string, ResolvedTuition> {
  const present = new Set(items.map((i) => i.kind_id));

  // Union-find over the enrolled kinderen, joined through shared ouders.
  const parent = new Map<string, string>();
  const find = (x: string): string => {
    let r = parent.get(x) ?? x;
    while (r !== (parent.get(r) ?? r)) r = parent.get(r) ?? r;
    parent.set(x, r);
    return r;
  };
  const union = (a: string, b: string) => { const ra = find(a), rb = find(b); if (ra !== rb) parent.set(ra, rb); };
  for (const k of present) parent.set(k, k);
  const byOuder = new Map<string, string[]>();
  for (const l of links) {
    if (!present.has(l.kind_id)) continue;
    const arr = byOuder.get(l.ouder_id) ?? [];
    arr.push(l.kind_id);
    byOuder.set(l.ouder_id, arr);
  }
  for (const kids of byOuder.values()) for (let i = 1; i < kids.length; i++) union(kids[0], kids[i]);

  // tiers per track, sorted ascending by rang.
  const tiersByTrack = new Map<string, { rang: number; bedrag: number }[]>();
  for (const t of tiers) {
    const arr = tiersByTrack.get(t.track) ?? [];
    arr.push({ rang: t.rang, bedrag: Number(t.bedrag) });
    tiersByTrack.set(t.track, arr);
  }
  for (const arr of tiersByTrack.values()) arr.sort((a, b) => a.rang - b.rang);
  const tierFor = (track: string | null, rang: number): number | null => {
    if (!track) return null;
    const arr = tiersByTrack.get(track);
    if (!arr || !arr.length) return null;
    let pick = arr[0];
    for (const t of arr) if (t.rang <= rang) pick = t; // largest rang ≤ child rang
    return pick.bedrag;
  };

  // Group enrolled children by family.
  const families = new Map<string, ResolveInput[]>();
  for (const it of items) {
    const root = find(it.kind_id);
    const arr = families.get(root) ?? [];
    arr.push(it);
    families.set(root, arr);
  }

  const out = new Map<string, ResolvedTuition>();
  for (const fam of families.values()) {
    const sorted = [...fam].sort((a, b) => {
      const ay = a.birth_year ?? Infinity, by = b.birth_year ?? Infinity; // oldest (smallest year) first
      if (ay !== by) return ay - by;
      return a.id.localeCompare(b.id);
    });
    sorted.forEach((it, idx) => {
      const rang = idx + 1;
      const tierAmount = tierFor(it.track ?? null, rang);
      const overridden = it.override != null;
      const amount = overridden ? Number(it.override) : tierAmount ?? 0;
      out.set(it.id, { amount, rang, track: it.track ?? null, overridden, tierAmount });
    });
  }
  return out;
}
