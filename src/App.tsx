import { useEffect, useMemo, useRef, useState } from "react";
import "./App.css";
import Scanner from "./Scanner";
import treeLogo from "./assets/image.png";
import scannerIcon from "./assets/scanner.png";
import { novaLabel } from "./ml/novaModel";
import { useProductLookup } from "./hooks/useProductLookup";

function scoreInfo(score: number | null) {
  if (score === null) return { color: "#9ca3af", label: "No Nutri-Score available", glow: "rgba(255,255,255,0.18)" };
  if (score <= 20) return { color: "#22c55e", label: "Excellent nutrition profile", glow: "rgba(34,197,94,0.30)" };
  if (score <= 40) return { color: "#84cc16", label: "Good nutrition profile", glow: "rgba(132,204,22,0.28)" };
  if (score <= 60) return { color: "#facc15", label: "Mixed nutrition profile", glow: "rgba(250,204,21,0.26)" };
  if (score <= 80) return { color: "#fb923c", label: "Poor nutrition profile", glow: "rgba(251,146,60,0.26)" };
  return { color: "#f87171", label: "Very poor nutrition profile", glow: "rgba(248,113,113,0.26)" };
}

function chip(label: string, value: string) {
  return (
    <div className="fs-chip" key={label}>
      <div className="fs-chipK">{label}</div>
      <div className="fs-chipV">{value}</div>
    </div>
  );
}

function formatNova(nova: { nova: 1 | 2 | 3 | 4; confidence: number }) {
  const raw = novaLabel(nova.nova);
  const parts = raw.split("·").map((s) => s.trim());
  const left = parts[0] ?? `NOVA ${nova.nova}`;
  const right = parts[1] ?? "";
  const pct = Math.round(nova.confidence * 100);

  const m = left.match(/NOVA\s+([1-4])/i);
  const groupNum = (m?.[1] ?? String(nova.nova)) as string;

  return {
    groupNum,
    groupName: right || left,
    confidencePct: pct,
  };
}

function novaTheme(nova: { nova: 1 | 2 | 3 | 4 } | null) {
  if (!nova) return { color: "#9ca3af", glow: "rgba(255,255,255,0.18)" };

  if (nova.nova === 1) return { color: "#22c55e", glow: "rgba(34,197,94,0.30)" };
  if (nova.nova === 2) return { color: "#facc15", glow: "rgba(250,204,21,0.26)" };
  if (nova.nova === 3) return { color: "#fb923c", glow: "rgba(251,146,60,0.26)" };
  return { color: "#f87171", glow: "rgba(248,113,113,0.26)" };
}

export default function App() {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [scanning, setScanning] = useState(false);

  const { barcode, setBarcode, product, nova, productLoading, productError, history, clearHistory, lookup } = useProductLookup();

  useEffect(() => {
    if (productLoading) return;
    if (!product && !productError) return;

    try {
      (document.activeElement as HTMLElement | null)?.blur?.();
      inputRef.current?.blur();
    } catch {
      // ignore focus cleanup failures
    }

    requestAnimationFrame(() => {
      window.scrollTo({ top: 0, left: 0, behavior: "smooth" });
    });
  }, [productLoading, product, productError]);

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
    if (product.scoreRaw != null) list.push(chip("Nutri raw", String(product.scoreRaw)));
    if (product.nutritionSource) list.push(chip("Nutrition source", product.nutritionSource));
    if (product.upstreamSource === "stale-cache") list.push(chip("Data source", "Cached OFF data"));
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
          <div className="fs-brandRow">
            <div className="fs-brandBadge" aria-hidden>
              <img className="fs-brandLogo" src={treeLogo} alt="" />
            </div>
            <h1 className="fs-pageTitle">Food Score</h1>
          </div>
          <p className="fs-pageSubtitle">Scan or type a barcode to inspect processing and Nutri-Score nutrition quality.</p>
        </header>

        <div className="fs-card fs-card-pad">
          <div className="fs-actions">
            <button className="fs-btn" onClick={() => setScanning(true)}>
              <img className="fs-btnIconImage" src={scannerIcon} alt="" aria-hidden />
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

            <button className="fs-btn fs-btnPrimary" onClick={() => lookup()} disabled={productLoading}>
              {productLoading ? "Looking up…" : "Lookup"}
            </button>
          </div>

          {productError && <div className="fs-error">{productError}</div>}
        </div>

        {product && (
          <div className="fs-card fs-card-pad fs-resultCard">
            <div className="fs-resultGrid">
              <div className="fs-resultLeft">
                <div className="fs-novaHero">
                  <div className="fs-novaHeroHead">
                    <div className="fs-novaHeroTitle">Processing level (NOVA, ML)</div>
                    <div className="fs-novaHeroSub">How processed this food is (1 = least, 4 = most)</div>
                  </div>

                  {novaUi ? (
                    <div className="fs-novaHeroRow">
                      <div
                        className="fs-novaBig fs-glow"
                        style={
                          {
                            color: novaMeta.color,
                            "--glow": novaMeta.glow,
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
                    Processing level is classified by our ML model using NOVA groups. Nutrition quality below is based on Nutri-Score values from Open Food Facts.
                  </div>
                </div>

                <div className="fs-healthCard">
                  <div className="fs-healthTitle">Nutrition score (Nutri-Score based)</div>
                  <div className="fs-healthSub">Normalized 0–100 from official Nutri-Score raw value (lower is better)</div>

                  <div className="fs-scoreBlock" style={{ marginTop: 10 }}>
                    <div
                      className="fs-score fs-glow"
                      style={
                        {
                          color: scoreMeta.color,
                          "--glow": scoreMeta.glow,
                        } as React.CSSProperties
                      }
                    >
                      {scoreDisplay ?? "—"}
                    </div>

                    <div className="fs-scoreText">
                      <div className="fs-label">
                        {scoreMeta.label}
                        {product.grade ? ` · Grade ${product.grade}` : ""}
                      </div>
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
                  <div className="fs-footnote">No nutrition details returned.</div>
                )}
              </div>

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

                    <div className="fs-footnote">Data: Open Food Facts · Nutri-Score values come from OFF data when available.</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {history.length > 0 && (
          <div className="fs-card fs-card-pad fs-historyCard">
            <div className="fs-row" style={{ justifyContent: "space-between" }}>
              <h3 className="fs-sectionTitle">Recent scans</h3>
              <button className="fs-btn fs-btnSmall" onClick={clearHistory}>
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
              } catch {
                // vibration is optional
              }

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
