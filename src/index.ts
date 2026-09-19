// MillSaathi Worker: JSON API under /api/* plus authenticated root routing.
import { Hono } from 'hono';
import type { Context } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { hashPassword, hashToken, newSessionToken, sessionExpiry, verifyPassword } from './auth';
import { api } from './api';

export type UserRow = {
  id: string; mill_id: string; name: string; email: string; role: string; role_code?: string | null;
  preferred_unit?: string | null; theme?: string | null;
  pass_hash: string; pass_salt: string;
};
export type MillRow = {
  id: string; name: string; slug: string; plan: string; language: string; loss_limit_pct: number; season_label: string; created_at: string;
  address?: string | null; phone?: string | null; email?: string | null; gstin?: string | null; place_of_supply?: string | null;
};
type AppBindings = Env & { TURNSTILE_SECRET_KEY?: string; TURNSTILE_SITE_KEY?: string };
export type AppEnv = {
  Bindings: AppBindings;
  Variables: { session: { user: UserRow; mill: MillRow } };
};

const COOKIE = 'ms_session';

const app = new Hono<AppEnv>();

app.use('*', async (c, next) => {
  await next();
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('Referrer-Policy', 'strict-origin-when-cross-origin');
  c.header('X-Frame-Options', 'DENY');
  c.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  if (c.req.path.startsWith('/api/')) c.header('Cache-Control', 'no-store');
});

app.onError((err, c) => {
  console.error(JSON.stringify({ message: 'unhandled_error', error: String(err), path: c.req.path }));
  return c.json({ error: 'Something went wrong. Please try again.' }, 500);
});

function setSessionCookie(c: Context<AppEnv>, token: string) {
  setCookie(c, COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: 'Lax',
    path: '/',
    maxAge: 30 * 24 * 60 * 60,
  });
}

async function createSession(db: D1Database, userId: string): Promise<string> {
  const token = newSessionToken();
  await db.prepare(`INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)`)
    .bind(await hashToken(token), userId, sessionExpiry())
    .run();
  return token;
}

async function rateLimit(db: D1Database, bucket: string, limit: number, windowSeconds = 900): Promise<boolean> {
  const now = Math.floor(Date.now() / 1000);
  const current = await db.prepare(`SELECT window_start, attempts FROM auth_rate_limits WHERE bucket = ?`).bind(bucket).first<{ window_start: number; attempts: number }>();
  if (!current || now - current.window_start >= windowSeconds) {
    await db.prepare(`INSERT INTO auth_rate_limits (bucket, window_start, attempts) VALUES (?, ?, 1) ON CONFLICT(bucket) DO UPDATE SET window_start = excluded.window_start, attempts = 1, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')`).bind(bucket, now).run();
    return true;
  }
  if (current.attempts >= limit) return false;
  await db.prepare(`UPDATE auth_rate_limits SET attempts = attempts + 1, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE bucket = ?`).bind(bucket).run();
  return true;
}

async function verifyTurnstile(c: Context<AppEnv>, token: unknown): Promise<boolean> {
  const secret = c.env.TURNSTILE_SECRET_KEY?.trim();
  if (!secret) return true;
  const responseToken = String(token ?? '').trim();
  if (!responseToken) return false;
  const form = new URLSearchParams({ secret, response: responseToken });
  const remoteIp = c.req.header('CF-Connecting-IP');
  if (remoteIp) form.set('remoteip', remoteIp);
  try {
    const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: form });
    const result = await response.json<{ success?: boolean }>();
    return response.ok && result.success === true;
  } catch {
    return false;
  }
}

