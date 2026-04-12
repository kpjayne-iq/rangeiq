// api/redeem-code.js
// POST { code } with Authorization: Bearer <user-jwt>
// Redeems a code for the authenticated user. Handles all edge cases.

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Verify caller is authenticated (any user, not just admin).
  const authHeader = req.headers?.authorization || req.headers?.Authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Sign in required" });

  const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(token);
  if (userErr || !userData?.user) {
    return res.status(401).json({ error: "Invalid session" });
  }
  const user = userData.user;

  const { code } = req.body || {};
  if (!code || typeof code !== "string") {
    return res.status(400).json({ error: "Code required" });
  }
  const normalized = code.trim().toUpperCase();

  // Fetch the code
  const { data: codeRow, error: codeErr } = await supabaseAdmin
    .from("redemption_codes")
    .select("*")
    .eq("code", normalized)
    .maybeSingle();

  if (codeErr) {
    console.error("Code fetch error:", codeErr);
    return res.status(500).json({ error: "Lookup failed" });
  }
  if (!codeRow) {
    return res.status(404).json({ error: "invalid_code", message: "Code not found" });
  }
  if (codeRow.revoked_at) {
    return res.status(410).json({ error: "revoked_code", message: "This code has been revoked" });
  }
  if (codeRow.redeemed_at) {
    // Already redeemed. If redeemed by THIS user, tell them. Otherwise, it's taken.
    if (codeRow.redeemed_by_user_id === user.id) {
      return res.status(409).json({ error: "already_redeemed_by_you", message: "You've already redeemed this code" });
    }
    return res.status(409).json({ error: "already_redeemed", message: "This code has already been used" });
  }

  // Fetch current profile
  const { data: profile, error: profileErr } = await supabaseAdmin
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  if (profileErr) {
    console.error("Profile fetch error:", profileErr);
    return res.status(500).json({ error: "Profile lookup failed" });
  }
  if (!profile) {
    return res.status(500).json({ error: "Profile not found — contact support" });
  }

  // If user is already Pro via paid subscription, block redemption (don't waste the code).
  if (profile.grant_type === "paid" && profile.subscription_status !== "free") {
    return res.status(409).json({
      error: "already_paid",
      message: "You already have a paid Pro subscription. Save this code or share it.",
    });
  }

  // If user already has an active comp, block (don't stack).
  if (profile.grant_type === "comp" && profile.expires_at && new Date(profile.expires_at) > new Date()) {
    return res.status(409).json({
      error: "already_comp",
      message: "You already have an active comp. This code can be used by another account.",
    });
  }

  // All clear. Grant the comp.
  const now = new Date();
  const expiresAt = new Date(now.getTime() + codeRow.duration_days * 24 * 60 * 60 * 1000);

  const { error: updateErr } = await supabaseAdmin
    .from("profiles")
    .update({
      grant_type: "comp",
      subscription_status: "pro",
      expires_at: expiresAt.toISOString(),
      granted_notes: codeRow.notes || null,
      granted_by: codeRow.created_by,
      granted_at: now.toISOString(),
      expiry_warning_sent_at: null,
    })
    .eq("id", user.id);

  if (updateErr) {
    console.error("Profile update error:", updateErr);
    return res.status(500).json({ error: "Grant failed" });
  }

  // Mark code as redeemed
  const { error: codeUpdateErr } = await supabaseAdmin
    .from("redemption_codes")
    .update({
      redeemed_by_user_id: user.id,
      redeemed_by_email: user.email,
      redeemed_at: now.toISOString(),
    })
    .eq("code", normalized);

  if (codeUpdateErr) {
    // Profile is already granted — log but don't fail the user
    console.error("Code mark-redeemed failed (profile already granted):", codeUpdateErr);
  }

  return res.status(200).json({
    ok: true,
    expires_at: expiresAt.toISOString(),
    duration_days: codeRow.duration_days,
  });
}
