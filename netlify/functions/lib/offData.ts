import { fetchJsonWithRetry, type UpstreamSource } from "./offClient";

export type OffProduct = {
  code?: string;
  _id?: string;
  product_name?: string;
  brands?: string;
  image_front_url?: string;
  ingredients_text?: string;
  additives_tags?: string[];
  nutriments?: Record<string, number | string | undefined>;
  categories_tags?: string[];
  nutriscore_score?: number | string;
  nutriscore_grade?: string;
  nutrition_grades?: string;
};

type ProductResponse = {
  status?: number;
  product?: OffProduct;
};

export function isLikelyBarcode(s: string) {
  return /^[0-9]{8,14}$/.test(s);
}

export async function fetchOffProductByBarcode(barcode: string): Promise<{ product: OffProduct | null; source: UpstreamSource }> {
  const hosts = [
    "https://world.openfoodfacts.org",
    "https://us.openfoodfacts.org",
    "https://uk.openfoodfacts.org",
  ];

  let lastError: unknown = null;

  for (const host of hosts) {
    const url = `${host}/api/v2/product/${encodeURIComponent(barcode)}.json`;
    try {
      const { data, source } = await fetchJsonWithRetry<ProductResponse>({
        cacheKey: `off:product:${barcode}`,
        url,
        ttlMs: 10 * 60 * 1000,
        staleMs: 20 * 60 * 1000,
        // Keep product lookups comfortably below Netlify's 30s local function timeout.
        timeoutMs: 3000,
        retryDelaysMs: [250],
        maxAttempts: 1,
      });

      if (data.status !== 1 || !data.product) return { product: null, source };
      return { product: data.product, source };
    } catch (err: unknown) {
      lastError = err;
    }
  }

  throw lastError;
}
