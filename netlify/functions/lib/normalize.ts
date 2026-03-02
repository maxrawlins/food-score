import { assessNutrition, type Grade } from "./nutrition";
import type { OffProduct } from "./offData";

export type NormalizedProduct = {
  barcode: string;
  name: string | null;
  brands: string | null;
  imageUrl: string | null;
  ingredientsText: string | null;
  additivesCount: number;
  ingredientCount: number | null;
  categories: string[];
  nutriments: {
    sugars_100g: number | null;
    carbohydrates_100g?: number | null;
    salt_100g: number | null;
    saturated_fat_100g: number | null;
    fiber_100g: number | null;
    proteins_100g: number | null;
    energy_kcal_100g: number | null;
  };
  score: number | null; // normalized 0..100 from Nutri-Score raw
  scoreRaw: number | null; // official Nutri-Score numeric value
  grade: Grade | null;
  reasons: string[];
  model: { type: "nutri-score"; version: "off-v1" };
  nutritionSource: "off" | "calculated" | "insufficient";
};

export function toNumber(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
}

export function estimateIngredientCount(ingredientsText: string | null): number | null {
  if (!ingredientsText) return null;
  const parts = ingredientsText
    .split(/[,;•]/g)
    .map((s) => s.trim())
    .filter((s) => s.length >= 2);
  return parts.length ? parts.length : null;
}

export function normalizeProduct(barcode: string, p: OffProduct): NormalizedProduct {
  const carbohydrates_100g = toNumber(p.nutriments?.carbohydrates_100g);
  const sugars_100g = toNumber(p.nutriments?.sugars_100g);
  const salt_100g = toNumber(p.nutriments?.salt_100g);
  const saturated_fat_100g = toNumber(p.nutriments?.["saturated-fat_100g"] ?? p.nutriments?.saturated_fat_100g);
  const fiber_100g = toNumber(p.nutriments?.fiber_100g);
  const proteins_100g = toNumber(p.nutriments?.proteins_100g);
  const energy_kcal_100g = toNumber(p.nutriments?.["energy-kcal_100g"]) ?? toNumber(p.nutriments?.["energy-kcal"]) ?? null;

  const additivesCount = p.additives_tags?.length ?? 0;
  const ingredientsText = p.ingredients_text ?? null;
  const ingredientCount = estimateIngredientCount(ingredientsText);
  const categories = p.categories_tags?.slice(0, 50) ?? [];

  const nutrition = assessNutrition(p);

  return {
    barcode,
    name: p.product_name ?? null,
    brands: p.brands ?? null,
    imageUrl: p.image_front_url ?? null,
    ingredientsText,
    additivesCount,
    ingredientCount,
    categories: categories.slice(0, 10),
    nutriments: {
      sugars_100g,
      carbohydrates_100g,
      salt_100g,
      saturated_fat_100g,
      fiber_100g,
      proteins_100g,
      energy_kcal_100g,
    },
    score: nutrition.scoreNormalized,
    scoreRaw: nutrition.scoreRaw,
    grade: nutrition.grade,
    reasons: nutrition.notes,
    model: { type: "nutri-score", version: "off-v1" },
    nutritionSource: nutrition.source,
  };
}
