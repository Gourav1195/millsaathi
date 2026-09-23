#!/usr/bin/env node
/**
 * Create MillSaathi Razorpay subscription plans and print the secret values to add in Cloudflare.
 *
 * Usage:
 *   RAZORPAY_KEY=rzp_test_xxx RAZORPAY_SECRET=yyy node scripts/razorpay-create-plans.mjs
 *
 * Wrangler local dev also reads .dev.vars with the same variable names.
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const PLANS = [
  {
    secret: 'RAZORPAY_PLAN_STARTER',
    name: 'MillSaathi Starter',
    description: 'Gate, weighbridge, inventory, and stock for a single mill.',
    monthly_inr: 9_999,
  },
  {
    secret: 'RAZORPAY_PLAN_PROFESSIONAL',
    name: 'MillSaathi Professional',
    description: 'Full loop with lab, production, and owner digest.',
    monthly_inr: 24_999,
  },
];

function loadDevVars() {
  const path = resolve(process.cwd(), '.dev.vars');
  if (!existsSync(path)) return {};
  const vars = {};
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const index = trimmed.indexOf('=');
    if (index === -1) continue;
    vars[trimmed.slice(0, index).trim()] = trimmed.slice(index + 1).trim();
  }
  return vars;
}

async function razorpayRequest(key, secret, body) {
  const response = await fetch('https://api.razorpay.com/v1/plans', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${key}:${secret}`).toString('base64')}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = payload?.error?.description || JSON.stringify(payload);
    throw new Error(message);
  }
  return payload;
}

const devVars = loadDevVars();
const key = process.env.RAZORPAY_KEY || devVars.RAZORPAY_KEY;
const secret = process.env.RAZORPAY_SECRET || devVars.RAZORPAY_SECRET;

if (!key || !secret) {
  console.error('Missing RAZORPAY_KEY and RAZORPAY_SECRET.');
  console.error('Set them in the shell or in .dev.vars, then rerun this script.');
  process.exit(1);
}

console.log('Creating annual Razorpay plans (monthly price x 12)...\n');

for (const plan of PLANS) {
  const annualInr = plan.monthly_inr * 12;
  const annualPaise = annualInr * 100;
  const created = await razorpayRequest(key, secret, {
    period: 'yearly',
    interval: 1,
    item: {
      name: plan.name,
      amount: annualPaise,
      currency: 'INR',
      description: `${plan.description} Billed annually at ₹${plan.monthly_inr.toLocaleString('en-IN')}/month.`,
    },
    notes: { product: 'millsaathi', plan: plan.secret },
  });

  console.log(`${plan.name}`);
  console.log(`  Annual charge: ₹${annualInr.toLocaleString('en-IN')}`);
  console.log(`  Cloudflare secret: ${plan.secret}`);
  console.log(`  Value: ${created.id}`);
  console.log('');
}

console.log('Add the two plan IDs above as Worker secrets in Cloudflare:');
console.log('  Dashboard → Workers → millsaathi → Settings → Variables and Secrets');
console.log('Or locally in .dev.vars for wrangler dev.');
console.log('\nYou can also copy plan IDs from Razorpay Dashboard → Subscriptions → Plans.');
