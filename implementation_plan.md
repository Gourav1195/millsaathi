# Internal Processing Chains — Multi-Step Processing Backbone

## Current State Analysis

### What exists today (strong foundation)

| Entity | Table | Purpose |
|---|---|---|
| Process catalog | [`process_types`](file:///c:/Users/gmodi/Documents/GitHub/millsaathi/migrations/0003_domain_foundation.sql#L99-L109) | 6 default rice-mill steps (Pre-Cleaning → Hulling → Paddy Sep → Whitening → Grading → Packaging) |
| Process recipes | [`process_type_lines`](file:///c:/Users/gmodi/Documents/GitHub/millsaathi/migrations/0020_process_templates.sql#L2-L19) | Template with `semantic_type`, `expected_yield_min/max_pct`, `auto_calculate` |
| Single-step runs | [`process_runs`](file:///c:/Users/gmodi/Documents/GitHub/millsaathi/migrations/0003_domain_foundation.sql#L111-L124) + [`process_run_lines`](file:///c:/Users/gmodi/Documents/GitHub/millsaathi/migrations/0003_domain_foundation.sql#L125-L139) | Execute one process type at a time with INPUT/OUTPUT/LOSS lines |
| Stock integration | [`stock_movements`](file:///c:/Users/gmodi/Documents/GitHub/millsaathi/migrations/0003_domain_foundation.sql#L58-L78) | INPUTs create OUT movements, OUTPUTs create IN movements, LOSSes are tracked but don't create inventory movements |
| Lot tracking | [`lots`](file:///c:/Users/gmodi/Documents/GitHub/millsaathi/migrations/0001_init.sql#L119-L131) | Output lots are auto-created with codes, input lot quantities are decremented |
| Void / reversals | [`process-runs/:id/void`](file:///c:/Users/gmodi/Documents/GitHub/millsaathi/src/api.ts#L1486-L1512) | Full reversal: voids movements, restores input lots, clears output lots |
| Mass balance | [`massBalance()`](file:///c:/Users/gmodi/Documents/GitHub/millsaathi/src/api.ts#L193-L201) | Legacy paddy-specific; also generic `processing_summary` and `processing_today` from process_run_lines |
| UI workspace | [`dashboard.js`](file:///c:/Users/gmodi/Documents/GitHub/millsaathi/public/assets/dashboard.js#L919-L932) | Drag-and-drop lot → process → outputs flow with live mass balance |

### What's missing / what we need to improve

1. **No chain concept** — Steps are isolated. There's no way to define "Cleaning → Hulling → Grading → Packing" as a connected pipeline where the output of step N becomes the input of step N+1.
2. **No intermediate WIP (Work-in-Progress) tracking** — After cleaning, the material isn't tracked as "cleaned paddy" until explicitly entered into hulling. Material identity is lost between steps.
3. **No per-chain mass balance** — Mass balance currently works per-day at the dashboard level (legacy `production_runs`) or per individual `process_run`. There's no way to see the end-to-end yield from paddy → finished rice across a chain.
4. **No chain-level analytics** — No yield tracking per chain, no comparison between expected vs actual output across the full pipeline.
5. **Step ordering is visual only** — The UI shows steps as a stepper (`→`) but the ordering is just alphabetical/insertion order, not a defined DAG.
6. **Legacy `production_runs` table is redundant** — It duplicates what `process_runs` + `process_run_lines` already handle more generically. The dashboard still uses the old table for mass balance.

---

## Proposed Changes

### Design Philosophy

> **Additive, not destructive.** Every change is a new migration on top of 0022. Existing `process_runs`, `process_types`, and `process_type_lines` remain fully functional. The chain layer is an **optional orchestration wrapper** — mills that don't configure chains keep using standalone runs exactly as they do today.

This follows the MES (Manufacturing Execution System) pattern: **Routing Header → Routing Steps → Work Orders → Execution Logs**, adapted for D1/SQLite and Cloudflare Workers.

---

### Component 1: Processing Chain Definition (Schema)

New migration `0023_processing_chains.sql`.

#### [NEW] Table: `processing_chains`
The "Routing Header" — a named, ordered sequence of process types that a mill defines once and reuses.

```sql
CREATE TABLE processing_chains (
  id TEXT PRIMARY KEY,
  mill_id TEXT NOT NULL REFERENCES mills(id),
  name TEXT NOT NULL,
  description TEXT,
  -- The item category this chain processes (e.g., 'paddy' → rice pipeline)
  input_category TEXT,
  -- Expected end-to-end yield for the full chain
  expected_yield_pct REAL,
  active INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  deleted_at TEXT,
  deleted_by TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE UNIQUE INDEX idx_chain_name ON processing_chains(mill_id, name) WHERE deleted_at IS NULL;
```

#### [NEW] Table: `processing_chain_steps`
The "Routing Steps" — ordered entries linking a chain to its process types, with optional per-step yield expectations and predecessor constraints.

```sql
CREATE TABLE processing_chain_steps (
  id TEXT PRIMARY KEY,
  mill_id TEXT NOT NULL REFERENCES mills(id),
  chain_id TEXT NOT NULL REFERENCES processing_chains(id),
  process_type_id TEXT NOT NULL REFERENCES process_types(id),
  step_number INTEGER NOT NULL,
  -- Optional: expected yield for this step (out_base / in_base * 100)
  expected_yield_min_pct REAL,
  expected_yield_max_pct REAL,
  -- Can this step be skipped in the chain?
  optional INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE UNIQUE INDEX idx_chain_step_order ON processing_chain_steps(chain_id, step_number);
CREATE INDEX idx_chain_steps_chain ON processing_chain_steps(mill_id, chain_id);
```

#### [NEW] Table: `processing_chain_runs`
The "Work Order" — an instance of executing a chain. Tracks the overall run from paddy-in to finished-goods-out.

```sql
CREATE TABLE processing_chain_runs (
  id TEXT PRIMARY KEY,
  mill_id TEXT NOT NULL REFERENCES mills(id),
  chain_id TEXT NOT NULL REFERENCES processing_chains(id),
  code TEXT NOT NULL,
  -- The step currently being executed (NULL = not started, points to chain_step.id)
  current_step_id TEXT REFERENCES processing_chain_steps(id),
  status TEXT NOT NULL DEFAULT 'IN_PROGRESS'
    CHECK (status IN ('IN_PROGRESS','COMPLETED','VOID','PAUSED')),
  -- Initial input tracking
  start_date TEXT NOT NULL DEFAULT (date('now')),
  end_date TEXT,
  -- Totals computed from constituent process_runs
  total_input_base REAL NOT NULL DEFAULT 0,
  total_output_base REAL NOT NULL DEFAULT 0,
  total_loss_base REAL NOT NULL DEFAULT 0,
  total_byproduct_base REAL NOT NULL DEFAULT 0,
  notes TEXT,
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_chain_runs_mill ON processing_chain_runs(mill_id, status);
```

#### [MODIFY] Table: `process_runs` — add chain linkage
Add two columns to tie individual runs back to their chain context:

```sql
ALTER TABLE process_runs ADD COLUMN chain_run_id TEXT REFERENCES processing_chain_runs(id);
ALTER TABLE process_runs ADD COLUMN chain_step_id TEXT REFERENCES processing_chain_steps(id);
```

> [!IMPORTANT]
> These are NULLable columns. Standalone process runs (no chain) continue to work with both columns NULL. Zero breakage.

---

### Component 2: Chain API Endpoints

#### [MODIFY] [`api.ts`](file:///c:/Users/gmodi/Documents/GitHub/millsaathi/src/api.ts)

New endpoints grouped under `/processing-chains/*`:

| Method | Endpoint | Purpose |
|---|---|---|
| `POST` | `/processing-chains` | Create a new chain definition |
| `GET` | `/processing-chains` | List all chains for the mill (with their steps) |
| `GET` | `/processing-chains/:id` | Get chain detail with steps, template lines, and yield history |
| `PUT` | `/processing-chains/:id/steps` | Define/reorder the steps in a chain |
| `DELETE` | `/processing-chains/:id` | Soft-delete a chain definition |
| `PATCH` | `/processing-chains/:id/restore` | Restore a soft-deleted chain |
| `POST` | `/chain-runs` | Start a new chain run (creates the work order) |
| `GET` | `/chain-runs` | List chain runs with progress, status, and yield |
| `GET` | `/chain-runs/:id` | Full detail: all constituent process runs, step progress, mass balance |
| `POST` | `/chain-runs/:id/advance` | Execute the next step in the chain (creates a `process_run` linked to the chain) |
| `POST` | `/chain-runs/:id/complete` | Mark chain as complete, compute final yield |
| `POST` | `/chain-runs/:id/void` | Void entire chain (voids all constituent process runs in reverse order) |

**Key logic in `POST /chain-runs/:id/advance`:**

1. Look up the chain run's `current_step_id` to find the next step.
2. Resolve the output lots from the previous step's process run → these become the available inputs for the next step.
3. Create a new `process_run` with `chain_run_id` and `chain_step_id` set.
4. Advance `current_step_id` to the next step.
5. If no more steps, auto-transition to `COMPLETED`.

This is the **"output of step N becomes input of step N+1"** backbone.

---

### Component 3: Chain-Level Mass Balance

#### [MODIFY] [`api.ts`](file:///c:/Users/gmodi/Documents/GitHub/millsaathi/src/api.ts) — `/chain-runs/:id` response

The chain run detail endpoint computes end-to-end mass balance:

```
chain_mass_balance = {
  original_input_base,    // What went into step 1
  final_output_base,      // Main outputs from the last step
  total_byproduct_base,   // Sum of all byproducts across all steps
  total_loss_base,         // Sum of all losses across all steps
  unexplained_base,       // original - (final + byproducts + losses)
  yield_pct,              // final_output / original_input × 100
  step_yields: [           // Per-step breakdown
    { step_number, process_type_name, input_base, output_base, loss_base, yield_pct }
  ]
}
```

#### [MODIFY] `/overview` response — add chain analytics

Add to the existing overview payload:
```json
{
  "active_chain_runs": [...],
  "chain_yield_summary": { ... }
}
```

---

### Component 4: Legacy Mass Balance Unification

> [!NOTE]
> This is a **non-breaking improvement**. The legacy `production_runs` table and `massBalance()` function continue to work. We add a **parallel** generic mass balance that works from `process_run_lines`.

#### [MODIFY] Dashboard mass balance computation

The current `massBalance()` at [line 193](file:///c:/Users/gmodi/Documents/GitHub/millsaathi/src/api.ts#L193-L201) only looks at the legacy `production_runs` table. We'll add a `genericMassBalance()` that:

1. First tries `process_run_lines` (the modern path).
2. Falls back to `production_runs` only if no process runs exist for today.
3. Dashboard displays whichever is populated, preferring the modern path.

This lets mills gradually migrate from the old "log paddy/rice/bran/husk/broken" to the modern multi-line process runs without losing their dashboard.

---

### Component 5: Default Chain Seeding

#### [MODIFY] Signup in [`index.ts`](file:///c:/Users/gmodi/Documents/GitHub/millsaathi/src/index.ts#L136-L170)

When a new mill signs up, in addition to the existing 6 default `process_types`, we also create a default `processing_chain` called **"Rice Milling Pipeline"** that links them in order:

```
Pre-Cleaning (step 1) → De-husking (step 2) → Paddy Separation (step 3)
  → Whitening and Polishing (step 4) → Grading and Color Sorting (step 5)
  → Weighing and Packaging (step 6)
```

This gives new mills a working chain out-of-the-box while remaining fully editable.

#### [NEW] Migration `0023_processing_chains.sql`

Includes a backfill query that creates the default chain for existing mills.

---

### Component 6: UI Enhancements (Frontend)

#### [MODIFY] [`dashboard.js`](file:///c:/Users/gmodi/Documents/GitHub/millsaathi/public/assets/dashboard.js) and [`dashboard.css`](file:///c:/Users/gmodi/Documents/GitHub/millsaathi/public/assets/dashboard.css)

**Processing page restructured into two views:**

1. **Chain View** (new default) — Visual pipeline showing chain progress:
   - Horizontal stepper with status per step (pending → in-progress → done)
   - Click a step to open the existing process workspace pre-loaded with the chain context
   - Live chain-wide mass balance bar
   - "Start Chain Run" CTA → "Advance to Next Step" → "Complete Chain"

2. **Run Log View** (existing, enhanced) — History of all runs, now with chain linkage badges:
   - Each run shows which chain + step it belongs to (if any)
   - Filter by chain, date range, or process type
   - Chain-level yield summary cards

**Dashboard cards (existing page):**
- Replace the legacy `production_runs`-based mass balance card with one that uses `process_run_lines` when available
- Add "Active Chains" widget showing in-progress chain runs with progress bar

---

## Summary of File Changes

### Database Layer
| File | Change |
|---|---|
| [NEW] `migrations/0023_processing_chains.sql` | New tables + ALTER for chain linkage + backfill default chains |

### Backend
| File | Change |
|---|---|
| [MODIFY] [`src/api.ts`](file:///c:/Users/gmodi/Documents/GitHub/millsaathi/src/api.ts) | ~12 new endpoints for chain CRUD + chain run execution + chain mass balance |
| [MODIFY] [`src/index.ts`](file:///c:/Users/gmodi/Documents/GitHub/millsaathi/src/index.ts) | Seed default chain on signup |

### Frontend
| File | Change |
|---|---|
| [MODIFY] [`public/assets/dashboard.js`](file:///c:/Users/gmodi/Documents/GitHub/millsaathi/public/assets/dashboard.js) | Chain view UI, chain stepper, chain mass balance, chain run management |
| [MODIFY] [`public/assets/dashboard.css`](file:///c:/Users/gmodi/Documents/GitHub/millsaathi/public/assets/dashboard.css) | Styles for chain UI components |

### Documentation
| File | Change |
|---|---|
| [MODIFY] [`docs/ARCHITECTURE.md`](file:///c:/Users/gmodi/Documents/GitHub/millsaathi/docs/ARCHITECTURE.md) | Document chain architecture |
| [MODIFY] [`db/seed-demo.sql`](file:///c:/Users/gmodi/Documents/GitHub/millsaathi/db/seed-demo.sql) | Add demo chain data |

---

## Open Questions

> [!IMPORTANT]
> **Chain rigidity vs flexibility.** Should mills be forced to execute chain steps in order, or should they be able to skip steps / execute out of order? My recommendation is **in-order by default with optional steps** (the `optional` flag on `processing_chain_steps`), but I'd like your input.

> [!IMPORTANT]
> **Chain branching.** Rice milling is mostly linear, but some mills split material mid-chain (e.g., after hulling, some goes to parboiling and some to raw whitening). Should we support branching in V1, or keep chains strictly linear and handle branches as separate chains? My recommendation: **linear chains in V1**, with a "fork" feature planned for V2.

> [!IMPORTANT]
> **Legacy `production_runs` table.** Should we deprecate it now and migrate all dashboard mass balance to use `process_run_lines`, or keep both running in parallel? My recommendation: **parallel in V1** — the generic mass balance from `process_run_lines` takes priority when data exists, but the legacy path remains as a fallback for mills that haven't adopted the processing workspace yet.

> [!IMPORTANT]
> **Monolith concern.** [`api.ts`](file:///c:/Users/gmodi/Documents/GitHub/millsaathi/src/api.ts) is already 1826 lines and 147KB. Adding ~12 more endpoints will push it further. Should we split the API into domain-specific modules (e.g., `src/api/processing.ts`, `src/api/gate.ts`, etc.) as part of this work, or defer that refactor? My recommendation: **split now** — it's the right time and prevents the file from becoming unmaintainable. We can use Hono's `app.route()` pattern.

---

## Verification Plan

### Automated Tests
```bash
npm run check                      # TypeScript compilation
npm run db:migrate:local           # Migration applies cleanly
npm run db:seed:local              # Seed includes chain data
npm run test:smoke                 # Existing smoke tests pass
```

### Manual Verification
1. **Signup flow** — New mill gets default chain with 6 steps
2. **Chain CRUD** — Create, edit steps, delete, restore chain definitions
3. **Chain execution** — Start a chain run, advance through each step, verify:
   - Output lots from step N appear as available inputs for step N+1
   - Stock movements are correctly created at each step
   - Chain-level mass balance updates after each step
4. **Void chain** — Void a completed chain, verify all constituent runs are reversed
5. **Backward compatibility** — Standalone process runs (no chain) continue working unchanged
6. **Dashboard** — Chain progress widget appears, mass balance uses modern path when available
7. **Demo mill** — `/demo` continues working with seeded chain data
