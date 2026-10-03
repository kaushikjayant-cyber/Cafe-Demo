// Opening hours in the cafe's timezone (R24). Format, per weekday:
//   { "mon": [["08:00", "23:00"]], "fri": [["08:00", "02:00"]], ... }
// A range whose close is earlier than its open runs past midnight. A missing day is closed.
// `null` hours means always open.

export const WEEKDAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
export type Weekday = (typeof WEEKDAYS)[number];
export type OpeningHours = Partial<Record<Weekday, ReadonlyArray<readonly [string, string]>>>;

function toMinutes(time: string): number {
  const match = /^(\d{2}):(\d{2})$/.exec(time);
  if (!match) throw new RangeError(`invalid time: ${time}`);
  return Number(match[1]) * 60 + Number(match[2]);
}

function localParts(at: Date, timeZone: string): { day: number; minutes: number } {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(at);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const day = WEEKDAYS.indexOf(get("weekday").toLowerCase().slice(0, 3) as Weekday);
  return { day, minutes: Number(get("hour")) * 60 + Number(get("minute")) };
}

export function isOpenAt(hours: OpeningHours | null | undefined, at: Date, timeZone: string): boolean {
  if (!hours) return true;
  const { day, minutes } = localParts(at, timeZone);

  for (const [open, close] of hours[WEEKDAYS[day]] ?? []) {
    const [o, c] = [toMinutes(open), toMinutes(close)];
    if (o === c) return true; // open around the clock
    if (o < c ? minutes >= o && minutes < c : minutes >= o) return true;
  }
  // Yesterday's late-night range spilling into today.
  for (const [open, close] of hours[WEEKDAYS[(day + 6) % 7]] ?? []) {
    const [o, c] = [toMinutes(open), toMinutes(close)];
    if (o > c && minutes < c) return true;
  }
  return false;
}
