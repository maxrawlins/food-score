import type { Handler } from "@netlify/functions";

type OffResponse = {
  status: number;
  product?: {
    product_name?: string;
    brands?: string;
    image_front_url?: string;
    ingredients_text?: string;
    additives_tags?: string[];
    nutriments?: Record<string, number | string | undefined>;
    categories_tags?: string[];
  };
};

function isLikelyBarcode(s: string) {
  return /^[0-9]{8,14}$/.test(s);
}

function toNumber(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
}

function estimateIngredientCount(ingredientsText: string | null): number | null {
  if (!ingredientsText) return null;
  const parts = ingredientsText
    .split(/[,;•]/g)
    .map((s) => s.trim())
    .filter((s) => s.length >= 2);
  return parts.length ? parts.length : null;
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

type ScoreResult = {
  score: number; // 0..100 (higher = worse nutrition profile)
  confidence: "high" | "medium" | "low";
  reasons: string[];
};

/**
 * Nutrition Heuristic v1 (2026-03-01)
 *
 * What this is:
 * - A rough "nutrition profile" estimate (NOT medical advice)
 * - Primary signals: sugar, salt, saturated fat, energy density
 * - Helpful signals: fiber, protein
 * - Secondary signals: additives + ingredient count (small impact)
 *
 * Scale:
 * - 0 = better nutrition profile
 * - 100 = worse nutrition profile
 *
 * Notes:
 * - Beverages scored differently (sugar matters more per 100g = 100ml)
 * - This is NOT NOVA. NOVA remains your processing classifier.
 */
function computeNutritionScore(input: {
  additivesCount: number;
  ingredientCount: number | null;

  sugars_100g: number | null;
  salt_100g: number | null;
  saturated_fat_100g: number | null;
  fiber_100g: number | null;
  proteins_100g: number | null;
  energy_kcal_100g: number | null;

  categories?: string[] | null;
}): ScoreResult {
  // Confidence = how many key nutrition fields we have
  const knownFields =
    (input.sugars_100g !== null ? 1 : 0) +
    (input.salt_100g !== null ? 1 : 0) +
    (input.saturated_fat_100g !== null ? 1 : 0) +
    (input.energy_kcal_100g !== null ? 1 : 0) +
    (input.fiber_100g !== null ? 1 : 0) +
    (input.proteins_100g !== null ? 1 : 0);

  const confidence: ScoreResult["confidence"] =
    knownFields >= 5 ? "high" : knownFields >= 3 ? "medium" : "low";

  // Helpers
  const norm = (v: number, a: number, b: number) => clamp((v - a) / (b - a), 0, 1);
  const ease = (t: number) => t * t * (3 - 2 * t); // smoothstep

  const candidates: Array<{ weight: number; text: string }> = [];

  // Category detection (for beverage scoring)
  const cats = (input.categories ?? []).filter(Boolean);
  const catStr = cats.join(" ");
  const isBeverage = /\ben:beverages\b/.test(catStr);
  const isWater =
    /\ben:waters\b/.test(catStr) ||
    /\ben:spring-waters\b/.test(catStr) ||
    /\ben:mineral-waters\b/.test(catStr) ||
    /\ben:flavored-waters\b/.test(catStr);

  const isSugaryDrink =
    /\ben:soft-drinks\b/.test(catStr) ||
    /\ben:colas\b/.test(catStr) ||
    /\ben:sodas\b/.test(catStr) ||
    /\ben:carbonated-drinks\b/.test(catStr) ||
    /\ben:sugar-sweetened-beverages\b/.test(catStr);

  // Start baseline:
  // - water starts very low
  // - beverages slightly lower baseline because kcal often low but sugar still matters
  // - general foods moderate baseline
  let score = isWater ? 2 : isBeverage ? 8 : 12;

  // ---- NEGATIVE: sugar ----
  // Beverages: sugar is a bigger deal per 100g(ml)
  if (input.sugars_100g !== null) {
    const s = input.sugars_100g;
    let sugarPts = 0;

    if (isBeverage) {
      // 0..40 points, starts ~1g/100g, saturates ~12g/100g (cola ~10.6 gets big hit)
      sugarPts = Math.round(40 * ease(norm(s, 1, 12)));
      if (isSugaryDrink && s >= 6) sugarPts += 5; // extra nudge for classic sugary soda category
      sugarPts = clamp(sugarPts, 0, 45);
    } else {
      // Foods: 0..28 points, starts ~4g/100g, saturates ~30g/100g
      sugarPts = Math.round(28 * ease(norm(s, 4, 30)));
    }

    score += sugarPts;

    if (sugarPts > 0) {
      candidates.push({ weight: sugarPts, text: `Higher sugar (${s}g/100g)` });
    }
  } else if (isSugaryDrink) {
    // Missing sugar on a sugary drink should still be penalized a bit
    score += 18;
    candidates.push({ weight: 18, text: "Sugary drink category (sugar data missing)" });
  }

  // ---- NEGATIVE: salt ----
  if (input.salt_100g !== null) {
    const s = input.salt_100g;
    // 0..22 points, starts 0.2g, saturates 2.0g
    const saltPts = Math.round(22 * ease(norm(s, 0.2, 2.0)));
    score += saltPts;
    if (saltPts > 0) candidates.push({ weight: saltPts, text: `Higher salt (${s}g/100g)` });
  }

  // ---- NEGATIVE: saturated fat ----
  if (input.saturated_fat_100g !== null) {
    const sf = input.saturated_fat_100g;
    // 0..22 points, starts 1g, saturates 10g
    const satPts = Math.round(22 * ease(norm(sf, 1, 10)));
    score += satPts;
    if (satPts > 0) candidates.push({ weight: satPts, text: `Higher saturated fat (${sf}g/100g)` });
  }

  // ---- NEGATIVE: energy density (kcal/100g) ----
  // Great general nutrition signal for foods; for beverages, less important.
  if (input.energy_kcal_100g !== null) {
    const e = input.energy_kcal_100g;

    let energyPts = 0;
    if (isBeverage) {
      // 0..10 points, starts 10 kcal, saturates 80 kcal (many sodas ~42 => some penalty)
      energyPts = Math.round(10 * ease(norm(e, 10, 80)));
    } else {
      // 0..22 points, starts 120 kcal, saturates 520 kcal
      energyPts = Math.round(22 * ease(norm(e, 120, 520)));
    }

    score += energyPts;
    if (energyPts > 0) candidates.push({ weight: energyPts, text: `Higher calories (${e} kcal/100g)` });
  }

  // ---- POSITIVE: fiber ----
  if (input.fiber_100g !== null) {
    const f = input.fiber_100g;
    // subtract 0..18 points, starts ~1.5g, saturates ~10g
    const fiberBonus = Math.round(18 * ease(norm(f, 1.5, 10)));
    score -= fiberBonus;
    if (fiberBonus >= 5) candidates.push({ weight: fiberBonus, text: `Good fiber (${f}g/100g) lowers score` });
  }

  // ---- POSITIVE: protein ----
  // Keep modest so protein-heavy processed foods don't look "great".
  if (input.proteins_100g !== null) {
    const p = input.proteins_100g;

    // Beverages: protein rarely meaningful; cap effect
    const maxBonus = isBeverage ? 6 : 10;

    // subtract 0..maxBonus points, starts ~4g, saturates ~20g
    const proteinBonus = Math.round(maxBonus * ease(norm(p, 4, 20)));
    score -= proteinBonus;
    if (proteinBonus >= 4) candidates.push({ weight: proteinBonus, text: `More protein (${p}g/100g) lowers score` });
  }

  // ---- Secondary: additives + ingredient count (small) ----
  // These are *processing-ish* but can correlate with poorer nutrition; keep low weight.
  const add = input.additivesCount ?? 0;
  if (add > 0) {
    const addPts = Math.round(10 * ease(norm(add, 0, 8))); // 0..10
    score += addPts;
    candidates.push({ weight: addPts, text: `Has ${add} additive${add === 1 ? "" : "s"} (small penalty)` });
  }

  if (input.ingredientCount !== null && !isBeverage) {
    const ic = input.ingredientCount;
    const ingPts = Math.round(8 * ease(norm(ic, 6, 25))); // 0..8
    score += ingPts;
    if (ingPts >= 3) candidates.push({ weight: ingPts, text: `Longer ingredient list (~${ic})` });
  }

  // Water sanity: force very low unless something is clearly odd
  if (isWater) score = Math.min(score, 10);

  // Final clamp
  score = clamp(Math.round(score), 0, 100);

  // Top 3 reasons (largest absolute contributions)
  const reasons = candidates
    .sort((a, b) => b.weight - a.weight)
    .filter((c) => c.weight > 0)
    .slice(0, 3)
    .map((c) => c.text);

  if (reasons.length === 0) reasons.push("Limited nutrition data available for this product");

  return { score, confidence, reasons };
}

export const handler: Handler = async (event) => {
  const barcode = (event.queryStringParameters?.barcode || "").trim();

  if (!isLikelyBarcode(barcode)) {
    return {
      statusCode: 400,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ error: "Invalid barcode. Must be 8–14 digits." }),
    };
  }

  const url = `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}.json`;

  const res = await fetch(url, {
    headers: { "User-Agent": "FoodScore/1.0 (local dev)" },
  });

  if (!res.ok) {
    return {
      statusCode: 502,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ error: "Failed to reach Open Food Facts." }),
    };
  }

  const data = (await res.json()) as OffResponse;

  if (data.status !== 1 || !data.product) {
    return {
      statusCode: 404,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ error: "Product not found in Open Food Facts." }),
    };
  }

  const p = data.product;

  const sugars_100g = toNumber(p.nutriments?.sugars_100g);
  const salt_100g = toNumber(p.nutriments?.salt_100g);
  const saturated_fat_100g = toNumber(p.nutriments?.["saturated-fat_100g"]);
  const fiber_100g = toNumber(p.nutriments?.fiber_100g);
  const proteins_100g = toNumber(p.nutriments?.proteins_100g);

  // Calories: OFF may provide energy-kcal_100g; fallback if only kJ exists is omitted here to keep it simple.
  const energy_kcal_100g =
    toNumber(p.nutriments?.["energy-kcal_100g"]) ??
    toNumber(p.nutriments?.["energy-kcal"]) ??
    null;

  const additivesCount = p.additives_tags?.length ?? 0;
  const ingredientsText = p.ingredients_text ?? null;
  const ingredientCount = estimateIngredientCount(ingredientsText);

  const categories = p.categories_tags?.slice(0, 50) ?? [];

  const scoring = computeNutritionScore({
    additivesCount,
    ingredientCount,
    sugars_100g,
    salt_100g,
    saturated_fat_100g,
    fiber_100g,
    proteins_100g,
    energy_kcal_100g,
    categories,
  });

  const normalized = {
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
      salt_100g,
      saturated_fat_100g,
      fiber_100g,
      proteins_100g,
      energy_kcal_100g,
    },
    // ✅ NEW meaning: nutrition score
    score: scoring.score,
    confidence: scoring.confidence,
    reasons: scoring.reasons,
    model: { type: "nutrition-heuristic-v1", version: "2026-03-01" },
  };

  return {
    statusCode: 200,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
    },
    body: JSON.stringify(normalized),
  };
};