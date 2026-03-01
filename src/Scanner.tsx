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

              // Stop camera immediately
              controls.stop();

              onDetected(text);
            }
          }
        );

        controlsRef.current = controls;
      } catch (e: any) {
        setError(
          e?.message ||
            "Could not access camera. Check permissions or use manual entry."
        );
      }
    }

    start();

    return () => {
      cancelled = true;
      controlsRef.current?.stop();
    };
  }, [onDetected]);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.9)",
        display: "grid",
        gridTemplateRows: "auto 1fr auto",
        padding: 14,
        zIndex: 9999,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <div style={{ color: "white", fontWeight: 800 }}>
          Scan barcode
        </div>

        <button
          onClick={() => {
            controlsRef.current?.stop();
            onClose();
          }}
          style={{
            borderRadius: 12,
            padding: "10px 12px",
            border: "1px solid rgba(255,255,255,0.3)",
            background: "transparent",
            color: "white",
            fontWeight: 800,
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
          }}
        />
      </div>

      {error && (
        <div style={{ color: "#ffb4b4", fontWeight: 700 }}>
          {error}
        </div>
      )}
    </div>
  );
}