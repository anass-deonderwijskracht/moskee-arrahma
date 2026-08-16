import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { EnrollmentSheet } from "./EnrollmentSheet";
import type { Enrollment } from "@/data/enrollments";

const duplicated = {
  id: "enrollment-copy",
  child_name: "Yasmin El Amrani",
  status: "wachtlijst",
  track: "regulier",
  enrollment_parents: [],
} as unknown as Enrollment;

const duplicateMutation = vi.hoisted(() => ({ mutateAsync: vi.fn(), isPending: false }));

vi.mock("@/data/enrollments", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/data/enrollments")>();
  const mutation = () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false });
  return {
    ...original,
    useUpdateEnrollmentStatus: mutation,
    useUpdateEnrollment: mutation,
    useUpdateEnrollmentParent: mutation,
    useDeleteEnrollments: mutation,
    useDuplicateEnrollment: () => duplicateMutation,
    useUpsertPlacement: mutation,
    usePlacementPayment: () => ({ data: undefined }),
    useSetPlacementPayment: mutation,
    useFinalizeEnrollment: mutation,
  };
});

vi.mock("@/data/tuition", () => ({
  useTuitionTiers: () => ({ data: [] }),
  useResolvedTuition: () => new Map(),
  useSetLesgeldOverride: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
}));

const enrollment = {
  id: "enrollment-1",
  child_name: "Yasmin El Amrani",
  age: 8,
  birthdate: null,
  gender: "f",
  track: "regulier",
  status: "wachtlijst",
  target_class: null,
  submitted_at: "2026-08-16T10:00:00Z",
  submitted_label: "vandaag",
  rejection_reason: null,
  preferred_lesday: "Zaterdag",
  address: null,
  notes: null,
  twijfel: false,
  intake_access_token: "00000000-0000-4000-8000-000000000001",
  created_at: "2026-08-16T10:00:00Z",
  updated_at: "2026-08-16T10:00:00Z",
  enrollment_parents: [],
} as Enrollment;

describe("EnrollmentSheet", () => {
  it("opent de gedupliceerde inschrijving direct via de callback", async () => {
    duplicateMutation.mutateAsync.mockResolvedValueOnce(duplicated);
    const onDuplicated = vi.fn();
    render(<EnrollmentSheet item={enrollment} onClose={vi.fn()} onDuplicated={onDuplicated} />);

    const deleteButton = screen.getByRole("button", { name: "Inschrijving verwijderen" });
    const duplicateButton = screen.getByRole("button", { name: "Dupliceren" });
    expect(deleteButton.compareDocumentPosition(duplicateButton) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    fireEvent.click(duplicateButton);

    await waitFor(() => expect(duplicateMutation.mutateAsync).toHaveBeenCalledWith("enrollment-1"));
    expect(onDuplicated).toHaveBeenCalledWith(duplicated);
  });
});
