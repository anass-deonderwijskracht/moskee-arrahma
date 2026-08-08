import { describe, it, expect } from "vitest";
import {
  applyContactName, buildContactName, parseContactName, normalizePhone,
  statusMarker, bestMarker, yearSuffix, applyToNameParts, joinNameParts,
  trackCode, bestCode, pickPrimaryIndex, CODE_REGULIER, CODE_HIFDH,
  MARKER_OK, MARKER_PENDING, MARKER_REJECTED,
} from "./contactName";

describe("statusMarker / bestMarker", () => {
  it("verdeelt de zes statussen over drie markeringen", () => {
    expect(statusMarker("definitief")).toBe(MARKER_OK);
    expect(statusMarker("toegezegd")).toBe(MARKER_OK);
    expect(statusMarker("herinschrijving")).toBe(MARKER_PENDING);
    expect(statusMarker("wachtlijst")).toBe(MARKER_PENDING);
    expect(statusMarker("intake")).toBe(MARKER_PENDING);
    expect(statusMarker("afgewezen")).toBe(MARKER_REJECTED);
  });

  it("laat één geaccepteerd kind de ouder actief maken", () => {
    expect(bestMarker(["afgewezen", "definitief"])).toBe(MARKER_OK);
    expect(bestMarker(["afgewezen", "wachtlijst"])).toBe(MARKER_PENDING);
    expect(bestMarker(["afgewezen"])).toBe(MARKER_REJECTED);
    expect(bestMarker([])).toBe(MARKER_PENDING);
  });

  it("valt terug op de zandloper bij een onbekende status", () => {
    expect(statusMarker("iets-nieuws")).toBe(MARKER_PENDING);
  });
});

describe("trackCode / bestCode", () => {
  it("geeft HF voor hifdh en AO voor de rest", () => {
    expect(trackCode("hifdh")).toBe(CODE_HIFDH);
    expect(trackCode("regulier")).toBe(CODE_REGULIER);
    expect(trackCode(null)).toBe(CODE_REGULIER);
  });

  it("laat hifdh winnen bij een gezin met kinderen in beide trajecten", () => {
    expect(bestCode(["regulier", "hifdh"])).toBe(CODE_HIFDH);
    expect(bestCode(["regulier", "regulier"])).toBe(CODE_REGULIER);
    expect(bestCode([])).toBe(CODE_REGULIER);
  });
});

describe("yearSuffix", () => {
  it("leest het startjaar uit code, naam of getal", () => {
    expect(yearSuffix("y2026")).toBe(26);
    expect(yearSuffix("2026/27")).toBe(26);
    expect(yearSuffix(2025)).toBe(25);
    expect(yearSuffix("geen jaar")).toBeNull();
  });
});

describe("parseContactName", () => {
  it("splitst naam, code, jaar en markering", () => {
    expect(parseContactName("Mohamed Belbachir AO-25 ✅")).toEqual({
      base: "Mohamed Belbachir", code: "AO", year: 25, marker: MARKER_OK,
    });
  });

  it("werkt zonder markering en zonder achtervoegsel", () => {
    expect(parseContactName("Mohamed Belbachir AO-25")).toMatchObject({ base: "Mohamed Belbachir", year: 25, marker: null });
    expect(parseContactName("Mohamed Belbachir")).toMatchObject({ base: "Mohamed Belbachir", code: null, year: null, marker: null });
  });

  it("herkent een markering zonder code", () => {
    expect(parseContactName("Mohamed Belbachir ✅")).toMatchObject({ base: "Mohamed Belbachir", code: null, marker: MARKER_OK });
  });

  it("schoont een dubbel toegepast achtervoegsel op en houdt het buitenste aan", () => {
    expect(parseContactName("Mohamed Belbachir AO-25 ⏳ AO-26 ✅")).toEqual({
      base: "Mohamed Belbachir", code: "AO", year: 26, marker: MARKER_OK,
    });
  });

  it("herkent een achtervoegsel dat aan het begin staat", () => {
    expect(parseContactName("AO-25")).toEqual({ base: "", code: "AO", year: 25, marker: null });
    expect(parseContactName("AO-25 ✅")).toEqual({ base: "", code: "AO", year: 25, marker: MARKER_OK });
  });

  it("accepteert ook een viercijferig jaartal", () => {
    expect(parseContactName("Hassani AO-2025")).toMatchObject({ base: "Hassani", code: "AO", year: 25 });
  });

  it("laat namen met cijfers of streepjes met rust", () => {
    expect(parseContactName("Anne-Marie de Vries")).toMatchObject({ base: "Anne-Marie de Vries", code: null });
    expect(parseContactName("Jan Pieter 2e contact")).toMatchObject({ base: "Jan Pieter 2e contact", code: null });
  });

  it("negeert overtollige spaties en een emoji-variatieselector", () => {
    expect(parseContactName("  Mohamed   Belbachir   AO-25  ✅️ ")).toEqual({
      base: "Mohamed Belbachir", code: "AO", year: 25, marker: MARKER_OK,
    });
  });
});

