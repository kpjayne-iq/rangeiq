// api/cron-expire-comps.js
// Runs daily via Vercel cron. Two jobs:
//   1. Flip expired comps back to 'free'
//   2. Email users whose comp expires in ≤7 days (once per comp)
//
// Vercel cron config goes in vercel.json. This endpoint is protected
// by the CRON_SECRET env var — Vercel injects it automatically when
// the cron fires, and we reject any request without it.

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const CRON_SECRET = process.env.CRON_SECRET;
const RESEND_API_KEY = process.env.RESEND_API_KEY; // optional

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

export default async function handler(req, res) {
  // Auth: Vercel cron sends `Authorization: Bearer <CRON_SECRET>`
  const authHeader = req.headers?.authorization || "";
  if (!CRON_SECRET || authHeader !== `Bearer ${CRON_SECRET}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const now = new Date();
  const warnCutoff = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  // ── Job 1: Expire comps that have passed expires_at ──────────────
  const { data: expired, error: expiredErr } = await supabaseAdmin
    .from("profiles")
    .select("id, email")
    .eq("grant_type", "comp")
    .not("expires_at", "is", null)
    .lt("expires_at", now.toISOString());

  let expiredCount = 0;
  if (!expiredErr && expired && expired.length > 0) {
    const ids = expired.map(p => p.id);
    const { error: flipErr } = await supabaseAdmin
      .from("profiles")
      .update({
        grant_type: "none",
        subscription_status: "free",
        expires_at: null,
      })
      .in("id", ids);
    if (!flipErr) expiredCount = expired.length;
    else console.error("Flip-to-free failed:", flipErr);
  }

  // ── Job 2: Send warning emails for comps expiring in ≤7 days ─────
  let warnedCount = 0;
  const { data: warnable, error: warnErr } = await supabaseAdmin
    .from("profiles")
    .select("id, email, expires_at")
    .eq("grant_type", "comp")
    .not("expires_at", "is", null)
    .gte("expires_at", now.toISOString())
    .lt("expires_at", warnCutoff.toISOString())
    .is("expiry_warning_sent_at", null);

  if (!warnErr && warnable && warnable.length > 0 && RESEND_API_KEY) {
    for (const p of warnable) {
      const sent = await sendExpiryWarning(p.email, p.expires_at);
      if (sent) {
        await supabaseAdmin
          .from("profiles")
          .update({ expiry_warning_sent_at: now.toISOString() })
          .eq("id", p.id);
        warnedCount++;
      }
    }
  }

  return res.status(200).json({
    ok: true,
    expired: expiredCount,
    warned: warnedCount,
    timestamp: now.toISOString(),
  });
}

async function sendExpiryWarning(email, expiresAt) {
  if (!email || !RESEND_API_KEY) return false;
  const expiryDate = new Date(expiresAt);
  const daysLeft = Math.max(1, Math.ceil((expiryDate - new Date()) / (24 * 60 * 60 * 1000)));

  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "RangeIQ <noreply@rangeiqpoker.com>",
        to: [email],
        subject: `Your RangeIQ Pro access expires in ${daysLeft} day${daysLeft === 1 ? "" : "s"}`,
        html: `
          <div style="font-family:system-ui,sans-serif;background:#0A0A0A;color:#E5E5E5;padding:40px 20px;">
            <div style="max-width:560px;margin:0 auto;">
              <h1 style="color:#D9B95B;font-weight:800;letter-spacing:0.02em;margin:0 0 24px;">
                Range<span style="color:#fff;">IQ</span>
              </h1>
              <p>Your complimentary RangeIQ Pro access expires in <strong>${daysLeft} day${daysLeft === 1 ? "" : "s"}</strong> — on ${expiryDate.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}.</p>
              <p>If you'd like to keep Pro access, you can subscribe any time at <a href="https://app.rangeiqpoker.com" style="color:#D9B95B;">app.rangeiqpoker.com</a>.</p>
              <p style="margin-top:32px;color:#888;font-size:13px;">Range IQ is the exploit.</p>
            </div>
          </div>
        `,
      }),
    });
    return r.ok;
  } catch (e) {
    console.error("Resend send failed:", e);
    return false;
  }
}
