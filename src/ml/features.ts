export type MlFeatures = {
  additivesCount: number;
  ingredientCount: number | null;
  sugars_100g: number | null;
  salt_100g: number | null;
  saturated_fat_100g: number | null;
  fiber_100g: number | null;
  proteins_100g: number | null;
  // simple text flags (we’ll use these in training later)
  has_emulsifier: number;
  has_sweetener: number;
  has_flavoring: number;
  has_palm_oil: number;
  has_syrup: number;
  has_modified_starch: number;
};

function toNum(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
}

function flag(text: string | null | undefined, re: RegExp) {
  if (!text) return 0;
  return re.test(text.toLowerCase()) ? 1 : 0;
}

export function productToFeatures(product: {
  additivesCount: number;
  ingredientCount?: number | null;
  ingredientsText?: string | null;
  nutriments?: Record<string, unknown> | null;
}): MlFeatures {
  const ingredientsText = product.ingredientsText ?? null;
  const nutr = product.nutriments ?? null;

  return {
    additivesCount: product.additivesCount ?? 0,
    ingredientCount: product.ingredientCount ?? null,
    sugars_100g: toNum(nutr?.["sugars_100g"]),
    salt_100g: toNum(nutr?.["salt_100g"]),
    saturated_fat_100g: toNum(nutr?.["saturated_fat_100g"] ?? nutr?.["saturated-fat_100g"]),
    fiber_100g: toNum(nutr?.["fiber_100g"]),
    proteins_100g: toNum(nutr?.["proteins_100g"]),

    has_emulsifier: flag(ingredientsText, /\bemulsif|lecithin|mono-?glycer|di-?glycer\b/i),
    has_sweetener: flag(ingredientsText, /\baspartame|sucralose|acesulfame|stevia|saccharin\b/i),
    has_flavoring: flag(ingredientsText, /\bflavour|flavor|aroma\b/i),
    has_palm_oil: flag(ingredientsText, /\bpalm\b/i),
    has_syrup: flag(ingredientsText, /\bsyrup|glucose|fructose\b/i),
    has_modified_starch: flag(ingredientsText, /\bmodified starch\b/i),
  };
}