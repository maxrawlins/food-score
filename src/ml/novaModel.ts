import type { MlFeatures } from "./features";

export type NovaGroup = 1 | 2 | 3 | 4;

export type NovaPrediction = {
  nova: NovaGroup;
  confidence: number; // 0..1
  probs: Record<NovaGroup, number>; // full distribution
  source: "ml";
};

type ModelJson = {
  type: "multiclass_logreg";
  version: string;
  classes: number[]; // [1,2,3,4]
  features: string[];
  medians: Record<string, number>;
  scaler_mean: number[];
  scaler_scale: number[];
  coef: number[][]; // shape (4, n_features)
  intercept: number[]; // shape (4,)
};

let cachedModel: ModelJson | null = null;

export function novaLabel(n: NovaGroup) {
  if (n === 1) return "NOVA 1 · Minimally processed";
  if (n === 2) return "NOVA 2 · Culinary ingredients";
  if (n === 3) return "NOVA 3 · Processed";
  return "NOVA 4 · Ultra-processed";
}

async function loadModel(): Promise<ModelJson> {
  if (cachedModel) return cachedModel;

  const res = await fetch("/ml/nova_model.json", { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to load NOVA model");
  const json = (await res.json()) as ModelJson;

  // Basic sanity checks
  if (!Array.isArray(json.features) || !Array.isArray(json.coef)) {
    throw new Error("Invalid NOVA model format");
  }

  cachedModel = json;
  return json;
}

function softmax(logits: number[]) {
  const m = Math.max(...logits);
  const exps = logits.map((x) => Math.exp(x - m));
  const sum = exps.reduce((a, b) => a + b, 0) || 1;
  return exps.map((e) => e / sum);
}

function dot(a: number[], b: number[]) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

function getFeatureValue(features: MlFeatures, name: string): number | null {
  // Map model feature names to our MlFeatures keys
  const f = features as unknown as Record<string, unknown>;
  const v = f[name];

  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export async function predictNova(features: MlFeatures): Promise<NovaPrediction | null> {
  const model = await loadModel();

  // 1) Build vector in the exact feature order expected by the model
  const x: number[] = model.features.map((name) => {
    const raw = getFeatureValue(features, name);

    // If missing, impute using training median (if we have it)
    if (raw === null || raw === undefined) {
      const med = model.medians?.[name];
      return typeof med === "number" ? med : 0;
    }

    return raw;
  });

  // 2) Standardize using scaler stats from training
  const xs = x.map((v, i) => {
    const mean = model.scaler_mean[i] ?? 0;
    const scale = model.scaler_scale[i] ?? 1;
    const safeScale = scale === 0 ? 1 : scale;
    return (v - mean) / safeScale;
  });

  // 3) Compute logits = W·x + b for each class
  const logits = model.coef.map((wRow, k) => dot(wRow, xs) + (model.intercept[k] ?? 0));

  // 4) Convert to probabilities
  const probsArr = softmax(logits);

  // 5) Pick best class
  let bestIdx = 0;
  for (let i = 1; i < probsArr.length; i++) {
    if (probsArr[i] > probsArr[bestIdx]) bestIdx = i;
  }

  const cls = model.classes[bestIdx] as NovaGroup;
  const confidence = probsArr[bestIdx];

  // Build probs map for UI (always include all groups 1..4)
  const probs: Record<NovaGroup, number> = {
    1: probsArr[model.classes.indexOf(1)] ?? 0,
    2: probsArr[model.classes.indexOf(2)] ?? 0,
    3: probsArr[model.classes.indexOf(3)] ?? 0,
    4: probsArr[model.classes.indexOf(4)] ?? 0,
  };

  return { nova: cls, confidence, probs, source: "ml" };
}