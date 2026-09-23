export type SpreadsheetRow = Record<string, string>;

function normalizeHeader(header: string) {
  return header.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

export function parseCsv(text: string): SpreadsheetRow[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];
    if (ch === '"' && quoted && next === '"') {
      cell += '"';
      i++;
    } else if (ch === '"') {
      quoted = !quoted;
    } else if (ch === ',' && !quoted) {
      row.push(cell.trim());
      cell = '';
    } else if ((ch === '\n' || ch === '\r') && !quoted) {
      if (ch === '\r' && next === '\n') i++;
      row.push(cell.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += ch;
    }
  }

  row.push(cell.trim());
  if (row.some(Boolean)) rows.push(row);
  if (!rows.length) return [];

  const headers = rows.shift()!.map(normalizeHeader);
  return rows.map((values) => {
    const out: SpreadsheetRow = {};
    headers.forEach((header, index) => {
      out[header] = values[index] || '';
    });
    return out;
  });
}

function zipU16(view: DataView, offset: number) {
  return view.getUint16(offset, true);
}

function zipU32(view: DataView, offset: number) {
  return view.getUint32(offset, true);
}

async function unzipXlsx(buffer: ArrayBuffer): Promise<Record<string, string>> {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  let eocd = -1;

  for (let i = Math.max(0, bytes.length - 65557); i <= bytes.length - 22; i++) {
    if (zipU32(view, i) === 0x06054b50) eocd = i;
  }
  if (eocd < 0) throw new Error('This XLSX file is not a valid ZIP workbook.');

  const count = zipU16(view, eocd + 10);
  const centralOffset = zipU32(view, eocd + 16);
  if (!count || count > 100 || centralOffset >= bytes.length) {
    throw new Error('This XLSX file has an unsupported structure.');
  }

  const files: Record<string, string> = {};
  for (let pos = centralOffset, n = 0; n < count; n++) {
    if (zipU32(view, pos) !== 0x02014b50) throw new Error('This XLSX file has an invalid directory.');
    const method = zipU16(view, pos + 10);
    const compressed = zipU32(view, pos + 20);
    const uncompressed = zipU32(view, pos + 24);
    const nameLength = zipU16(view, pos + 28);
    const extraLength = zipU16(view, pos + 30);
    const commentLength = zipU16(view, pos + 32);
    const localOffset = zipU32(view, pos + 42);
    const name = new TextDecoder().decode(bytes.slice(pos + 46, pos + 46 + nameLength));
    if (uncompressed > 8 * 1024 * 1024 || compressed > bytes.length || localOffset >= bytes.length) {
      throw new Error('This XLSX file exceeds the safe import limits.');
    }
    const localNameLength = zipU16(view, localOffset + 26);
    const localExtraLength = zipU16(view, localOffset + 28);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const compressedData = bytes.slice(dataStart, dataStart + compressed);
    let data: Uint8Array;
    if (method === 0) data = compressedData;
    else if (method === 8 && typeof DecompressionStream === 'function') {
      data = new Uint8Array(
        await new Response(
          new Blob([compressedData]).stream().pipeThrough(new DecompressionStream('deflate-raw')),
        ).arrayBuffer(),
      );
    } else {
      throw new Error('This XLSX file uses an unsupported compression method.');
    }
    files[name] = new TextDecoder().decode(data);
    pos += 46 + nameLength + extraLength + commentLength;
  }
  return files;
}

function xlsxColumn(ref: string | null) {
  if (!ref) return 0;
  const letters = ref.replace(/\d+/g, '');
  let value = 0;
  for (let i = 0; i < letters.length; i++) value = value * 26 + (letters.charCodeAt(i) - 64);
  return value - 1;
}

function xlsxText(node: Element | null | undefined) {
  if (!node) return '';
  return Array.from(node.getElementsByTagName('t')).map((child) => child.textContent ?? '').join('');
}

export async function parseXlsx(buffer: ArrayBuffer): Promise<SpreadsheetRow[]> {
  const files = await unzipXlsx(buffer);
  const sheet = files['xl/worksheets/sheet1.xml'];
  if (!sheet) throw new Error('The XLSX workbook does not contain a first worksheet.');

  const shared: string[] = [];
  if (files['xl/sharedStrings.xml']) {
    const sharedDoc = new DOMParser().parseFromString(files['xl/sharedStrings.xml'], 'application/xml');
    Array.from(sharedDoc.getElementsByTagName('si')).forEach((node) => shared.push(xlsxText(node)));
  }

  const doc = new DOMParser().parseFromString(sheet, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) {
    throw new Error('The XLSX worksheet could not be read.');
  }

  const rows: string[][] = [];
  Array.from(doc.getElementsByTagName('row')).forEach((rowNode) => {
    const cellsByColumn: Record<number, string> = {};
    Array.from(rowNode.getElementsByTagName('c')).forEach((cell) => {
      const col = xlsxColumn(cell.getAttribute('r'));
      const valueNode = cell.getElementsByTagName('v')[0];
      let value = valueNode ? xlsxText(valueNode) : '';
      if (cell.getAttribute('t') === 's') value = shared[Number(value)] || '';
      else if (cell.getAttribute('t') === 'inlineStr') value = xlsxText(cell.getElementsByTagName('is')[0]);
      cellsByColumn[col] = value;
    });
    const max = Object.keys(cellsByColumn).reduce((m, key) => Math.max(m, Number(key)), -1);
    const cells: string[] = [];
    for (let col = 0; col <= max; col++) cells.push(cellsByColumn[col] || '');
    if (cells.some(Boolean)) rows.push(cells);
  });

  if (!rows.length) return [];
  const headers = rows.shift()!.map(normalizeHeader);
  return rows.slice(0, 1000).map((values) => {
    const out: SpreadsheetRow = {};
    headers.forEach((header, index) => {
      out[header] = values[index] || '';
    });
    return out;
  });
}

