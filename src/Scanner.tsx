import { useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";

export default function Scanner({
  onDetected,
  onClose,
}: {
  onDetected: (barcode: string) => void;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const controlsRef = useRef<{ stop: () => void } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // ✅ Prevent iOS Safari scroll getting stuck after closing overlay
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    let cancelled = false;

    async function start() {
      try {
        const reader = new BrowserMultiFormatReader();
        const video = videoRef.current;
        if (!video) return;

        const constraints: MediaStreamConstraints = {
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        };

        const controls = await reader.decodeFromConstraints(
          constraints,
          video,
          (result) => {
            if (cancelled) return;

            if (result) {
              const text = result.getText();
              controls.stop();
              onDetected(text);
            }
          }
        );

        controlsRef.current = controls;
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : null;
        setError(
          message ||
            "Could not access camera. Check permissions or use manual entry."
        );
      }
    }

    start();

    return () => {
      cancelled = true;
      controlsRef.current?.stop();
      document.body.style.overflow = prevOverflow; // ✅ restore
    };
  }, [onDetected]);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background:
          "radial-gradient(900px 650px at -10% -10%, rgba(96,155,102,0.34), transparent 60%), rgba(12,22,16,0.94)",
        display: "grid",
        gridTemplateRows: "auto 1fr auto",
        padding: `calc(14px + env(safe-area-inset-top)) 14px calc(14px + env(safe-area-inset-bottom))`,
        zIndex: 9999,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ color: "#ecf9ef", fontWeight: 900, letterSpacing: "-0.01em", fontSize: "1.05rem" }}>Scan barcode</div>

        <button
          onClick={() => {
            controlsRef.current?.stop();
            onClose();
          }}
          style={{
            borderRadius: 14,
            padding: "10px 12px",
            border: "1px solid rgba(204,230,208,0.52)",
            background: "rgba(60,117,72,0.35)",
            color: "#effbef",
            fontWeight: 900,
            backdropFilter: "blur(2px)",
          }}
        >
          Close
        </button>
      </div>

      <div style={{ display: "grid", placeItems: "center" }}>
        <video
          ref={videoRef}
          style={{
            width: "100%",
            maxWidth: 520,
            borderRadius: 18,
            background: "black",
            border: "1px solid rgba(190,230,194,0.35)",
            boxShadow: "0 12px 30px rgba(0,0,0,0.32)",
          }}
        />
      </div>

      {error && (
        <div style={{ color: "#ffc7c7", fontWeight: 800 }}>
          {error}
        </div>
      )}
    </div>
  );
}
