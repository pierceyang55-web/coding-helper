/**
 * Supabase renamed the browser key from "anon" to "publishable" and the
 * server key from "service_role" to "secret". Newer projects only show the
 * new names in the dashboard, older ones only the old — accept either.
 *
 * These reads must stay as literal `process.env.NEXT_PUBLIC_*` expressions so
 * Next.js can inline them into the client bundle at build time.
 */
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;

export const SUPABASE_ANON_KEY = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)!;

/** Server-only. Never import this from a client component. */
export const SUPABASE_SERVICE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SECRET_KEY)!;