async function sessionFromCookie(db: D1Database, token: string | undefined) {
  if (!token) return null;
  const row = await db.prepare(
    `SELECT u.id, u.mill_id, u.name, u.email, u.role, u.role_code, u.preferred_unit, u.theme,
            m.id AS m_id, m.name AS m_name, m.slug AS m_slug, m.plan AS m_plan,
            m.language AS m_language, m.loss_limit_pct AS m_loss_limit_pct, m.season_label AS m_season_label,
            m.created_at AS m_created_at, m.address AS m_address, m.phone AS m_phone, m.email AS m_email,
            m.gstin AS m_gstin, m.place_of_supply AS m_place_of_supply
     FROM sessions se JOIN users u ON u.id = se.user_id JOIN mills m ON m.id = u.mill_id
     WHERE se.token_hash = ? AND u.active = 1 AND se.expires_at > strftime('%Y-%m-%dT%H:%M:%fZ','now')`,
  ).bind(await hashToken(token)).first<Record<string, string | number>>();
  if (!row) return null;
  return {
    user: { id: row.id, mill_id: row.mill_id, name: row.name, email: row.email, role: row.role, role_code: row.role_code ?? null, preferred_unit: row.preferred_unit ?? 'QUINTAL', theme: row.theme ?? 'light', pass_hash: '', pass_salt: '' } as UserRow,
    mill: { id: row.m_id, name: row.m_name, slug: row.m_slug, plan: row.m_plan, language: row.m_language,
      loss_limit_pct: row.m_loss_limit_pct, season_label: row.m_season_label, created_at: row.m_created_at,
      address: row.m_address ?? null, phone: row.m_phone ?? null, email: row.m_email ?? null, gstin: row.m_gstin ?? null, place_of_supply: row.m_place_of_supply ?? null } as MillRow,
  };
}

app.get('/', async (c) => {
  if (await sessionFromCookie(c.env.DB, getCookie(c, COOKIE))) return c.redirect('/app');
  return c.env.ASSETS.fetch(c.req.raw);
});

// ---- Auth (public) ----
app.get('/api/auth/config', (c) => c.json({ turnstile_site_key: c.env.TURNSTILE_SECRET_KEY && c.env.TURNSTILE_SITE_KEY ? c.env.TURNSTILE_SITE_KEY : null }));

