import { formatVehicleNumber } from '../../../shared/vehicle-number';
import { formatQtl, formatRupee } from '../lib/format';

export type SaudaLotEntry = {
  id: string;
  code?: string;
  qty_kg?: number;
  value_paise?: number;
  godown_name?: string;
  in_date?: string;
  gate_token_no?: string | null;
  gate_vehicle_no?: string | null;
  note?: string | null;
};

function lotSource(entry: SaudaLotEntry) {
  if (entry.gate_token_no) {
    const vehicle = formatVehicleNumber(entry.gate_vehicle_no);
    return vehicle ? `Truck ${entry.gate_token_no} · ${vehicle}` : `Truck ${entry.gate_token_no}`;
  }
  return 'Manual receipt';
}

export function SaudaLotTable({ lots, showMoney = false }: { lots: SaudaLotEntry[]; showMoney?: boolean }) {
  if (!lots.length) return null;

  return (
    <div className="sauda-truck-table-wrap">
      <p className="sauda-truck-table-title">Lots on this sauda</p>
      <table className="sauda-truck-table">
        <thead>
          <tr>
            <th>Lot</th>
            <th>Qty</th>
            {showMoney ? <th>Value</th> : null}
            <th>Godown</th>
            <th>Source</th>
            <th>Date</th>
            <th>Note</th>
          </tr>
        </thead>
        <tbody>
          {lots.map((entry) => (
            <tr key={entry.id}>
              <td><strong>{entry.code ?? entry.id.slice(0, 8)}</strong></td>
              <td><strong>{formatQtl(entry.qty_kg)}</strong></td>
              {showMoney ? <td>{formatRupee(entry.value_paise)}</td> : null}
              <td>{entry.godown_name ?? '—'}</td>
              <td>{lotSource(entry)}</td>
              <td>{entry.in_date ?? '—'}</td>
              <td>{entry.note?.trim() || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
