import { ImageResponse } from "next/og";

import { LOGO_MARK_PATH } from "@/components/brand/logo";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

/** iOS home-screen icon: the mark reversed on solid ink, full-bleed (iOS applies its own mask). */
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#111111",
        }}
      >
        <svg width="104" height="104" viewBox="0 0 32 32">
          <path d={LOGO_MARK_PATH} fill="#ffffff" />
        </svg>
      </div>
    ),
    size,
  );
}
