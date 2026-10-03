/**
 * Printed QR codes must outlive the free hosting URL (R21). A code pointing at localhost, a
 * bare IP or *.onrender.com will break once the cafe moves to its real domain.
 */
export function isTemporaryOrigin(origin: string): boolean {
  const host = new URL(origin).hostname;
  return host === "localhost" || /^\d+\.\d+\.\d+\.\d+$/.test(host) || host.endsWith(".onrender.com") || host.endsWith(".local");
}
