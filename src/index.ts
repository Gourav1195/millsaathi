// MillSaathi Worker: JSON API under /api/*. Everything else (landing, /demo, /app SPA)
// is served directly from static assets and never reaches this code (run_worker_first: /api/*).
import { Hono } from 'hono';
import type { Context } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { hashPassword, hashToken, newSessionToken, sessionExpiry, verifyPassword } from './auth';
import { api } from './api';

export type UserRow = {
  id: string; mill_id: string; name: string; email: string; role: 'owner' | 'manager' | 'accountant' | 'operator';
  pass_hash: string; pass_salt: string;
};
export type MillRow = {
  id: string; name: string; slug: string; plan: string; language: string; loss_limit_pct: number; season_label: string;
};
export type AppEnv = {
  Bindings: Env;
  Variables: { session: { user: UserRow; mill: MillRow } };
};

const COOKIE = 'ms_session';

const app = new Hono<AppEnv>();

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

// ---- Auth (public) ----
app.post('/api/auth/signup', async (c) => {
  const b = await c.req.json<Record<string, string>>().catch(() => ({}) as Record<string, string>);
  const millName = (b.mill_name ?? '').trim();
  const name = (b.name ?? '').trim();
  const email = (b.email ?? '').trim().toLowerCase();
  const password = b.password ?? '';
  if (!millName || !name || !/^\S+@\S+\.\S+$/.test(email)) return c.json({ error: 'Mill name, your name and a valid email are required.' }, 400);
  if (password.length < 8) return c.json({ error: 'Password must be at least 8 characters.' }, 400);

  const existing = await c.env.DB.prepare(`SELECT id FROM users WHERE email = ?`).bind(email).first();
  if (existing) return c.json({ error: 'An account with this email already exists.' }, 409);

  const millId = crypto.randomUUID();
  const userId = crypto.randomUUID();
  const slug = millName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) + '-' + crypto.randomUUID().slice(0, 6);
  const { hash, salt } = await hashPassword(password);

  // New mill starts usable: standard rice item graph + one godown.
  const defaults: D1PreparedStatement[] = [
    c.env.DB.prepare(`INSERT INTO mills (id, name, slug) VALUES (?, ?, ?)`).bind(millId, millName, slug),
    c.env.DB.prepare(`INSERT INTO users (id, mill_id, name, email, role, pass_hash, pass_salt) VALUES (?, ?, ?, ?, 'owner', ?, ?)`)
      .bind(userId, millId, name, email, hash, salt),
    c.env.DB.prepare(`INSERT INTO godowns (id, mill_id, name, capacity_qtl) VALUES (?, ?, 'Godown 1', 2000)`).bind(crypto.randomUUID(), millId),
  ];
  const defaultItems: [string, string, string, number | null][] = [
    ['Paddy (common)', 'paddy', '1006', null],
    ['Raw Rice', 'rice', '1006', 67],
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
  const user = await c.env.DB.prepare(`SELECT * FROM users WHERE email = ?`).bind(email).first<UserRow>();
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

// ---- Session guard for everything else under /api ----
app.use('/api/*', async (c, next) => {
  const token = getCookie(c, COOKIE);
  if (!token) return c.json({ error: 'unauthenticated' }, 401);
  const row = await c.env.DB.prepare(
    `SELECT u.id, u.mill_id, u.name, u.email, u.role, u.pass_hash, u.pass_salt,
            m.id AS m_id, m.name AS m_name, m.slug AS m_slug, m.plan AS m_plan,
            m.language AS m_language, m.loss_limit_pct AS m_loss_limit_pct, m.season_label AS m_season_label
     FROM sessions se
     JOIN users u ON u.id = se.user_id
     JOIN mills m ON m.id = u.mill_id
     WHERE se.token_hash = ? AND se.expires_at > strftime('%Y-%m-%dT%H:%M:%fZ','now')`,
  )
    .bind(await hashToken(token))
    .first<Record<string, never>>();
  if (!row) return c.json({ error: 'unauthenticated' }, 401);
  c.set('session', {
    user: { id: row.id, mill_id: row.mill_id, name: row.name, email: row.email, role: row.role, pass_hash: '', pass_salt: '' },
    mill: {
      id: row.m_id, name: row.m_name, slug: row.m_slug, plan: row.m_plan,
      language: row.m_language, loss_limit_pct: row.m_loss_limit_pct, season_label: row.m_season_label,
    },
  });
  await next();
});

app.get('/api/auth/me', (c) => {
  const { user, mill } = c.get('session');
  return c.json({ id: user.id, name: user.name, email: user.email, role: user.role, mill: { id: mill.id, name: mill.name, plan: mill.plan } });
});

app.route('/api', api);

app.all('*', (c) => c.json({ error: 'not found' }, 404));

export default app;
