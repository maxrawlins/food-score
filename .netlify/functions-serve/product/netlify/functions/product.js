var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// netlify/functions/product.ts
var product_exports = {};
__export(product_exports, {
  handler: () => handler
});
module.exports = __toCommonJS(product_exports);
function isLikelyBarcode(s) {
  return /^[0-9]{8,14}$/.test(s);
}
function toNumber(v) {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
}
function estimateIngredientCount(ingredientsText) {
  if (!ingredientsText) return null;
  const parts = ingredientsText.split(/[,;•]/g).map((s) => s.trim()).filter((s) => s.length >= 2);
  return parts.length ? parts.length : null;
}
function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}
function computeNutritionScore(input) {
  const knownFields = (input.sugars_100g !== null ? 1 : 0) + (input.salt_100g !== null ? 1 : 0) + (input.saturated_fat_100g !== null ? 1 : 0) + (input.energy_kcal_100g !== null ? 1 : 0) + (input.fiber_100g !== null ? 1 : 0) + (input.proteins_100g !== null ? 1 : 0);
  const confidence = knownFields >= 5 ? "high" : knownFields >= 3 ? "medium" : "low";
  const norm = (v, a, b) => clamp((v - a) / (b - a), 0, 1);
  const ease = (t) => t * t * (3 - 2 * t);
  const candidates = [];
  const cats = (input.categories ?? []).filter(Boolean);
  const catStr = cats.join(" ");
  const isBeverage = /\ben:beverages\b/.test(catStr);
  const isWater = /\ben:waters\b/.test(catStr) || /\ben:spring-waters\b/.test(catStr) || /\ben:mineral-waters\b/.test(catStr) || /\ben:flavored-waters\b/.test(catStr);
  const isSugaryDrink = /\ben:soft-drinks\b/.test(catStr) || /\ben:colas\b/.test(catStr) || /\ben:sodas\b/.test(catStr) || /\ben:carbonated-drinks\b/.test(catStr) || /\ben:sugar-sweetened-beverages\b/.test(catStr);
  let score = isWater ? 2 : isBeverage ? 8 : 12;
  if (input.sugars_100g !== null) {
    const s = input.sugars_100g;
    let sugarPts = 0;
    if (isBeverage) {
      sugarPts = Math.round(40 * ease(norm(s, 1, 12)));
      if (isSugaryDrink && s >= 6) sugarPts += 5;
      sugarPts = clamp(sugarPts, 0, 45);
    } else {
      sugarPts = Math.round(28 * ease(norm(s, 4, 30)));
    }
    score += sugarPts;
    if (sugarPts > 0) {
      candidates.push({ weight: sugarPts, text: `Higher sugar (${s}g/100g)` });
    }
  } else if (isSugaryDrink) {
    score += 18;
    candidates.push({ weight: 18, text: "Sugary drink category (sugar data missing)" });
  }
  if (input.salt_100g !== null) {
    const s = input.salt_100g;
    const saltPts = Math.round(22 * ease(norm(s, 0.2, 2)));
    score += saltPts;
    if (saltPts > 0) candidates.push({ weight: saltPts, text: `Higher salt (${s}g/100g)` });
  }
  if (input.saturated_fat_100g !== null) {
    const sf = input.saturated_fat_100g;
    const satPts = Math.round(22 * ease(norm(sf, 1, 10)));
    score += satPts;
    if (satPts > 0) candidates.push({ weight: satPts, text: `Higher saturated fat (${sf}g/100g)` });
  }
  if (input.energy_kcal_100g !== null) {
    const e = input.energy_kcal_100g;
    let energyPts = 0;
    if (isBeverage) {
      energyPts = Math.round(10 * ease(norm(e, 10, 80)));
    } else {
      energyPts = Math.round(22 * ease(norm(e, 120, 520)));
    }
    score += energyPts;
    if (energyPts > 0) candidates.push({ weight: energyPts, text: `Higher calories (${e} kcal/100g)` });
  }
  if (input.fiber_100g !== null) {
    const f = input.fiber_100g;
    const fiberBonus = Math.round(18 * ease(norm(f, 1.5, 10)));
    score -= fiberBonus;
    if (fiberBonus >= 5) candidates.push({ weight: fiberBonus, text: `Good fiber (${f}g/100g) lowers score` });
  }
  if (input.proteins_100g !== null) {
    const p = input.proteins_100g;
    const maxBonus = isBeverage ? 6 : 10;
    const proteinBonus = Math.round(maxBonus * ease(norm(p, 4, 20)));
    score -= proteinBonus;
    if (proteinBonus >= 4) candidates.push({ weight: proteinBonus, text: `More protein (${p}g/100g) lowers score` });
  }
  const add = input.additivesCount ?? 0;
  if (add > 0) {
    const addPts = Math.round(10 * ease(norm(add, 0, 8)));
    score += addPts;
    candidates.push({ weight: addPts, text: `Has ${add} additive${add === 1 ? "" : "s"} (small penalty)` });
  }
  if (input.ingredientCount !== null && !isBeverage) {
    const ic = input.ingredientCount;
    const ingPts = Math.round(8 * ease(norm(ic, 6, 25)));
    score += ingPts;
    if (ingPts >= 3) candidates.push({ weight: ingPts, text: `Longer ingredient list (~${ic})` });
  }
  if (isWater) score = Math.min(score, 10);
  score = clamp(Math.round(score), 0, 100);
  const reasons = candidates.sort((a, b) => b.weight - a.weight).filter((c) => c.weight > 0).slice(0, 3).map((c) => c.text);
  if (reasons.length === 0) reasons.push("Limited nutrition data available for this product");
  return { score, confidence, reasons };
}
var handler = async (event) => {
  const barcode = (event.queryStringParameters?.barcode || "").trim();
  if (!isLikelyBarcode(barcode)) {
    return {
      statusCode: 400,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ error: "Invalid barcode. Must be 8\u201314 digits." })
    };
  }
  const url = `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}.json`;
  const res = await fetch(url, {
    headers: { "User-Agent": "FoodScore/1.0 (local dev)" }
  });
  if (!res.ok) {
    return {
      statusCode: 502,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ error: "Failed to reach Open Food Facts." })
    };
  }
  const data = await res.json();
  if (data.status !== 1 || !data.product) {
    return {
      statusCode: 404,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ error: "Product not found in Open Food Facts." })
    };
  }
  const p = data.product;
  const sugars_100g = toNumber(p.nutriments?.sugars_100g);
  const salt_100g = toNumber(p.nutriments?.salt_100g);
  const saturated_fat_100g = toNumber(p.nutriments?.["saturated-fat_100g"]);
  const fiber_100g = toNumber(p.nutriments?.fiber_100g);
  const proteins_100g = toNumber(p.nutriments?.proteins_100g);
  const energy_kcal_100g = toNumber(p.nutriments?.["energy-kcal_100g"]) ?? toNumber(p.nutriments?.["energy-kcal"]) ?? null;
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
    categories
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
      energy_kcal_100g
    },
    // ✅ NEW meaning: nutrition score
    score: scoring.score,
    confidence: scoring.confidence,
    reasons: scoring.reasons,
    model: { type: "nutrition-heuristic-v1", version: "2026-03-01" }
  };
  return {
    statusCode: 200,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store"
    },
    body: JSON.stringify(normalized)
  };
};
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  handler
});
//# sourceMappingURL=product.js.map
