import "server-only";

import { headers } from "next/headers";
import QRCode from "qrcode";

export { isTemporaryOrigin } from "./qr-origin";

/** The address guests' QR codes point to: this request's own origin. */
export async function siteOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  return `${proto}://${host}`;
}

export function tableUrl(origin: string, token: string): string {
  return `${origin}/t/${token}`;
}

/** Crisp SVG for print. Medium error correction survives a coffee stain or a scratched laminate. */
export function qrSvg(url: string): Promise<string> {
  return QRCode.toString(url, { type: "svg", errorCorrectionLevel: "M", margin: 1, color: { dark: "#111111", light: "#ffffff" } });
}

/** The dark modules of a QR code as one SVG path (one unit per module), for large decorative use. */
export function qrModulesPath(text: string): { size: number; path: string } {
  const { modules } = QRCode.create(text, { errorCorrectionLevel: "M" });
  let path = "";
  for (let row = 0; row < modules.size; row++) {
    for (let col = 0; col < modules.size; col++) {
      if (modules.get(row, col)) path += `M${col} ${row}h1v1h-1z`;
    }
  }
  return { size: modules.size, path };
}