describe("buildContactName / applyContactName", () => {
  it("stelt de naam samen zoals afgesproken", () => {
    expect(buildContactName("Mohamed Belbachir", "AO", 26, MARKER_OK)).toBe("Mohamed Belbachir AO-26 ✅");
  });

  it("vult het jaartal aan tot twee cijfers", () => {
    expect(buildContactName("Test Ouder", "AO", 2026, MARKER_PENDING)).toBe("Test Ouder AO-26 ⏳");
    expect(buildContactName("Test Ouder", "AO", 5, MARKER_OK)).toBe("Test Ouder AO-05 ✅");
  });

  it("werkt AO-25 bij naar AO-26 zonder de naam aan te tasten", () => {
    expect(applyContactName("Mohamed Belbachir AO-25 ✅", { code: "AO", year: 26, marker: MARKER_OK }))
      .toBe("Mohamed Belbachir AO-26 ✅");
  });

  it("behoudt een handmatige naamcorrectie in Google", () => {
    expect(applyContactName("Mohammed el Belbachir AO-25 ✅", { code: "AO", year: 26, marker: MARKER_PENDING }))
      .toBe("Mohammed el Belbachir AO-26 ⏳");
  });

  it("is idempotent", () => {
    const opts = { code: "AO", year: 26, marker: MARKER_OK } as const;
    const once = applyContactName("Mohamed Belbachir", opts);
    expect(applyContactName(once, opts)).toBe(once);
    expect(applyContactName(applyContactName(once, opts), opts)).toBe(once);
  });

  it("zet een afgewezen ouder om naar het kruisje", () => {
    expect(applyContactName("Fatima Idrissi AO-26 ⏳", { code: "AO", year: 26, marker: MARKER_REJECTED }))
      .toBe("Fatima Idrissi AO-26 ❌");
  });

  it("wisselt van traject zonder resten achter te laten", () => {
    expect(applyContactName("Yasmin El Amrani AO-25 ✅", { code: CODE_HIFDH, year: 26, marker: MARKER_OK }))
      .toBe("Yasmin El Amrani HF-26 ✅");
    expect(applyToNameParts({ givenName: "Yasmin", familyName: "El Amrani HF-25 ✅" }, { code: CODE_REGULIER, year: 26, marker: MARKER_OK }))
      .toEqual({ givenName: "Yasmin", middleName: "", familyName: "El Amrani AO-26 ✅" });
  });
});

describe("applyToNameParts", () => {
  const opts = { code: "AO", year: 26, marker: MARKER_OK } as const;

  it("hangt het achtervoegsel aan de achternaam en laat de voornaam met rust", () => {
    expect(applyToNameParts({ givenName: "Mohamed", familyName: "Belbachir" }, opts))
      .toEqual({ givenName: "Mohamed", middleName: "", familyName: "Belbachir AO-26 ✅" });
  });

  it("vervangt een bestaand achtervoegsel in de achternaam", () => {
    expect(applyToNameParts({ givenName: "Mohamed", familyName: "Belbachir AO-25 ⏳" }, opts))
      .toEqual({ givenName: "Mohamed", middleName: "", familyName: "Belbachir AO-26 ✅" });
  });

  it("valt terug op de voornaam als er geen achternaam is", () => {
    expect(applyToNameParts({ givenName: "Mohamed Belbachir" }, opts))
      .toEqual({ givenName: "Mohamed Belbachir AO-26 ✅", middleName: "", familyName: "" });
  });

  it("gebruikt het tussenvoegsel als dat de laatste gevulde component is", () => {
    expect(applyToNameParts({ givenName: "Mohamed", middleName: "el" }, opts))
      .toEqual({ givenName: "Mohamed", middleName: "el AO-26 ✅", familyName: "" });
  });

  it("ruimt een achtervoegsel op dat in de verkeerde component stond", () => {
    expect(applyToNameParts({ givenName: "Mohamed AO-25", familyName: "Belbachir ✅" }, opts))
      .toEqual({ givenName: "Mohamed", middleName: "", familyName: "Belbachir AO-26 ✅" });
  });

  it("stript een component die volledig uit het achtervoegsel bestaat", () => {
    // Zoals de handmatige import het bij sommige contacten opsloeg:
    // givenName "Oumaima Hassani", familyName "AO-25". Dat leverde eerder
    // "Oumaima Hassani AO-25 AO-26 ✅" op.
    expect(joinNameParts(applyToNameParts({ givenName: "Oumaima Hassani", familyName: "AO-25" }, opts)))
      .toBe("Oumaima Hassani AO-26 ✅");
  });

  it("houdt de voor-/achternaamsplitsing aan zoals de sync hem aanlevert", () => {
    expect(applyToNameParts({ givenName: "Oumaima", familyName: "Hassani" }, opts))
      .toEqual({ givenName: "Oumaima", middleName: "", familyName: "Hassani AO-26 ✅" });
  });

  it("stapelt geen jaartallen op bij een los achtervoegsel mét markering", () => {
    expect(joinNameParts(applyToNameParts({ givenName: "Emre karacoban", familyName: "AO-24 ⏳" }, opts)))
      .toBe("Emre karacoban AO-26 ✅");
  });

  it("valt terug op de systeemnaam als er na strippen niets overblijft", () => {
    expect(joinNameParts(applyToNameParts(
      { givenName: "AO-25", familyName: "✅" },
      opts,
      { givenName: "Oumaima", familyName: "Hassani" },
    ))).toBe("Oumaima Hassani AO-26 ✅");
  });

  it("is idempotent over de losse componenten", () => {
    const once = applyToNameParts({ givenName: "Mohamed", familyName: "Belbachir" }, opts);
    expect(applyToNameParts(once, opts)).toEqual(once);
  });

  it("levert dezelfde weergavenaam op als de losse variant", () => {
    const parts = applyToNameParts({ givenName: "Mohamed", familyName: "Belbachir" }, opts);
    expect(joinNameParts(parts)).toBe(applyContactName("Mohamed Belbachir", opts));
  });
});

