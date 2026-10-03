import { formatINR } from "@/lib/money";

export interface BillCafe {
  name: string;
  legal_name: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  gstin: string | null;
  fssai_no: string | null;
  gst_mode: "none" | "regular";
  timezone: string;
}

export interface BillOrder {
  daily_no: number;
  invoice_no: string | null;
  paid_at: string | null;
  created_at: string;
  payment_method: string | null;
  payment_status: string;
  guest_name: string | null;
  subtotal_paise: number;
  tax_paise: number;
  cgst_paise: number;
  sgst_paise: number;
  round_off_paise: number;
  total_paise: number;
  tax_rate_bp: number;
  prices_include_tax: boolean;
  gst_mode: "none" | "regular";
  tables: { label: string } | null;
  order_items: {
    id: string;
    name_snapshot: string;
    qty: number;
    unit_price_paise: number;
    line_total_paise: number;
    options_snapshot: { name: string }[];
    status: string;
  }[];
}

const METHOD: Record<string, string> = { online: "Online (UPI / card)", cash: "Cash", upi_counter: "UPI at counter", card_counter: "Card at counter" };

/**
 * A GST-compliant bill [D-27]: "Tax Invoice" with CGST/SGST for a registered cafe, or a
 * "Bill of Supply" with no tax lines for an unregistered/composition cafe [D-10].
 * Uses the snapshots stored on the order, so later price or tax changes never alter it.
 */
export function Bill({ cafe, order }: { cafe: BillCafe; order: BillOrder }) {
  const regular = order.gst_mode === "regular";
  const items = order.order_items.filter((i) => i.status === "active");
  const taxable = order.prices_include_tax ? order.subtotal_paise - order.tax_paise : order.subtotal_paise;
  const halfRate = `${order.tax_rate_bp / 200}%`;
  const when = new Intl.DateTimeFormat("en-IN", { timeZone: cafe.timezone, dateStyle: "medium", timeStyle: "short" }).format(
    new Date(order.paid_at ?? order.created_at),
  );

  return (
    <article className="bill mx-auto w-full max-w-md rounded-2xl bg-white p-6 text-[13px] leading-relaxed text-[#1c1b18] shadow-sm ring-1 ring-[#e7e4dd] print:max-w-none print:rounded-none print:shadow-none print:ring-0">
      <header className="flex flex-col items-center gap-0.5 border-b border-dashed border-[#cfcac0] pb-4 text-center">
        <p className="text-xs font-semibold tracking-[0.2em] uppercase">{regular ? "Tax Invoice" : "Bill of Supply"}</p>
        <h1 className="mt-1 font-heading text-xl font-bold">{cafe.legal_name || cafe.name}</h1>
        {cafe.address && <p className="text-[#686660]">{cafe.address}</p>}
        {cafe.phone && <p className="text-[#686660]">Phone {cafe.phone}</p>}
        {regular && cafe.gstin && <p className="font-mono">GSTIN {cafe.gstin}</p>}
        {cafe.fssai_no && <p className="font-mono text-[#686660]">FSSAI {cafe.fssai_no}</p>}
      </header>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 border-b border-dashed border-[#cfcac0] py-3">
        <dt className="text-[#686660]">Invoice no.</dt>
        <dd className="text-right font-mono">{order.invoice_no ?? "Not yet issued"}</dd>
        <dt className="text-[#686660]">Date</dt>
        <dd className="text-right">{when}</dd>
        <dt className="text-[#686660]">Order</dt>
        <dd className="text-right">
          #{order.daily_no} · {order.tables?.label ?? "Counter"}
        </dd>
        {order.guest_name && (
          <>
            <dt className="text-[#686660]">Guest</dt>
            <dd className="text-right">{order.guest_name}</dd>
          </>
        )}
      </dl>

      <table className="w-full border-b border-dashed border-[#cfcac0]">
        <thead>
          <tr className="text-left text-[#686660]">
            <th className="py-2 font-medium">Item</th>
            <th className="py-2 text-right font-medium">Qty</th>
            <th className="py-2 text-right font-medium">Rate</th>
            <th className="py-2 text-right font-medium">Amount</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id} className="align-top">
              <td className="py-1 pr-2">
                {item.name_snapshot}
                {item.options_snapshot.length > 0 && <span className="block text-xs text-[#686660]">{item.options_snapshot.map((o) => o.name).join(", ")}</span>}
              </td>
              <td className="py-1 text-right tabular-nums">{item.qty}</td>
              <td className="py-1 text-right tabular-nums">{formatINR(item.unit_price_paise)}</td>
              <td className="py-1 text-right tabular-nums">{formatINR(item.line_total_paise)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 py-3 tabular-nums">
        {regular ? (
          <>
            <dt className="text-[#686660]">Taxable value</dt>
            <dd className="text-right">{formatINR(taxable)}</dd>
            <dt className="text-[#686660]">CGST @ {halfRate}{order.prices_include_tax ? " (incl.)" : ""}</dt>
            <dd className="text-right">{formatINR(order.cgst_paise)}</dd>
            <dt className="text-[#686660]">SGST @ {halfRate}{order.prices_include_tax ? " (incl.)" : ""}</dt>
            <dd className="text-right">{formatINR(order.sgst_paise)}</dd>
          </>
        ) : (
          <>
            <dt className="text-[#686660]">Items</dt>
            <dd className="text-right">{formatINR(order.subtotal_paise)}</dd>
          </>
        )}
        {order.round_off_paise !== 0 && (
          <>
            <dt className="text-[#686660]">Round off</dt>
            <dd className="text-right">{formatINR(order.round_off_paise)}</dd>
          </>
        )}
        <dt className="border-t border-[#1c1b18] pt-2 text-base font-bold">Total</dt>
        <dd className="border-t border-[#1c1b18] pt-2 text-right text-base font-bold">{formatINR(order.total_paise)}</dd>
      </dl>

      <footer className="flex flex-col items-center gap-1 border-t border-dashed border-[#cfcac0] pt-3 text-center text-[#686660]">
        <p>
          {order.payment_status === "paid" && order.payment_method
            ? `Paid · ${METHOD[order.payment_method] ?? order.payment_method}`
            : order.payment_status === "refunded"
              ? "Refunded"
              : "Unpaid"}
        </p>
        {!regular && <p className="text-xs">Composition taxable person / not registered under GST. Not eligible to collect tax.</p>}
        <p>Thank you for visiting {cafe.name}!</p>
      </footer>
    </article>
  );
}
