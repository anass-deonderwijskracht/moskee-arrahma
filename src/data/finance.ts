import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Tables } from "@/types/database";

export type Expense = Tables<"expenses">;
export type BudgetCategory = Tables<"budget_categories">;

export function useAppSettings() {
  return useQuery({
    queryKey: ["app-settings"],
    queryFn: async (): Promise<Tables<"app_settings"> | null> => {
      const { data, error } = await supabase.from("app_settings").select("*").limit(1).maybeSingle();
      if (error) throw error;
      return data as Tables<"app_settings"> | null;
    },
  });
}

export type Income = Tables<"incomes">;

export interface FinanceData {
  expenses: Expense[];
  budgets: BudgetCategory[];
  incomes: Income[];                 // manual incomes (sponsoren, donaties, …)
  paidTuition: number;               // sum of paid collegegeld payments
  openCount: number;                 // payments not paid
  leerlingCount: number;             // current-year leerlingen for this schooljaar
  // Per-track capacity & enrolment for the begroting (capacity × tarief).
  regulier: { capacity: number; enrolled: number };
  hifdh: { capacity: number; enrolled: number };
}

export function useFinance(schooljaarId: string | null) {
  return useQuery({
    queryKey: ["finance", schooljaarId],
    enabled: !!schooljaarId,
    queryFn: async (): Promise<FinanceData> => {
      const [expensesRes, budgetsRes, incomesRes, paymentsRes, classesRes, leerlingRes] = await Promise.all([
        supabase.from("expenses").select("*").eq("schooljaar_id", schooljaarId!).order("date"),
        supabase.from("budget_categories").select("*"),
        supabase.from("incomes").select("*").eq("schooljaar_id", schooljaarId!).order("date"),
        supabase.from("payments").select("amount,status"),
        supabase.from("classes").select("id, capacity, track").eq("schooljaar_id", schooljaarId!),
        supabase.from("leerlingen").select("class_id, classes(track)").eq("schooljaar_id", schooljaarId!),
      ]);
      if (expensesRes.error) throw expensesRes.error;
      if (incomesRes.error) throw incomesRes.error;
      const payments = (paymentsRes.data ?? []) as { amount: number; status: string }[];
      const classes = (classesRes.data ?? []) as { id: string; capacity: number | null; track: string }[];
      const leerlingen = (leerlingRes.data ?? []) as unknown as { class_id: string; classes: { track: string } | null }[];

      const cap = (track: string) => classes.filter((c) => c.track === track).reduce((a, c) => a + (c.capacity ?? 0), 0);
      const enr = (track: string) => leerlingen.filter((l) => l.classes?.track === track).length;

      return {
        expenses: (expensesRes.data as Expense[]) ?? [],
        budgets: (budgetsRes.data as BudgetCategory[]) ?? [],
        incomes: (incomesRes.data as Income[]) ?? [],
        paidTuition: payments.filter((p) => p.status === "paid").reduce((a, p) => a + Number(p.amount), 0),
        openCount: payments.filter((p) => p.status !== "paid").length,
        leerlingCount: leerlingen.length,
        regulier: { capacity: cap("regulier"), enrolled: enr("regulier") },
        hifdh: { capacity: cap("hifdh"), enrolled: enr("hifdh") },
      };
    },
  });
}

export function useAddIncome() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (row: { schooljaar_id: string; date: string; source: string; description: string; amount: number }) => {
      const { error } = await supabase.from("incomes").insert(row as never);
      if (error) throw error;
      await supabase.from("audit_log").insert({ action: "inkomst toegevoegd", object: `${row.source}: €${row.amount}`, type: "fin", user_label: "Beheerder" } as never);
    },
    onSuccess: (_d, row) => qc.invalidateQueries({ queryKey: ["finance", row.schooljaar_id] }),
  });
}

export function useAddExpense() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (row: { schooljaar_id: string; date: string; category: string; description: string; amount: number; vendor: string }) => {
      const { error } = await supabase.from("expenses").insert(row as never);
      if (error) throw error;
      await supabase.from("audit_log").insert({ action: "uitgave toegevoegd", object: `${row.description} (€${row.amount})`, type: "fin", user_label: "Beheerder" } as never);
    },
    onSuccess: (_d, row) => qc.invalidateQueries({ queryKey: ["finance", row.schooljaar_id] }),
  });
}

export function useDeleteExpenses(schooljaarId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (ids: string[]) => {
      if (!ids.length) return;
      const { error } = await supabase.from("expenses").delete().in("id", ids);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["finance", schooljaarId] }),
  });
}

export function useDeleteIncomes(schooljaarId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (ids: string[]) => {
      if (!ids.length) return;
      const { error } = await supabase.from("incomes").delete().in("id", ids);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["finance", schooljaarId] }),
  });
}

/** Maps an expense category to a budget category name (prototype grouping). */
export function budgetForCategory(cat: string | null): string | null {
  switch (cat) {
    case "Materialen": return "Materialen";
    case "Salaris": return "Salaris docenten";
    case "Faciliteit": return "Faciliteit";
    case "Activiteit":
    case "Catering": return "Activiteiten";
    case "Software": return "Software & admin";
    default: return null;
  }
}
