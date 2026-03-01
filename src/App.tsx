import { useEffect, useMemo, useRef, useState } from "react";
import "./App.css";
import Scanner from "./Scanner";
import { productToFeatures } from "./ml/features";
import { novaLabel, predictNova, type NovaPrediction } from "./ml/novaModel";

type Confidence = "high" | "medium" | "low";

type Product = {
  barcode: string;
  name: string | null;
  brands: string | null;
  imageUrl: string | null;
  ingredientsText: string | null;
  additivesCount: number;

  ingredientCount?: number | null;
  score?: number; // heuristic score (0..100)
  confidence?: Confidence; // heuristic confidence
  reasons?: string[];

  categories?: string[];
  nutriments?: Record<string, unknown> | null;
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
  if (score === null) return { color: "#9ca3af", label: "Unknown", glow: "rgba(255,255,255,0.18)" };
  if (score <= 25) return { color: "#22c55e", label: "Better nutrition profile", glow: "rgba(34,197,94,0.30)" };
  if (score <= 50) return { color: "#facc15", label: "Mixed nutrition profile", glow: "rgba(250,204,21,0.26)" };
  if (score <= 75) return { color: "#fb923c", label: "Less ideal nutrition profile", glow: "rgba(251,146,60,0.26)" };
  return { color: "#f87171", label: "Poor nutrition profile", glow: "rgba(248,113,113,0.26)" };
}

function chip(label: string, value: string) {
  return (
    <div className="fs-chip" key={label}>
      <div className="fs-chipK">{label}</div>
      <div className="fs-chipV">{value}</div>
    </div>
  );
}

function formatNova(nova: NovaPrediction) {
  // novaLabel returns e.g. "NOVA 4 · Ultra-processed"
  const raw = novaLabel(nova.nova);
  const parts = raw.split("·").map((s) => s.trim());
  const left = parts[0] ?? `NOVA ${nova.nova}`;
  const right = parts[1] ?? "";
  const pct = Math.round(nova.confidence * 100);

  // Extract group number for prominent display
  const m = left.match(/NOVA\s+([1-4])/i);
  const groupNum = (m?.[1] ?? String(nova.nova)) as string;

  return {
    groupNum,
    groupName: right || left,
    confidencePct: pct,
  };
}

function novaTheme(nova: NovaPrediction | null) {
  // ✅ green / yellow / orange / red
  // We return both a color and a glow so you can reuse your glow effect.
  if (!nova) return { color: "#9ca3af", glow: "rgba(255,255,255,0.18)" };

  if (nova.nova === 1) return { color: "#22c55e", glow: "rgba(34,197,94,0.30)" }; // green
  if (nova.nova === 2) return { color: "#facc15", glow: "rgba(250,204,21,0.26)" }; // yellow
  if (nova.nova === 3) return { color: "#fb923c", glow: "rgba(251,146,60,0.26)" }; // orange
  return { color: "#f87171", glow: "rgba(248,113,113,0.26)" }; // red
}

