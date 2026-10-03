// Display formats for the owner panel.

/** Indian short form: ₹45,200 · ₹9.11 L · ₹1.24 Cr (whole rupees). */
export function formatINRShort(paise: number): string {
  const rupees = paise / 100;
  const sign = rupees < 0 ? "-" : "";
  const abs = Math.abs(rupees);
  if (abs >= 1e7) return `${sign}₹${(abs / 1e7).toFixed(2).replace(/\.?0+$/, "")} Cr`;
  if (abs >= 1e5) return `${sign}₹${(abs / 1e5).toFixed(2).replace(/\.?0+$/, "")} L`;
  return `${sign}₹${Math.round(abs).toLocaleString("en-IN")}`;
}

/** Signed percentage change, or null when there's nothing to compare with. */
export function percentChange(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}

const dayFormat = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });
const weekdayFormat = new Intl.DateTimeFormat("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

/** "4 Sept" from a YYYY-MM-DD business date (a calendar date, so formatted in UTC). */
export function shortDate(date: string): string {
  return dayFormat.format(new Date(`${date}T00:00:00Z`));
}

export function longDate(date: string): string {
  return weekdayFormat.format(new Date(`${date}T00:00:00Z`));
}

/** What a person types in a price box ("190", "190.5", "₹1,190.50") → paise, or null if it isn't a price. */
export function rupeesToPaise(value: string): number | null {
  const cleaned = value.replace(/[₹,\s]/g, "");
  if (!/^-?\d{1,6}(\.\d{1,2})?$/.test(cleaned)) return null;
  return Math.round(Number(cleaned) * 100);
}

/** Paise → the plain rupee text a price box shows ("190" or "190.50"). */
export function paiseToInput(paise: number): string {
  return paise % 100 === 0 ? String(paise / 100) : (paise / 100).toFixed(2);
}
