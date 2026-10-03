// Per-cafe policy pages [D-34]. Razorpay's website check for merchant activation looks for
// Contact, Terms, Privacy, Refund/Cancellation and Delivery policies on the cafe's site.
// Plain-language templates filled with the cafe's details. Each cafe should have them
// reviewed before relying on them; the wording here is a sensible default, not legal advice.

export const LEGAL_PAGES = ["terms", "privacy", "refunds", "delivery", "contact"] as const;
export type LegalPage = (typeof LEGAL_PAGES)[number];

export const LEGAL_TITLES: Record<LegalPage, string> = {
  terms: "Terms of service",
  privacy: "Privacy policy",
  refunds: "Refunds & cancellations",
  delivery: "Service & delivery",
  contact: "Contact us",
};

export interface LegalCafe {
  name: string;
  legal_name: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  gstin: string | null;
}

export interface LegalSection {
  heading?: string;
  paragraphs: string[];
}

export function isLegalPage(value: string): value is LegalPage {
  return (LEGAL_PAGES as readonly string[]).includes(value);
}

/** The city for "courts at …": the last part of the address before the PIN code. */
function cityOf(address: string | null): string {
  if (!address) return "the city where the cafe operates";
  const parts = address.replace(/\d{6}\s*$/, "").split(",").map((p) => p.trim()).filter(Boolean);
  return parts.at(-1) ?? "the city where the cafe operates";
}

export function legalContent(page: LegalPage, cafe: LegalCafe): LegalSection[] {
  const business = cafe.legal_name || cafe.name;
  const contact = [cafe.phone && `phone ${cafe.phone}`, cafe.email && `email ${cafe.email}`].filter(Boolean).join(" or ") || "the counter";

  switch (page) {
    case "terms":
      return [
        { paragraphs: [`These terms apply when you order from ${cafe.name}, operated by ${business}, using the QR menu at our tables.`] },
        {
          heading: "Ordering",
          paragraphs: [
            "Your order is a request to buy the items shown. It is confirmed when the cafe accepts it. We may decline an order, for example if an item has run out, and you will see this on your order page.",
            "Prices are in Indian Rupees and include applicable GST unless the menu says otherwise. The bill shows the tax breakdown.",
            "Menu items, prices and availability can change. The price you see when you place the order is the price you pay.",
          ],
        },
        {
          heading: "Payment",
          paragraphs: [
            "You can pay online when you order, or at the counter if the cafe allows it. Online payments are processed by our payment partner, Razorpay, under its own terms.",
            "An order chosen for online payment is sent to the kitchen only once the payment is confirmed. Unpaid online orders are released after 15 minutes.",
          ],
        },
        {
          heading: "Using the service",
          paragraphs: [
            "Please order only for your own table. Orders placed to cause trouble may be cancelled, and repeated misuse may be blocked.",
            "Tell staff about allergies before ordering. Notes added to an order are passed to the kitchen, but we can't guarantee any item is free from allergens.",
          ],
        },
        {
          heading: "Liability and law",
          paragraphs: [
            `Our responsibility for any order is limited to the amount paid for it, except where the law does not allow such a limit.`,
            `These terms are governed by the laws of India. Disputes are subject to the courts at ${cityOf(cafe.address)}.`,
          ],
        },
      ];

    case "privacy":
      return [
        { paragraphs: [`This policy explains what ${business} collects when you order through our QR menu, and why. We follow the Digital Personal Data Protection Act, 2023.`] },
        {
          heading: "What we collect",
          paragraphs: [
            "Your order: the items, notes, table and time. The first name you choose to give, if any, so we can call you.",
            "A random session identifier stored on your phone, so you can track your own order. We don't ask for your phone number, email or an account to order.",
            "Your rating and comments, if you leave a review.",
            "Payment details are entered on Razorpay's secure page. We never see or store your card number, UPI PIN or bank details; we only receive the payment status and a reference number.",
          ],
        },
        {
          heading: "How we use it",
          paragraphs: [
            "To prepare and serve your order, issue your bill, handle refunds, keep the GST records the law requires, and improve our menu and service.",
            "We don't sell your data or use it for advertising.",
          ],
        },
        {
          heading: "Who handles it",
          paragraphs: [
            "Our ordering software provider hosts the service for us and processes data only on our instructions. Razorpay processes online payments.",
            "Bills and order records are kept for as long as tax law requires. Session identifiers are deleted after 30 days without use.",
          ],
        },
        { heading: "Your rights", paragraphs: [`You can ask us what we hold about you, ask us to correct or delete it where the law allows, or raise a concern. Contact us by ${contact}.`] },
      ];

    case "refunds":
      return [
        {
          heading: "Cancelling an order",
          paragraphs: [
            "You can cancel an order yourself from your order page until the cafe accepts it. After that, please speak to a member of staff.",
            "An online order that isn't paid within 15 minutes is cancelled automatically, and nothing is charged.",
          ],
        },
        {
          heading: "Refunds for online payments",
          paragraphs: [
            "If we cancel or decline an order you have paid for online (for example because an item has run out), we refund the full amount.",
            "If you were charged twice for the same order, we refund the extra payment.",
            "Refunds go back to the original payment method. Banks usually take 5 to 7 working days to show the money in your account.",
          ],
        },
        {
          heading: "Food and service issues",
          paragraphs: [
            "If something is wrong with your food or drink, tell us before you leave and we'll replace it or adjust your bill.",
            "Once an order has been served and eaten, refunds are at the cafe's discretion.",
          ],
        },
        { heading: "Questions", paragraphs: [`Contact us by ${contact}, with your order number from the bill.`] },
      ];

    case "delivery":
      return [
        {
          heading: "Dine-in service",
          paragraphs: [
            `${cafe.name} serves food and drinks at your table. Orders placed through the QR menu are prepared in our kitchen and brought to the table the QR code is on.`,
            "Most orders are ready in 10 to 30 minutes, depending on the items and how busy we are. Your order page shows each step live.",
          ],
        },
        {
          heading: "Counter and takeaway",
          paragraphs: ["Orders placed at the counter are served at your table or handed over at the counter when ready."],
        },
        { heading: "No shipping", paragraphs: ["We don't ship or courier any products. All orders are served or collected at the cafe."] },
      ];

    case "contact":
      return [
        {
          paragraphs: [
            business,
            ...(cafe.address ? [cafe.address] : []),
            ...(cafe.phone ? [`Phone: ${cafe.phone}`] : []),
            ...(cafe.email ? [`Email: ${cafe.email}`] : []),
            ...(cafe.gstin ? [`GSTIN: ${cafe.gstin}`] : []),
          ],
        },
        { paragraphs: ["For questions about an order, a payment or a refund, please have your order number or bill ready."] },
      ];
  }
}