describe("pickPrimaryIndex", () => {
  const c = (name: string, richness = 0) => ({ name, richness });

  it("houdt het contact van het nieuwste schooljaar aan", () => {
    const list = [c("Oumaima Hassani AO-23"), c("Oumaima Hassani AO-25"), c("Oumaima Hassani AO-24")];
    expect(pickPrimaryIndex(list)).toBe(1);
  });

  it("kijkt bij gelijk jaartal naar het rijkst gevulde contact", () => {
    expect(pickPrimaryIndex([c("Ahmed Mobarak AO-25", 1), c("Ahmed Mobarak AO-25", 4)])).toBe(1);
  });

  it("valt zonder jaartallen terug op het rijkst gevulde contact", () => {
    expect(pickPrimaryIndex([c("Ghizlane", 0), c("Ghizlane", 3), c("Ghizlane", 1)])).toBe(1);
  });

  it("laat een contact mét jaartal winnen van eentje zonder, ook als die voller is", () => {
    expect(pickPrimaryIndex([c("Hamza Belhadj", 9), c("Hamza Belhadj AO-24", 1)])).toBe(1);
  });

  it("kiest bij volledig gelijkspel de eerste", () => {
    expect(pickPrimaryIndex([c("Adam Jamai AO-25", 2), c("Adam Jamai AO-25", 2)])).toBe(0);
  });

  it("werkt met één kandidaat", () => {
    expect(pickPrimaryIndex([c("Faiza Mehdaoui AO-25")])).toBe(0);
  });
});

describe("normalizePhone", () => {
  it("zet Nederlandse notaties om naar E.164", () => {
    expect(normalizePhone("0612345678")).toBe("+31612345678");
    expect(normalizePhone("06 12 34 56 78")).toBe("+31612345678");
    expect(normalizePhone("06-12345678")).toBe("+31612345678");
    expect(normalizePhone("+31 6 12345678")).toBe("+31612345678");
    expect(normalizePhone("0031612345678")).toBe("+31612345678");
    expect(normalizePhone("(06) 1234 5678")).toBe("+31612345678");
  });

  it("laat een al genormaliseerd nummer ongemoeid", () => {
    expect(normalizePhone("+31612345678")).toBe("+31612345678");
  });

  it("houdt buitenlandse nummers heel", () => {
    expect(normalizePhone("+212612345678")).toBe("+212612345678");
  });

  it("geeft null bij onbruikbare invoer", () => {
    expect(normalizePhone("")).toBeNull();
    expect(normalizePhone(null)).toBeNull();
    expect(normalizePhone("onbekend")).toBeNull();
    expect(normalizePhone("06123")).toBeNull();
  });

  it("matcht twee notaties van hetzelfde nummer op elkaar", () => {
    expect(normalizePhone("06-12345678")).toBe(normalizePhone("+31 612 345 678"));
  });
});
