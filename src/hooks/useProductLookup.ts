import { useEffect, useRef, useState } from "react";
import { fetchProduct } from "../api/product";
import { productToFeatures } from "../ml/features";
import { predictNova, type NovaPrediction } from "../ml/novaModel";
import type { HistoryItem, Product } from "../types/product";

const HISTORY_KEY = "foodScore.history.v1";
const HISTORY_LIMIT = 20;

function loadHistory(): HistoryItem[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as HistoryItem[]) : [];
  } catch {
    return [];
  }
}

function saveHistory(items: HistoryItem[]) {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(items));
}

export function useProductLookup() {
  const [barcode, setBarcode] = useState("");
  const [product, setProduct] = useState<Product | null>(null);
  const [nova, setNova] = useState<NovaPrediction | null>(null);
  const [productLoading, setProductLoading] = useState(false);
  const [productError, setProductError] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>(() => loadHistory());

  const runIdRef = useRef(0);

  useEffect(() => {
    saveHistory(history);
  }, [history]);

  async function lookup(barcodeOverride?: string) {
    const trimmed = (barcodeOverride ?? barcode).trim();
    if (!trimmed) return;

    const runId = ++runIdRef.current;
    setProductLoading(true);
    setProductError(null);
    setProduct(null);
    setNova(null);

    try {
      const p = await fetchProduct(trimmed);
      if (runIdRef.current !== runId) return;

      setProduct(p);

      const newItem: HistoryItem = {
        barcode: p.barcode,
        name: p.name ?? null,
        brands: p.brands ?? null,
        imageUrl: p.imageUrl ?? null,
        score: typeof p.score === "number" ? p.score : null,
        scannedAt: Date.now(),
      };

      setHistory((prev) => [newItem, ...prev.filter((h) => h.barcode !== newItem.barcode)].slice(0, HISTORY_LIMIT));

      try {
        const features = productToFeatures(p);
        const pred = await predictNova(features);
        if (runIdRef.current !== runId) return;
        setNova(pred);
      } catch {
        if (runIdRef.current !== runId) return;
        setNova(null);
      }
    } catch (err: unknown) {
      if (runIdRef.current !== runId) return;
      const message = err instanceof Error ? err.message : "Something went wrong";
      setProductError(message);
    } finally {
      if (runIdRef.current === runId) setProductLoading(false);
    }
  }

  return {
    barcode,
    setBarcode,
    product,
    nova,
    productLoading,
    productError,
    history,
    clearHistory: () => setHistory([]),
    lookup,
  };
}
