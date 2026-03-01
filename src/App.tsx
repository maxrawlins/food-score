import { useEffect, useMemo, useState } from "react";
import "./App.css";
import Scanner from "./Scanner";

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

function scoreInfo(score: number | null) {
  if (score === null) return { color: "#888", label: "Unknown", glow: "rgba(255,255,255,0.2)" };
  if (score <= 25) return { color: "#16a34a", label: "Minimally processed", glow: "rgba(34,197,94,0.35)" };
  if (score <= 50) return { color: "#ca8a04", label: "Moderately processed", glow: "rgba(250,204,21,0.30)" };
  if (score <= 75) return { color: "#ea580c", label: "Processed", glow: "rgba(249,115,22,0.32)" };
  return { color: "#dc2626", label: "Ultra processed", glow: "rgba(239,68,68,0.32)" };
}

function formatFacts(p: Product) {
  const items: Array<{ k: string; v: string }> = [];

  // Avoid duplicates: show additives OR ingredients count if available, both are useful but not repeated elsewhere
  items.push({
    k: "Additives",
    v: String(p.additivesCount),
  });

  if (p.ingredientCount != null) {
    items.push({
      k: "Ingredients",
      v: `~${p.ingredientCount}`,
    });
  }

  if (p.brands) {
    items.push({
      k: "Brand",
      v: p.brands,
    });
  }

  return items;
}

export default function App() {
  const [barcode, setBarcode] = useState("");
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);

  const [history, setHistory] = useState<HistoryItem[]>(() => loadHistory());

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

  const scoreMeta = useMemo(() => scoreInfo(scoreDisplay), [scoreDisplay]);

  const reasons = useMemo(() => {
    if (Array.isArray(product?.reasons) && product.reasons.length > 0) return product.reasons;
    return null;
  }, [product]);

  const facts = useMemo(() => (product ? formatFacts(product) : []), [product]);

  return (
    <div className="fs-wrap">
      {/* ✅ Simple top-left page title */}
      <header className="fs-header">
        <h1 className="fs-pageTitle">Food Score</h1>
        <p className="fs-pageSubtitle">Scan or type a barcode to score processing.</p>
      </header>

      <div className="fs-card fs-card-pad">
        <div className="fs-actions">
          <button className="fs-btn" onClick={() => setScanning(true)}>
            <svg className="fs-icon" viewBox="0 0 24 24" fill="none">
              <path d="M7 3H5a2 2 0 0 0-2 2v2" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              <path d="M17 3h2a2 2 0 0 1 2 2v2" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              <path d="M7 21H5a2 2 0 0 1-2-2v-2" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              <path d="M17 21h2a2 2 0 0 0 2-2v-2" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              <path d="M4 12h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.7"/>
            </svg>
            Scan barcode
          </button>

          <input
            className="fs-input"
            value={barcode}
            onChange={(e) => setBarcode(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") lookup();
            }}
            inputMode="numeric"
            placeholder="Enter barcode (e.g. 737628064502)"
          />

          <button className="fs-btn fs-btnPrimary" onClick={() => lookup()} disabled={loading}>
            {loading ? "Looking up…" : "Lookup"}
          </button>
        </div>

        {error && <div className="fs-error">{error}</div>}
      </div>

      {product && (
        <div className="fs-card fs-card-pad fs-resultCard">
          <div className="fs-resultHeader">
            {/* ✅ Left: score + label */}
            <div className="fs-scoreWrap">
              <div
                className="fs-score fs-glow"
                style={
                  {
                    color: scoreMeta.color,
                    ["--glow" as any]: scoreMeta.glow,
                  } as React.CSSProperties
                }
              >
                {scoreDisplay ?? "—"}
              </div>

              <div className="fs-scoreMeta">
                <div className="fs-label">{scoreMeta.label}</div>
                <div className="fs-conf">{confidenceLabel(product.confidence)} confidence</div>
              </div>
            </div>

            {/* ✅ Right: small facts grid (no duplicates, better placement) */}
            <div className="fs-facts">
              {facts.map((f) => (
                <div key={f.k} className="fs-fact">
                  <div className="fs-factKey">{f.k}</div>
                  <div className="fs-factVal">{f.v}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Reasons */}
          {reasons ? (
            <ul className="fs-reasons">
              {reasons.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          ) : (
            <div className="fs-footnote">No reasons returned.</div>
          )}

          <div className="fs-product">
            <div className="fs-thumb">
              {product.imageUrl ? <img src={product.imageUrl} alt="" /> : null}
            </div>

            <div>
              <div className="fs-prodName">{product.name ?? "Unknown product"}</div>
              <div className="fs-prodMeta">
                {/* ✅ no duplicate "Additives" here now */}
                <div><b>Barcode:</b> {product.barcode}</div>
              </div>

              {product.ingredientsText && (
                <details className="fs-details">
                  <summary>Ingredients</summary>
                  <p>{product.ingredientsText}</p>
                </details>
              )}

              <div className="fs-footnote">
                Data: Open Food Facts · Score is an estimate, not medical advice.
              </div>
            </div>
          </div>
        </div>
      )}

      {history.length > 0 && (
        <div className="fs-card fs-card-pad" style={{ marginTop: 14 }}>
          <div className="fs-row" style={{ justifyContent: "space-between" }}>
            <h3 className="fs-sectionTitle">Recent scans</h3>
            <button
              className="fs-btn"
              style={{ width: "auto", padding: "10px 12px" }}
              onClick={() => setHistory([])}
            >
              Clear
            </button>
          </div>

          <div className="fs-historyList">
            {history.map((h) => (
              <button
                key={h.barcode}
                className="fs-historyItem"
                onClick={() => {
                  setBarcode(h.barcode);
                  lookup(h.barcode);
                }}
              >
                <div className="fs-historyThumb">
                  {h.imageUrl ? <img src={h.imageUrl} alt="" /> : null}
                </div>

                <div style={{ minWidth: 0 }}>
                  <div className="fs-historyName">{h.name ?? "Unknown product"}</div>
                  <div className="fs-historySub">
                    {(h.brands ?? "Unknown brand") + " · " + h.barcode}
                  </div>
                </div>

                <div className="fs-historyScore">{h.score ?? "—"}</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {scanning && (
        <Scanner
          onDetected={(code) => {
            const digitsOnly = code.replace(/\D/g, "");
            if (digitsOnly.length === 0) return;

            try { navigator.vibrate?.(50); } catch {}

            setBarcode(digitsOnly);
            setScanning(false);
            lookup(digitsOnly);
          }}
          onClose={() => setScanning(false)}
        />
      )}
    </div>
  );
}