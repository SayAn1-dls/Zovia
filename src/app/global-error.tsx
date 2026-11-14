"use client";

import { useEffect } from "react";

/**
 * Last-resort boundary: replaces the root layout, so it cannot rely on
 * globals.css, fonts or providers. Styles are inline and self-contained.
 */
export default function GlobalError({ error, retry }: { error: unknown; retry: () => void }) {
  const digest =
    error instanceof Error && "digest" in error && typeof error.digest === "string"
      ? error.digest
      : null;

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="en-IN">
      <body
        style={{
          margin: 0,
          minHeight: "100dvh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "24px",
          background: "#111111",
          color: "#ffffff",
          fontFamily: "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif",
          textAlign: "center",
        }}
      >
        <title>Something went wrong · Zovia</title>
        <main style={{ maxWidth: 440 }}>
          <p style={{ margin: 0, fontSize: 24, fontWeight: 800, letterSpacing: "-0.06em" }}>zovia</p>
          <h1 style={{ margin: "24px 0 0", fontSize: 32, lineHeight: 1.1, letterSpacing: "-0.03em" }}>
            Something went wrong
          </h1>
          <p style={{ margin: "16px 0 0", fontSize: 17, lineHeight: 1.55, color: "#b9b6ae" }}>
            Zovia could not load. Please try again in a moment.
          </p>
          {digest ? (
            <p style={{ margin: "12px 0 0", fontSize: 12, fontFamily: "ui-monospace, monospace", color: "#b9b6ae" }}>
              Reference: {digest}
            </p>
          ) : null}
          <button
            type="button"
            onClick={() => retry()}
            style={{
              marginTop: 28,
              height: 52,
              padding: "0 28px",
              border: 0,
              borderRadius: 999,
              background: "#c8f04a",
              color: "#111111",
              fontSize: 16,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
