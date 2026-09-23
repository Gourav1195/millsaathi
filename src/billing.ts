import type { AppEnv } from './index';

export type BillingPlanKey = 'starter' | 'professional';

type BillingBindings = AppEnv['Bindings'];

export type BillingPlan = {
  key: BillingPlanKey;
  label: string;
  amount_paise: number;
  interval: 'yearly';
  billing_note: string;
  description: string;
  features: string[];
  razorpay_plan_id: string | null;
};

export const BILLING_PLANS: Record<BillingPlanKey, Omit<BillingPlan, 'razorpay_plan_id'>> = {
  starter: {
    key: 'starter',
    label: 'Starter',
    amount_paise: 9_999_00,
    interval: 'yearly',
    billing_note: 'billed annually',
    description: 'Gate, weighbridge, inventory, and stock for a single mill.',
    features: ['Gate & Weighbridge', 'Inventory & Lots', 'Suppliers & buyers khata', 'Up to 3 users'],
  },
  professional: {
    key: 'professional',
    label: 'Professional',
    amount_paise: 24_999_00,
    interval: 'yearly',
    billing_note: 'billed annually',
    description: 'The full loop with lab, production, and owner digest.',
    features: ['Everything in Starter', 'Lab & Quality', 'Purchase & Saudas', 'Production & Mass Balance', 'WhatsApp Owner Digest', 'Unlimited users'],
  },
};

type RazorpayCustomer = { id: string };
type RazorpaySubscription = {
  id: string;
  plan_id: string;
  status: string;
  current_start?: number | null;
  current_end?: number | null;
  customer_id?: string | null;
};

type RazorpayEvent = {
  id: string;
  event: string;
  payload?: {
    subscription?: { entity: RazorpaySubscription };
    payment?: { entity: Record<string, unknown> };
  };
};

export function billingConfigured(env: BillingBindings): boolean {
  return Boolean(env.RAZORPAY_KEY?.trim() && env.RAZORPAY_SECRET?.trim());
}

export function billingPlans(env: BillingBindings): BillingPlan[] {
  return (Object.keys(BILLING_PLANS) as BillingPlanKey[]).map((key) => ({
    ...BILLING_PLANS[key],
    razorpay_plan_id: planIdForKey(env, key),
  }));
}

export function checkoutAvailable(env: BillingBindings): boolean {
  return billingConfigured(env) && billingPlans(env).some((plan) => Boolean(plan.razorpay_plan_id));
}

function planIdForKey(env: BillingBindings, key: BillingPlanKey): string | null {
  const value = key === 'starter' ? env.RAZORPAY_PLAN_STARTER : env.RAZORPAY_PLAN_PROFESSIONAL;
  const trimmed = value?.trim();
  return trimmed || null;
}

function planKeyForId(env: BillingBindings, planId: string): BillingPlanKey | null {
  const starter = planIdForKey(env, 'starter');
  const professional = planIdForKey(env, 'professional');
  if (starter && starter === planId) return 'starter';
  if (professional && professional === planId) return 'professional';
  return null;
}

function webhookSecret(env: BillingBindings): string | null {
  const secret = env.RAZORPAY_WEBHOOK_SECRET?.trim() || env.RAZORPAY_SECRET?.trim();
  return secret || null;
}

