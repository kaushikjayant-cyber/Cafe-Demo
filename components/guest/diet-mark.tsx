import type { Diet } from "@/lib/menu-types";

const LABEL: Record<Diet, string> = { veg: "Vegetarian", vegan: "Vegan", egg: "Contains egg", nonveg: "Non-vegetarian" };

/** The Indian food-label mark: a dot in a square for veg, a triangle for non-veg. */
export function DietMark({ diet }: { diet: Diet | null }) {
  if (!diet) return null;
  const color = diet === "nonveg" ? "var(--g-nonveg)" : diet === "egg" ? "var(--g-egg)" : "var(--g-veg)";
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" role="img" aria-label={LABEL[diet]} className="shrink-0">
      <rect x="0.75" y="0.75" width="12.5" height="12.5" rx="2" fill="none" stroke={color} strokeWidth="1.5" />
      {diet === "nonveg" ? <path d="M7 3.5 L10.5 10 H3.5 Z" fill={color} /> : <circle cx="7" cy="7" r="3.2" fill={color} />}
    </svg>
  );
}
