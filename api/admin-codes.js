// api/admin-codes.js
// GET  → list codes (all) + active comps
// POST { action: "revoke", code, reason } → revoke unredeemed code
// POST { action: "revoke_comp", user_id, reason } → flip active comp back to free

import { supabaseAdmin, requireAdmin } from "./_lib/admin-auth.js";

export default async function handler(req, res) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return res.status(auth.status).json({ error: auth.error });

  if (req.method === "GET") {
    const { data: codes, error: codesErr } = await supabaseAdmin
      .from("redemption_codes")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);

    const { data: activeComps, error: compsErr } = await supabaseAdmin
      .from("active_comps")
      .select("*");

    if (codesErr || compsErr) {
      return res.status(500).json({ error: "Query failed" });
    }
    return res.status(200).json({ codes: codes || [], active_comps: activeComps || [] });
  }

  if (req.method === "POST") {
    const { action, code, user_id, reason } = req.body || {};

    if (action === "revoke") {
      if (!code) return res.status(400).json({ error: "code required" });
      // Only revoke if not already redeemed
      const { data: existing } = await supabaseAdmin
        .from("redemption_codes")
        .select("code, redeemed_at, revoked_at")
        .eq("code", code)
        .maybeSingle();
      if (!existing) return res.status(404).json({ error: "Code not found" });
      if (existing.redeemed_at) {
        return res.status(400).json({ error: "Code already redeemed. Use revoke_comp instead." });
      }
      if (existing.revoked_at) {
        return res.status(400).json({ error: "Code already revoked" });
      }
      const { error } = await supabaseAdmin
        .from("redemption_codes")
        .update({
          revoked_at: new Date().toISOString(),
          revoked_by: auth.user.email,
          revoked_reason: reason || null,
        })
        .eq("code", code);
      if (error) return res.status(500).json({ error: "Revoke failed" });
      return res.status(200).json({ ok: true });
    }

    if (action === "revoke_comp") {
      if (!user_id) return res.status(400).json({ error: "user_id required" });
      const { error } = await supabaseAdmin
        .from("profiles")
        .update({
          grant_type: "none",
          expires_at: null,
          subscription_status: "free",
          granted_notes: (reason ? `REVOKED: ${reason}` : "REVOKED by admin"),
        })
        .eq("id", user_id);
      if (error) return res.status(500).json({ error: "Revoke comp failed" });
      return res.status(200).json({ ok: true });
    }

    return res.status(400).json({ error: "Unknown action" });
  }

  return res.status(405).json({ error: "Method not allowed" });
}