async function hmacSha256Hex(secret: string, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  return Array.from(new Uint8Array(signature)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function verifyPaymentSignature(env: BillingBindings, paymentId: string, subscriptionId: string, signature: string): Promise<boolean> {
  const secret = env.RAZORPAY_SECRET?.trim();
  if (!secret || !paymentId || !subscriptionId || !signature) return false;
  const expected = await hmacSha256Hex(secret, `${paymentId}|${subscriptionId}`);
  return expected === signature;
}

export async function verifyWebhookSignature(env: BillingBindings, rawBody: string, signature: string): Promise<boolean> {
  const secret = webhookSecret(env);
  if (!secret || !signature) return false;
  const expected = await hmacSha256Hex(secret, rawBody);
  return expected === signature;
}

async function razorpayRequest<T>(env: BillingBindings, method: string, path: string, body?: Record<string, unknown>): Promise<T> {
  const key = env.RAZORPAY_KEY?.trim();
  const secret = env.RAZORPAY_SECRET?.trim();
  if (!key || !secret) throw new Error('Razorpay is not configured');
  const response = await fetch(`https://api.razorpay.com/v1${path}`, {
    method,
    headers: {
      Authorization: `Basic ${btoa(`${key}:${secret}`)}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) {
    const description = typeof payload.error === 'object' && payload.error && typeof (payload.error as { description?: string }).description === 'string'
      ? (payload.error as { description: string }).description
      : 'Razorpay request failed';
    throw new Error(description);
  }
  return payload as T;
}

function isoFromUnix(value: number | null | undefined): string | null {
  if (!value) return null;
  return new Date(value * 1000).toISOString();
}

async function getBillingAccount(db: D1Database, millId: string) {
  return db.prepare(
    `SELECT id, mill_id, provider, provider_customer_id
     FROM billing_accounts WHERE mill_id = ?`,
  ).bind(millId).first<{ id: string; mill_id: string; provider: string; provider_customer_id: string | null }>();
}

async function getActiveSubscription(db: D1Database, billingAccountId: string) {
  return db.prepare(
    `SELECT id, provider_subscription_id, plan, status
     FROM billing_subscriptions
     WHERE billing_account_id = ?
       AND status IN ('created', 'authenticated', 'active', 'trialing', 'past_due', 'pending')
     ORDER BY created_at DESC LIMIT 1`,
  ).bind(billingAccountId).first<{ id: string; provider_subscription_id: string | null; plan: string; status: string }>();
}

async function ensureRazorpayCustomer(
  env: BillingBindings,
  db: D1Database,
  billingAccount: { id: string; mill_id: string; provider_customer_id: string | null },
  mill: { id: string; name: string },
  user: { name: string; email: string },
): Promise<string> {
  if (billingAccount.provider_customer_id) return billingAccount.provider_customer_id;
  const customer = await razorpayRequest<RazorpayCustomer>(env, 'POST', '/customers', {
    name: mill.name || user.name,
    email: user.email,
    notes: { mill_id: mill.id, billing_account_id: billingAccount.id },
  });
  await db.prepare(`UPDATE billing_accounts SET provider_customer_id = ? WHERE id = ?`)
    .bind(customer.id, billingAccount.id)
    .run();
  return customer.id;
}

export async function createCheckoutSubscription(
  env: BillingBindings,
  db: D1Database,
  mill: { id: string; name: string },
  user: { name: string; email: string },
  planKey: BillingPlanKey,
) {
  if (!billingConfigured(env)) throw new Error('Razorpay is not configured');
  const planId = planIdForKey(env, planKey);
  if (!planId) throw new Error('This plan is not available yet');

  const billingAccount = await getBillingAccount(db, mill.id);
  if (!billingAccount) throw new Error('Billing account not found');

  const active = await getActiveSubscription(db, billingAccount.id);
  if (active && ['active', 'trialing', 'authenticated', 'pending', 'past_due'].includes(active.status)) {
    throw new Error('An active subscription already exists for this mill');
  }

  const customerId = await ensureRazorpayCustomer(env, db, billingAccount, mill, user);
  const subscription = await razorpayRequest<RazorpaySubscription>(env, 'POST', '/subscriptions', {
    plan_id: planId,
    total_count: 10,
    quantity: 1,
    customer_notify: true,
    customer_id: customerId,
    notes: { mill_id: mill.id, billing_account_id: billingAccount.id, plan: planKey },
  });

  const subscriptionRowId = crypto.randomUUID();
  await db.prepare(
    `INSERT INTO billing_subscriptions (id, billing_account_id, provider_subscription_id, plan, status, current_period_start, current_period_end)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    subscriptionRowId,
    billingAccount.id,
    subscription.id,
    planKey,
    subscription.status,
    isoFromUnix(subscription.current_start),
    isoFromUnix(subscription.current_end),
  ).run();

  return {
    key_id: env.RAZORPAY_KEY!.trim(),
    subscription_id: subscription.id,
    plan: planKey,
    customer: { name: mill.name || user.name, email: user.email },
  };
}

async function recordBillingEvent(db: D1Database, billingAccountId: string | null, providerEventId: string, eventType: string, payload: unknown) {
  const existing = await db.prepare(`SELECT id FROM billing_events WHERE provider_event_id = ?`).bind(providerEventId).first();
  if (existing) return false;
  await db.prepare(
    `INSERT INTO billing_events (id, billing_account_id, provider_event_id, event_type, payload_json)
     VALUES (?, ?, ?, ?, ?)`,
  ).bind(crypto.randomUUID(), billingAccountId, providerEventId, eventType, JSON.stringify(payload)).run();
  return true;
}

async function syncSubscription(
  env: BillingBindings,
  db: D1Database,
  subscription: RazorpaySubscription,
  fallback?: { millId?: string; billingAccountId?: string; plan?: BillingPlanKey },
) {
  const notes = (subscription as { notes?: Record<string, string> }).notes ?? {};
  const millId = notes.mill_id || fallback?.millId;
  const billingAccountId = notes.billing_account_id || fallback?.billingAccountId;
  const planKey = planKeyForId(env, subscription.plan_id) || fallback?.plan || null;

  let accountId = billingAccountId || null;
  if (!accountId && millId) {
    const account = await getBillingAccount(db, millId);
    accountId = account?.id ?? null;
  }

  const existing = await db.prepare(
    `SELECT id, billing_account_id, plan FROM billing_subscriptions WHERE provider_subscription_id = ?`,
  ).bind(subscription.id).first<{ id: string; billing_account_id: string; plan: string }>();

  const status = subscription.status;
  const periodStart = isoFromUnix(subscription.current_start);
  const periodEnd = isoFromUnix(subscription.current_end);
  const resolvedPlan = planKey || existing?.plan || 'starter';
  const resolvedAccountId = accountId || existing?.billing_account_id;

  if (!resolvedAccountId) return;

  if (existing) {
    await db.prepare(
      `UPDATE billing_subscriptions
       SET status = ?, current_period_start = ?, current_period_end = ?, plan = ?
       WHERE id = ?`,
    ).bind(status, periodStart, periodEnd, resolvedPlan, existing.id).run();
  } else {
    await db.prepare(
      `INSERT INTO billing_subscriptions (id, billing_account_id, provider_subscription_id, plan, status, current_period_start, current_period_end)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).bind(crypto.randomUUID(), resolvedAccountId, subscription.id, resolvedPlan, status, periodStart, periodEnd).run();
  }

  if (['active', 'trialing'].includes(status) && millId && resolvedPlan !== 'enterprise') {
    await db.prepare(`UPDATE mills SET plan = ? WHERE id = ?`).bind(resolvedPlan, millId).run();
  }
  if (['cancelled', 'completed', 'expired', 'halted'].includes(status) && millId) {
    await db.prepare(`UPDATE mills SET plan = 'trial' WHERE id = ?`).bind(millId).run();
  }
}

export async function verifyCheckoutPayment(
  env: BillingBindings,
  db: D1Database,
  millId: string,
  paymentId: string,
  subscriptionId: string,
  signature: string,
) {
  const valid = await verifyPaymentSignature(env, paymentId, subscriptionId, signature);
  if (!valid) throw new Error('Payment verification failed');

  const billingAccount = await getBillingAccount(db, millId);
  if (!billingAccount) throw new Error('Billing account not found');

  const subscription = await razorpayRequest<RazorpaySubscription>(env, 'GET', `/subscriptions/${subscriptionId}`);
  await syncSubscription(env, db, subscription, { millId, billingAccountId: billingAccount.id });
  return subscription;
}

export async function handleBillingWebhook(env: BillingBindings, db: D1Database, rawBody: string, signature: string) {
  if (!await verifyWebhookSignature(env, rawBody, signature)) {
    throw new Error('Invalid webhook signature');
  }

  const event = JSON.parse(rawBody) as RazorpayEvent;
  const subscription = event.payload?.subscription?.entity;
  const billingAccountId = subscription
    ? ((subscription as { notes?: Record<string, string> }).notes?.billing_account_id ?? null)
    : null;

  const recorded = await recordBillingEvent(db, billingAccountId, event.id, event.event, event);
  if (!recorded) return { ok: true, duplicate: true };

  if (subscription && event.event.startsWith('subscription.')) {
    await syncSubscription(env, db, subscription);
  }

  return { ok: true };
}

export function formatBillingStatus(row: {
  provider: string | null;
  plan: string | null;
  status: string | null;
  current_period_start: string | null;
  current_period_end: string | null;
} | null, env: BillingBindings) {
  const activeStatuses = new Set(['active', 'trialing', 'authenticated', 'pending', 'past_due', 'created']);
  const hasPaidPlan = row?.plan && row?.status && activeStatuses.has(row.status) && row.plan !== 'free';
  return {
    plan: hasPaidPlan ? row!.plan! : 'free',
    status: hasPaidPlan ? row!.status! : 'free',
    provider: row?.provider || null,
    current_period_start: row?.current_period_start || null,
    current_period_end: row?.current_period_end || null,
    checkout_available: checkoutAvailable(env),
  };
}
