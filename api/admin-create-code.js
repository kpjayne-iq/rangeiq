// api/admin-create-code.js
// POST { duration_days, notes } → { code }
// Creates a new redemption code. Admin-only.

import { supabaseAdmin, requireAdmin, generateCode } from "./_lib/admin-auth.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const auth = await requireAdmin(req);
  if (!auth.ok) return res.status(auth.status).json({ error: auth.error });

  const { duration_days, notes } = req.body || {};
  const days = Number.isInteger(duration_days) ? duration_days : 365;
  if (days < 1 || days > 3650) {
    return res.status(400).json({ error: "duration_days must be 1-3650" });
  }

  // Generate code with retry on collision (extremely unlikely).
  let code, attempts = 0;
  while (attempts < 5) {
    code = generateCode();
    const { data: existing } = await supabaseAdmin
      .from("redemption_codes")
      .select("code")
      .eq("code", code)
      .maybeSingle();
    if (!existing) break;
    attempts++;
  }

  const { error } = await supabaseAdmin
    .from("redemption_codes")
    .insert({
      code,
      duration_days: days,
      notes: notes || null,
      created_by: auth.user.email,
    });

  if (error) {
    console.error("Insert failed:", error);
    return res.status(500).json({ error: "Failed to create code" });
  }

  return res.status(200).json({ code, duration_days: days });
}
