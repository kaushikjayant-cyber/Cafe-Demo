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
