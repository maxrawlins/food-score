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

// netlify/functions/lib/offClient.ts
var OffError = class extends Error {
  code;
  status;
  constructor(code, message, status) {
    super(message);
    this.code = code;
    this.status = status;
  }
};
var USER_AGENT = "FoodScore/1.0 (local dev)";
var cache = /* @__PURE__ */ new Map();
var DEFAULT_TIMEOUT_MS = 7e3;
var BACKOFF_SCHEDULE_MS = [300, 900, 2100];
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
function jitter(ms) {
  return ms + Math.floor(Math.random() * 120);
}
function parseRetryAfter(value) {
  if (!value) return null;
  const asNumber = Number(value);
  if (Number.isFinite(asNumber) && asNumber > 0) return Math.floor(asNumber * 1e3);
  const dateMs = Date.parse(value);
  if (!Number.isFinite(dateMs)) return null;
  const diff = dateMs - Date.now();
  return diff > 0 ? diff : null;
}
function classifyFailure(status, cause) {
  if (status === 429) return new OffError("OFF_RATE_LIMITED", "Open Food Facts rate limited request", status);
  if (typeof status === "number" && status >= 500) {
    return new OffError("OFF_UNAVAILABLE", "Open Food Facts returned server error", status);
  }
  if (cause instanceof DOMException && cause.name === "AbortError" || cause instanceof Error && cause.name === "AbortError") {
    return new OffError("OFF_TIMEOUT", "Open Food Facts request timed out", status);
  }
  if (cause instanceof OffError) return cause;
  return new OffError("OFF_UNAVAILABLE", "Open Food Facts request failed", status);
}
function freshCache(key) {
  const found = cache.get(key);
  if (!found) return null;
  if (Date.now() <= found.expiresAt) return found.data;
  return null;
}
function staleCache(key) {
  const found = cache.get(key);
  if (!found) return null;
  if (Date.now() <= found.staleUntil) return found.data;
  return null;
}
function setCache(key, data, ttlMs, staleMs) {
  const now = Date.now();
  cache.set(key, {
    data,
    expiresAt: now + ttlMs,
    staleUntil: now + ttlMs + staleMs
  });
}
async function fetchJsonWithRetry(input) {
  const hit = freshCache(input.cacheKey);
  if (hit !== null) return { data: hit, source: "live" };
  const timeoutMs = input.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const retryDelaysMs = input.retryDelaysMs ?? BACKOFF_SCHEDULE_MS;
  const maxAttempts = Math.max(1, Math.min(input.maxAttempts ?? retryDelaysMs.length + 1, retryDelaysMs.length + 1));
  const fetcher = input.fetcher ?? fetch;
  let lastError = null;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetcher(input.url, {
        headers: { "User-Agent": USER_AGENT },
        signal: controller.signal
      });
      if (!res.ok) {
        const status = res.status;
        const err = classifyFailure(status, void 0);
        if (status === 429 || status >= 500) {
          lastError = err;
          if (attempt < maxAttempts - 1) {
            const retryAfter = parseRetryAfter(res.headers.get("retry-after"));
            const wait = retryAfter ?? jitter(retryDelaysMs[Math.min(attempt, retryDelaysMs.length - 1)]);
            await sleep(wait);
            continue;
          }
        }
        throw err;
      }
      let data;
      try {
        data = await res.json();
      } catch {
        throw new OffError("OFF_INVALID_RESPONSE", "Open Food Facts response was not valid JSON", res.status);
      }
      setCache(input.cacheKey, data, input.ttlMs, input.staleMs);
      return { data, source: "live" };
    } catch (err) {
      const normalized = classifyFailure(void 0, err);
      lastError = normalized;
      if (attempt < maxAttempts - 1) {
        await sleep(jitter(retryDelaysMs[Math.min(attempt, retryDelaysMs.length - 1)]));
        continue;
      }
    } finally {
      clearTimeout(timer);
    }
  }
  const stale = staleCache(input.cacheKey);
  if (stale !== null) return { data: stale, source: "stale-cache" };
  throw lastError ?? new OffError("OFF_UNAVAILABLE", "Open Food Facts request failed");
}
function offErrorToMessage(err) {
  if (err instanceof OffError) {
    if (err.code === "OFF_RATE_LIMITED") return "Open Food Facts is rate-limiting requests. Retrying shortly.";
    if (err.code === "OFF_TIMEOUT") return "Open Food Facts timed out. Please try again.";
    if (err.code === "OFF_INVALID_RESPONSE") return "Open Food Facts returned invalid data.";
    return "Failed to reach Open Food Facts.";
  }
  return "Failed to reach Open Food Facts.";
}

