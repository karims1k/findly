import { ImageResponse } from "next/og";

export const size = { width: 64, height: 64 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #d946ef 0%, #ec4899 50%, #f43f5e 100%)",
          borderRadius: 18,
        }}
      >
        <svg width="46" height="46" viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg">
          <circle cx="16.5" cy="17" r="7" stroke="white" strokeWidth="2.75" fill="none" />
          <line x1="21.5" y1="22" x2="27.5" y2="28" stroke="white" strokeWidth="3" strokeLinecap="round" />
          <path d="M29 7 L30.4 10.6 L34 12 L30.4 13.4 L29 17 L27.6 13.4 L24 12 L27.6 10.6 Z" fill="#fff5b8" />
        </svg>
      </div>
    ),
    { ...size }
  );
}
