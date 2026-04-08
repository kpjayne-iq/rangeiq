// /api/paddle-webhook.js
// RangeIQ — Paddle Billing webhook handler
// Receives Paddle notifications and updates Supabase profiles.subscription_status
//
// Required environment variables (set in Vercel → Settings → Environment Variables):
//   SUPABASE_URL                  - https://ergcjqowgdxpneohlvam.supabase.co
//   SUPABASE_SERVICE_ROLE_KEY     - service_role JWT (NEVER expose to frontend)
//   PADDLE_WEBHOOK_SECRET         - signing secret from Paddle notification destination
//
// Handles these Paddle events:
//   subscription.activated   -> mark user as 'pro'
//   subscription.updated     -> sync plan + period end
//   subscription.canceled    -> mark user as 'canceled'
//   subscription.past_due    -> mark user as 'past_due'
//   transaction.completed    -> safety net (also marks 'pro')

import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";

// ---------- Supabase client (service role - bypasses RLS) ----------
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

// ---------- Paddle signature verification ----------
// Paddle sends a header `paddle-signature` formatted as:
//   ts=1234567890;h1=<hex-hmac-sha256>
// The HMAC is computed over `${ts}:${rawBody}` using the webhook secret.
function verifyPaddleSignature(rawBody, signatureHeader, secret) {
  if (!signatureHeader || !secret) return false;
  try {
    const parts = Object.fromEntries(
      signatureHeader.split(";").map((p) => p.split("="))
    );
    const ts = parts.ts;
    const h1 = parts.h1;
    if (!ts || !h1) return false;

    const signedPayload = `${ts}:${rawBody}`;
    const expected = crypto
      .createHmac("sha256", secret)
      .update(signedPayload)
      .digest("hex");

    // Constant-time compare
    const a = Buffer.from(expected, "hex");
    const b = Buffer.from(h1, "hex");
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch (err) {
    console.error("[paddle-webhook] signature parse error:", err.message);
    return false;
  }
}

// ---------- Read raw body (Vercel Node functions) ----------
// We need the raw bytes for signature verification — JSON.parse loses whitespace.
async function readRawBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

// ---------- Helper: extract supabase_user_id from event ----------
// Paddle exposes customData on both subscription and transaction objects.
function extractUserId(eventData) {
  return (
    eventData?.custom_data?.supabase_user_id ||
    eventData?.customData?.supabase_user_id ||
    null
  );
}

// ---------- Helper: derive plan label from price ID ----------
const PRICE_ID_MONTHLY = "pri_01knm7tyxmchp9e4t8ekfgwtk1";
const PRICE_ID_ANNUAL  = "pri_01knm7wcc97mtwzv3vpndhfjf1";
function planFromPriceId(priceId) {
  if (priceId === PRICE_ID_MONTHLY) return "monthly";
  if (priceId === PRICE_ID_ANNUAL) return "annual";
  return null;
}

// ---------- Main handler ----------
export default async function handler(req, res) {
  // Only POST allowed
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Disable Vercel's automatic body parsing — we need the raw string
  // (config export below also enforces this)
  let rawBody;
  try {
    rawBody = await readRawBody(req);
  } catch (err) {
    console.error("[paddle-webhook] failed to read body:", err.message);
    return res.status(400).json({ error: "Failed to read request body" });
  }

  // Verify signature
  const sigHeader = req.headers["paddle-signature"];
  const secret = process.env.PADDLE_WEBHOOK_SECRET;
  if (!verifyPaddleSignature(rawBody, sigHeader, secret)) {
    console.warn("[paddle-webhook] invalid signature — rejecting");
    return res.status(401).json({ error: "Invalid signature" });
  }

  // Parse the event
  let event;
  try {
    event = JSON.parse(rawBody);
  } catch (err) {
    console.error("[paddle-webhook] invalid JSON:", err.message);
    return res.status(400).json({ error: "Invalid JSON" });
  }

  const eventType = event?.event_type;
  const data = event?.data || {};
  console.log(`[paddle-webhook] received: ${eventType}`);

  // Extract Supabase user_id from customData
  const userId = extractUserId(data);
  if (!userId) {
    console.warn(
      `[paddle-webhook] no supabase_user_id in customData for ${eventType} — acknowledging without DB write`
    );
    // Return 200 so Paddle does not retry forever. Log for manual review.
    return res.status(200).json({ received: true, note: "no user_id" });
  }

  // Pull common fields
  const paddleCustomerId = data?.customer_id || null;
  const paddleSubscriptionId = data?.id || data?.subscription_id || null;
  const currentPeriodEnd =
    data?.current_billing_period?.ends_at ||
    data?.next_billed_at ||
    null;
  const firstItem = Array.isArray(data?.items) ? data.items[0] : null;
  const priceId = firstItem?.price?.id || firstItem?.price_id || null;
  const plan = planFromPriceId(priceId);

  // Decide what to write based on event type
  let updates = { updated_at: new Date().toISOString() };

  switch (eventType) {
    case "subscription.activated":
    case "subscription.created":
    case "transaction.completed":
      updates.subscription_status = "pro";
      if (plan) updates.subscription_plan = plan;
      if (paddleCustomerId) updates.paddle_customer_id = paddleCustomerId;
      if (paddleSubscriptionId) updates.paddle_subscription_id = paddleSubscriptionId;
      if (currentPeriodEnd) updates.subscription_current_period_end = currentPeriodEnd;
      updates.subscription_canceled_at = null;
      break;

    case "subscription.updated":
      // Sync plan + period end without flipping status (Paddle sends this on renewals too)
      if (plan) updates.subscription_plan = plan;
      if (paddleCustomerId) updates.paddle_customer_id = paddleCustomerId;
      if (paddleSubscriptionId) updates.paddle_subscription_id = paddleSubscriptionId;
      if (currentPeriodEnd) updates.subscription_current_period_end = currentPeriodEnd;
      // If Paddle reports the subscription is currently active, ensure status reflects it
      if (data?.status === "active" || data?.status === "trialing") {
        updates.subscription_status = "pro";
      }
      break;

    case "subscription.canceled":
      updates.subscription_status = "canceled";
      updates.subscription_canceled_at = new Date().toISOString();
      break;

    case "subscription.past_due":
      updates.subscription_status = "past_due";
      break;

    default:
      console.log(`[paddle-webhook] unhandled event_type: ${eventType} — acknowledging`);
      return res.status(200).json({ received: true, ignored: eventType });
  }

  // Update profiles row
  const { error } = await supabase
    .from("profiles")
    .update(updates)
    .eq("id", userId);

  if (error) {
    console.error("[paddle-webhook] supabase update failed:", error.message);
    // Return 500 so Paddle retries
    return res.status(500).json({ error: "Database update failed" });
  }

  console.log(
    `[paddle-webhook] OK — user=${userId} event=${eventType} status=${updates.subscription_status || "(unchanged)"}`
  );
  return res.status(200).json({ received: true });
}

// Tell Vercel NOT to parse the body — we need raw bytes for signature verification
export const config = {
  api: {
    bodyParser: false,
  },
};
