import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { IntakesScreen } from "./IntakesScreen";
import type { IntakeMoment } from "@/data/intakes";

const moment = {
  id: "moment-1",
  description: "Intake september",
  duration_text: "20 minuten",
  status: "actief",
  allow_other: false,
  message_template: "Open [link]",
  thank_you_text: "Bedankt",
  created_at: "2026-08-16T10:00:00Z",
  updated_at: "2026-08-16T10:00:00Z",
  intake_slots: [{
    id: "slot-1",
    intake_moment_id: "moment-1",
    date: "2026-09-05",
    start_time: "09:00:00",
    end_time: "12:00:00",
    position: 0,
    created_at: "2026-08-16T10:00:00Z",
  }],
  intake_choices: [],
  intake_attendance: [],
} as IntakeMoment;

vi.mock("@/data/intakes", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/data/intakes")>();
  const mutation = () => ({ mutateAsync: vi.fn(), isPending: false });
  return {
    ...original,
    useIntakeMoments: () => ({ data: [moment], isLoading: false, isError: false, error: null }),
    useSetIntakeStatus: mutation,
    useDeleteIntakeMoment: mutation,
    useDeleteIntakeChoices: mutation,
    useSaveIntakeMoment: mutation,
  };
});

describe("IntakesScreen", () => {
  it("toont intakemomenten in een tabel en opent de details na een rijklik", () => {
    render(<IntakesScreen />);

    expect(screen.getByRole("columnheader", { name: /intakemoment/i })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: /reacties/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Details sluiten" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByText("Intake september"));

    expect(screen.getByRole("button", { name: "Details sluiten" })).toBeEnabled();
    expect(screen.getByText("Beschrijving")).toBeInTheDocument();
  });
});
