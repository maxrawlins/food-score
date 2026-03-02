import type { OffProduct } from "./offData";

export type Grade = "A" | "B" | "C" | "D" | "E";

export type NutritionAssessment = {
  method: "nutri-score";
  source: "off" | "calculated" | "insufficient";
  scoreRaw: number | null;
  scoreNormalized: number | null; // 0..100 (higher = worse)
  grade: Grade | null;
  notes: string[];
};

function toNumber(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
}

function normalizeGrade(g: unknown): Grade | null {
  if (typeof g !== "string") return null;
  const value = g.trim().toUpperCase();
  if (value === "A" || value === "B" || value === "C" || value === "D" || value === "E") return value;
  return null;
}

function gradeFromRawFoodScore(scoreRaw: number): Grade {
  // Food grade mapping used by Nutri-Score (beverages may differ; OFF grade is preferred when available)
  if (scoreRaw <= -1) return "A";
  if (scoreRaw <= 2) return "B";
  if (scoreRaw <= 10) return "C";
  if (scoreRaw <= 18) return "D";
  return "E";
}

function normalizeRawTo100(raw: number) {
  const min = -15;
  const max = 40;
  const normalized = ((raw - min) / (max - min)) * 100;
  return Math.max(0, Math.min(100, Math.round(normalized)));
}

export function assessNutrition(product: OffProduct): NutritionAssessment {
  const nutriments = product.nutriments ?? null;

  const rawCandidates = [
    toNumber(product.nutriscore_score),
    toNumber(nutriments?.["nutrition-score-fr_100g"]),
    toNumber(nutriments?.["nutrition-score-fr"]),
    toNumber(nutriments?.["nutrition-score-uk_100g"]),
    toNumber(nutriments?.["nutrition-score-uk"]),
  ];

  const gradeCandidates = [
    normalizeGrade(product.nutriscore_grade),
    normalizeGrade(product.nutrition_grades),
    normalizeGrade(nutriments?.nutrition_grade_fr),
  ];

  const scoreRaw = rawCandidates.find((v) => v !== null) ?? null;
  const offGrade = gradeCandidates.find((v) => v !== null) ?? null;

  if (scoreRaw === null && offGrade === null) {
    return {
      method: "nutri-score",
      source: "insufficient",
      scoreRaw: null,
      scoreNormalized: null,
      grade: null,
      notes: ["Open Food Facts did not provide Nutri-Score for this product."],
    };
  }

  const grade = offGrade ?? (scoreRaw !== null ? gradeFromRawFoodScore(scoreRaw) : null);

  return {
    method: "nutri-score",
    source: offGrade ? "off" : "calculated",
    scoreRaw,
    scoreNormalized: scoreRaw !== null ? normalizeRawTo100(scoreRaw) : null,
    grade,
    notes: [
      offGrade
        ? "Nutrition score is sourced from Open Food Facts Nutri-Score."
        : "Grade derived from available Nutri-Score value.",
    ],
  };
}
