export type Grade = "A" | "B" | "C" | "D" | "E";

export type Product = {
  barcode: string;
  name: string | null;
  brands: string | null;
  imageUrl: string | null;
  ingredientsText: string | null;
  additivesCount: number;
  ingredientCount?: number | null;
  score?: number | null; // normalized 0..100 from Nutri-Score raw
  scoreRaw?: number | null; // official Nutri-Score raw value
  grade?: Grade | null;
  reasons?: string[];
  categories?: string[];
  nutriments?: Record<string, unknown> | null;
  upstreamSource?: "live" | "stale-cache";
  nutritionSource?: "off" | "calculated" | "insufficient";
};

export type HistoryItem = {
  barcode: string;
  name: string | null;
  brands: string | null;
  imageUrl: string | null;
  score: number | null;
  scannedAt: number;
};