app.post('/api/auth/signup', async (c) => {
  const b = await c.req.json<Record<string, string>>().catch(() => ({}) as Record<string, string>);
  const millName = (b.mill_name ?? '').trim();
  const name = (b.name ?? '').trim();
  const email = (b.email ?? '').trim().toLowerCase();
  const password = b.password ?? '';
  const preferredUnit = String(b.preferred_unit ?? 'QUINTAL').toUpperCase();
  const ip = c.req.header('CF-Connecting-IP') || 'unknown';
  if (!await rateLimit(c.env.DB, `signup:${ip}`, 10)) return c.json({ error: 'Too many signup attempts. Please try again later.' }, 429);
  if (!await verifyTurnstile(c, b.turnstile_token)) return c.json({ error: 'Please complete the security check and try again.' }, 403);
  if (!millName || !name || !/^\S+@\S+\.\S+$/.test(email)) return c.json({ error: 'Mill name, your name and a valid email are required.' }, 400);
  if (password.length < 8) return c.json({ error: 'Password must be at least 8 characters.' }, 400);
  if (!['KG', 'QUINTAL', 'TONNE', 'BAG', 'PIECE'].includes(preferredUnit)) return c.json({ error: 'Choose a supported preferred unit.' }, 400);

  const existing = await c.env.DB.prepare(`SELECT id FROM users WHERE email = ?`).bind(email).first();
  if (existing) return c.json({ error: 'An account with this email already exists.' }, 409);

  const millId = crypto.randomUUID();
  const userId = crypto.randomUUID();
  const slug = millName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) + '-' + crypto.randomUUID().slice(0, 6);
  const { hash, salt } = await hashPassword(password);

  // New mill starts usable: standard rice item graph + one godown.
  const defaults: D1PreparedStatement[] = [
    c.env.DB.prepare(`INSERT INTO mills (id, name, slug) VALUES (?, ?, ?)`).bind(millId, millName, slug),
    c.env.DB.prepare(`INSERT INTO users (id, mill_id, name, email, role, preferred_unit, pass_hash, pass_salt) VALUES (?, ?, ?, ?, 'owner', ?, ?, ?)`)
      .bind(userId, millId, name, email, preferredUnit, hash, salt),
    c.env.DB.prepare(`INSERT INTO billing_accounts (id, mill_id, provider) VALUES (?, ?, 'razorpay')`).bind(crypto.randomUUID(), millId),
    c.env.DB.prepare(`INSERT INTO godowns (id, mill_id, name, capacity_qtl) VALUES (?, ?, 'Godown 1', 2000)`).bind(crypto.randomUUID(), millId),
  ];
  const defaultProcesses = [
    ['Pre-Cleaning', 'Remove dust, stones and foreign matter before milling.'],
    ['De-husking (Hulling)', 'Separate husk from paddy.'],
    ['Paddy Separation', 'Separate paddy and brown rice.'],
    ['Whitening and Polishing', 'Whiten and polish brown rice to finished rice.'],
    ['Grading and Color Sorting', 'Grade kernels and remove discolored grains.'],
    ['Weighing and Packaging', 'Weigh, pack and prepare finished goods for dispatch.'],
  ];
  const defaultProcessIds = defaultProcesses.map(() => crypto.randomUUID());
  for (const [index, [name, description]] of defaultProcesses.entries()) {
    defaults.push(c.env.DB.prepare(`INSERT INTO process_types (id, mill_id, name, description, default_unit) VALUES (?, ?, ?, ?, ?)`)
      .bind(defaultProcessIds[index], millId, name, description, preferredUnit));
  }
  // A new mill can begin using the linear rice pipeline immediately. The chain
  // remains optional: standalone process runs keep working unchanged.
  const defaultChainId = crypto.randomUUID();
  defaults.push(c.env.DB.prepare(`INSERT INTO processing_chains (id, mill_id, name, description, input_category, expected_yield_pct) VALUES (?, ?, ?, ?, ?, ?)`)
    .bind(defaultChainId, millId, 'Rice Milling Pipeline', 'Default end-to-end rice milling chain: Pre-Cleaning through Packaging.', 'paddy', 67));
  defaultProcessIds.forEach((processTypeId, index) => {
    defaults.push(c.env.DB.prepare(`INSERT INTO processing_chain_steps (id, mill_id, chain_id, process_type_id, step_number) VALUES (?, ?, ?, ?, ?)`)
      .bind(crypto.randomUUID(), millId, defaultChainId, processTypeId, index + 1));
  });
  const defaultItems: [string, string, string, number | null][] = [
    ['Paddy (common)', 'paddy', '1006', null],
    ['Raw Rice', 'rice', '1006', 67],
    ['Parboiled Non-Basmati Rice', 'rice', '1006', 68],
    ['Rice Bran', 'byproduct', '2302', 8],
    ['Broken Rice', 'byproduct', '1006', 5],
    ['Husk', 'byproduct', '1213', 20],
  ];
  for (const [iname, cat, hsn, otr] of defaultItems) {
    defaults.push(
      c.env.DB.prepare(`INSERT INTO items (id, mill_id, name, category, hsn, typical_otr_pct) VALUES (?, ?, ?, ?, ?, ?)`)
        .bind(crypto.randomUUID(), millId, iname, cat, hsn, otr),
    );
  }
  await c.env.DB.batch(defaults);

  setSessionCookie(c, await createSession(c.env.DB, userId));
  return c.json({ ok: true, mill_id: millId }, 201);
});

