// commandCenter.js — read a user's shared "Mac Command Center" subscription.
//
// Command Center is ONE $19/mo subscription (sold at maccommandcenter.vercel.app)
// that grants Pro across every Mac Bridge connector. The entitlement is a GLOBAL
// key in the shared ecosystem KV keyed by email — `cc:ent:<email_lower>` —
// written by the hub's Stripe webhook. Here we only READ it: a pure KV lookup,
// no Stripe dependency. `uid2email:<userId>` (written at signup) lets a bridge
// resolve the email for the currently-authed user id.
import { redis } from './redis.js';

const GRACE_MS = 3 * 24 * 60 * 60 * 1000; // keep access a few days past period end

export const normalizeEmail = (e) => String(e || '').trim().toLowerCase();

export async function readCommandCenter(email) {
  if (!email) return { active: false };
  const raw = await redis.get(`cc:ent:${normalizeEmail(email)}`);
  if (!raw) return { active: false };
  let e;
  try { e = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { return { active: false }; }
  const withinPeriod = !e.current_period_end || e.current_period_end * 1000 + GRACE_MS > Date.now();
  return { active: !!e.active && withinPeriod };
}
export const hasCommandCenter = async (email) => (await readCommandCenter(email)).active;

// Resolve the email for a user id (stored at signup as uid2email:<userId>).
export async function emailForUser(userId) {
  if (!userId) return null;
  return redis.get(`uid2email:${userId}`);
}
