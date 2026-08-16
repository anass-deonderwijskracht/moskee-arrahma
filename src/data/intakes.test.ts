import { describe, expect, it } from "vitest";
import { renderIntakeMessage } from "./intakes";

describe("renderIntakeMessage", () => {
  it("vervangt iedere [link]-variabele door de persoonlijke ouderlink", () => {
    expect(renderIntakeMessage(
      "Beste ouder, open [link]. Bewaar deze link: [link]",
      "https://voorbeeld.nl/intake/persoonlijk",
    )).toBe(
      "Beste ouder, open https://voorbeeld.nl/intake/persoonlijk. Bewaar deze link: https://voorbeeld.nl/intake/persoonlijk",
    );
  });

  it("laat vrije tekst zonder variabele ongewijzigd", () => {
    expect(renderIntakeMessage("Neem contact met ons op.", "https://voorbeeld.nl"))
      .toBe("Neem contact met ons op.");
  });
});
