/**
 * Staff sign in with a short username ("eix"). Every storage driver (Appwrite,
 * Redis, local file) keys logins by email, so a username is stored as an
 * internal address on a reserved domain and shown without it. Real email
 * addresses keep working as logins too.
 */

export const USERNAME_DOMAIN = "staff.local";
export const USERNAME_RE = /^[a-z0-9][a-z0-9._-]{1,31}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** "eix" → "eix@staff.local"; a real email is kept; anything else → null. */
export function loginToEmail(login: unknown): string | null {
  if (typeof login !== "string") return null;
  const value = login.trim().toLowerCase();
  if (!value || value.length > 190) return null;
  if (value.includes("@")) return EMAIL_RE.test(value) ? value : null;
  return USERNAME_RE.test(value) ? `${value}@${USERNAME_DOMAIN}` : null;
}

/** What to show for a login: the username, or the email for older accounts. */
export function displayLogin(email: string | null | undefined): string {
  if (!email) return "";
  const suffix = `@${USERNAME_DOMAIN}`;
  return email.endsWith(suffix) ? email.slice(0, -suffix.length) : email;
}
