// Staff sign in with a username; Supabase Auth needs an email, so each username maps to a
// synthetic address on a domain we control [D-36]. Owners sign in with their real email.

export const USERNAME_PATTERN = /^[a-z0-9._-]{3,32}$/;

export function staffEmailDomain(): string {
  return process.env.STAFF_EMAIL_DOMAIN || "staff.example.com";
}

/** "counter" at cafe "demo" → "counter.demo@staff.example.com". */
export function staffEmail(slug: string, username: string, domain = staffEmailDomain()): string {
  return `${username.toLowerCase()}.${slug}@${domain}`;
}

/** What the login box accepts: a real email (owners) or a username (staff). */
export function loginEmail(slug: string, identifier: string, domain = staffEmailDomain()): string | null {
  const value = identifier.trim().toLowerCase();
  if (value.includes("@")) return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? value : null;
  return USERNAME_PATTERN.test(value) ? staffEmail(slug, value, domain) : null;
}
