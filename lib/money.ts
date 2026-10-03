// All money is integer paise [D-07]. GST rules: IMPLEMENTATION.md §5.6 [D-27].

export type GstMode = "none" | "regular";

export interface BillLineInput {
  unitPricePaise: number;
  optionDeltasPaise?: number[];
  qty: number;
}

export interface BillInput {
  lines: BillLineInput[];
  taxRateBp: number; // basis points: 500 = 5%
  pricesIncludeTax: boolean;
  gstMode: GstMode;
}

export interface Bill {
  lineTotalsPaise: number[];
  subtotalPaise: number; // sum of lines as priced on the menu
  taxablePaise: number;
  taxPaise: number;
  cgstPaise: number;
  sgstPaise: number;
  roundOffPaise: number; // may be negative
  totalPaise: number; // always whole rupees
}

function assertInt(value: number, label: string, min = 0): void {
  if (!Number.isSafeInteger(value) || value < min) {
    throw new RangeError(`${label} must be an integer >= ${min}, got ${value}`);
  }
}

/** a / b rounded half-up, for non-negative integers, without floating point error. */
export function roundDiv(a: number, b: number): number {
  assertInt(a, "numerator");
  assertInt(b, "denominator", 1);
  return Math.floor((2 * a + b) / (2 * b));
}

export function lineTotal({ unitPricePaise, optionDeltasPaise = [], qty }: BillLineInput): number {
  assertInt(unitPricePaise, "unitPricePaise");
  assertInt(qty, "qty", 1);
  const unit = optionDeltasPaise.reduce((sum, delta) => {
    if (!Number.isSafeInteger(delta)) throw new RangeError(`option delta must be an integer, got ${delta}`);
    return sum + delta;
  }, unitPricePaise);
  if (unit < 0) throw new RangeError(`unit price after options is negative: ${unit}`);
  return unit * qty;
}

export function computeBill({ lines, taxRateBp, pricesIncludeTax, gstMode }: BillInput): Bill {
  assertInt(taxRateBp, "taxRateBp");
  const lineTotalsPaise = lines.map(lineTotal);
  const subtotalPaise = lineTotalsPaise.reduce((a, b) => a + b, 0);

  let taxablePaise = subtotalPaise;
  let taxPaise = 0;
  let beforeRounding = subtotalPaise;

  if (gstMode === "regular" && taxRateBp > 0) {
    if (pricesIncludeTax) {
      taxablePaise = roundDiv(subtotalPaise * 10_000, 10_000 + taxRateBp);
      taxPaise = subtotalPaise - taxablePaise;
    } else {
      taxPaise = roundDiv(subtotalPaise * taxRateBp, 10_000);
      beforeRounding = subtotalPaise + taxPaise;
    }
  }

  const cgstPaise = Math.floor(taxPaise / 2);
  const sgstPaise = taxPaise - cgstPaise;
  const totalPaise = roundDiv(beforeRounding, 100) * 100;

  return {
    lineTotalsPaise,
    subtotalPaise,
    taxablePaise,
    taxPaise,
    cgstPaise,
    sgstPaise,
    roundOffPaise: totalPaise - beforeRounding,
    totalPaise,
  };
}

const inrWhole = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
const inrFraction = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2 });

/** ₹1,234 for whole rupees, ₹1,234.50 otherwise. Negative amounts keep their sign. */
export function formatINR(paise: number): string {
  if (!Number.isSafeInteger(paise)) throw new RangeError(`paise must be an integer, got ${paise}`);
  return paise % 100 === 0 ? inrWhole.format(paise / 100) : inrFraction.format(paise / 100);
}
