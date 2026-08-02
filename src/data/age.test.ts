import { describe, it, expect } from "vitest";
import { age, ageFromBirthdate, ageFromBirthYear, ageLabel, isEstimated, birthYearOf } from "./age";

// Vast "vandaag" zodat de tests niet meebewegen met de kalender.
const TODAY = new Date("2026-07-26T12:00:00");

describe("ageFromBirthdate", () => {
  it("trekt er een jaar af als de verjaardag nog moet komen", () => {
    // Het geval uit de melding: geboren oktober 2020 is in juli 2026 nog 5.
    expect(ageFromBirthdate("2020-10-14", TODAY)).toBe(5);
  });

  it("telt het jaar mee zodra de verjaardag is geweest", () => {
    expect(ageFromBirthdate("2020-03-14", TODAY)).toBe(6);
  });

  it("telt de verjaardag zelf al mee", () => {
    expect(ageFromBirthdate("2020-07-26", TODAY)).toBe(6);
    expect(ageFromBirthdate("2020-07-27", TODAY)).toBe(5);
  });

  it("geeft null bij ontbrekende of onzinnige invoer", () => {
    expect(ageFromBirthdate(null, TODAY)).toBeNull();
    expect(ageFromBirthdate("", TODAY)).toBeNull();
    expect(ageFromBirthdate("geen datum", TODAY)).toBeNull();
  });
});

describe("ageFromBirthYear", () => {
  it("schat op basis van het jaar en kan er tot de verjaardag 1 naast zitten", () => {
    expect(ageFromBirthYear(2020, TODAY)).toBe(6);
  });

  it("geeft null zonder geboortejaar", () => {
    expect(ageFromBirthYear(null, TODAY)).toBeNull();
  });
});

describe("age", () => {
  it("laat de volledige datum winnen van het geboortejaar", () => {
    expect(age({ birthdate: "2020-10-14", birth_year: 2020 }, TODAY)).toBe(5);
  });

  it("valt terug op het geboortejaar als de datum ontbreekt", () => {
    expect(age({ birthdate: null, birth_year: 2020 }, TODAY)).toBe(6);
  });

  it("geeft null als beide ontbreken", () => {
    expect(age({}, TODAY)).toBeNull();
  });
});

describe("isEstimated en ageLabel", () => {
  it("markeert alleen een leeftijd uit enkel het geboortejaar als schatting", () => {
    expect(isEstimated({ birth_year: 2020 })).toBe(true);
    expect(isEstimated({ birthdate: "2020-10-14", birth_year: 2020 })).toBe(false);
    expect(isEstimated({})).toBe(false);
  });

  it("zet er een ± voor bij een schatting, maar alleen als daarom gevraagd is", () => {
    expect(ageLabel({ birth_year: 2020 }, { approx: true })).toBe("±6 jr");
    expect(ageLabel({ birth_year: 2020 })).toBe("6 jr");
    expect(ageLabel({ birthdate: "2020-10-14" }, { approx: true })).toBe("5 jr");
    expect(ageLabel({})).toBe("—");
  });
});

describe("birthYearOf", () => {
  it("pakt het jaar uit een datum", () => {
    expect(birthYearOf("2020-10-14")).toBe(2020);
    expect(birthYearOf(null)).toBeNull();
  });
});
