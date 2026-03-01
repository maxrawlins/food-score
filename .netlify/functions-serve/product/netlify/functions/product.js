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
function computeProcessingScore(input) {
  const knownFields = (input.ingredientCount !== null ? 1 : 0) + (input.sugars_100g !== null ? 1 : 0) + (input.salt_100g !== null ? 1 : 0) + (input.saturated_fat_100g !== null ? 1 : 0) + (input.fiber_100g !== null ? 1 : 0) + (input.proteins_100g !== null ? 1 : 0);
  const confidence = knownFields >= 5 ? "high" : knownFields >= 3 ? "medium" : "low";
  let score = 10;
  score += clamp(input.additivesCount * 6, 0, 40);
  if (input.ingredientCount !== null) {
    if (input.ingredientCount >= 20) score += 20;
    else if (input.ingredientCount >= 12) score += 14;
    else if (input.ingredientCount >= 8) score += 8;
    else if (input.ingredientCount >= 5) score += 4;
  }
  if (input.sugars_100g !== null) {
    if (input.sugars_100g >= 20) score += 18;
    else if (input.sugars_100g >= 12) score += 12;
    else if (input.sugars_100g >= 5) score += 6;
  }
  if (input.salt_100g !== null) {
    if (input.salt_100g >= 1.5) score += 14;
    else if (input.salt_100g >= 0.9) score += 9;
    else if (input.salt_100g >= 0.3) score += 4;
  }
  if (input.saturated_fat_100g !== null) {
    if (input.saturated_fat_100g >= 5) score += 10;
    else if (input.saturated_fat_100g >= 2) score += 6;
    else if (input.saturated_fat_100g >= 1) score += 3;
  }
  if (input.fiber_100g !== null) {
    if (input.fiber_100g >= 6) score -= 10;
    else if (input.fiber_100g >= 3) score -= 6;
    else if (input.fiber_100g >= 1.5) score -= 3;
  }
  if (input.proteins_100g !== null) {
    if (input.proteins_100g >= 10) score -= 4;
    else if (input.proteins_100g >= 6) score -= 2;
  }
  score = clamp(Math.round(score), 0, 100);
  const candidates = [];
  if (input.additivesCount >= 1) {
    candidates.push({
      weight: Math.min(40, input.additivesCount * 6),
      text: `Contains ${input.additivesCount} additive${input.additivesCount === 1 ? "" : "s"}`
    });
  }
  if (input.ingredientCount !== null) {
    const w = input.ingredientCount >= 20 ? 20 : input.ingredientCount >= 12 ? 14 : input.ingredientCount >= 8 ? 8 : input.ingredientCount >= 5 ? 4 : 0;
    candidates.push({ weight: w, text: `Long ingredient list (~${input.ingredientCount})` });
  }
  if (input.sugars_100g !== null && input.sugars_100g >= 5) {
    candidates.push({
      weight: input.sugars_100g >= 20 ? 18 : input.sugars_100g >= 12 ? 12 : 6,
      text: `Higher sugar (${input.sugars_100g}g/100g)`
    });
  }
  if (input.salt_100g !== null && input.salt_100g >= 0.3) {
    candidates.push({
      weight: input.salt_100g >= 1.5 ? 14 : input.salt_100g >= 0.9 ? 9 : 4,
      text: `Higher salt (${input.salt_100g}g/100g)`
    });
  }
  if (input.fiber_100g !== null && input.fiber_100g >= 3) {
    candidates.push({
      weight: 6,
      text: `Decent fiber (${input.fiber_100g}g/100g) lowers score`
    });
  }
  const reasons = candidates.sort((a, b) => b.weight - a.weight).filter((c) => c.weight > 0).slice(0, 3).map((c) => c.text);
  if (reasons.length === 0) reasons.push("Limited data available for this product");
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
  const url = `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(
    barcode
  )}.json`;
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
  const additivesCount = p.additives_tags?.length ?? 0;
  const ingredientsText = p.ingredients_text ?? null;
  const ingredientCount = estimateIngredientCount(ingredientsText);
  const scoring = computeProcessingScore({
    additivesCount,
    ingredientCount,
    sugars_100g,
    salt_100g,
    saturated_fat_100g,
    fiber_100g,
    proteins_100g
  });
  const normalized = {
    barcode,
    name: p.product_name ?? null,
    brands: p.brands ?? null,
    imageUrl: p.image_front_url ?? null,
    ingredientsText,
    additivesCount,
    ingredientCount,
    categories: p.categories_tags?.slice(0, 10) ?? [],
    nutriments: {
      sugars_100g,
      salt_100g,
      saturated_fat_100g,
      fiber_100g,
      proteins_100g
    },
    score: scoring.score,
    confidence: scoring.confidence,
    reasons: scoring.reasons,
    model: { type: "heuristic-v0", version: "2026-03-01" }
  };
  return {
    statusCode: 200,
    headers: {
      "content-type": "application/json",
      // Disable caching in dev so the browser always shows latest changes
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
