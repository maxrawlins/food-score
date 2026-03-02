import type { Handler } from "@netlify/functions";
import { fetchOffProductByBarcode, isLikelyBarcode } from "./lib/offData";
import { normalizeProduct } from "./lib/normalize";
import { offErrorToMessage } from "./lib/offClient";

export const handler: Handler = async (event) => {
  const barcode = (event.queryStringParameters?.barcode || "").trim();

  if (!isLikelyBarcode(barcode)) {
    return {
      statusCode: 400,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ error: "Invalid barcode. Must be 8–14 digits." }),
    };
  }

  try {
    const { product, source } = await fetchOffProductByBarcode(barcode);

    if (!product) {
      return {
        statusCode: 404,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ error: "Product not found in Open Food Facts." }),
      };
    }

    const normalized = normalizeProduct(barcode, product);

    return {
      statusCode: 200,
      headers: {
        "content-type": "application/json",
        "cache-control": "no-store",
      },
      body: JSON.stringify({ ...normalized, upstreamSource: source }),
    };
  } catch (err: unknown) {
    return {
      statusCode: 502,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ error: offErrorToMessage(err) }),
    };
  }
};
