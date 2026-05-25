import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export interface ActivityRow { id: string; at: string; user_label: string | null; action: string | null; object: string | null; type: string | null; }

const STATUSES = ["wachtlijst", "intake", "toegezegd", "definitief", "afgewezen"] as const;

export function useEnrollmentCounts() {
  return useQuery({
    queryKey: ["enrollment-counts"],
    queryFn: async (): Promise<Record<string, number>> => {
      const { data, error } = await supabase.from("enrollments").select("status");
      if (error) throw error;
      const counts: Record<string, number> = {};
      for (const s of STATUSES) counts[s] = 0;
      for (const row of data ?? []) counts[(row as { status: string }).status] = (counts[(row as { status: string }).status] ?? 0) + 1;
      return counts;
    },
  });
}

export function useActivityFeed(limit = 7) {
  return useQuery({
    queryKey: ["activity-feed", limit],
    queryFn: async (): Promise<ActivityRow[]> => {
      const { data, error } = await supabase
        .from("audit_log")
        .select("id, at, user_label, action, object, type")
        .order("at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data as ActivityRow[]) ?? [];
    },
  });
}

export function useFinanceSummary(schooljaarId: string | null) {
  return useQuery({
    queryKey: ["finance-summary", schooljaarId],
    enabled: !!schooljaarId,
    queryFn: async () => {
      const [expensesRes, paymentsRes] = await Promise.all([
        supabase.from("expenses").select("amount").eq("schooljaar_id", schooljaarId!),
        supabase.from("payments").select("amount, status"),
      ]);
      if (expensesRes.error) throw expensesRes.error;
      if (paymentsRes.error) throw paymentsRes.error;
      const expenses = (expensesRes.data ?? []).reduce((a, r) => a + Number((r as { amount: number }).amount), 0);
      const payments = (paymentsRes.data ?? []) as { amount: number; status: string }[];
      const paid = payments.filter((p) => p.status === "paid");
      const income = paid.reduce((a, p) => a + Number(p.amount), 0);
      const open = payments.filter((p) => p.status !== "paid").length;
      return { expenses, income, paidCount: paid.length, openCount: open };
    },
  });
}

export const ENROLL_COLUMNS = [
  { id: "wachtlijst", title: "Wachtlijst", color: "var(--warn)" },
  { id: "intake", title: "Intake gepland", color: "var(--accent)" },
  { id: "toegezegd", title: "Toegezegd", color: "var(--info)" },
  { id: "definitief", title: "Definitief", color: "var(--success)" },
  { id: "afgewezen", title: "Afgewezen", color: "var(--danger)" },
];
