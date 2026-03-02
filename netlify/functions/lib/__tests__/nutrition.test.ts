import { describe, expect, it } from "vitest";
import { assessNutrition } from "../nutrition";

describe("assessNutrition", () => {
  it("uses OFF nutriscore score and grade when available", () => {
    const out = assessNutrition({
      nutriscore_score: 14,
      nutriscore_grade: "d",
      nutriments: {},
    });

    expect(out.source).toBe("off");
    expect(out.scoreRaw).toBe(14);
    expect(out.grade).toBe("D");
    expect(out.scoreNormalized).toBeGreaterThanOrEqual(0);
    expect(out.scoreNormalized).toBeLessThanOrEqual(100);
  });

  it("returns insufficient when Nutri-Score is unavailable", () => {
    const out = assessNutrition({ nutriments: {} });
    expect(out.source).toBe("insufficient");
    expect(out.scoreRaw).toBeNull();
    expect(out.grade).toBeNull();
  });
});
