'use client';

import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { Button, DataTable, Select, TableCard } from './ui';

type Movement = {
  id: string; movement_date: string; direction: string; quantity_base: number; base_unit: string;
  status: string; source_type: string; source_id: string | null; source_label: string;
  balance_base: number; item_name: string; godown_name: string | null; lot_code: string | null;
  sauda_code: string | null; token_no: string | null;
};

export function StockLedger({ items }: { items: { id: string; name: string }[] }) {
  const [itemId, setItemId] = useState('');
  const [page, setPage] = useState(0);
  const [data, setData] = useState<{ movements: Movement[]; has_more: boolean } | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let cancelled = false;
    setData(null);
    setError('');
    api<{ movements: Movement[]; has_more: boolean }>(`/api/stock-ledger?item_id=${encodeURIComponent(itemId)}&offset=${page * 50}`)
      .then((body) => { if (!cancelled) setData(body); })
      .catch((cause) => { if (!cancelled) setError(cause instanceof Error ? cause.message : 'Could not load ledger'); });
    return () => { cancelled = true; };
  }, [itemId, page, items]);
  return <TableCard title="Stock ledger" subtitle="Receipts, processing consumption and adjustments. Balance is per material across all godowns; voided entries have no effect."
    actions={<Select aria-label="Ledger material" value={itemId} onChange={(event) => { setItemId(event.target.value); setPage(0); }}>
      <option value="">All materials</option>{items.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
    </Select>}>
    {error && <p role="alert">{error}</p>}
    <DataTable columns={[{ id: 'date', label: 'Date' }, { id: 'material', label: 'Material / lot' }, { id: 'source', label: 'Source' }, { id: 'godown', label: 'Godown' }, { id: 'in', label: 'Added' }, { id: 'out', label: 'Reduced' }, { id: 'balance', label: 'Balance' }]}>
      {data?.movements.map((row) => <tr key={row.id}>
        <td>{row.movement_date}<small>{row.status === 'VOID' ? 'Voided' : ''}</small></td>
        <td>{row.item_name}<small>{row.lot_code}</small></td>
        <td>{row.source_type === 'PROCESS_RUN' ? `Processing · ${row.source_label}` : row.source_type}<small>{[row.sauda_code, row.token_no].filter(Boolean).join(' · ')}</small><small>{row.source_id}</small></td>
        <td>{row.godown_name ?? '—'}</td>
        <td>{row.direction !== 'OUT' ? `${row.quantity_base.toLocaleString('en-IN')} ${row.base_unit}` : '—'}</td>
        <td>{row.direction === 'OUT' ? `${row.quantity_base.toLocaleString('en-IN')} ${row.base_unit}` : '—'}</td>
        <td>{row.balance_base.toLocaleString('en-IN')} {row.base_unit}</td>
      </tr>)}
      {!data?.movements.length && <tr><td colSpan={7}>{data ? 'No stock movements.' : error ? 'Ledger unavailable.' : 'Loading ledger…'}</td></tr>}
    </DataTable>
    <div className="table-actions"><Button className="secondary" disabled={!page || !data} onClick={() => setPage((current) => current - 1)}>Previous</Button><span>Page {page + 1}</span><Button className="secondary" disabled={!data?.has_more} onClick={() => setPage((current) => current + 1)}>Next</Button></div>
  </TableCard>;
}
