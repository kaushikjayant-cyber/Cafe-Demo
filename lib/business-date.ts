// Business day and financial year, in the cafe's timezone [D-09, D-18].
// Mirrors public.business_date() and public.fy_code() in the database.

/** "HH:MM" or "HH:MM:SS" → minutes after midnight. */
function minutesOf(time: string): number {
  const match = /^(\d{2}):(\d{2})(?::\d{2})?$/.exec(time);
  if (!match) throw new RangeError(`invalid time: ${time}`);
  const [hours, minutes] = [Number(match[1]), Number(match[2])];
  if (hours > 23 || minutes > 59) throw new RangeError(`invalid time: ${time}`);
  return hours * 60 + minutes;
}

/** Calendar date (YYYY-MM-DD) of an instant in a timezone. */
export function localDate(at: Date, timeZone: string): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(at);
}

/** The cafe's trading day for an instant: before `dayStartsAt` it still counts as yesterday. */
export function businessDate(at: Date, timeZone: string, dayStartsAt = "04:00"): string {
  return localDate(new Date(at.getTime() - minutesOf(dayStartsAt) * 60_000), timeZone);
}

/** Indian financial year code: 2026-10-03 → "2627", 2027-03-31 → "2627", 2027-04-01 → "2728". */
export function fyCode(date: string): string {
  const match = /^(\d{4})-(\d{2})-\d{2}$/.exec(date);
  if (!match) throw new RangeError(`invalid date: ${date}`);
  const year = Number(match[1]);
  const startYear = Number(match[2]) >= 4 ? year : year - 1;
  const yy = (n: number) => String(n % 100).padStart(2, "0");
  return yy(startYear) + yy(startYear + 1);
}