export default function App() {
  const [barcode, setBarcode] = useState("");
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);

  const [nova, setNova] = useState<NovaPrediction | null>(null);

  const inputRef = useRef<HTMLInputElement | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>(() => loadHistory());

  useEffect(() => {
    saveHistory(history);
  }, [history]);

  async function fetchProduct(barcodeValue: string) {
    const res = await fetch(`/.netlify/functions/product?barcode=${encodeURIComponent(barcodeValue)}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Unknown error");
    return data as Product;
  }

  function releaseMobileScrollLock() {
    try {
      (document.activeElement as HTMLElement | null)?.blur?.();
      inputRef.current?.blur();
    } catch {}

    requestAnimationFrame(() => {
      window.scrollTo({ top: 0, left: 0, behavior: "smooth" });
    });
  }

  async function lookup(barcodeOverride?: string) {
    const trimmed = (barcodeOverride ?? barcode).trim();
    if (!trimmed) return;

    setLoading(true);
    setError(null);
    setProduct(null);
    setNova(null);

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

      setHistory((prev) => [newItem, ...prev.filter((h) => h.barcode !== newItem.barcode)].slice(0, HISTORY_LIMIT));

      // Predict NOVA for scanned product
      let pred: NovaPrediction | null = null;
      try {
        const features = productToFeatures(p);
        pred = await predictNova(features);
      } catch {
        pred = null;
      }
      setNova(pred);

      releaseMobileScrollLock();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Something went wrong";
      setError(message);
      releaseMobileScrollLock();
    } finally {
      setLoading(false);
    }
  }

  const scoreDisplay = useMemo(() => (typeof product?.score === "number" ? product.score : null), [product]);
  const scoreMeta = useMemo(() => scoreInfo(scoreDisplay), [scoreDisplay]);

  const reasons = useMemo(() => {
    if (Array.isArray(product?.reasons) && product.reasons.length > 0) return product.reasons;
    return null;
  }, [product]);

  const chips = useMemo(() => {
    if (!product) return [];
    const list = [];
    list.push(chip("Additives", String(product.additivesCount)));
    if (product.ingredientCount != null) list.push(chip("Ingredients", `~${product.ingredientCount}`));
    if (product.brands) list.push(chip("Brand", product.brands));
    return list;
  }, [product]);

  const novaUi = useMemo(() => {
    if (!nova) return null;
    return formatNova(nova);
  }, [nova]);

  const novaMeta = useMemo(() => novaTheme(nova), [nova]);

  return (
    <div className="fs-page">
      <div className="fs-wrap">
        <header className="fs-header">
          <h1 className="fs-pageTitle">Food Score</h1>
          <p className="fs-pageSubtitle">Scan or type a barcode to score processing and estimate nutrition profile.</p>
        </header>

        <div className="fs-card fs-card-pad">
          <div className="fs-actions">
            <button className="fs-btn" onClick={() => setScanning(true)}>
              <span className="fs-btnIcon">⌁</span>
              Scan barcode
            </button>

            <input
              ref={inputRef}
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
            <div className="fs-resultGrid">
              {/* LEFT: key metrics */}
              <div className="fs-resultLeft">
                {/* ✅ NOVA FIRST (primary) */}
                <div className="fs-novaHero">
                  <div className="fs-novaHeroHead">
                    <div className="fs-novaHeroTitle">Processing level (NOVA, ML)</div>
                    <div className="fs-novaHeroSub">How processed this food is (1 = least, 4 = most)</div>
                  </div>

                  {novaUi ? (
                    <div className="fs-novaHeroRow">
                      {/* ✅ green/yellow/orange/red + glow */}
                      <div
                        className="fs-novaBig fs-glow"
                        style={
                          {
                            color: novaMeta.color,
                            ["--glow" as any]: novaMeta.glow,
                          } as React.CSSProperties
                        }
                      >
                        {novaUi.groupNum}
                      </div>

                      <div className="fs-novaHeroText">
                        <div className="fs-novaHeroValue">{novaUi.groupName}</div>
                        <div className="fs-novaHeroMeta">Model confidence: {novaUi.confidencePct}%</div>
                      </div>
                    </div>
                  ) : (
                    <div className="fs-novaHeroLoading">Predicting processing level…</div>
                  )}

                  <div className="fs-novaHint">
                    NOVA is about <b>processing</b>, not “healthiness”. An ultra-processed item can still have a low/medium
                    nutrition score depending on sugar/salt/fat, etc.
                  </div>
                </div>

                {/* ✅ heuristic second (nutrition estimate) */}
                <div className="fs-healthCard">
                  <div className="fs-healthTitle">Nutrition estimate (heuristic)</div>
                  <div className="fs-healthSub">0–100 · higher usually means less ideal nutrition profile</div>

                  <div className="fs-scoreBlock" style={{ marginTop: 10 }}>
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

                    <div className="fs-scoreText">
                      <div className="fs-label">{scoreMeta.label}</div>
                      <div className="fs-conf">{confidenceLabel(product.confidence)} confidence</div>
                    </div>
                  </div>

                  <div className="fs-chipRow">{chips}</div>
                </div>

                {reasons ? (
                  <ul className="fs-reasons">
                    {reasons.map((r) => (
                      <li key={r}>{r}</li>
                    ))}
                  </ul>
                ) : (
                  <div className="fs-footnote">No reasons returned.</div>
                )}
              </div>

              {/* RIGHT: product details */}
              <div className="fs-resultRight">
                <div className="fs-product">
                  <div className="fs-thumb">{product.imageUrl ? <img src={product.imageUrl} alt="" /> : null}</div>

                  <div>
                    <div className="fs-prodName">{product.name ?? "Unknown product"}</div>
                    <div className="fs-prodMeta">
                      <div>
                        <b>Barcode:</b> {product.barcode}
                      </div>
                    </div>

                    {product.ingredientsText && (
                      <details className="fs-details">
                        <summary>Ingredients</summary>
                        <p>{product.ingredientsText}</p>
                      </details>
                    )}

                    <div className="fs-footnote">Data: Open Food Facts · Scores are estimates, not medical advice.</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {history.length > 0 && (
          <div className="fs-card fs-card-pad" style={{ marginTop: 14 }}>
            <div className="fs-row" style={{ justifyContent: "space-between" }}>
              <h3 className="fs-sectionTitle">Recent scans</h3>
              <button className="fs-btn fs-btnSmall" onClick={() => setHistory([])}>
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
                  <div className="fs-historyThumb">{h.imageUrl ? <img src={h.imageUrl} alt="" /> : null}</div>

                  <div style={{ minWidth: 0 }}>
                    <div className="fs-historyName">{h.name ?? "Unknown product"}</div>
                    <div className="fs-historySub">{(h.brands ?? "Unknown brand") + " · " + h.barcode}</div>
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

              try {
                navigator.vibrate?.(50);
              } catch {}

              setBarcode(digitsOnly);
              setScanning(false);
              lookup(digitsOnly);
            }}
            onClose={() => setScanning(false)}
          />
        )}
      </div>
    </div>
  );
}