// Qur'an auto-next-ayah engine — the signature workflow's pure logic.
// Used by Qur'an-administratie to propose the next homework after a teacher
// evaluates the previous (type='new') homework. Kept framework-free so it is
// trivially unit-testable (see ayahEngine.test.ts).

export interface SurahRef {
  n: number;
  name: string;
  verses: number;
}

export interface Assignment {
  surah_n: number;
  start_ayah: number;
  end_ayah: number;
  type: "new" | "revision";
}

export interface ProposedHomework {
  surah_n: number;
  start_ayah: number;
  end_ayah: number;
}

export type Evaluation = "yes" | "partial" | "no" | null;

const CHUNK = 4; // ayahs proposed per "Geleerd" step

/**
 * Memorisation order: juz 30 back-to-front (An-Nas first), then Al-Fatiha last.
 * Mirrors the prototype: [...SURAHS].sort((a, b) => b.n - a.n).
 */
export function memorisationOrder(surahs: SurahRef[]): SurahRef[] {
  return [...surahs].sort((a, b) => b.n - a.n);
}

function nextSurah(surahs: SurahRef[], currentN: number): SurahRef | null {
  const order = memorisationOrder(surahs);
  const idx = order.findIndex((s) => s.n === currentN);
  if (idx < 0 || idx + 1 >= order.length) return null;
  return order[idx + 1];
}

/**
 * Given the previous homework and the teacher's evaluation, propose the next
 * homework block.
 *
 * Rules (from the design chat + spec §6.2):
 *  - Only `type: 'new'` previous homework generates a proposal. Revisions return null.
 *  - 'yes'  → next CHUNK ayahs of the same surah (start = prev.end+1). If the
 *             surah is finished, roll to the first CHUNK ayahs of the next surah
 *             in memorisation order.
 *  - 'partial' / 'no' → repeat the same surah/range.
 *  - null (eval toggled off) → no proposal (remove generated homework).
 */
export function computeNextHomework(
  prev: Assignment,
  evaluation: Evaluation,
  surahs: SurahRef[],
): ProposedHomework | null {
  if (prev.type !== "new") return null;
  if (evaluation == null) return null;

  if (evaluation === "partial" || evaluation === "no") {
    return { surah_n: prev.surah_n, start_ayah: prev.start_ayah, end_ayah: prev.end_ayah };
  }

  // evaluation === "yes"
  const surah = surahs.find((s) => s.n === prev.surah_n);
  const versesInSurah = surah?.verses ?? prev.end_ayah;

  if (prev.end_ayah < versesInSurah) {
    const start = prev.end_ayah + 1;
    const end = Math.min(versesInSurah, start + CHUNK - 1);
    return { surah_n: prev.surah_n, start_ayah: start, end_ayah: end };
  }

  // Surah finished — roll to the next surah in memorisation order.
  const next = nextSurah(surahs, prev.surah_n);
  if (!next) return null; // reached the end (Al-Fatiha)
  return { surah_n: next.n, start_ayah: 1, end_ayah: Math.min(next.verses, CHUNK) };
}
