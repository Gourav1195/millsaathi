'use client';

import { AppLink } from './app-link';
import { useCallback, useEffect, useState } from 'react';
import { AppHeader } from './app-header';
import { Alert, Button, Card, PageHeader } from './ui';
import { millHeaderMeta } from '../lib/app-meta';
import { useSession } from '../lib/session';

type Billing = {
  plan: string;
  status: string;
  provider: string | null;
  current_period_start: string | null;
  current_period_end: string | null;
  checkout_available: boolean;
};

type BillingPlan = {
  key: string;
  label: string;
  amount_paise: number;
  interval: string;
  billing_note: string;
  description: string;
  features: string[];
  available: boolean;
};

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => { open: () => void; on: (event: string, handler: (response: { error?: { description?: string } }) => void) => void };
  }
}

function formatInr(paise: number) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(paise / 100);
}

function formatDate(value: string | null) {
  if (!value) return null;
  return new Date(value).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function canManageBilling(role: string) {
  return role === 'owner' || role === 'admin';
}

export function BillingApp() {
  const { session, sessionError } = useSession();
  const headerMeta = millHeaderMeta(session);
  const [billing, setBilling] = useState<Billing | null>(null);
  const [plans, setPlans] = useState<BillingPlan[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [checkoutPlan, setCheckoutPlan] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadBilling = useCallback(async () => {
    const [statusResponse, plansResponse] = await Promise.all([
      fetch('/api/billing/status', { credentials: 'include' }),
      fetch('/api/billing/plans', { credentials: 'include' }),
    ]);
    const statusBody = await statusResponse.json();
    const plansBody = await plansResponse.json();
    if (!statusResponse.ok) throw new Error(statusBody.error ?? 'Could not load billing status');
    if (!plansResponse.ok) throw new Error(plansBody.error ?? 'Could not load billing plans');
    setBilling(statusBody.billing as Billing);
    setPlans(plansBody.plans as BillingPlan[]);
  }, []);

  useEffect(() => {
    if (!session) return;
    void loadBilling().catch((cause: unknown) => setError(cause instanceof Error ? cause.message : 'Could not load billing'));
  }, [session, loadBilling]);

  async function startCheckout(planKey: string) {
    if (!session || !canManageBilling(session.role)) return;
    setCheckoutPlan(planKey);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch('/api/billing/checkout', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ plan: planKey }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? 'Could not start checkout');

      await new Promise<void>((resolve, reject) => {
        const existing = document.querySelector('script[data-razorpay-checkout]');
        if (existing) {
          resolve();
          return;
        }
        const script = document.createElement('script');
        script.src = 'https://checkout.razorpay.com/v1/checkout.js';
        script.async = true;
        script.dataset.razorpayCheckout = 'true';
        script.onload = () => resolve();
        script.onerror = () => reject(new Error('Could not load Razorpay checkout'));
        document.body.appendChild(script);
      });

      if (!window.Razorpay) throw new Error('Razorpay checkout is unavailable');

      const checkout = body.checkout as {
        key_id: string;
        subscription_id: string;
        customer: { name: string; email: string };
      };

      const rzp = new window.Razorpay({
        key: checkout.key_id,
        subscription_id: checkout.subscription_id,
        name: 'MillSaathi',
        description: 'Annual subscription',
        prefill: checkout.customer,
        theme: { color: '#C0451C' },
        handler: async (payment: { razorpay_payment_id: string; razorpay_subscription_id: string; razorpay_signature: string }) => {
          const verifyResponse = await fetch('/api/billing/verify', {
            method: 'POST',
            credentials: 'include',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(payment),
          });
          const verifyBody = await verifyResponse.json();
          if (!verifyResponse.ok) throw new Error(verifyBody.error ?? 'Payment verification failed');
          setBilling(verifyBody.billing as Billing);
          setNotice('Subscription activated. Thank you for supporting MillSaathi.');
          await loadBilling();
        },
      });
      rzp.on('payment.failed', (response) => {
        throw new Error(response.error?.description ?? 'Payment failed');
      });
      rzp.open();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not start checkout');
    } finally {
      setCheckoutPlan(null);
    }
  }

  if (session === undefined) return <main className="auth-page"><p className="muted">Loading billing…</p></main>;
  if (!session) return <main className="auth-page"><div className="auth-card"><h1>Sign in required</h1>{sessionError && <p className="error">{sessionError}</p>}<AppLink className="primary" href="/app">Go to login</AppLink></div></main>;

  const onPaidPlan = billing && billing.plan !== 'free' && ['active', 'trialing', 'authenticated', 'pending', 'past_due'].includes(billing.status);
  const showPlans = billing?.checkout_available && plans.some((plan) => plan.available) && !onPaidPlan;

  return (
    <main className="shell">
      <AppHeader session={session} />
      <section className="workspace">
        <PageHeader
          title="Billing"
          subtitle="Manage your MillSaathi subscription."
          date={headerMeta.date}
          season={headerMeta.season}
          actions={<AppLink href="/app/dashboard"><Button className="quiet">Dashboard</Button></AppLink>}
        />

        {error && <Alert title="Billing error" level="red">{error}</Alert>}
        {notice && <Alert title="Subscription updated" level="blue">{notice}</Alert>}
        {!billing && !error && <p className="muted">Loading billing status…</p>}

        {billing && (
          <section className="billing-card">
            <span className="eyebrow">Current plan</span>
            <h3>{billing.plan}</h3>
            <p><strong>Status:</strong> {billing.status}</p>
            <p><strong>Provider:</strong> {billing.provider ?? 'Not configured'}</p>
            {billing.current_period_end && <p><strong>Current period ends:</strong> {formatDate(billing.current_period_end)}</p>}
            {!billing.checkout_available && !onPaidPlan && (
              <p className="muted">MillSaathi remains free while checkout is being configured. Your mill keeps full access.</p>
            )}
            {onPaidPlan && <p className="muted">Your subscription is active. Contact support if you need to change or cancel it.</p>}
          </section>
        )}

        {showPlans && (
          <section className="billing-plans">
            <header className="card-title-row" style={{ marginTop: 24 }}>
              <div>
                <h2>Choose a plan</h2>
                <p>Annual billing through Razorpay. Existing mills keep what they use today free until you choose to upgrade.</p>
              </div>
            </header>
            <div className="billing-plan-grid">
              {plans.filter((plan) => plan.available).map((plan) => (
                <Card key={plan.key} className="billing-plan-card">
                  <span className="eyebrow">{plan.label}</span>
                  <h4>{formatInr(plan.amount_paise)}<span className="muted"> / month</span></h4>
                  <p className="muted">{plan.billing_note}</p>
                  <p className="muted">{plan.description}</p>
                  <ul className="billing-plan-features">
                    {plan.features.map((feature) => <li key={feature}>{feature}</li>)}
                  </ul>
                  {canManageBilling(session.role) ? (
                    <Button type="button" disabled={checkoutPlan === plan.key} onClick={() => void startCheckout(plan.key)}>
                      {checkoutPlan === plan.key ? 'Opening checkout…' : `Subscribe to ${plan.label}`}
                    </Button>
                  ) : (
                    <p className="muted">Only the mill owner or admin can start checkout.</p>
                  )}
                </Card>
              ))}
            </div>
          </section>
        )}
      </section>
    </main>
  );
}
