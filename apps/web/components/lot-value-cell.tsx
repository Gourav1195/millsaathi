'use client';

import { TableCellDetail } from './table-cell-detail';
import { formatRupee } from '../lib/format';
import {
  lotValueBreakdownRows,
  lotValueHasBreakdown,
  type GateIntakeLineRef,
  type LotValueContext,
} from '../lib/lot-value-breakdown';

export function LotValueCell({
  lot,
  intakeByGate,
}: {
  lot: LotValueContext;
  intakeByGate: Map<string, GateIntakeLineRef[]>;
}) {
  const rows = lotValueBreakdownRows(lot, intakeByGate);
  const showInfo = lotValueHasBreakdown(lot, intakeByGate) && rows.length > 0;
  const title = lot.gate_entry_id
    ? `Truck value breakdown${lot.gate_token_no ? ` · ${lot.gate_token_no}` : ''}`
    : lot.sauda_id
      ? 'Sauda value breakdown'
      : 'Stock value breakdown';

  return (
    <span className="lot-value-cell">
      <strong>{formatRupee(lot.value_paise)}</strong>
      {showInfo ? (
        <TableCellDetail title={title} rows={rows}>
          <button type="button" className="lot-value-info" aria-label={title}>
            i
          </button>
        </TableCellDetail>
      ) : null}
    </span>
  );
}
