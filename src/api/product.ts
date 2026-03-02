import type { Product } from "../types/product";

async function parseJson<T>(res: Response): Promise<T> {
  let data: (T & { error?: string }) | null = null;
  try {
    data = (await res.json()) as T & { error?: string };
  } catch {
    data = null;
  }

  if (!res.ok) {
    const message = data && typeof data === "object" && "error" in data ? String(data.error) : `Request failed (${res.status})`;
    throw new Error(message);
  }

  if (data === null) throw new Error("Invalid response from product service.");
  return data;
}

export async function fetchProduct(barcodeValue: string): Promise<Product> {
  try {
    const res = await fetch(`/.netlify/functions/product?barcode=${encodeURIComponent(barcodeValue)}`);
    return parseJson<Product>(res);
  } catch (err: unknown) {
    if (err instanceof Error) {
      if (/did not match the expected pattern/i.test(err.message)) {
        throw new Error("Network request failed while looking up this barcode. Please try again.");
      }
      throw err;
    }
    throw new Error("Network request failed while looking up this barcode.");
  }
}
