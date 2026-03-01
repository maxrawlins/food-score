import { useEffect, useMemo, useState } from "react";
import "./App.css";

type Confidence = "high" | "medium" | "low";

type Product = {
  barcode: string;
  name: string | null;
  brands: string | null;
  imageUrl: string | null;
  ingredientsText: string | null;
  additivesCount: number;

  ingredientCount?: number | null;
  score?: number;
  confidence?: Confidence;
  reasons?: string[];
};

type HistoryItem = {
  barcode: string;
  name: string | null;
  brands: string | null;
  imageUrl: string | null;
  score: number | null;
  confidence: Confidence | null;
  scannedAt: number;
};

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

function confidenceLabel(c: Confidence | null | undefined) {
  if (c === "high") return "HIGH";
  if (c === "medium") return "MED";
  if (c === "low") return "LOW";
  return "—";
}

export default function App() {
  const [barcode, setBarcode] = useState("");
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load history once on first render
  const [history, setHistory] = useState<HistoryItem[]>(() => loadHistory());

  // Persist history whenever it changes
  useEffect(() => {
    saveHistory(history);
  }, [history]);

  async function fetchProduct(barcodeValue: string) {
    const res = await fetch(
      `/.netlify/functions/product?barcode=${encodeURIComponent(barcodeValue)}`
    );
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Unknown error");
    return data as Product;
  }

  async function lookup(barcodeOverride?: string) {
    const trimmed = (barcodeOverride ?? barcode).trim();
    if (!trimmed) return;

    setLoading(true);
    setError(null);
    setProduct(null);

    try {
      const p = await fetchProduct(trimmed);
      setProduct(p);

      const newItem: HistoryItem = {
        barcode: p.barcode,
        name: p.name ?? null,
        brands: p.brands ?? null,
        imageUrl: p.imageUrl ?? null,
        score: typeof p.score === "number" ? p.score : null,
        confidence: p.confidence ?? null,
        scannedAt: Date.now(),
      };

      // Functional update avoids stale history bugs
      setHistory((prev) => {
        const next = [newItem, ...prev.filter((h) => h.barcode !== newItem.barcode)].slice(
          0,
          HISTORY_LIMIT
        );
        return next;
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Something went wrong";
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  const scoreDisplay = useMemo(() => {
    if (typeof product?.score === "number") return product.score;
    return null;
  }, [product]);

  const reasons = useMemo(() => {
    if (Array.isArray(product?.reasons) && product.reasons.length > 0) return product.reasons;
    return null;
  }, [product]);

  return (
    <div style={{ maxWidth: 520, margin: "0 auto", padding: 16 }}>
      <header style={{ marginBottom: 12 }}>
        <h1 style={{ fontSize: 22, margin: 0 }}>Food Score</h1>
        <p style={{ margin: "6px 0 0", opacity: 0.75 }}>
          Enter a barcode to get a processing score (camera scan next).
        </p>
      </header>

      <div style={{ display: "grid", gap: 10 }}>
        <input
          value={barcode}
          onChange={(e) => setBarcode(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") lookup();
          }}
          inputMode="numeric"
          placeholder="Enter barcode (e.g. 737628064502)"
          style={{
            width: "100%",
            padding: 14,
            fontSize: 18,
            borderRadius: 12,
            border: "1px solid #ccc",
          }}
        />

        <button
          onClick={() => lookup()}
          disabled={loading}
          style={{
            width: "100%",
            padding: 16,
            fontSize: 18,
            borderRadius: 12,
            border: "none",
            background: loading ? "#333" : "#111",
            color: "white",
            opacity: loading ? 0.8 : 1,
          }}
        >
          {loading ? "Looking up…" : "Lookup"}
        </button>
      </div>

      {error && <p style={{ color: "red", marginTop: 12 }}>{error}</p>}

      {product && (
        <div
          style={{
            marginTop: 18,
            padding: 16,
            borderRadius: 16,
            border: "1px solid #ddd",
          }}
        >
          {/* Score header */}
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              justifyContent: "space-between",
              gap: 12,
              marginBottom: 10,
            }}
          >
            <div style={{ fontSize: 42, fontWeight: 900, lineHeight: 1 }}>
              {scoreDisplay ?? "—"}
            </div>

            <div style={{ textAlign: "right" }}>
              <div style={{ fontWeight: 700 }}>Processing Score</div>
              <div style={{ opacity: 0.75, fontWeight: 700 }}>
                {confidenceLabel(product.confidence)} confidence
              </div>
            </div>
          </div>

          {/* Reasons */}
          {reasons ? (
            <ul style={{ margin: "8px 0 14px", paddingLeft: 18 }}>
              {reasons.map((r) => (
                <li key={r} style={{ marginBottom: 6 }}>
                  {r}
                </li>
              ))}
            </ul>
          ) : (
            <p style={{ margin: "8px 0 14px", opacity: 0.7 }}>
              No reasons returned.
            </p>
          )}

          {/* Product */}
          {product.imageUrl && (
            <img
              src={product.imageUrl}
              alt=""
              style={{ width: "100%", borderRadius: 12, marginBottom: 10 }}
            />
          )}

          <h2 style={{ margin: "8px 0 6px" }}>
            {product.name ?? "Unknown product"}
          </h2>

          <p style={{ margin: "6px 0" }}>
            <b>Brand:</b> {product.brands ?? "Unknown"}
          </p>

          <p style={{ margin: "6px 0" }}>
            <b>Additives:</b> {product.additivesCount}
            {product.ingredientCount != null ? (
              <>
                {" "}
                · <b>Ingredients:</b> ~{product.ingredientCount}
              </>
            ) : null}
          </p>

          {product.ingredientsText && (
            <details style={{ marginTop: 10 }}>
              <summary style={{ fontWeight: 700, cursor: "pointer" }}>
                Ingredients
              </summary>
              <p style={{ fontSize: 14, lineHeight: 1.5, marginTop: 8 }}>
                {product.ingredientsText}
              </p>
            </details>
          )}

          <p style={{ marginTop: 14, fontSize: 12, opacity: 0.7, lineHeight: 1.4 }}>
            Data: Open Food Facts · Score is an estimate, not medical advice.
          </p>
        </div>
      )}

      {/* History */}
      {history.length > 0 && (
        <div
          style={{
            marginTop: 16,
            padding: 16,
            borderRadius: 16,
            border: "1px solid #ddd",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
            <h3 style={{ margin: 0 }}>Recent scans</h3>
            <button
              onClick={() => setHistory([])}
              style={{
                border: "1px solid rgba(0,0,0,0.2)",
                background: "transparent",
                borderRadius: 10,
                padding: "8px 10px",
                fontWeight: 700,
              }}
            >
              Clear
            </button>
          </div>

          <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
            {history.map((h) => (
              <button
                key={h.barcode}
                onClick={() => {
                  setBarcode(h.barcode);
                  lookup(h.barcode);
                }}
                style={{
                  display: "grid",
                  gridTemplateColumns: "52px 1fr auto",
                  alignItems: "center",
                  gap: 10,
                  textAlign: "left",
                  border: "1px solid rgba(0,0,0,0.15)",
                  background: "transparent",
                  borderRadius: 14,
                  padding: 10,
                }}
              >
                <div
                  style={{
                    width: 52,
                    height: 52,
                    borderRadius: 12,
                    overflow: "hidden",
                    background: "rgba(0,0,0,0.06)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontWeight: 800,
                    opacity: 0.8,
                  }}
                >
                  {h.imageUrl ? (
                    <img
                      src={h.imageUrl}
                      alt=""
                      style={{ width: "100%", height: "100%", objectFit: "cover" }}
                    />
                  ) : (
                    "—"
                  )}
                </div>

                <div style={{ minWidth: 0 }}>
                  <div
                    style={{
                      fontWeight: 800,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {h.name ?? "Unknown product"}
                  </div>
                  <div style={{ opacity: 0.7, fontSize: 13 }}>
                    {h.brands ?? "Unknown brand"} · {h.barcode}
                  </div>
                </div>

                <div style={{ textAlign: "right", fontWeight: 900, fontSize: 18 }}>
                  {h.score ?? "—"}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}