import { formatVehicleNumber } from '../../../shared/vehicle-number';

export type SaudaTruckEntry = {
  id: string;
  token_no?: string;
  vehicle_no?: string;
  gross_kg?: number | null;
  tare_kg?: number | null;
  net_kg?: number;
  observed_bag_count?: number | null;
  moisture_pct?: number | null;
  status?: string;
  stock_status?: string;
  entry_date?: string;
};

const qtl = (kg?: number | null) => `${((kg ?? 0) / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })} qtl`;

export function SaudaTruckTable({ trucks }: { trucks: SaudaTruckEntry[] }) {
  if (!trucks.length) return null;

  return (
    <div className="sauda-truck-table-wrap">
      <p className="sauda-truck-table-title">Trucks on this sauda</p>
      <table className="sauda-truck-table">
        <thead>
          <tr>
            <th>Token</th>
            <th>Vehicle</th>
            <th>Gross</th>
            <th>Tare</th>
            <th>Net</th>
            <th>Bags</th>
            <th>Moisture</th>
            <th>Status</th>
            <th>Stock</th>
            <th>Date</th>
          </tr>
        </thead>
        <tbody>
          {trucks.map((truck) => (
            <tr key={truck.id}>
              <td>{truck.token_no ?? '—'}</td>
              <td><strong>{formatVehicleNumber(truck.vehicle_no) || '—'}</strong></td>
              <td>{truck.gross_kg ?? '—'}</td>
              <td>{truck.tare_kg ?? '—'}</td>
              <td><strong>{qtl(truck.net_kg)}</strong></td>
              <td>{truck.observed_bag_count ?? '—'}</td>
              <td>{truck.moisture_pct != null ? `${truck.moisture_pct}%` : '—'}</td>
              <td>{truck.status ?? '—'}</td>
              <td>{truck.stock_status ?? '—'}</td>
              <td>{truck.entry_date ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