app.post('/api/auth/login', async (c) => {
  const b = await c.req.json<Record<string, string>>().catch(() => ({}) as Record<string, string>);
  const email = (b.email ?? '').trim().toLowerCase();
  const ip = c.req.header('CF-Connecting-IP') || 'unknown';
  if (!await rateLimit(c.env.DB, `login:${ip}:${email}`, 10)) return c.json({ error: 'Too many login attempts. Please try again later.' }, 429);
  if (!await verifyTurnstile(c, b.turnstile_token)) return c.json({ error: 'Please complete the security check and try again.' }, 403);
  const user = await c.env.DB.prepare(`SELECT * FROM users WHERE email = ? AND active = 1`).bind(email).first<UserRow>();
  if (!user || !(await verifyPassword(b.password ?? '', user.pass_salt, user.pass_hash))) {
    return c.json({ error: 'Wrong email or password.' }, 401);
  }
  setSessionCookie(c, await createSession(c.env.DB, user.id));
  return c.json({ ok: true });
});

app.post('/api/auth/logout', async (c) => {
  const token = getCookie(c, COOKIE);
  if (token) {
    await c.env.DB.prepare(`DELETE FROM sessions WHERE token_hash = ?`).bind(await hashToken(token)).run();
  }
  deleteCookie(c, COOKIE, { path: '/' });
  return c.json({ ok: true });
});

app.post('/api/auth/accept-invite', async (c) => {
  const b = await c.req.json<Record<string, string>>().catch(() => ({} as Record<string, string>));
  const token = b.token ?? '';
  const password = b.password ?? '';
  if (!token || password.length < 8) return c.json({ error: 'invite token and a password of at least 8 characters are required' }, 400);
  const invited = await c.env.DB.prepare(`SELECT id FROM users WHERE invite_token_hash = ? AND active = 0 AND invite_expires_at > datetime('now')`).bind(await hashToken(token)).first<{ id: string }>();
  if (!invited) return c.json({ error: 'invite is invalid or expired' }, 400);
  const credentials = await hashPassword(password);
  await c.env.DB.prepare(`UPDATE users SET pass_hash = ?, pass_salt = ?, active = 1, invite_token_hash = NULL, invite_expires_at = NULL WHERE id = ?`).bind(credentials.hash, credentials.salt, invited.id).run();
  setSessionCookie(c, await createSession(c.env.DB, invited.id));
  return c.json({ ok: true });
});

// ---- Session guard for everything else under /api ----
app.use('/api/*', async (c, next) => {
  const token = getCookie(c, COOKIE);
  const session = await sessionFromCookie(c.env.DB, token);
  if (!session) return c.json({ error: 'unauthenticated' }, 401);
  c.set('session', session);
  await next();
});

app.get('/api/auth/me', (c) => {
  const { user, mill } = c.get('session');
  return c.json({ id: user.id, name: user.name, email: user.email, role: user.role_code || user.role, preferred_unit: user.preferred_unit || 'QUINTAL', theme: user.theme || 'light', mill: { id: mill.id, name: mill.name, plan: mill.plan } });
});

app.patch('/api/auth/me', async (c) => {
  const { user } = c.get('session');
  const b = await c.req.json<Record<string, unknown>>().catch(() => ({} as Record<string, unknown>));
  const preferredUnit = String(b.preferred_unit ?? user.preferred_unit ?? 'QUINTAL').toUpperCase();
  const theme = String(b.theme ?? user.theme ?? 'light').toLowerCase();
  if (!['KG', 'QUINTAL', 'TONNE', 'BAG', 'PIECE'].includes(preferredUnit)) return c.json({ error: 'unsupported preferred unit' }, 400);
  if (!['light', 'dark'].includes(theme)) return c.json({ error: 'unsupported theme' }, 400);
  await c.env.DB.prepare(`UPDATE users SET preferred_unit = ?, theme = ? WHERE id = ?`).bind(preferredUnit, theme, user.id).run();
  user.preferred_unit = preferredUnit;
  user.theme = theme;
  return c.json({ ok: true, preferred_unit: preferredUnit, theme });
});

app.route('/api', api);

app.all('*', (c) => c.json({ error: 'not found' }, 404));

export default app;
