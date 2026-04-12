// api/_lib/admin-auth.js
// Shared helper: verify caller is an admin via Supabase JWT.
// Import into admin-* serverless functions.

import { createClient } from "@supabase/supabase-js";

const ADMIN_EMAILS = new Set([
  "kpjayne1@gmail.com",
  // Add additional admin emails here
]);

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Admin client — bypasses RLS. Server-only, never expose key to client.
export const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// Verify the request comes from an authenticated admin user.
// Returns { ok: true, user } or { ok: false, status, error }.
export async function requireAdmin(req) {
  const authHeader = req.headers?.authorization || req.headers?.Authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) {
    return { ok: false, status: 401, error: "Missing auth token" };
  }
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data?.user) {
    return { ok: false, status: 401, error: "Invalid auth token" };
  }
  const email = (data.user.email || "").toLowerCase();
  if (!ADMIN_EMAILS.has(email)) {
    return { ok: false, status: 403, error: "Not authorized" };
  }
  return { ok: true, user: data.user };
}

// Generate a readable code: 4 letter-blocks separated by dashes.
// Example: RANGE-IQPR-O2K4-XZ7M. 16 alphanumeric chars = ~64 bits entropy.
export function generateCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I
  const blocks = [];
  for (let b = 0; b < 4; b++) {
    let s = "";
    for (let i = 0; i < 4; i++) {
      s += chars[Math.floor(Math.random() * chars.length)];
    }
    blocks.push(s);
  }
  return blocks.join("-");
}
