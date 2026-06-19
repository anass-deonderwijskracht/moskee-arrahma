import { describe, it, expect } from "vitest";
import { resolveTuition, type TuitionTier } from "./tuition";

const tier = (track: string, rang: number, bedrag: number): TuitionTier =>
  ({ id: `${track}-${rang}`, schooljaar_id: "sj", track, rang, bedrag });

describe("resolveTuition", () => {
  it("past één trede toe op alle kinderen ongeacht rang", () => {
    const res = resolveTuition(
      [
        { id: "a", kind_id: "ka", birth_year: 2015, track: "regulier", override: null },
        { id: "b", kind_id: "kb", birth_year: 2017, track: "regulier", override: null },
      ],
      [{ kind_id: "ka", ouder_id: "o1" }, { kind_id: "kb", ouder_id: "o1" }],
      [tier("regulier", 1, 210)],
    );
    expect(res.get("a")?.amount).toBe(210);
    expect(res.get("b")?.amount).toBe(210);
    expect(res.get("a")?.rang).toBe(1); // oudste = rang 1
    expect(res.get("b")?.rang).toBe(2);
  });

  it("rangt gezins-breed op leeftijd en pakt het bedrag uit het eigen traject", () => {
    const res = resolveTuition(
      [
        { id: "a", kind_id: "ka", birth_year: 2014, track: "regulier", override: null },
        { id: "b", kind_id: "kb", birth_year: 2016, track: "hifdh", override: null },
        { id: "c", kind_id: "kc", birth_year: 2018, track: "regulier", override: null },
      ],
      [
        { kind_id: "ka", ouder_id: "o1" }, { kind_id: "kb", ouder_id: "o1" }, { kind_id: "kc", ouder_id: "o1" },
      ],
      [tier("regulier", 1, 210), tier("regulier", 2, 200), tier("regulier", 3, 190), tier("hifdh", 1, 350), tier("hifdh", 2, 300)],
    );
    expect(res.get("a")).toMatchObject({ rang: 1, amount: 210 });
    expect(res.get("b")).toMatchObject({ rang: 2, amount: 300 }); // hifdh, rang 2
    expect(res.get("c")).toMatchObject({ rang: 3, amount: 190 });
  });

  it("laat de override altijd winnen", () => {
    const res = resolveTuition(
      [{ id: "a", kind_id: "ka", birth_year: 2015, track: "regulier", override: 0 }],
      [],
      [tier("regulier", 1, 210)],
    );
    expect(res.get("a")?.amount).toBe(0);
    expect(res.get("a")?.overridden).toBe(true);
    expect(res.get("a")?.tierAmount).toBe(210);
  });

  it("herhaalt de laatste trede voorbij het aantal ingestelde treden", () => {
    const res = resolveTuition(
      [
        { id: "a", kind_id: "ka", birth_year: 2014, track: "regulier", override: null },
        { id: "b", kind_id: "kb", birth_year: 2016, track: "regulier", override: null },
        { id: "c", kind_id: "kc", birth_year: 2018, track: "regulier", override: null },
      ],
      [
        { kind_id: "ka", ouder_id: "o1" }, { kind_id: "kb", ouder_id: "o1" }, { kind_id: "kc", ouder_id: "o1" },
      ],
      [tier("regulier", 1, 210), tier("regulier", 2, 200)],
    );
    expect(res.get("c")?.amount).toBe(200); // 3e kind valt terug op laatste trede
  });

  it("telt aparte gezinnen los", () => {
    const res = resolveTuition(
      [
        { id: "a", kind_id: "ka", birth_year: 2014, track: "regulier", override: null },
        { id: "b", kind_id: "kb", birth_year: 2016, track: "regulier", override: null },
      ],
      [{ kind_id: "ka", ouder_id: "o1" }, { kind_id: "kb", ouder_id: "o2" }],
      [tier("regulier", 1, 210), tier("regulier", 2, 200)],
    );
    expect(res.get("a")?.rang).toBe(1);
    expect(res.get("b")?.rang).toBe(1); // ander gezin → ook rang 1
  });
});
