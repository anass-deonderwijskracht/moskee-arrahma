import { describe, it, expect } from "vitest";
import { computeNextHomework, memorisationOrder, type SurahRef, type Assignment } from "./ayahEngine";

// A small slice of juz 30 (descending memorisation order: 114, 113, 112, ...).
const SURAHS: SurahRef[] = [
  { n: 1, name: "Al-Fatiha", verses: 7 },
  { n: 112, name: "Al-Ikhlas", verses: 4 },
  { n: 113, name: "Al-Falaq", verses: 5 },
  { n: 114, name: "An-Nas", verses: 6 },
];

const newHw = (surah_n: number, start_ayah: number, end_ayah: number): Assignment => ({
  surah_n, start_ayah, end_ayah, type: "new",
});

describe("memorisationOrder", () => {
  it("orders surahs by descending number (An-Nas first, Al-Fatiha last)", () => {
    expect(memorisationOrder(SURAHS).map((s) => s.n)).toEqual([114, 113, 112, 1]);
  });
});

describe("computeNextHomework — Geleerd (yes)", () => {
  it("proposes the next 4 ayahs of the same surah", () => {
    // An-Nas has 6 verses; learned 1-2 → propose 3-6 (capped at chunk of 4).
    expect(computeNextHomework(newHw(114, 1, 2), "yes", SURAHS)).toEqual({
      surah_n: 114, start_ayah: 3, end_ayah: 6,
    });
  });

  it("caps the end ayah at the surah's verse count", () => {
    // Al-Falaq has 5 verses; learned 1-3 → propose 4-5 (only 2 left, not 4).
    expect(computeNextHomework(newHw(113, 1, 3), "yes", SURAHS)).toEqual({
      surah_n: 113, start_ayah: 4, end_ayah: 5,
    });
  });

  it("rolls to the next surah when the current one is finished", () => {
    // An-Nas finished (1-6) → next in order is Al-Falaq (113), first 4 ayahs.
    expect(computeNextHomework(newHw(114, 1, 6), "yes", SURAHS)).toEqual({
      surah_n: 113, start_ayah: 1, end_ayah: 4,
    });
  });

  it("returns null at the very end of the memorisation order", () => {
    // Al-Fatiha (n=1) is last in order; finishing it has no successor.
    expect(computeNextHomework(newHw(1, 1, 7), "yes", SURAHS)).toBeNull();
  });
});

describe("computeNextHomework — Gedeeltelijk / Niet", () => {
  it("repeats the same range on partial", () => {
    expect(computeNextHomework(newHw(114, 1, 4), "partial", SURAHS)).toEqual({
      surah_n: 114, start_ayah: 1, end_ayah: 4,
    });
  });
  it("repeats the same range on no", () => {
    expect(computeNextHomework(newHw(114, 1, 4), "no", SURAHS)).toEqual({
      surah_n: 114, start_ayah: 1, end_ayah: 4,
    });
  });
});

describe("computeNextHomework — guards", () => {
  it("returns null when evaluation is cleared", () => {
    expect(computeNextHomework(newHw(114, 1, 4), null, SURAHS)).toBeNull();
  });

  it("never generates from a revision-type assignment (prototype bug fix)", () => {
    const revision: Assignment = { surah_n: 114, start_ayah: 1, end_ayah: 6, type: "revision" };
    expect(computeNextHomework(revision, "yes", SURAHS)).toBeNull();
    expect(computeNextHomework(revision, "partial", SURAHS)).toBeNull();
  });
});
