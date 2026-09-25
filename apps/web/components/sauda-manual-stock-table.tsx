import { formatQtl } from '../lib/format';

export type SaudaManualStockEntry = {
  id: string;
  code?: string;
  qty_kg?: number;
  godown_name?: string;
  in_date?: string;
  note?: string | null;
};

export function SaudaManualStockTable({ entries }: { entries: SaudaManualStockEntry[] }) {
  if (!entries.length) return null;

  return (
    <div className="sauda-truck-table-wrap">
      <p className="sauda-truck-table-title">Manual stock receipts</p>
      <table className="sauda-truck-table">
        <thead>
          <tr>
            <th>Lot</th>
            <th>Qty</th>
            <th>Godown</th>
            <th>Date</th>
            <th>Note</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => (
            <tr key={entry.id}>
              <td><strong>{entry.code ?? entry.id.slice(0, 8)}</strong></td>
              <td><strong>{formatQtl(entry.qty_kg)}</strong></td>
              <td>{entry.godown_name ?? '—'}</td>
              <td>{entry.in_date ?? '—'}</td>
              <td>{entry.note?.trim() || 'Manual stock receipt'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
