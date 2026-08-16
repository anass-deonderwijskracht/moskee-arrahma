import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PublicIntakePage } from "./PublicIntakePage";
import type { PublicIntake } from "@/data/intakes";

const mocks = vi.hoisted(() => ({
  data: null as PublicIntake | null,
  submit: vi.fn(),
}));

vi.mock("@/data/intakes", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/data/intakes")>();
  return {
    ...original,
    usePublicIntake: () => ({ data: mocks.data, isLoading: false, isError: false }),
    useSubmitPublicIntake: () => ({
      mutateAsync: mocks.submit,
      isPending: false,
      isError: false,
    }),
  };
});

const baseData: PublicIntake = {
  moment: {
    id: "moment-1",
    description: "Kies een geschikt moment voor de intake.",
    duration_text: "ongeveer 20 minuten",
    allow_other: true,
  },
  enrollments: [
    { id: "child-1", first_name: "Yasmin", preferred_lesday: "Zaterdag" },
    { id: "child-2", first_name: "Adam", preferred_lesday: "Geen voorkeur" },
  ],
  slots: [{ id: "slot-1", date: "2026-09-07", start_time: "09:00:00", end_time: "12:00:00" }],
  selection: null,
};

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/intake/00000000-0000-4000-8000-000000000001"]}>
      <Routes>
        <Route path="/intake/:token" element={<PublicIntakePage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("PublicIntakePage", () => {
  beforeEach(() => {
    mocks.data = structuredClone(baseData);
    mocks.submit.mockReset().mockResolvedValue(baseData);
    vi.stubGlobal("scrollTo", vi.fn());
  });

  it("slaat meerdere kinderen, één moment en opmerkingen gezamenlijk op", async () => {
    renderPage();

    fireEvent.click(screen.getByRole("checkbox", { name: "Yasmin" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Adam" }));
    fireEvent.change(screen.getAllByLabelText("Voorkeursdag")[1], { target: { value: "Zondag" } });
    fireEvent.click(screen.getByRole("radio", { name: /maandag 7 september 2026/i }));
    fireEvent.change(screen.getByLabelText("Opmerkingen"), { target: { value: "Graag samen inplannen." } });
    fireEvent.click(screen.getByRole("button", { name: "Voorkeur opslaan" }));

    await waitFor(() => expect(mocks.submit).toHaveBeenCalledWith({
      enrollmentIds: ["child-1", "child-2"],
      slotId: "slot-1",
      otherText: null,
      note: "Graag samen inplannen.",
      lessonDayPreferences: { "child-1": "Zaterdag", "child-2": "Zondag" },
    }));
  });

  it("toont een bestaande gezinskeuze als één bevestigde afspraak", () => {
    mocks.data = {
      ...structuredClone(baseData),
      selection: {
        enrollment_ids: ["child-1", "child-2"],
        slot_id: "slot-1",
        other_text: null,
        note: "Graag samen inplannen.",
        chosen_at: "2026-08-15T12:00:00Z",
        updated_at: "2026-08-15T12:00:00Z",
      },
    };

    renderPage();

    expect(screen.getByRole("heading", { name: "Bedankt" })).toBeInTheDocument();
    expect(screen.getByText("Yasmin")).toBeInTheDocument();
    expect(screen.getByText("Adam")).toBeInTheDocument();
    expect(screen.getByText("Zaterdag")).toBeInTheDocument();
    expect(screen.getByText("Geen voorkeur")).toBeInTheDocument();
    expect(screen.getByText("Graag samen inplannen.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Voorkeur wijzigen" })).toBeEnabled();
  });
});