export async function parseSpreadsheetFile(file: File): Promise<SpreadsheetRow[]> {
  if (file.size > 2 * 1024 * 1024) throw new Error('Choose a CSV or XLSX file up to 2 MB.');
  const isXlsx = /\.xlsx$/i.test(file.name);
  const buffer = await file.arrayBuffer();
  if (isXlsx && new Uint8Array(buffer)[0] !== 80) throw new Error('The selected XLSX file is invalid.');
  return isXlsx ? parseXlsx(buffer) : parseCsv(new TextDecoder().decode(buffer));
}

export function mapPartyImportRows(kind: 'supplier' | 'buyer', rows: SpreadsheetRow[]) {
  const targets = kind === 'supplier'
    ? ['name', 'type', 'place', 'phone', 'email', 'gstin', 'address']
    : ['name', 'type', 'location', 'phone', 'email', 'gstin', 'address'];
  const aliases: Record<string, string[]> = {
    name: ['name', 'party_name', 'supplier_name', 'buyer_name', 'customer_name', 'vendor_name'],
    type: ['type', 'party_type', 'category', 'kind'],
    place: ['place', 'location', 'city', 'district', 'town'],
    location: ['location', 'place', 'city', 'district', 'town'],
    phone: ['phone', 'mobile', 'mobile_no', 'phone_number', 'contact', 'contact_number'],
    email: ['email', 'email_address', 'mail'],
    gstin: ['gstin', 'gst', 'gst_no', 'gst_number', 'tax_id'],
    address: ['address', 'postal_address', 'full_address'],
  };
  const headers: string[] = [];
  rows.forEach((row) => {
    Object.keys(row).forEach((key) => {
      if (!headers.includes(key)) headers.push(key);
    });
  });
  const mapping: Record<string, string> = {};
  targets.forEach((target) => {
    const candidates = aliases[target] || [target];
    mapping[target] = candidates.find((candidate) => headers.includes(candidate)) || '';
  });
  return {
    rows: rows.map((row) => {
      const mapped: SpreadsheetRow = {};
      targets.forEach((target) => {
        if (mapping[target]) mapped[target] = row[mapping[target]] || '';
      });
      return mapped;
    }),
    summary: targets
      .filter((target) => mapping[target])
      .map((target) => `${mapping[target]} → ${target}`),
  };
}

export function mapSaudaImportRows(rows: SpreadsheetRow[]) {
  const aliases: Record<string, string[]> = {
    direction: ['direction', 'type'],
    party: ['party', 'supplier', 'buyer', 'party_name'],
    item: ['item', 'material', 'item_name'],
    quantity: ['quantity', 'qty'],
    unit: ['unit'],
    rate: ['rate', 'rate_qtl', 'rate_qtl_'],
    broker: ['broker', 'broker_name'],
    moisture_pct: ['moisture_pct', 'moisture'],
    agreement_date: ['agreement_date', 'date'],
    delivery_start: ['delivery_start'],
    delivery_end: ['delivery_end'],
    delivery_tolerance_pct: ['delivery_tolerance_pct', 'tolerance_pct'],
    commission_type: ['commission_type'],
    commission_value: ['commission_value', 'fixed_commission', 'fixed_commission_'],
    advance: ['advance', 'advance_rs'],
    note: ['note', 'terms'],
  };
  const keys: string[] = [];
  rows.forEach((row) => {
    Object.keys(row).forEach((key) => {
      if (!keys.includes(key)) keys.push(key);
    });
  });
  const mapping: Record<string, string> = {};
  Object.keys(aliases).forEach((target) => {
    mapping[target] = aliases[target].find((candidate) => keys.includes(candidate)) || '';
  });
  return {
    rows: rows.map((row) => {
      const out: SpreadsheetRow = {};
      Object.keys(mapping).forEach((target) => {
        if (mapping[target]) out[target] = row[mapping[target]] || '';
      });
      return out;
    }),
    summary: Object.keys(mapping)
      .filter((target) => mapping[target])
      .map((target) => `${mapping[target]} → ${target}`),
  };
}