// netlify/functions/lib/offData.ts
function isLikelyBarcode(s) {
  return /^[0-9]{8,14}$/.test(s);
}
async function fetchOffProductByBarcode(barcode) {
  const hosts = [
    "https://world.openfoodfacts.org",
    "https://us.openfoodfacts.org",
    "https://uk.openfoodfacts.org"
  ];
  let lastError = null;
  for (const host of hosts) {
    const url = `${host}/api/v2/product/${encodeURIComponent(barcode)}.json`;
    try {
      const { data, source } = await fetchJsonWithRetry({
        cacheKey: `off:product:${barcode}`,
        url,
        ttlMs: 10 * 60 * 1e3,
        staleMs: 20 * 60 * 1e3,
        // Keep product lookups comfortably below Netlify's 30s local function timeout.
        timeoutMs: 3e3,
        retryDelaysMs: [250],
        maxAttempts: 1
      });
      if (data.status !== 1 || !data.product) return { product: null, source };
      return { product: data.product, source };
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError;
}

// netlify/functions/lib/nutrition.ts
function toNumber(v) {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
}
function normalizeGrade(g) {
  if (typeof g !== "string") return null;
  const value = g.trim().toUpperCase();
  if (value === "A" || value === "B" || value === "C" || value === "D" || value === "E") return value;
  return null;
}
function gradeFromRawFoodScore(scoreRaw) {
  if (scoreRaw <= -1) return "A";
  if (scoreRaw <= 2) return "B";
  if (scoreRaw <= 10) return "C";
  if (scoreRaw <= 18) return "D";
  return "E";
}
function normalizeRawTo100(raw) {
  const min = -15;
  const max = 40;
  const normalized = (raw - min) / (max - min) * 100;
  return Math.max(0, Math.min(100, Math.round(normalized)));
}
function assessNutrition(product) {
  const nutriments = product.nutriments ?? null;
  const rawCandidates = [
    toNumber(product.nutriscore_score),
    toNumber(nutriments?.["nutrition-score-fr_100g"]),
    toNumber(nutriments?.["nutrition-score-fr"]),
    toNumber(nutriments?.["nutrition-score-uk_100g"]),
    toNumber(nutriments?.["nutrition-score-uk"])
  ];
  const gradeCandidates = [
    normalizeGrade(product.nutriscore_grade),
    normalizeGrade(product.nutrition_grades),
    normalizeGrade(nutriments?.nutrition_grade_fr)
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
      notes: ["Open Food Facts did not provide Nutri-Score for this product."]
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
      offGrade ? "Nutrition score is sourced from Open Food Facts Nutri-Score." : "Grade derived from available Nutri-Score value."
    ]
  };
}

// netlify/functions/lib/normalize.ts
function toNumber2(v) {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
}
function estimateIngredientCount(ingredientsText) {
  if (!ingredientsText) return null;
  const parts = ingredientsText.split(/[,;•]/g).map((s) => s.trim()).filter((s) => s.length >= 2);
  return parts.length ? parts.length : null;
}
function normalizeProduct(barcode, p) {
  const carbohydrates_100g = toNumber2(p.nutriments?.carbohydrates_100g);
  const sugars_100g = toNumber2(p.nutriments?.sugars_100g);
  const salt_100g = toNumber2(p.nutriments?.salt_100g);
  const saturated_fat_100g = toNumber2(p.nutriments?.["saturated-fat_100g"] ?? p.nutriments?.saturated_fat_100g);
  const fiber_100g = toNumber2(p.nutriments?.fiber_100g);
  const proteins_100g = toNumber2(p.nutriments?.proteins_100g);
  const energy_kcal_100g = toNumber2(p.nutriments?.["energy-kcal_100g"]) ?? toNumber2(p.nutriments?.["energy-kcal"]) ?? null;
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
      energy_kcal_100g
    },
    score: nutrition.scoreNormalized,
    scoreRaw: nutrition.scoreRaw,
    grade: nutrition.grade,
    reasons: nutrition.notes,
    model: { type: "nutri-score", version: "off-v1" },
    nutritionSource: nutrition.source
  };
}

// netlify/functions/product.ts
var handler = async (event) => {
  const barcode = (event.queryStringParameters?.barcode || "").trim();
  if (!isLikelyBarcode(barcode)) {
    return {
      statusCode: 400,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ error: "Invalid barcode. Must be 8\u201314 digits." })
    };
  }
  try {
    const { product, source } = await fetchOffProductByBarcode(barcode);
    if (!product) {
      return {
        statusCode: 404,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ error: "Product not found in Open Food Facts." })
      };
    }
    const normalized = normalizeProduct(barcode, product);
    return {
      statusCode: 200,
      headers: {
        "content-type": "application/json",
        "cache-control": "no-store"
      },
      body: JSON.stringify({ ...normalized, upstreamSource: source })
    };
  } catch (err) {
    return {
      statusCode: 502,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ error: offErrorToMessage(err) })
    };
  }
};
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  handler
});
//# sourceMappingURL=product.js.map
