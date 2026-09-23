# Legacy UI migration design QA

- source target: `work/ui-comparison/legacy-processing.png` (`http://127.0.0.1:8787/legacy-app`)
- implementation screenshot: `work/ui-comparison/react-processing-verified.png` (`http://localhost:3000/app`)
- viewport: 1280 × 720
- checked flow: authenticated Processing page, empty input and output state

## Visual comparison

The React route now shares the legacy shell dimensions, dark navigation, white processing header, route order and divider, process chips, three-column processing workspace, material-card density, dashed process well, output CTA, and mass-balance/posting strip. The source and implementation use the same demo data source but quantities can differ as inventory changes.

## Interaction checks

- Navigation links render with legacy route labels and active state.
- Process chips remain selectable.
- Lot cards can still be selected or dragged into the process well.
- Destination godown selector and post-run guard remain available.
- `npm run check:web`, `npm run build:web`, and `git diff --check` pass.

final result: passed
