import { readFile } from "node:fs/promises";

export type NovaGroup = 1 | 2 | 3 | 4;

export type NovaPrediction = {
  nova: NovaGroup;
  confidence: number;
  probs: Record<NovaGroup, number>;
  source: "ml";
};

type ModelJson = {
  classes: number[];
  features: string[];
  medians: Record<string, number>;
  scaler_mean: number[];
  scaler_scale: number[];
  coef: number[][];
  intercept: number[];
};

let modelCache: ModelJson | null = null;

function softmax(logits: number[]) {
  const m = Math.max(...logits);
  const exps = logits.map((x) => Math.exp(x - m));
  const sum = exps.reduce((a, b) => a + b, 0) || 1;
  return exps.map((e) => e / sum);
}

function dot(a: number[], b: number[]) {
  let s = 0;
  for (let i = 0; i < a.length; i += 1) s += a[i] * b[i];
  return s;
}

async function loadModel(): Promise<ModelJson> {
  if (modelCache) return modelCache;
  const url = new URL("../../../public/ml/nova_model.json", import.meta.url);
  const raw = await readFile(url, "utf-8");
  const parsed = JSON.parse(raw) as ModelJson;
  modelCache = parsed;
  return parsed;
}

function ingredientTextFlag(text: string | null | undefined, re: RegExp) {
  if (!text) return 0;
  return re.test(text.toLowerCase()) ? 1 : 0;
}

export async function predictNovaForProduct(product: {
  additivesCount: number;
  ingredientCount: number | null;
  ingredientsText: string | null;
  nutriments: Record<string, unknown> | null;
}): Promise<NovaPrediction | null> {
  const model = await loadModel();
  const nutr = product.nutriments ?? null;

  const featureMap: Record<string, number | null> = {
    additivesCount: product.additivesCount ?? 0,
    ingredientCount: product.ingredientCount ?? null,
    sugars_100g: typeof nutr?.sugars_100g === "number" ? nutr.sugars_100g : Number(nutr?.sugars_100g ?? NaN),
    salt_100g: typeof nutr?.salt_100g === "number" ? nutr.salt_100g : Number(nutr?.salt_100g ?? NaN),
    saturated_fat_100g:
      typeof nutr?.saturated_fat_100g === "number" ? nutr.saturated_fat_100g : Number(nutr?.saturated_fat_100g ?? NaN),
    fiber_100g: typeof nutr?.fiber_100g === "number" ? nutr.fiber_100g : Number(nutr?.fiber_100g ?? NaN),
    proteins_100g: typeof nutr?.proteins_100g === "number" ? nutr.proteins_100g : Number(nutr?.proteins_100g ?? NaN),
    has_emulsifier: ingredientTextFlag(product.ingredientsText, /\bemulsif|lecithin|mono-?glycer|di-?glycer\b/i),
    has_sweetener: ingredientTextFlag(product.ingredientsText, /\baspartame|sucralose|acesulfame|stevia|saccharin\b/i),
    has_flavoring: ingredientTextFlag(product.ingredientsText, /\bflavour|flavor|aroma\b/i),
    has_palm_oil: ingredientTextFlag(product.ingredientsText, /\bpalm\b/i),
    has_syrup: ingredientTextFlag(product.ingredientsText, /\bsyrup|glucose|fructose\b/i),
    has_modified_starch: ingredientTextFlag(product.ingredientsText, /\bmodified starch\b/i),
  };

  const x: number[] = model.features.map((name) => {
    const value = featureMap[name];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    const med = model.medians?.[name];
    return typeof med === "number" ? med : 0;
  });

  const xs = x.map((v, i) => {
    const mean = model.scaler_mean[i] ?? 0;
    const scale = model.scaler_scale[i] ?? 1;
    return (v - mean) / (scale === 0 ? 1 : scale);
  });

  const logits = model.coef.map((row, k) => dot(row, xs) + (model.intercept[k] ?? 0));
  const probsArr = softmax(logits);

  let bestIdx = 0;
  for (let i = 1; i < probsArr.length; i += 1) {
    if (probsArr[i] > probsArr[bestIdx]) bestIdx = i;
  }

  const cls = model.classes[bestIdx] as NovaGroup;

  return {
    nova: cls,
    confidence: probsArr[bestIdx],
    probs: {
      1: probsArr[model.classes.indexOf(1)] ?? 0,
      2: probsArr[model.classes.indexOf(2)] ?? 0,
      3: probsArr[model.classes.indexOf(3)] ?? 0,
      4: probsArr[model.classes.indexOf(4)] ?? 0,
    },
    source: "ml",
  };
}
