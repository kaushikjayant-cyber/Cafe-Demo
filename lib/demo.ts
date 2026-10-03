// Demo cafe staff accounts. Shown on the demo cafe's login page so prospects can try each
// role, and created by scripts/seed-demo-staff.ts. Only ever used for cafes with is_demo.

export const DEMO_PASSWORD = "brew-demo-2026";

export const DEMO_STAFF = [
  { username: "owner", displayName: "Riya (Owner)", role: "owner" },
  { username: "counter", displayName: "Arjun (Counter)", role: "cashier" },
  { username: "kitchen", displayName: "Kitchen", role: "kitchen" },
] as const;
