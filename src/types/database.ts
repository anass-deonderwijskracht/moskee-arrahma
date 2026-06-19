// Hand-authored to match supabase/migrations/*.sql.
// Regenerate later with: supabase gen types typescript --project-id <ref> > src/types/database.ts
// (kept in sync manually until the project is linked).

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

type Timestamps = { created_at: string };

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: { id: string; full_name: string | null; role: string; class_id: string | null; email: string | null } & Timestamps;
        Insert: { id: string; full_name?: string | null; role?: string; class_id?: string | null; email?: string | null };
        Update: { full_name?: string | null; role?: string; class_id?: string | null; email?: string | null };
        Relationships: [];
      };
      report_periods: {
        Row: { id: string; name: string; ord: number; archived: boolean } & Timestamps;
        Insert: { name: string; ord?: number; archived?: boolean };
        Update: Partial<{ name: string; ord: number; archived: boolean }>;
        Relationships: [];
      };
      tests: {
        Row: { id: string; class_id: string; report_period_id: string; name: string; grade_type: string } & Timestamps;
        Insert: { class_id: string; report_period_id: string; name: string; grade_type: string };
        Update: Partial<{ class_id: string; report_period_id: string; name: string; grade_type: string }>;
        Relationships: [];
      };
      test_grades: {
        Row: { id: string; test_id: string; leerling_id: string; value: string | null; updated_at: string };
        Insert: { test_id: string; leerling_id: string; value?: string | null };
        Update: Partial<{ test_id: string; leerling_id: string; value: string | null }>;
        Relationships: [];
      };
      report_assessments: {
        Row: { id: string; leerling_id: string; report_period_id: string; quran: string | null; gedrag: string | null; inzet: string | null; opmerking: string | null; updated_at: string };
        Insert: { leerling_id: string; report_period_id: string; quran?: string | null; gedrag?: string | null; inzet?: string | null; opmerking?: string | null };
        Update: Partial<{ quran: string | null; gedrag: string | null; inzet: string | null; opmerking: string | null }>;
        Relationships: [];
      };
      app_settings: {
        Row: {
          id: string; name: string; address: string | null; phone: string | null;
          email: string | null; annual_amount_eur: number; terms: number;
          sibling_discount: string | null; singleton: boolean; updated_at: string;
          tuition_regulier_eur: number; tuition_hifdh_eur: number;
        };
        Insert: Partial<Database["public"]["Tables"]["app_settings"]["Row"]>;
        Update: Partial<Database["public"]["Tables"]["app_settings"]["Row"]>;
        Relationships: [];
      };
      surahs: {
        Row: { n: number; name: string; verses: number; juz: number };
        Insert: { n: number; name: string; verses: number; juz: number };
        Update: Partial<{ name: string; verses: number; juz: number }>;
        Relationships: [];
      };
      schooljaren: {
        Row: {
          id: string; code: string; name: string; start_date: string | null;
          end_date: string | null; lesdagen: number | null; is_current: boolean; archived: boolean;
        };
        Insert: Partial<Database["public"]["Tables"]["schooljaren"]["Row"]> & { code: string; name: string };
        Update: Partial<Database["public"]["Tables"]["schooljaren"]["Row"]>;
        Relationships: [];
      };
      tuition_tiers: {
        Row: { id: string; schooljaar_id: string; track: string; rang: number; bedrag: number };
        Insert: { schooljaar_id: string; track: string; rang: number } & Partial<Database["public"]["Tables"]["tuition_tiers"]["Row"]>;
        Update: Partial<Database["public"]["Tables"]["tuition_tiers"]["Row"]>;
        Relationships: [];
      };
      teachers: {
        Row: {
          id: string; name: string; short: string | null; email: string | null;
          phone: string | null; joined: string | null; specialty: string | null; role: string;
        } & Timestamps;
        Insert: Partial<Database["public"]["Tables"]["teachers"]["Row"]> & { name: string };
        Update: Partial<Database["public"]["Tables"]["teachers"]["Row"]>;
        Relationships: [];
      };
      kinderen: {
        Row: {
          id: string; first_name: string; last_name: string; full_name: string;
          initials: string | null; gender: string | null; birth_year: number | null;
          address: string | null; notes: string | null;
        } & Timestamps;
        Insert: { first_name: string; last_name: string } & Partial<{
          initials: string | null; gender: string | null; birth_year: number | null;
          address: string | null; notes: string | null;
        }>;
        Update: Partial<Database["public"]["Tables"]["kinderen"]["Row"]>;
        Relationships: [];
      };
      ouders: {
        Row: {
          id: string; role: string | null; name: string; phone: string | null;
          email: string | null; primary: boolean; bereik: string | null;
        } & Timestamps;
        Insert: { name: string } & Partial<{
          role: string | null; phone: string | null; email: string | null;
          primary: boolean; bereik: string | null;
        }>;
        Update: Partial<Database["public"]["Tables"]["ouders"]["Row"]>;
        Relationships: [];
      };
      kind_ouder: {
        Row: { kind_id: string; ouder_id: string; is_primary: boolean };
        Insert: { kind_id: string; ouder_id: string; is_primary?: boolean };
        Update: Partial<{ is_primary: boolean }>;
        Relationships: [];
      };
      classes: {
        Row: {
          id: string; code: string; grade: number | null; teacher_id: string | null;
          quran_teacher_id: string | null; color: string | null; day: string | null;
          time: string | null; location: string | null; capacity: number | null;
          schooljaar_id: string; track: string; historic: boolean; is_next: boolean;
        } & Timestamps;
        Insert: { code: string; schooljaar_id: string } & Partial<Database["public"]["Tables"]["classes"]["Row"]>;
        Update: Partial<Database["public"]["Tables"]["classes"]["Row"]>;
        Relationships: [];
      };
      leerlingen: {
        Row: {
          id: string; kind_id: string; class_id: string; schooljaar_id: string;
          leerlingnummer: string | null; niveau: string | null; joined: string | null;
          final_grade: string | null; notes_end_of_year: string | null;
          hist_attendance_pct: number | null; hist_surahs_known: number | null;
          lesgeld_override: number | null;
        } & Timestamps;
        Insert: { kind_id: string; class_id: string; schooljaar_id: string } & Partial<Database["public"]["Tables"]["leerlingen"]["Row"]>;
        Update: Partial<Database["public"]["Tables"]["leerlingen"]["Row"]>;
        Relationships: [];
      };
      lessons: {
        Row: {
          id: string; class_id: string; date: string; week_nr: number | null;
          topic: string | null; time: string | null; location: string | null;
          teacher_id: string | null; quran_teacher_id: string | null; type: string;
          teacher_na: boolean; quran_na: boolean;
        } & Timestamps;
        Insert: { class_id: string; date: string } & Partial<Database["public"]["Tables"]["lessons"]["Row"]>;
        Update: Partial<Database["public"]["Tables"]["lessons"]["Row"]>;
        Relationships: [];
      };
      attendance_records: {
        Row: {
          id: string; leerling_id: string; lesson_id: string; status: string | null;
          homework: string | null; materials_issue: boolean; note: string | null; updated_at: string;
        };
        Insert: { leerling_id: string; lesson_id: string } & Partial<Database["public"]["Tables"]["attendance_records"]["Row"]>;
        Update: Partial<Database["public"]["Tables"]["attendance_records"]["Row"]>;
        Relationships: [];
      };
      lesson_notes: {
        Row: { id: string; lesson_id: string; author: string | null; body: string | null; is_draft: boolean } & Timestamps;
        Insert: { lesson_id: string } & Partial<Database["public"]["Tables"]["lesson_notes"]["Row"]>;
        Update: Partial<Database["public"]["Tables"]["lesson_notes"]["Row"]>;
        Relationships: [];
      };
      quran_assignments: {
        Row: {
          id: string; leerling_id: string; class_id: string; assigned_at_lesson_id: string | null;
          evaluated_at_lesson_id: string | null; surah_n: number; start_ayah: number; end_ayah: number;
          type: string; evaluation: string | null; absent: boolean; notes: string | null;
        } & Timestamps;
        Insert: { leerling_id: string; class_id: string; surah_n: number; start_ayah: number; end_ayah: number } & Partial<Database["public"]["Tables"]["quran_assignments"]["Row"]>;
        Update: Partial<Database["public"]["Tables"]["quran_assignments"]["Row"]>;
        Relationships: [];
      };
      leerling_surah_progress: {
        Row: { id: string; leerling_id: string; surah_n: number; status: string; updated_at: string };
        Insert: { leerling_id: string; surah_n: number; status: string };
        Update: Partial<{ status: string }>;
        Relationships: [];
      };
      enrollments: {
        Row: {
          id: string; child_name: string; age: number | null; gender: string | null; track: string;
          status: string; target_class: string | null; submitted_at: string | null;
          submitted_label: string | null; rejection_reason: string | null; preferred_lesday: string | null;
          address: string | null; notes: string | null; birthdate: string | null;
        } & Timestamps;
        Insert: { child_name: string } & Partial<Database["public"]["Tables"]["enrollments"]["Row"]>;
        Update: Partial<Database["public"]["Tables"]["enrollments"]["Row"]>;
        Relationships: [];
      };
      enrollment_parents: {
        Row: {
          id: string; enrollment_id: string; role: string | null; name: string | null;
          phone: string | null; email: string | null; is_primary: boolean;
        };
        Insert: { enrollment_id: string } & Partial<Database["public"]["Tables"]["enrollment_parents"]["Row"]>;
        Update: Partial<Database["public"]["Tables"]["enrollment_parents"]["Row"]>;
        Relationships: [];
      };
      enrollment_placements: {
        Row: {
          id: string; enrollment_id: string; schooljaar_id: string; class_id: string | null;
          niveau: string | null; lesgeld_bedrag: number | null; lesgeld_verschuldigd: number | null; definitief: boolean;
          leerling_id: string | null; updated_at: string;
        };
        Insert: { enrollment_id: string; schooljaar_id: string } & Partial<Database["public"]["Tables"]["enrollment_placements"]["Row"]>;
        Update: Partial<Database["public"]["Tables"]["enrollment_placements"]["Row"]>;
        Relationships: [];
      };
      expenses: {
        Row: {
          id: string; schooljaar_id: string; date: string; category: string | null;
          description: string | null; amount: number; vendor: string | null;
        } & Timestamps;
        Insert: { schooljaar_id: string; date: string; amount: number } & Partial<Database["public"]["Tables"]["expenses"]["Row"]>;
        Update: Partial<Database["public"]["Tables"]["expenses"]["Row"]>;
        Relationships: [];
      };
      budget_categories: {
        Row: { id: string; schooljaar_id: string | null; name: string; planned: number; color: string | null };
        Insert: { name: string } & Partial<Database["public"]["Tables"]["budget_categories"]["Row"]>;
        Update: Partial<Database["public"]["Tables"]["budget_categories"]["Row"]>;
        Relationships: [];
      };
      payments: {
        Row: {
          id: string; leerling_id: string; date: string | null; description: string | null;
          amount: number; status: string; method: string | null;
        } & Timestamps;
        Insert: { leerling_id: string } & Partial<Database["public"]["Tables"]["payments"]["Row"]>;
        Update: Partial<Database["public"]["Tables"]["payments"]["Row"]>;
        Relationships: [];
      };
      audit_log: {
        Row: {
          id: string; at: string; user_label: string | null; action: string | null;
          object: string | null; type: string | null; ip: string | null;
        };
        Insert: Partial<Database["public"]["Tables"]["audit_log"]["Row"]>;
        Update: never;
        Relationships: [];
      };
      incomes: {
        Row: { id: string; schooljaar_id: string; date: string; source: string | null; description: string | null; amount: number } & Timestamps;
        Insert: { schooljaar_id: string; date: string; amount: number } & Partial<Database["public"]["Tables"]["incomes"]["Row"]>;
        Update: Partial<Database["public"]["Tables"]["incomes"]["Row"]>;
        Relationships: [];
      };
    };
    Views: {
      leerling_metrics: {
        Row: {
          leerling_id: string; attendance_pct: number | null; arabic_homework_pct: number | null;
          quran_learned_pct: number | null; surahs_known: number;
        };
        Relationships: [];
      };
      class_metrics: {
        Row: {
          class_id: string; leerling_count: number; capacity: number | null; occupancy: number | null;
          avg_attendance_pct: number | null; avg_arabic_homework_pct: number | null;
          avg_quran_learned_pct: number | null; avg_age: number | null; boys: number; girls: number;
        };
        Relationships: [];
      };
    };
    Functions: {
      finalize_enrollment: { Args: { p_placement_id: string }; Returns: string };
      is_admin: { Args: Record<string, never>; Returns: boolean };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}

// Convenience row aliases used across the data layer.
export type Tables<T extends keyof Database["public"]["Tables"]> = Database["public"]["Tables"][T]["Row"];
export type Views<T extends keyof Database["public"]["Views"]> = Database["public"]["Views"][T]["Row"];
export type Insert<T extends keyof Database["public"]["Tables"]> = Database["public"]["Tables"][T]["Insert"];
export type Update<T extends keyof Database["public"]["Tables"]> = Database["public"]["Tables"][T]["Update"];
