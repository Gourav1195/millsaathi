'use client';

import { FormEvent, useEffect, useState } from 'react';
import type { Session } from '../lib/session';

declare global { interface Window { turnstile?: { render: (element: HTMLElement, options: { sitekey: string; callback: (token: string) => void }) => string; remove: (id: string) => void } } }

type Mode = 'login' | 'signup' | 'invite';
const millTypes = ['RICE', 'SUGAR', 'FLOUR', 'OIL', 'DAL'];

export function AuthApp({ onSuccess }: { onSuccess: (session: Session) => void }) {
  const [mode, setMode] = useState<Mode>('login');
  const [invite, setInvite] = useState('');
  const [turnstileKey, setTurnstileKey] = useState<string | null>(null);
  const [turnstileToken, setTurnstileToken] = useState('');
  const [form, setForm] = useState({ email: '', password: '', name: '', mill_name: '', mill_type: 'RICE', preferred_unit: 'QUINTAL' });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search); const token = params.get('invite');
    if (token) { setInvite(token); setMode('invite'); } else if (params.get('signup') === '1') setMode('signup');
    void fetch('/api/auth/config').then(async response => response.ok ? response.json() as Promise<{ turnstile_site_key?: string | null }> : { turnstile_site_key: null }).then(config => setTurnstileKey(config.turnstile_site_key ?? null)).catch(() => undefined);
  }, []);
  useEffect(() => {
    if (!turnstileKey) return;
    const render = () => { const target = document.getElementById('turnstile-widget'); if (target && window.turnstile && !target.dataset.rendered) { target.dataset.rendered = window.turnstile.render(target, { sitekey: turnstileKey, callback: setTurnstileToken }); } };
    const script = document.createElement('script'); script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'; script.async = true; script.defer = true; script.onload = render; document.head.appendChild(script); render();
    return () => { script.remove(); };
  }, [turnstileKey]);

  async function submit(event: FormEvent) {
    event.preventDefault(); setSubmitting(true); setError(null);
    const endpoint = mode === 'invite' ? '/api/auth/accept-invite' : mode === 'signup' ? '/api/auth/signup' : '/api/auth/login';
    const body = mode === 'invite' ? { token: invite, password: form.password } : mode === 'signup' ? { ...form, turnstile_token: turnstileToken } : { email: form.email, password: form.password, turnstile_token: turnstileToken };
    try {
      const response = await fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, credentials: 'include', body: JSON.stringify(body) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error ?? 'Could not continue');
      const me = await fetch('/api/auth/me', { credentials: 'include' }); const session = await me.json(); if (!me.ok) throw new Error(session.error ?? 'Could not open your workspace');
      onSuccess(session as Session);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not continue'); } finally { setSubmitting(false); }
  }
  const title = mode === 'invite' ? 'Join your MillSaathi team' : mode === 'signup' ? 'Start your mill on MillSaathi' : 'Log in to your mill';
  return <main className="auth-page"><form className="auth-card" onSubmit={submit}><p className="eyebrow">MillSaathi</p><h1>{title}</h1><p className="muted">{mode === 'invite' ? 'Set a password to accept this invitation.' : mode === 'signup' ? 'Free forever — no card needed.' : 'Welcome back.'}</p>{error && <p className="error" role="alert">{error}</p>}
    {mode === 'signup' && <><label>Mill name<input required value={form.mill_name} onChange={e => setForm({ ...form, mill_name: e.target.value })} /></label><label>Your name<input required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></label><label>Mill type<select value={form.mill_type} onChange={e => setForm({ ...form, mill_type: e.target.value })}>{millTypes.map(type => <option key={type}>{type}</option>)}</select></label><label>Preferred unit<select value={form.preferred_unit} onChange={e => setForm({ ...form, preferred_unit: e.target.value })}><option>QUINTAL</option><option>KG</option><option>TONNE</option><option>BAG</option><option>PIECE</option></select></label></>}
    {mode !== 'invite' && <label>Email<input required type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} autoComplete="email" /></label>}<label>Password<input required minLength={8} type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} /></label>{turnstileKey && <div id="turnstile-widget" />}<button className="post" disabled={submitting}>{submitting ? 'Please wait…' : mode === 'invite' ? 'Accept invitation' : mode === 'signup' ? 'Create my mill' : 'Log in'}</button>
    {mode !== 'invite' && <p className="muted">{mode === 'signup' ? <>Already using MillSaathi? <button type="button" onClick={() => setMode('login')}>Log in</button></> : <>New here? <button type="button" onClick={() => setMode('signup')}>Create your mill</button></>}</p>}</form></main>;
}
