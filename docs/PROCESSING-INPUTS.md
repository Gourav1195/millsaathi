# Classic processing input

Choose stock from the materials panel before creating a draft. Drag a grouped card to
the input area before step one to select its lots, or expand the group and select
individual godown lots. Each selected lot has an editable quantity and projected
remaining balance. All selected lots must contain the same accepted material.

Save input draft persists lot IDs and integer kilogram quantities on the chain run.
Reopen it from Recent chain runs or History. Drafts and starting a run do not reserve
or deduct inventory: availability is checked again when posting. Post step records
consumption, stock movements and the remaining lot quantity together. Actual main
output feeds the next step. Subsequent steps may select only the previous step's
output lots. Voiding restores consumed quantities and marks ledger movements void.

Stock & Lots includes a paginated Stock ledger with material, lot, godown, source,
purchase/truck references, additions, reductions and a running material balance.
Voided entries remain visible but do not count toward that balance.

Migration 0029 adds saved input selections and database guards against negative lot
stock and duplicate posted chain steps. Apply after 0028 before serving the updated
API. Local verification: `npm run test:processing-input`,
`node scripts/processing-flow-tests.mjs` (requires the local API on port 8787 and
creates isolated regression tenants), `npm run check:all`, `npm run build:web`.
