import { describe, it, expect } from "vitest";
import { buildBulkTestRows } from "./rapporten";

describe("buildBulkTestRows", () => {
  it("maakt één rij per klas × rapport-combinatie", () => {
    const rows = buildBulkTestRows({
      name: "Soera-toets", grade_type: "cijfer",
      classIds: ["c1", "c2"], reportPeriodIds: ["r1", "r2"],
    });
    expect(rows).toHaveLength(4);
    expect(rows).toContainEqual({ class_id: "c1", report_period_id: "r1", name: "Soera-toets", grade_type: "cijfer" });
    expect(rows).toContainEqual({ class_id: "c2", report_period_id: "r2", name: "Soera-toets", grade_type: "cijfer" });
  });

  it("geeft geen rijen zonder klas of zonder rapport", () => {
    expect(buildBulkTestRows({ name: "x", grade_type: "schaal", classIds: [], reportPeriodIds: ["r1"] })).toHaveLength(0);
    expect(buildBulkTestRows({ name: "x", grade_type: "schaal", classIds: ["c1"], reportPeriodIds: [] })).toHaveLength(0);
  });
});
