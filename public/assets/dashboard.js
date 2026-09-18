/* MillSaathi dashboard SPA. Runs in two modes:
   - demo: window.MS_MODE==='demo' — uses window.DEMO_OVERVIEW, role switcher enabled, no writes.
   - live: fetches /api/overview, actions enabled, role comes from the session. */
(function () {
  'use strict';

  var MODE = window.MS_MODE || 'live';
  var SUPPORT_ADMIN_EMAIL = 'gouravmodi1195@gmail.com';
  var AUTH_CONFIG = null;
  var TURNSTILE_SCRIPT = null;
  var requestedPage = new URLSearchParams(location.search).get('page');
  var initialPage = ['dashboard', 'gate', 'purchase', 'stock', 'suppliers', 'buyers', 'items', 'processing', 'team', 'documents', 'digest', 'bugs'].indexOf(requestedPage) >= 0 ? requestedPage : 'dashboard';
  var S = { page: initialPage, role: 'owner', q: '', filters: {}, focusSearch: false, period: 'daily', ov: null, bugs: null, bugsError: '', processTypes: null, processRuns: null, processWorkspace: null, processDraft: null, team: null, documents: null, payments: null, pageIndex: {} };

  // ---------- helpers ----------
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function toast(message, kind) {
    var host = document.getElementById('ms-toasts');
    if (!host) { host = document.createElement('div'); host.id = 'ms-toasts'; host.className = 'ms-toasts'; document.body.appendChild(host); }
    var item = document.createElement('div'); item.className = 'ms-toast ' + (kind || 'info'); item.textContent = message; host.appendChild(item);
    setTimeout(function () { item.classList.add('leaving'); setTimeout(function () { item.remove(); }, 220); }, 3600);
  }
  function qtl(kg, dec) {
    if (kg == null) return '—';
    return (kg / 100).toLocaleString('en-IN', { maximumFractionDigits: dec == null ? 0 : dec });
  }
  function balanceQtl(kg) { return qtl(kg, Math.abs(Number(kg) || 0) < 10000 ? 2 : 0); }
  function incomingToday(k) { return k.incoming_today_kg != null ? k.incoming_today_kg : (k.paddy_in_today_kg || 0); }
  function outgoingToday(k) { return k.outgoing_today_kg != null ? k.outgoing_today_kg : (k.rice_out_today_kg || 0); }
  function qualityValue(row, key) { if (!row || !row.quality_json) return ''; try { return JSON.parse(row.quality_json)[key] || ''; } catch (_) { return ''; } }
  function kgFmt(kg) { return kg == null ? '—' : Number(kg).toLocaleString('en-IN') + ' kg'; }
  function lotQty(lot) {
    if (lot && lot.entered_quantity != null && lot.entered_unit) return Number(lot.entered_quantity).toLocaleString('en-IN', { maximumFractionDigits: 3 }) + ' ' + String(lot.entered_unit).toLowerCase();
    return lot ? qtl(lot.qty_kg) + ' qtl' : '—';
  }
  function saudaQty(sauda) {
    if (sauda && sauda.agreed_quantity != null && sauda.agreed_unit) return Number(sauda.agreed_quantity).toLocaleString('en-IN', { maximumFractionDigits: 3 }) + ' ' + String(sauda.agreed_unit).toLowerCase();
    return sauda ? qtl(sauda.qty_kg) + ' qtl' : '—';
  }
  function money(paise) {
    if (paise == null) return '—';
    var r = paise / 100;
    if (Math.abs(r) >= 1e7) return '₹' + (r / 1e7).toFixed(2) + ' Cr';
    if (Math.abs(r) >= 1e5) return '₹' + (r / 1e5).toFixed(1) + ' L';
    return '₹' + r.toLocaleString('en-IN', { maximumFractionDigits: 0 });
  }
  function rate(paisePerQtl) { return paisePerQtl == null ? '—' : '₹' + Math.round(paisePerQtl / 100).toLocaleString('en-IN'); }
  function pct(v) { return v == null ? '—' : v.toFixed(1) + '%'; }
  function initials(n) {
    return String(n || '').split(/[\s.]+/).filter(Boolean).slice(0, 2).map(function (w) { return w[0]; }).join('').toUpperCase();
  }
  function ago(iso) {
    if (!iso) return '—';
    var d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
    return d <= 0 ? 'Today' : d === 1 ? 'Yesterday' : d + ' days';
  }
  function dstr(iso) {
    if (!iso) return '—';
    return new Date(iso + (iso.length === 10 ? 'T00:00:00' : '')).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
  }

  var ST = {
    at_gate: ['At gate', '#EEF1F5', '#475467'], weighing: ['Weighing', '#FEF3D6', '#8A6A16'],
    in_lab: ['In lab', '#E7EEF8', '#2A5CA8'], weighed: ['Weighed', '#E6F0E9', '#256238'],
    unloading: ['Unloading', '#FEF3D6', '#8A6A16'], done: ['Done', '#E6F0E9', '#256238'],
    open: ['Open', '#FEF3D6', '#8A6A16'], settled: ['Settled', '#E6F0E9', '#256238'],
    advance_paid: ['Advance paid', '#E7EEF8', '#2A5CA8'], disputed: ['Disputed', '#FBEDE7', '#8F2E12'],
    bug: ['Bug', '#FBEDE7', '#8F2E12'], help: ['Help', '#E7EEF8', '#2A5CA8'], feature: ['Feature', '#FEF3D6', '#8A6A16'],
    reviewed: ['Reviewed', '#E7EEF8', '#2A5CA8'], closed: ['Closed', '#E6F0E9', '#256238'],
  };
  function pill(status) {
    var m = ST[status] || [status, '#EEF1F5', '#475467'];
    return '<span class="pill" style="background:' + m[1] + ';color:' + m[2] + '">' + esc(m[0]) + '</span>';
  }
  var CAT = { paddy: ['Paddy', '#FEF3D6', '#8A6A16'], rice: ['Rice', '#E6F0E9', '#256238'], byproduct: ['By-product', '#EEF1F5', '#475467'] };
  var SUPTYPE = { farmer: ['Farmer', '#E6F0E9', '#256238'], trader: ['Trader', '#E7EEF8', '#2A5CA8'], broker: ['Broker', '#FEF3D6', '#8A6A16'] };

  function canMoney() { return S.role !== 'manager'; }
  function can(permission) { return MODE === 'live' && S.ov && S.ov.me && (S.ov.me.permissions || []).indexOf(permission) >= 0; }
  function canFinance() { return MODE === 'live' && ['owner', 'admin', 'accountant'].indexOf(S.role) >= 0; }
  function net(g) {
    if (g.gross_kg == null || g.tare_kg == null) return 0;
    return Math.max(0, g.gross_kg - g.tare_kg);
  }
  function filtersFor(page) { return S.filters[page] || {}; }
  function quantityFor(row) {
    if (S.page === 'gate') return net(row) / 100;
    if (S.page === 'purchase') return Number(row.qty_kg || 0) / 100;
    if (S.page === 'stock') return Number(row.qty_kg || 0) / 100;
    if (S.page === 'suppliers') return Number(row.supplied_kg || 0) / 100;
    if (S.page === 'buyers') return Number(row.bought_kg || 0) / 100;
    if (S.page === 'items') return Number(row.stock_kg || 0) / 100;
    return null;
  }
  function optionsFrom(rows, key, label, transform) {
    var values = rows.map(function (row) { return transform ? transform(row) : row[key]; }).filter(Boolean).map(String).filter(function (value, index, list) { return list.indexOf(value) === index; }).sort();
    var selected = filtersFor(S.page)[key] || '';
    return '<select class="table-filter" data-filter-key="' + esc(key) + '"><option value="">All ' + esc(label) + '</option>' + values.map(function (value) { return '<option value="' + esc(value) + '"' + (selected === value ? ' selected' : '') + '>' + esc(value) + '</option>'; }).join('') + '</select>';
  }
  function filterToolbar(rows, kind) {
    var page = S.page, f = filtersFor(page), fields = '';
    if (page === 'gate') fields = optionsFrom(rows, 'direction', 'directions') + optionsFrom(rows, 'status', 'statuses', function (r) { return String(r.status || '').toLowerCase(); });
    else if (page === 'purchase') fields = optionsFrom(rows, 'direction', 'directions') + optionsFrom(rows, 'status', 'statuses', function (r) { return String(r.status || '').toLowerCase(); }) + optionsFrom(rows, 'item_name', 'materials');
    else if (page === 'stock') fields = optionsFrom(rows, 'godown_name', 'godowns') + optionsFrom(rows, 'item_name', 'materials');
    else if (page === 'suppliers' || page === 'buyers') fields = optionsFrom(rows, 'type', 'types') + optionsFrom(rows, 'location', 'locations', function (r) { return page === 'suppliers' ? r.place : r.location; });
    else if (page === 'items') fields = optionsFrom(rows, 'category', 'categories', function (r) { return r.category_code || r.category; });
    else if (page === 'documents') fields = optionsFrom(rows, 'status', 'statuses', function (r) { return String(r.status || '').toLowerCase(); }) + optionsFrom(rows, 'document_type', 'types');
    var quantity = ['gate', 'purchase', 'stock', 'suppliers', 'buyers', 'items'].indexOf(page) >= 0;
    var dates = page === 'documents';
    return '<div class="table-filters"><div class="filter-title"><span>⌕</span><div><strong>Filter ' + esc(kind) + '</strong><small>Search and narrow the results</small></div></div><div class="filter-fields"><label class="filter-search"><span>⌕</span><input id="ms-q" placeholder="Search ' + esc(kind.toLowerCase()) + '…" value="' + esc(S.q) + '"></label>' + fields + (quantity ? '<label class="range-field"><span>Qty qtl</span><input class="table-filter" data-filter-key="min_qty" type="number" min="0" step="0.01" placeholder="Min" value="' + esc(f.min_qty || '') + '"><span>–</span><input class="table-filter" data-filter-key="max_qty" type="number" min="0" step="0.01" placeholder="Max" value="' + esc(f.max_qty || '') + '"></label>' : '') + (dates ? '<input class="table-filter" data-filter-key="from_date" type="date" value="' + esc(f.from_date || '') + '"><input class="table-filter" data-filter-key="to_date" type="date" value="' + esc(f.to_date || '') + '">' : '') + '<button class="clear-filters" data-act="filters-clear"' + ((!S.q && !Object.keys(f).length) ? ' disabled' : '') + '>Clear</button></div></div>';
  }
  function filt(rows) {
    var q = S.q.toLowerCase(), f = filtersFor(S.page);
    return rows.filter(function (r) {
      var qty = quantityFor(r), location = S.page === 'suppliers' ? r.place : r.location;
      var matchesSearch = !q || Object.keys(r).some(function (k) { return String(r[k] == null ? '' : r[k]).toLowerCase().indexOf(q) >= 0; });
      var matchesFields = (!f.direction || f.direction === r.direction) && (!f.status || f.status === String(r.status || '').toLowerCase()) && (!f.item_name || f.item_name === r.item_name) && (!f.godown_name || f.godown_name === r.godown_name) && (!f.type || f.type === r.type) && (!f.location || f.location === location) && (!f.category || f.category === (r.category_code || r.category)) && (!f.document_type || f.document_type === r.document_type);
      var matchesRange = (qty == null || (!f.min_qty || qty >= Number(f.min_qty)) && (!f.max_qty || qty <= Number(f.max_qty))) && (!f.from_date || String(r.issue_date || '') >= f.from_date) && (!f.to_date || String(r.issue_date || '') <= f.to_date);
      return matchesSearch && matchesFields && matchesRange;
    });
  }

  // ---------- data ----------
  function loadOverview() {
    if (MODE === 'demo') {
      S.ov = window.DEMO_OVERVIEW;
      S.role = S.role || 'owner';
      return Promise.resolve(true);
    }
    return fetch('/api/overview?range=' + encodeURIComponent(S.period)).then(function (r) {
      if (r.status === 401) return false;
      return r.json().then(function (ov) { S.ov = ov; S.role = ov.me.role; return true; });
    });
  }
  function apiPost(path, body, method) {
    return fetch(path, {
      method: method || 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }).then(function (r) {
      return r.json().then(function (j) {
        if (!r.ok) throw new Error(j.error || 'Request failed');
        return j;
      });
    });
  }
  function refresh() { return loadOverview().then(render); }

  var ITEM_FIELDS = [
    { name: 'name', label: 'Name', required: true },
    { name: 'category', label: 'Category', type: 'select', options: [{ value: 'paddy', label: 'Paddy / raw material' }, { value: 'rice', label: 'Rice / finished good' }, { value: 'byproduct', label: 'By-product' }, { value: 'packaging', label: 'Packaging' }, { value: 'consumable', label: 'Consumable' }, { value: 'other', label: 'Other' }] },
    { name: 'hsn', label: 'HSN', value: '1006' },
    { name: 'display_unit', label: 'Display unit', type: 'select', options: [{ value: 'KG', label: 'kg' }, { value: 'QUINTAL', label: 'quintal' }, { value: 'TONNE', label: 'tonne' }, { value: 'BAG', label: 'bag' }, { value: 'PIECE', label: 'piece' }] },
    { name: 'package_unit', label: 'Package unit (optional)', type: 'select', options: [{ value: '', label: '—' }, { value: 'BAG', label: 'bag' }, { value: 'PIECE', label: 'piece' }] },
    { name: 'package_quantity_base', label: 'Base kg per package (optional)', type: 'number', step: '0.001' },
    { name: 'typical_otr_pct', label: 'Typical OTR % (rice/by-products)', type: 'number', step: '1' },
  ];
  function partyFields(kind) {
    return [
      { name: 'name', label: 'Name', required: true },
      { name: 'type', label: 'Type', type: 'select', options: kind === 'supplier'
        ? [{ value: 'farmer', label: 'Farmer' }, { value: 'trader', label: 'Trader' }, { value: 'broker', label: 'Broker' }]
        : ['Wholesaler', 'Distributor', 'Retailer', 'Exporter', 'Bran buyer', 'Husk buyer'].map(function (v) { return { value: v, label: v }; }) },
      { name: kind === 'supplier' ? 'place' : 'location', label: kind === 'supplier' ? 'Village / Place' : 'Location' },
      { name: 'phone', label: 'Phone' },
      { name: 'email', label: 'Email', type: 'email' },
      { name: 'gstin', label: 'GSTIN (optional)' },
      { name: 'address', label: 'Address', type: 'textarea' },
    ];
  }
  function pageSlice(rows, key) {
    var size = 25, total = rows.length, pages = Math.max(1, Math.ceil(total / size));
    var index = Math.min(Math.max(0, S.pageIndex[key] || 0), pages - 1);
    S.pageIndex[key] = index;
    return { rows: rows.slice(index * size, (index + 1) * size), total: total, index: index, pages: pages };
  }
  function pager(page, key) {
    if (page.total <= 25) return '';
    return '<div class="pager"><span class="hint">Showing ' + (page.index * 25 + 1) + '–' + Math.min(page.total, (page.index + 1) * 25) + ' of ' + page.total + '</span><span class="pager-actions"><button class="btn sm" data-act="page-prev" data-page-key="' + esc(key) + '" ' + (page.index === 0 ? 'disabled' : '') + '>Previous</button><span class="hint">Page ' + (page.index + 1) + ' of ' + page.pages + '</span><button class="btn sm" data-act="page-next" data-page-key="' + esc(key) + '" ' + (page.index >= page.pages - 1 ? 'disabled' : '') + '>Next</button></span></div>';
  }
  function mountTurnstile(root) {
    if (!AUTH_CONFIG || !AUTH_CONFIG.turnstile_site_key) return;
    var mount = root.querySelector('#turnstile-widget');
    if (!mount || mount.dataset.rendered) return;
    function renderWidget() {
      if (!window.turnstile || mount.dataset.rendered) return;
      mount.dataset.rendered = '1';
      window.turnstile.render(mount, { sitekey: AUTH_CONFIG.turnstile_site_key, callback: function (token) { mount.dataset.token = token; }, 'expired-callback': function () { mount.dataset.token = ''; } });
    }
    if (window.turnstile) return renderWidget();
    if (!TURNSTILE_SCRIPT) {
      TURNSTILE_SCRIPT = document.createElement('script');
      TURNSTILE_SCRIPT.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      TURNSTILE_SCRIPT.async = true; TURNSTILE_SCRIPT.defer = true;
      TURNSTILE_SCRIPT.onload = renderWidget;
      document.head.appendChild(TURNSTILE_SCRIPT);
    } else TURNSTILE_SCRIPT.addEventListener('load', renderWidget, { once: true });
  }
  function loadAuthConfig(root) {
    if (AUTH_CONFIG !== null || MODE === 'demo') return;
    fetch('/api/auth/config').then(function (r) { return r.json(); }).then(function (config) {
      AUTH_CONFIG = config || {};
      if (document.getElementById('ms-root') === root && !root.querySelector('#turnstile-widget')) renderLogin(root);
    }).catch(function () { AUTH_CONFIG = {}; });
  }
  function godownFields() {
    return [
      { name: 'name', label: 'Name', required: true },
      { name: 'capacity_qty', label: 'Capacity quantity (optional)', type: 'number', step: '0.001' },
      { name: 'capacity_unit', label: 'Capacity unit', type: 'select', options: [{ value: 'QUINTAL', label: 'quintal' }, { value: 'KG', label: 'kg' }, { value: 'TONNE', label: 'tonne' }, { value: 'BAG', label: 'bag' }, { value: 'PIECE', label: 'piece' }] },
    ];
  }
  function fieldValues(fields, values) {
    return fields.map(function (field) {
      var copy = Object.assign({}, field);
      if (values[field.name] != null) copy.value = values[field.name];
      return copy;
    });
  }
  function masterFormFields(master, row) {
    if (master === 'suppliers') return fieldValues(partyFields('supplier'), row);
    if (master === 'buyers') return fieldValues(partyFields('buyer'), row);
    if (master === 'items') {
      var categories = { RAW_MATERIAL: 'paddy', FINISHED_GOOD: 'rice', BYPRODUCT: 'byproduct', PACKAGING: 'packaging', CONSUMABLE: 'consumable', OTHER: 'other' };
      return fieldValues(ITEM_FIELDS, Object.assign({}, row, { category: categories[row.category_code] || row.category || 'other', display_unit: row.display_unit || row.unit || 'QUINTAL' }));
    }
    return fieldValues(godownFields(), row);
  }
  function masterLabel(master) { return master === 'suppliers' ? 'supplier' : master === 'buyers' ? 'buyer' : master === 'items' ? 'item' : 'godown'; }
  function quickAddFields(f) {
    if (f.quickAdd === 'suppliers') return partyFields('supplier');
    if (f.quickAdd === 'buyers') return partyFields('buyer');
    if (f.quickAdd === 'items') return ITEM_FIELDS;
    if (f.quickAdd === 'godowns') return godownFields();
    return [{ name: 'name', label: 'Name', required: true }];
  }
  function quickAddTitle(f) {
    return f.quickAdd === 'suppliers' ? 'Add supplier' : f.quickAdd === 'buyers' ? 'Add buyer' : f.quickAdd === 'items' ? 'Add item' : 'Add godown';
  }

  // ---------- modal forms ----------
  function modal(title, fields, submitLabel, onSubmit, options) {
    options = options || {};
    var old = document.getElementById('ms-modal');
    if (old && !options.keepExisting) old.remove();
    var dlg = document.createElement('dialog');
    dlg.className = 'modal'; dlg.id = options.id || 'ms-modal';
    function renderField(f) {
      var simpleProcessOptional = title === 'New process run' && ['source_lot', 'input_item_2', 'input_lot_2', 'input_qty_2', 'input_unit_2', 'output_item_2', 'output_qty_2', 'output_unit_2', 'destination_godown', 'byproduct_item', 'byproduct_qty', 'byproduct_unit', 'loss_item', 'loss_qty', 'loss_unit'].indexOf(f.name) >= 0;
      var when = (f.when ? ' data-when="' + esc(f.when) + '"' : '') + (f.advanced || simpleProcessOptional ? ' data-advanced="1"' : '');
      if (f.type === 'select') {
        var opts = f.quickAdd ? f.options.concat([{ value: '__add:' + f.quickAdd, label: '+ Add new ' + f.quickAddLabel }]) : f.options;
        var preferred = title === 'New process run' && ['input_unit', 'output_unit', 'input_unit_2', 'output_unit_2', 'byproduct_unit', 'loss_unit'].indexOf(f.name) >= 0 ? ((S.ov && S.ov.me && S.ov.me.preferred_unit) || 'QUINTAL') : '';
        var selectedValue = f.value == null ? preferred : f.value;
        return '<div class="fld"' + when + '><label>' + esc(f.label) + '</label><select name="' + f.name + '">' +
          opts.map(function (o) { return '<option value="' + esc(o.value) + '"' + (String(o.value) === String(selectedValue == null ? '' : selectedValue) ? ' selected' : '') + '>' + esc(o.label) + '</option>'; }).join('') +
          '</select></div>';
      }
      if (f.type === 'toggle') return '<div class="fld"' + when + '><label>' + esc(f.label) + '</label><div class="toggle-control" data-toggle-name="' + esc(f.name) + '">' + f.options.map(function (o) { return '<button type="button" class="toggle-option' + (String(o.value) === String(f.value == null ? f.options[0].value : f.value) ? ' on' : '') + '" data-toggle-value="' + esc(o.value) + '" aria-pressed="' + (String(o.value) === String(f.value == null ? f.options[0].value : f.value) ? 'true' : 'false') + '">' + esc(o.label) + '</button>'; }).join('') + '<input type="hidden" name="' + f.name + '" value="' + esc(f.value == null ? f.options[0].value : f.value) + '"></div></div>';
      if (f.type === 'textarea') return '<div class="fld"' + when + '><label>' + esc(f.label) + '</label><textarea name="' + f.name + '"' + (f.placeholder ? ' placeholder="' + esc(f.placeholder) + '"' : '') + '>' + esc(f.value || '') + '</textarea></div>';
      if (f.type === 'info') return '<div class="fld"' + when + '><label>' + esc(f.label) + '</label><div class="hint" data-info="' + esc(f.name) + '">' + esc(f.value || '—') + '</div></div>';
      return '<div class="fld"' + when + '><label>' + esc(f.label) + '</label><input name="' + f.name + '" type="' + (f.type || 'text') + '"' + (f.step ? ' step="' + f.step + '"' : '') + (f.min != null ? ' min="' + esc(f.min) + '"' : '') + (f.max != null ? ' max="' + esc(f.max) + '"' : '') + (f.required ? ' required' : '') + (f.placeholder ? ' placeholder="' + esc(f.placeholder) + '"' : '') + (f.value != null ? ' value="' + esc(f.value) + '"' : '') + '></div>';
    }
    var formFields = [], openRow = null;
    fields.forEach(function (f, i) {
      if (f.row && openRow !== f.row) { if (openRow) formFields.push('</div>'); openRow = f.row; formFields.push('<div class="frow modal-row">'); }
      if (!f.row && openRow) { formFields.push('</div>'); openRow = null; }
      formFields.push(renderField(f));
      if (openRow && (!fields[i + 1] || fields[i + 1].row !== openRow)) { formFields.push('</div>'); openRow = null; }
    });
    dlg.innerHTML =
      '<div class="modal-h">' + esc(title) + '</div>' +
      '<form class="modal-b" method="dialog">' +
      formFields.join('') +
      '<div class="form-err"></div>' +
      '<div class="frow"><button type="button" class="btn ghost" style="flex:1" data-x>Cancel</button>' +
      '<button type="submit" class="btn acc" style="flex:1">' + esc(submitLabel) + '</button></div></form>';
    document.body.appendChild(dlg);
    if (fields.some(function (f) { return f.advanced || (title === 'New process run' && f.name === 'source_lot'); })) {
      dlg.querySelectorAll('[data-advanced]').forEach(function (node) { node.hidden = true; });
      var more = document.createElement('button'); more.type = 'button'; more.className = 'btn ghost advanced-toggle'; more.textContent = '＋ More details (optional)';
      more.onclick = function () { var open = more.getAttribute('aria-expanded') === 'true'; more.setAttribute('aria-expanded', open ? 'false' : 'true'); more.textContent = open ? '＋ More details (optional)' : '− Hide optional details'; dlg.querySelectorAll('[data-advanced]').forEach(function (node) { node.hidden = open; }); };
      dlg.querySelector('.form-err').before(more);
    }
    function updateConditionalFields() {
      var direction = dlg.querySelector('[name="direction"]');
      fields.forEach(function (f) {
        if (!f.when) return;
        var control = dlg.querySelector('[name="' + f.name + '"]');
        var visible = !direction || f.when === direction.value;
        control.parentElement.hidden = !visible;
        control.disabled = !visible;
      });
    }
    var directionSelect = dlg.querySelector('[name="direction"]');
    if (directionSelect) directionSelect.onchange = updateConditionalFields;
    fields.forEach(function (f) {
      if (f.type !== 'toggle') return;
      var hidden = dlg.querySelector('[name="' + f.name + '"]');
      dlg.querySelectorAll('[data-toggle-name="' + f.name + '"] .toggle-option').forEach(function (button) {
        button.onclick = function () {
          hidden.value = button.getAttribute('data-toggle-value');
          dlg.querySelectorAll('[data-toggle-name="' + f.name + '"] .toggle-option').forEach(function (other) { var on = other === button; other.classList.toggle('on', on); other.setAttribute('aria-pressed', on ? 'true' : 'false'); });
          updateConditionalFields();
          if (f.onChange) f.onChange(hidden.value, dlg);
        };
      });
    });
    updateConditionalFields();
    dlg.querySelector('[data-x]').onclick = function () { dlg.close(); dlg.remove(); if (options.onCancel) options.onCancel(); };
    fields.forEach(function (f) {
      if (!f.quickAdd) return;
      var sel = dlg.querySelector('[name="' + f.name + '"]');
      if (!sel) return;
      sel.onchange = function () {
        if (sel.value.indexOf('__add:') !== 0) return;
        sel.value = '';
        dlg.hidden = true;
        var childId = 'ms-modal-quick';
        modal(quickAddTitle(f), quickAddFields(f), 'Add', function (data) {
          return apiPost('/api/' + f.quickAdd, data).then(function (j) { j.name = data.name; return j; });
        }, { id: childId, keepExisting: true, refresh: false, onSuccess: function (j) {
          var opt = document.createElement('option');
          opt.value = j.id; opt.textContent = j.name || f.quickAddLabel;
          sel.insertBefore(opt, sel.querySelector('option[value^="__add:"]'));
          sel.value = j.id;
          if (f.onChange) f.onChange(j.id, dlg);
          dlg.hidden = false;
          loadOverview();
        }, onCancel: function () { dlg.hidden = false; } });
      };
    });
    fields.forEach(function (f) {
      if (!f.onChange || f.quickAdd) return;
      var sel = dlg.querySelector('[name="' + f.name + '"]');
      if (!sel) return;
      sel.onchange = function () { f.onChange(sel.value, dlg); };
      f.onChange(sel.value, dlg);
    });
    dlg.querySelector('form').onsubmit = function (e) {
      e.preventDefault();
      var data = {};
      fields.forEach(function (f) {
        var el = dlg.querySelector('[name="' + f.name + '"]');
        data[f.name] = el ? el.value : '';
      });
      Promise.resolve(onSubmit(data)).then(function (result) { dlg.close(); dlg.remove(); if (options.onSuccess) options.onSuccess(result); if (options.refresh !== false) refresh(); })
        .catch(function (err) { dlg.querySelector('.form-err').textContent = err.message; });
    };
    dlg.showModal();
  }
  function num(v) { var n = parseFloat(v); return isNaN(n) ? 0 : n; }
  function optList(rows, extra) {
    var o = (extra || []).concat(rows.map(function (r) { return { value: r.id, label: r.name || r.code }; }));
    return o.length ? o : [{ value: '', label: '—' }];
  }

  function isSupportAdmin() {
    return MODE === 'live' && S.ov && S.ov.me && String(S.ov.me.email || '').toLowerCase() === SUPPORT_ADMIN_EMAIL;
  }
  function saudaSummary(id, ov) {
    var sauda = (ov.saudas || []).find(function (s) { return s.id === id; });
    if (!sauda) return 'No agreement selected';
    var party = sauda.direction === 'out' ? sauda.buyer_name : sauda.supplier_name;
    var windowText = sauda.delivery_start || sauda.delivery_end ? ' · ' + (sauda.delivery_start || 'open') + ' → ' + (sauda.delivery_end || 'open') : '';
    var agreedQty = sauda.agreed_quantity != null && sauda.agreed_unit ? Number(sauda.agreed_quantity).toLocaleString('en-IN', { maximumFractionDigits: 3 }) + ' ' + String(sauda.agreed_unit).toLowerCase() : qtl(sauda.qty_kg) + ' qtl';
    return sauda.code + ' · ' + (sauda.direction === 'out' ? 'Sale' : 'Purchase') + ' · ' + agreedQty + ' · ₹' + Math.round((sauda.rate_paise_per_qtl || 0) / 100).toLocaleString('en-IN') + '/qtl · ' + (party || 'party') + windowText;
  }

  // ---------- page renderers ----------
  var PAGES = {
    dashboard: { t: 'Dashboard', s: function () { return 'Today at a glance · ' + roleDesc() + ' view'; }, search: false },
    gate: { t: 'Gate & Weighbridge', s: function () { return 'Live queue and today’s weighments'; }, search: true },
    purchase: { t: 'Purchase & Saudas', s: function () { return 'Broker deals and lot settlements'; }, search: true },
    stock: { t: 'Stock & Lots', s: function () { return 'Live godown-wise inventory'; }, search: true },
    suppliers: { t: 'Suppliers', s: function () { return 'Farmers, traders and brokers'; }, search: true },
    buyers: { t: 'Buyers', s: function () { return 'Rice and by-product customers'; }, search: true },
    items: { t: 'Items', s: function () { return 'Varieties, SKUs and by-products'; }, search: true },
    processing: { t: 'Processing', s: function () { return 'Transform inputs into traceable outputs'; }, search: false },
    team: { t: 'Team', s: function () { return 'Members and access'; }, search: false },
    documents: { t: 'Documents', s: function () { return 'Purchase, sales and weighment records'; }, search: true },
    bugs: { t: 'Bug Reports', s: function () { return 'Private support queue'; }, search: true },
    digest: { t: 'Night Digest', s: function () { return 'The owner’s day on one screen'; }, search: false },
  };
  function roleDesc() { return { owner: 'Owner', manager: 'Mill Manager', accountant: 'Accountant', operator: 'Operator' }[S.role] || S.role; }

  function kpiCard(label, value, sub, valColor, subColor) {
    return '<div class="kpi"><div class="l">' + esc(label) + '</div>' +
      '<div class="v" style="color:' + (valColor || 'var(--ink)') + '">' + value + '</div>' +
      '<div class="s" style="color:' + (subColor || 'var(--muted)') + '">' + sub + '</div></div>';
  }

  function massBalanceCard(mb, limit, withAction) {
    var i = mb.in_kg || 0;
    var p = function (kg) { return i > 0 ? Math.round((kg / i) * 100) : 0; };
    var over = i > 0 && mb.unexplained_pct > limit;
    var seg = function (kg, color, pulse) {
      return '<div style="width:' + p(kg) + '%;background:' + color + (pulse ? ';animation:ms-pulse 1.8s ease-in-out infinite' : '') + '"></div>';
    };
    var rows = [['Rice', mb.rice_kg, '#BE8A16'], ['Bran', mb.bran_kg, '#8C6B3F'], ['Husk', mb.husk_kg, '#CBB78C'], ['Broken', mb.broken_kg, '#98A2B3']];
    return '<div class="card pad">' +
      '<div style="display:flex;justify-content:space-between;align-items:center"><div class="card-h">Today’s mass balance</div>' +
      (withAction ? '<button class="btn sm" data-nav="processing">Open Processing</button>' : '') + '</div>' +
      (i <= 0
        ? '<div class="empty">No production entered for today yet.' + (withAction ? '<br>Use Processing to post normalized inputs, outputs and measurable loss.' : '') + '</div>'
        : '<div class="mb-bar">' + seg(mb.rice_kg, '#BE8A16') + seg(mb.bran_kg, '#8C6B3F') + seg(mb.husk_kg, '#CBB78C') + seg(mb.broken_kg, '#98A2B3') + seg(mb.unexplained_kg, '#C0451C', true) + '</div>' +
        '<div style="display:flex;flex-direction:column;gap:8px;margin-top:16px">' +
        rows.filter(function (r) { return r[1] > 0; }).map(function (r) {
          return '<div class="mb-row"><span class="b6 mut">' + r[0] + '</span><span class="b7">' + qtl(r[1]) + ' qtl · ' + p(r[1]) + '%</span></div>';
        }).join('') + '</div>' +
        (over
          ? '<div class="warn-box"><div style="display:flex;justify-content:space-between;align-items:center">' +
            '<span style="font-weight:700;color:var(--red-ink);font-size:14px">⚠ Unexplained</span>' +
            '<span class="arch" style="font-weight:800;font-size:18px;color:var(--red)">' + qtl(mb.unexplained_kg) + ' qtl · ' + pct(mb.unexplained_pct) + '</span></div>' +
            '<div style="font-size:12.5px;color:var(--red-ink);font-weight:600;margin-top:5px">Above your ' + limit + '% limit.</div></div>'
          : '<div class="ok-box"><div style="display:flex;justify-content:space-between;align-items:center">' +
            '<span style="font-weight:700;color:#256238;font-size:14px">✓ Unexplained</span>' +
            '<span class="arch" style="font-weight:800;font-size:18px;color:var(--green)">' + qtl(mb.unexplained_kg) + ' qtl · ' + pct(mb.unexplained_pct) + '</span></div>' +
            '<div style="font-size:12.5px;color:#256238;font-weight:600;margin-top:5px">Within your ' + limit + '% limit.</div></div>')) +
      '</div>';
  }

  function processingBalanceCard(summary, withAction) {
    var totals = {};
    (summary || []).forEach(function (r) { totals[r.line_type] = Number(r.quantity_base) || 0; });
    var input = totals.INPUT || 0, output = totals.OUTPUT || 0, loss = totals.LOSS || 0;
    var unexplained = Math.max(0, input - output - loss);
    var pctUnexplained = input > 0 ? Math.round((unexplained / input) * 1000) / 10 : 0;
    var pct = function (kg) { return input > 0 ? Math.round((kg / input) * 100) : 0; };
    var segment = function (kg, color) { return '<div style="width:' + pct(kg) + '%;background:' + color + '"></div>'; };
    return '<div class="card pad"><div style="display:flex;justify-content:space-between;align-items:center"><div class="card-h">Today’s processing balance</div>' +
      (withAction ? '<button class="btn sm" data-nav="processing">Open Processing</button>' : '') + '</div>' +
      '<div class="mb-bar">' + segment(output, '#BE8A16') + segment(loss, '#CBB78C') + segment(unexplained, '#C0451C') + '</div>' +
      '<div style="display:flex;flex-direction:column;gap:8px;margin-top:16px">' +
      '<div class="mb-row"><span class="b6 mut">Input</span><span class="b7">' + balanceQtl(input) + ' qtl</span></div>' +
      '<div class="mb-row"><span class="b6 mut">Output</span><span class="b7">' + balanceQtl(output) + ' qtl · ' + pct(output) + '%</span></div>' +
      '<div class="mb-row"><span class="b6 mut">Measured loss</span><span class="b7">' + balanceQtl(loss) + ' qtl · ' + pct(loss) + '%</span></div></div>' +
      (unexplained > 0 ? '<div class="warn-box" style="margin-top:14px"><div style="display:flex;justify-content:space-between;align-items:center"><span style="font-weight:700;color:var(--red-ink);font-size:14px">⚠ Unexplained</span><span class="arch" style="font-weight:800;font-size:18px;color:var(--red)">' + balanceQtl(unexplained) + ' qtl · ' + pctUnexplained + '%</span></div></div>' :
        '<div class="ok-box" style="margin-top:14px"><span style="font-weight:700;color:#256238;font-size:14px">✓ All process input accounted for</span></div>') + '</div>';
  }

  function onboardingCard() {
    if (MODE !== 'live') return '';
    var ov = S.ov;
    var ob = ov.onboarding || {};
    var steps = [
      ['Add suppliers', ov.suppliers.length > 0, 'Farmers, traders or brokers you buy from.', 'sup-new'],
      ['Add buyers', ov.buyers.length > 0, 'Customers who buy rice or by-products.', 'buy-new'],
      ['Check items', ov.items.length > 0, 'Paddy, parboiled rice, bran, husk and other SKUs.', 'item-new'],
      ['Create a sauda', ov.saudas.length > 0, 'Record the purchase deal before the truck arrives.', 'sauda-new'],
      ['Record gate entry', (ob.gate_count || ov.gate.length) > 0, 'Enter incoming/outgoing trucks and weights.', 'gate-new'],
      ['Move to stock', ov.lots.length > 0, 'Add completed incoming trucks into a godown lot.', 'lot-new'],
    ];
    var done = steps.every(function (s) { return s[1]; });
    if (done) {
      var connectedKey = 'ms-onboarding-connected:' + (ov.mill.id || ov.mill.name);
      try { if (localStorage.getItem(connectedKey) === '1') return ''; } catch (_) {}
      setTimeout(function () {
        try { localStorage.setItem(connectedKey, '1'); } catch (_) {}
        var card = document.querySelector('.celebrate-card');
        if (card) card.remove();
      }, 8000);
      return '<div class="card pad guide-card celebrate-card"><div class="celebrate-mark"></div>' +
        '<div><div class="card-h">Mill flow is connected</div><div class="hint" style="margin-top:4px">Parties, items, sauda, gate and stock are ready for daily use.</div></div></div>';
    }
    return '<div class="card pad guide-card"><div style="display:flex;justify-content:space-between;gap:14px;align-items:flex-start">' +
      '<div><div class="card-h">First days flow</div><div class="hint" style="margin-top:4px">Follow this order until the mill data starts feeling natural.</div></div>' +
      '</div>' +
      '<div class="guide-steps">' + steps.map(function (s, i) {
        return '<div class="guide-step ' + (s[1] ? 'done' : '') + '"><span class="guide-num">' + (s[1] ? '✓' : i + 1) + '</span>' +
          '<div><div class="b7">' + esc(s[0]) + '</div><div class="mut">' + esc(s[2]) + '</div></div>' +
          (MODE === 'live' && !s[1] ? '<button class="btn sm" data-act="' + s[3] + '">Start</button>' : '') + '</div>';
      }).join('') + '</div></div>';
  }

  function pageDashboard() {
    var ov = S.ov, k = ov.kpis, mb = ov.mass_balance;
    var kpis;
    if (S.role === 'manager') {
      kpis = [
        kpiCard('In gate queue', k.trucks_in_queue, 'trucks now inside', null, null),
        kpiCard('Arriving today', qtl(incomingToday(k)) + ' qtl', k.weighed_today + ' trucks weighed'),
        kpiCard('Dispatched today', qtl(outgoingToday(k)) + ' qtl', 'all items', null, 'var(--green)'),
        kpiCard('Pending lab tests', k.lab_pending, k.lab_pending > 0 ? 'trucks waiting on moisture' : 'all clear', k.lab_pending > 0 ? 'var(--red)' : null, k.lab_pending > 0 ? 'var(--red)' : null),
      ];
    } else if (S.role === 'accountant') {
      kpis = [
        kpiCard('Payables', money(k.payables_paise), 'to suppliers', 'var(--red)', 'var(--red)'),
        kpiCard('Receivables', money(k.receivables_paise), 'from buyers', null, 'var(--green)'),
        kpiCard('Cash received today', money(k.cash_received_today_paise), 'against invoices'),
        kpiCard('Broker advances', money(k.advances_open_paise), 'on open saudas'),
      ];
    } else {
      var over = mb.in_kg > 0 && mb.unexplained_pct > ov.mill.loss_limit_pct;
      var marginPct = k.sale_value_paise > 0 ? Math.round((k.gross_margin_today_paise / k.sale_value_paise) * 1000) / 10 : null;
      kpis = [
        kpiCard('Gross margin today', money(k.gross_margin_today_paise), marginPct != null ? marginPct + '% of sales' : 'sales − purchases', null, 'var(--green)'),
        kpiCard('Unexplained loss', mb.in_kg > 0 ? pct(mb.unexplained_pct) : '—',
          mb.in_kg > 0 ? (over ? 'Above ' : 'Within ') + ov.mill.loss_limit_pct + '% limit' : 'no production yet',
          over ? 'var(--red)' : 'var(--ink)', over ? 'var(--red)' : 'var(--muted)'),
        kpiCard('Cash paid today', money(k.cash_paid_today_paise), k.weighed_today + ' trucks'),
        kpiCard('Stock value', money(k.stock_value_paise), 'across ' + ov.godowns.length + ' godowns'),
      ];
    }

    var trend = ov.trend || { range: 'daily', label: 'last 7 days', data: ov.week || [] };
    var trendData = trend.data || [];
    var max = Math.max.apply(null, trendData.map(function (d) { return Math.max(d.in_kg, d.out_kg, 1); }));
    var bars = trendData.map(function (d) {
      var date = trend.range === 'monthly' ? new Date(d.date + '-01T00:00:00') : new Date(d.date + 'T00:00:00');
      var lab = trend.range === 'monthly' ? date.toLocaleDateString('en-IN', { month: 'short' }) : trend.range === 'weekly' ? date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : date.toLocaleDateString('en-IN', { weekday: 'short' });
      return '<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:5px;position:relative;height:100%;justify-content:flex-end">' +
        '<div style="display:flex;align-items:flex-end;gap:4px;height:100%;width:100%;justify-content:center">' +
        '<div style="width:40%;max-width:20px;background:#BE8A16;border-radius:3px 3px 0 0;height:' + Math.round((d.in_kg / max) * 140) + 'px"></div>' +
        '<div style="width:40%;max-width:20px;background:#2E7D46;border-radius:3px 3px 0 0;height:' + Math.round((d.out_kg / max) * 140) + 'px"></div></div>' +
        '<div style="position:absolute;bottom:-24px;font-size:12px;font-weight:600;color:var(--muted)">' + esc(lab) + '</div></div>';
    }).join('');

    var dot = { red: '#C0451C', amber: '#8A6A16', blue: '#2A5CA8' };
    var alerts = ov.alerts.length
      ? ov.alerts.map(function (a) {
          return '<div style="display:flex;gap:12px;padding:13px 0;border-bottom:1px solid var(--line)">' +
            '<span style="width:9px;height:9px;border-radius:50%;background:' + (dot[a.level] || '#98A2B3') + ';margin-top:5px;flex-shrink:0"></span>' +
            '<div><div style="font-weight:700;font-size:14.5px">' + esc(a.title) + '</div>' +
            '<div style="font-size:13px;color:var(--muted);font-weight:500;margin-top:2px">' + esc(a.body) + '</div></div></div>';
        }).join('')
      : '<div class="empty">Nothing needs your eyes right now.</div>';

    var recent = ov.gate.slice(0, 5).map(function (r) {
      return '<tr><td class="tok">' + esc(r.token_no) + '</td><td>' + esc(r.supplier_name || r.buyer_name || '—') + '</td>' +
        '<td class="b6">' + (net(r) > 0 ? qtl(net(r)) + ' qtl' : '—') + '</td><td>' + pill(r.status) + '</td></tr>';
    }).join('') || '<tr><td colspan="4" class="empty">No gate activity today yet.</td></tr>';

    var stockRows = (ov.stock_by_item || []).filter(function (r) { return Number(r.quantity_base) !== 0; }).slice(0, 8).map(function (r) { return '<div class="mb-row"><span class="b6 mut">' + esc(r.item_name) + '</span><span class="b7">' + qtl(r.quantity_base) + ' qtl</span></div>'; }).join('') || '<div class="empty">No posted stock movements yet.</div>';
    var flowRows = (ov.item_flows || []).filter(function (r) { return Number(r.incoming_base) || Number(r.outgoing_base); }).slice(0, 8).map(function (r) { return '<tr><td class="b6">' + esc(r.item_name) + '</td><td>↙ IN ' + qtl(r.incoming_base) + ' qtl</td><td class="b7">↗ OUT ' + qtl(r.outgoing_base) + ' qtl</td></tr>'; }).join('') || '<tr><td colspan="3" class="empty">No completed item movements in the last 30 days.</td></tr>';
    var processTotals = {}; (ov.processing_summary || []).forEach(function (r) { processTotals[r.line_type] = Number(r.quantity_base) || 0; });
    var processInput = processTotals.INPUT || 0, processOutput = processTotals.OUTPUT || 0, processLoss = processTotals.LOSS || 0;
    var processYield = processInput > 0 ? Math.round((processOutput / processInput) * 1000) / 10 : null;
    return onboardingCard() +
      '<div class="kpis">' + kpis.join('') + '</div>' +
      '<div class="card pad" style="margin-top:14px"><div style="display:flex;justify-content:space-between;align-items:center"><div><div class="card-h">Current stock by item</div><div class="hint">Normalized ledger quantities</div></div><button class="btn sm" data-nav="stock">View stock</button></div><div style="display:flex;flex-direction:column;gap:8px;margin-top:16px">' + stockRows + '</div></div>' +
      '<div class="card pad" style="margin-top:14px"><div class="card-h">Item movements · ' + esc(trend.label) + '</div><div class="hint" style="margin-top:4px">Direction is recorded on each transaction; item category never determines IN or OUT.</div><div class="twrap ms-scroll" style="margin-top:12px"><table class="ms"><thead><tr><th>Item</th><th>Arriving</th><th>Dispatching</th></tr></thead><tbody>' + flowRows + '</tbody></table></div></div>' +
      '<div class="card pad" style="margin-top:14px"><div style="display:flex;justify-content:space-between;align-items:center"><div><div class="card-h">Processing · ' + esc(trend.label) + '</div><div class="hint">Normalized movement totals across posted process runs.</div></div><button class="btn sm" data-nav="processing">View runs</button></div><div class="kpis" style="margin-top:14px"><div class="kpi"><div class="l">Inputs</div><div class="v">' + balanceQtl(processInput) + ' qtl</div></div><div class="kpi"><div class="l">Outputs</div><div class="v">' + balanceQtl(processOutput) + ' qtl</div></div><div class="kpi"><div class="l">Measured loss</div><div class="v">' + balanceQtl(processLoss) + ' qtl</div></div><div class="kpi"><div class="l">Output yield</div><div class="v">' + (processYield == null ? '—' : processYield + '%') + '</div></div></div></div>' +
      '<div class="grid2">' +
      '<div class="card pad" style="min-width:0"><div style="display:flex;justify-content:space-between;align-items:baseline">' +
      '<div class="card-h">Inbound vs. outbound</div><div class="hint">all items · quintals · ' + esc(trend.label) + '</div></div>' +
      '<div style="display:flex;align-items:flex-end;gap:clamp(8px,1.5vw,20px);height:180px;margin-top:22px;padding-bottom:26px;position:relative">' + bars + '</div>' +
      '<div style="display:flex;gap:20px;margin-top:8px;font-size:13px;font-weight:600">' +
      '<span style="display:flex;align-items:center;gap:7px"><span style="width:11px;height:11px;border-radius:2px;background:#BE8A16"></span>↙ Arriving</span>' +
      '<span style="display:flex;align-items:center;gap:7px"><span style="width:11px;height:11px;border-radius:2px;background:#2E7D46"></span>↗ Dispatching</span></div></div>' +
      ((ov.processing_today || []).some(function (r) { return r.line_type === 'INPUT' && Number(r.quantity_base) > 0; })
        ? processingBalanceCard(ov.processing_today, can('CREATE'))
        : massBalanceCard(mb, S.ov.mill.loss_limit_pct, can('CREATE'))) +
      '</div>' +
      '<div class="grid2r">' +
      '<div class="card pad"><div class="card-h" style="margin-bottom:6px">Needs your eyes</div>' + alerts + '</div>' +
      '<div class="card" style="min-width:0;padding-bottom:8px"><div class="pad" style="padding-bottom:0"><div class="card-h">Recent gate activity</div></div>' +
      '<div class="twrap ms-scroll"><table class="ms" style="min-width:440px;margin-top:12px"><thead><tr><th>Token</th><th>Party</th><th>Net</th><th>Status</th></tr></thead><tbody>' +
      recent + '</tbody></table></div></div></div>';
  }

  function pageGate() {
    var ov = S.ov, k = ov.kpis;
    var rows = filt(ov.gate), page = pageSlice(rows, 'gate'); rows = page.rows;
    var live = MODE === 'live';
    var body = rows.map(function (g) {
      var canAct = can('EDIT') && g.status !== 'done';
      return '<tr class="gate-row gate-' + esc(g.direction) + '"><td class="tok">' + esc(g.token_no) + '</td>' +
        '<td class="b6">' + esc(g.vehicle_no) + ' <span class="pill dir">' + (g.direction === 'out' ? 'OUT' : 'IN') + '</span></td>' +
        '<td>' + esc(g.supplier_name || g.buyer_name || '—') + '</td>' +
        '<td class="mut">' + esc(g.item_name || '—') + '</td>' +
        '<td class="b6">' + (g.gross_kg ? kgFmt(g.gross_kg) : '—') + '</td>' +
        '<td class="b7">' + (net(g) > 0 ? qtl(net(g)) + ' qtl' : '—') + '</td>' +
        '<td class="b6">' + (g.moisture_pct != null ? pct(g.moisture_pct) : '—') + '</td>' +
        '<td>' + pill(g.status) + (canAct ? ' <button class="btn sm" data-act="gate-upd" data-id="' + esc(g.id) + '">Update</button>' : '') + '</td></tr>';
    }).join('') || '<tr><td colspan="8" class="empty">No trucks match.</td></tr>';

    return '<div class="kpis" style="grid-template-columns:repeat(auto-fit,minmax(180px,1fr));margin-bottom:18px">' +
      kpiCard('In queue now', k.trucks_in_queue + ' trucks', 'inside the gate') +
      kpiCard('Weighed today', k.weighed_today, 'trucks completed') +
      kpiCard('Arriving today', qtl(incomingToday(k)) + ' qtl', 'net weight across items') +
      kpiCard('Avg moisture', k.avg_moisture != null ? pct(k.avg_moisture) : '—', 'weighed lots') + '</div>' +
      '<div class="card"><div class="card-top"><div class="card-h">Weighbridge queue</div>' +
      '<div style="display:flex;gap:10px;align-items:center"><span class="hint">' + rows.length + ' shown</span>' +
      (can('CREATE') ? '<button class="btn acc" data-act="gate-new">+ New gate entry</button>' : '') + '</div></div>' +
      filterToolbar(ov.gate, 'gate entries') +
      '<div class="twrap ms-scroll"><table class="ms" style="min-width:860px"><thead><tr>' +
      '<th>Token</th><th>Vehicle</th><th>Party</th><th>Material</th><th>Gross</th><th>Net</th><th>Moisture</th><th>Status</th></tr></thead><tbody>' +
      body + '</tbody></table></div>' + pager(page, 'gate') + '</div>';
  }

  function pagePurchase() {
    var ov = S.ov;
    var rows = filt(ov.saudas), page = pageSlice(rows, 'purchase'); rows = page.rows;
    var openVal = ov.saudas.filter(function (s) { return s.status === 'open' || s.status === 'advance_paid'; })
      .reduce(function (a, s) { return a + (s.value_paise || 0); }, 0);
    var m = canMoney();
    var body = rows.map(function (p) {
      var fulfilled = Number(p.fulfilled_qty_base || 0);
      var agreement = Number(p.qty_kg || 0);
      return '<tr><td class="tok">' + esc(p.code) + '</td>' +
        '<td><div class="b6">' + (p.direction === 'out' ? 'Sale' : 'Purchase') + '</div><div style="font-size:12px;color:var(--muted)">' + esc(p.buyer_name || p.supplier_name || '') + '</div></td>' +
        '<td>' + esc(p.item_name || '—') + '</td>' +
        '<td class="b7">' + esc(saudaQty(p)) + '</td>' +
        (m ? '<td class="b6">' + rate(p.rate_paise_per_qtl) + '</td>' : '') +
        '<td class="b6">' + (p.moisture_pct != null ? pct(p.moisture_pct) : '—') + '</td>' +
        (m ? '<td class="b7">' + money(p.value_paise) + '</td>' : '') +
        '<td><div>' + pill(p.status) + '</div><div class="mut" style="font-size:12px;margin-top:4px">Delivered ' + qtl(fulfilled) + ' / ' + esc(saudaQty(p)) + '</div>' +
        (MODE === 'live' && m && (p.status === 'open' || p.status === 'advance_paid' || p.status === 'disputed')
          ? ' <button class="btn sm" data-act="sauda-upd" data-id="' + esc(p.id) + '">Update</button><button class="btn sm" data-act="delivery-new" data-id="' + esc(p.id) + '">Delivery</button>' : '') +
        (MODE === 'live' ? ' <button class="btn sm" data-act="delivery-history" data-id="' + esc(p.id) + '">History</button>' : '') + '</td></tr>';
    }).join('') || '<tr><td colspan="8" class="empty">No saudas yet.</td></tr>';
    return '<div class="card"><div class="card-top"><div class="card-h">Saudas &amp; purchases</div>' +
      '<div style="display:flex;gap:10px;align-items:center">' + (m ? '<span class="hint">Open value: ' + money(openVal) + '</span>' : '') +
      (canFinance() && m ? '<button class="btn acc" data-act="sauda-new">+ New sauda</button>' : '') + '</div></div>' +
      filterToolbar(ov.saudas, 'saudas') +
      '<div class="twrap ms-scroll"><table class="ms" style="min-width:' + (m ? 900 : 700) + 'px"><thead><tr>' +
      '<th>Sauda</th><th>Direction / Party</th><th>Item</th><th>Qty</th>' + (m ? '<th>Rate</th>' : '') + '<th>Moisture</th>' + (m ? '<th>Value</th>' : '') + '<th>Status / deliveries</th>' +
      '</tr></thead><tbody>' + body + '</tbody></table></div>' +
      (!m ? '<div class="note-locked">🔒 Purchase rates and values are hidden for the Manager role.</div>' : '') + pager(page, 'purchase') + '</div>';
  }

  function showDeliveryHistory(sauda) {
    fetch('/api/saudas/' + encodeURIComponent(sauda.id) + '/deliveries').then(function (r) {
      return r.json().then(function (j) { if (!r.ok) throw new Error(j.error || 'Could not load delivery history'); return j; });
    }).then(function (j) {
      var dlg = document.createElement('dialog');
      dlg.className = 'modal'; dlg.id = 'ms-delivery-history';
      var rows = (j.deliveries || []).map(function (d) {
        var source = d.gate_entry_id ? 'Gate ' + (d.token_no || d.vehicle_no || 'linked') : 'Manual';
        var action = can('VOID') && d.status === 'POSTED' && !d.gate_entry_id
          ? '<button class="btn sm" data-void-delivery="' + esc(d.id) + '">Void</button>'
          : (d.gate_entry_id && d.status === 'POSTED' ? '<span class="hint">Gate-linked</span>' : '');
        return '<tr><td>' + esc(d.actual_date || '—') + '</td><td class="b7">' + esc(Number(d.actual_qty).toLocaleString('en-IN', { maximumFractionDigits: 3 }) + ' ' + String(d.actual_unit || '').toLowerCase()) + '</td><td>' + esc(source) + '</td><td>' + esc(d.lot_code || '—') + '</td><td>' + pill(d.status) + '</td><td>' + action + '</td></tr>';
      }).join('') || '<tr><td colspan="6" class="empty">No deliveries recorded.</td></tr>';
      dlg.innerHTML = '<div class="modal-h">Delivery history · ' + esc(sauda.code) + '</div><div class="modal-b"><div class="twrap ms-scroll"><table class="ms" style="min-width:760px"><thead><tr><th>Date</th><th>Quantity</th><th>Source</th><th>Lot</th><th>Status</th><th></th></tr></thead><tbody>' + rows + '</tbody></table></div><div class="frow"><button type="button" class="btn ghost" data-close-history>Close</button></div></div>';
      document.body.appendChild(dlg);
      dlg.querySelector('[data-close-history]').onclick = function () { dlg.close(); dlg.remove(); };
      dlg.querySelectorAll('[data-void-delivery]').forEach(function (button) {
        button.onclick = function () {
          var reason = window.prompt('Reason for voiding this manual delivery:');
          if (!reason || reason.trim().length < 3) return;
          apiPost('/api/sauda-deliveries/' + button.getAttribute('data-void-delivery') + '/void', { reason: reason.trim() })
            .then(function () { dlg.close(); dlg.remove(); refresh(); })
            .catch(function (err) { window.alert(err.message); });
        };
      });
      dlg.showModal();
    }).catch(function (err) { window.alert(err.message); });
  }

  function pageStock() {
    var ov = S.ov;
    var m = canMoney();
    var live = MODE === 'live';
    var defaultGodown = ov.godowns[0] || {};
    var cards = ov.godowns.map(function (gd) {
      var cap = Number(gd.capacity_kg || 0);
      var fill = cap > 0 ? Math.min(100, Math.round((gd.stock_kg / cap) * 100)) : 0;
      var color = fill > 85 ? 'var(--red)' : fill > 60 ? 'var(--gold-dark)' : 'var(--green)';
      var pillBg = fill > 85 ? '#FBEDE7' : fill > 60 ? '#FEF3D6' : '#E6F0E9';
      var pillFg = fill > 85 ? '#8F2E12' : fill > 60 ? '#8A6A16' : '#256238';
      return '<div class="kpi"><div style="display:flex;justify-content:space-between;align-items:center">' +
        '<div style="font-weight:700;font-size:15px">' + esc(gd.name) + '</div>' +
        '<span class="pill" style="background:' + pillBg + ';color:' + pillFg + '">' + fill + '% full</span></div>' +
        '<div class="v" style="font-size:25px;margin:10px 0 2px">' + qtl(gd.stock_kg) + ' qtl</div>' +
        '<div class="s">' + (cap > 0 ? 'of ' + qtl(cap) + ' qtl compatible capacity' : 'Capacity utilisation unavailable for this unit') + '</div>' +
        '<div class="gd-fill"><div style="width:' + fill + '%;background:' + color + '"></div></div></div>';
    }).join('');
    var pending = ov.pending_receipts || [];
    var receiptPanel = '';
    if (pending.length) {
      var g = pending[0];
      var amount = Math.round(Math.max(0, g.net_kg || 0) * ((g.sauda_rate_paise_per_qtl || 0) / 100));
      receiptPanel = '<div class="receipt-toast card" data-receipt="' + esc(g.id) + '">' +
        '<div><div class="card-h">Add incoming truck to stock?</div>' +
        '<div class="hint">' + esc(g.token_no) + ' · ' + esc(g.supplier_name || 'Supplier') + ' · ' + esc(g.item_name || 'Item') + ' · ' + qtl(g.net_kg) + ' qtl' +
        (g.moisture_pct != null ? ' · ' + pct(g.moisture_pct) : '') + (pending.length > 1 ? ' · +' + (pending.length - 1) + ' more' : '') + '</div>' +
        '<div class="hint" style="margin-top:4px">Accept creates a lot in ' + esc(defaultGodown.name || 'your first godown') + '. You can edit quantity, godown or note later.</div></div>' +
        '<div class="receipt-toast-actions">' +
        (can('CREATE') ? '<button class="btn acc" data-act="receipt-accept" data-id="' + esc(g.id) + '" data-godown="' + esc(defaultGodown.id || '') + '" data-item="' + esc(g.item_id || '') + '" data-qty="' + esc(g.net_kg || 0) + '" data-moisture="' + esc(g.moisture_pct == null ? '' : g.moisture_pct) + '" data-value="' + esc(amount) + '">Accept</button>' : '') +
        (can('EDIT') ? '<button class="btn ghost" data-act="receipt-reject" data-id="' + esc(g.id) + '">Reject</button>' : '') +
        '</div></div>';
    } else if (live) {
      receiptPanel = '<div class="card pad receipt-empty"><div class="card-h">No pending stock receipts</div><div class="hint" style="margin-top:4px">When an incoming truck is marked Done at the gate, it will appear here for one-click accept or reject.</div></div>';
    }
    var rows = filt(ov.lots), page = pageSlice(rows, 'stock'); rows = page.rows;
    var body = rows.map(function (s) {
      return '<tr><td class="tok">' + esc(s.code) + '</td><td class="b6">' + esc(s.godown_name || '—') + '</td>' +
        '<td>' + esc(s.item_name || '—') + '</td><td class="b7">' + esc(lotQty(s)) + '</td>' +
        '<td class="b6">' + (s.moisture_pct != null ? pct(s.moisture_pct) : '—') + '</td>' +
        '<td class="mut">' + dstr(s.in_date) + '</td>' + (m ? '<td class="b7">' + money(s.value_paise) + '</td>' : '') +
        '<td class="mut">' + esc(s.note || '') + '</td>' +
        (can('EDIT') ? '<td><button class="btn sm" data-act="lot-edit" data-id="' + esc(s.id) + '">Edit</button></td>' : '') + '</tr>';
    }).join('') || '<tr><td colspan="7" class="empty">No lots on hand.</td></tr>';
    return '<div class="kpis" style="grid-template-columns:repeat(auto-fit,minmax(200px,1fr));margin-bottom:18px">' + cards + '</div>' +
      (live ? receiptPanel : '') +
      '<div class="card"><div class="card-top"><div class="card-h">Lots on hand</div>' +
      '<div style="display:flex;gap:10px;align-items:center"><span class="hint">' + rows.length + ' lots</span>' +
      (can('CREATE') ? '<button class="btn acc" data-act="lot-new">+ New lot</button>' : '') + '</div></div>' +
      filterToolbar(ov.lots, 'lots') +
      '<div class="twrap ms-scroll"><table class="ms" style="min-width:800px"><thead><tr>' +
      '<th>Lot</th><th>Godown</th><th>Item</th><th>Qty</th><th>Moisture</th><th>In date</th>' + (m ? '<th>Value</th>' : '') + '<th>Note</th>' + (can('EDIT') ? '<th></th>' : '') +
      '</tr></thead><tbody>' + body + '</tbody></table></div>' + pager(page, 'stock') + '</div></div>';
  }

  function partyPage(kind) {
    var ov = S.ov;
    if (!S.payments) loadPayments();
    var m = canMoney();
    var isSup = kind === 'suppliers';
    var rows = filt(isSup ? ov.suppliers : ov.buyers), page = pageSlice(rows, kind); rows = page.rows;
    var body = rows.map(function (s) {
      var t = isSup ? (SUPTYPE[s.type] || [s.type, '#EEF1F5', '#475467']) : [s.type, '#EEF1F5', '#475467'];
      var out = isSup ? s.outstanding_paise : s.receivable_paise;
      return '<tr><td><div style="display:flex;align-items:center;gap:11px">' +
        '<span class="avatar" style="background:' + (isSup ? '#F0E7D3' : '#E6F0E9') + ';color:' + (isSup ? '#8A6A16' : '#2E7D46') + '">' + esc(initials(s.name)) + '</span>' +
        '<span class="b7">' + esc(s.name) + '</span></div></td>' +
        '<td><span class="pill" style="background:' + t[1] + ';color:' + t[2] + '">' + esc(t[0]) + '</span></td>' +
        '<td>' + esc((isSup ? s.place : s.location) || '—') + '</td>' +
        '<td class="b7">' + qtl(isSup ? s.supplied_kg : s.bought_kg) + ' qtl</td>' +
        (m ? '<td class="b7" style="color:' + (out > 0 ? (isSup ? 'var(--red)' : 'var(--ink)') : 'var(--muted)') + '">' + money(out || 0) +
          (canFinance() && out > 0 ? ' <button class="btn sm" data-act="pay" data-kind="' + (isSup ? 'supplier' : 'buyer') + '" data-id="' + esc(s.id) + '">' + (isSup ? 'Pay' : 'Receive') + '</button>' : '') + '</td>' : '') +
        '<td class="mut">' + ago(s.last_at) + '</td><td>' + (can('EDIT') ? '<button class="btn sm" data-act="' + (isSup ? 'sup-edit' : 'buy-edit') + '" data-id="' + esc(s.id) + '">Edit</button>' : '') + '</td></tr>';
    }).join('') || '<tr><td colspan="' + (m ? '7' : '6') + '" class="empty">Nobody here yet.</td></tr>';
    var paymentRows = (S.payments || []).filter(function (p) { return p.party_kind === (isSup ? 'supplier' : 'buyer'); }).map(function (p) { var voidButton = p.status === 'POSTED' && can('VOID') ? ' <button class="btn sm" data-act="payment-void" data-id="' + esc(p.id) + '">Void</button>' : ''; var receiptButton = can('EXPORT') ? ' <a class="btn sm" target="_blank" rel="noopener" href="/api/payments/' + encodeURIComponent(p.id) + '/print">Download receipt</a>' : ''; return '<tr><td class="tok">' + esc(p.pay_date) + '</td><td>' + esc(p.party_name || '—') + '</td><td>' + esc(p.direction === 'paid' ? 'Paid' : 'Received') + '</td><td class="b7">' + (m ? money(p.amount_paise) : '—') + '</td><td>' + pill(String(p.status || '').toLowerCase()) + receiptButton + voidButton + '</td></tr>'; }).join('') || '<tr><td colspan="5" class="empty">No payments recorded.</td></tr>';
    var paymentSection = '<div class="card" style="margin-top:18px"><div class="card-top"><div><div class="card-h">Recent ' + (isSup ? 'supplier payments' : 'buyer receipts') + '</div><div class="hint">Posted payments affect outstanding balances; voids remain in history.</div></div></div><div class="twrap ms-scroll"><table class="ms"><thead><tr><th>Date</th><th>Party</th><th>Direction</th><th>Amount</th><th>Status</th></tr></thead><tbody>' + paymentRows + '</tbody></table></div></div>';
    return '<div class="card"><div class="card-top"><div><div class="card-h">' + (isSup ? 'Supplier directory' : 'Buyer directory') + '</div><div class="hint">Manage contacts, activity and balances.</div></div>' +
      '<div style="display:flex;gap:10px;align-items:center"><span class="hint">' + rows.length + (isSup ? ' · farmers, traders & brokers' : ' customers') + '</span>' +
      (can('CREATE') ? '<a class="btn sm" href="/api/parties/import/template.csv?kind=' + (isSup ? 'supplier' : 'buyer') + '">CSV template</a><button class="btn sm" data-act="party-import" data-kind="' + (isSup ? 'supplier' : 'buyer') + '">Import CSV</button><button class="btn acc" data-act="' + (isSup ? 'sup-new' : 'buy-new') + '">+ Add</button>' : '') + '</div></div>' +
      filterToolbar(isSup ? ov.suppliers : ov.buyers, isSup ? 'suppliers' : 'buyers') +
      '<div class="twrap ms-scroll"><table class="ms" style="min-width:760px"><thead><tr>' +
      '<th>Name</th><th>Type</th><th>' + (isSup ? 'Village / Place' : 'Location') + '</th><th>' + (isSup ? 'Supplied (season)' : 'Bought (season)') + '</th>' +
      (m ? '<th>' + (isSup ? 'Outstanding' : 'Receivable') + '</th>' : '') + '<th>Last</th><th></th></tr></thead><tbody>' + body + '</tbody></table></div>' + pager(page, kind) + '</div></div>' + paymentSection;
  }

  function loadPayments() {
    return fetch('/api/payments').then(function (r) { return r.json(); }).then(function (j) { S.payments = j.payments || []; render(); });
  }

  function pageItems() {
    var rows = filt(S.ov.items), page = pageSlice(rows, 'items'); rows = page.rows;
    var body = rows.map(function (i) {
      var genericCategory = { RAW_MATERIAL: ['Raw material', '#FEF3D6', '#8A6A16'], FINISHED_GOOD: ['Finished good', '#E6F0E9', '#256238'], BYPRODUCT: ['By-product', '#EEF1F5', '#475467'], PACKAGING: ['Packaging', '#EAF2F8', '#2A5CA8'], CONSUMABLE: ['Consumable', '#F3EAF8', '#6941C6'], OTHER: ['Other', '#EEF1F5', '#475467'] };
      var ct = genericCategory[i.category_code] || CAT[i.category] || [i.category, '#EEF1F5', '#475467'];
      return '<tr><td class="b7">' + esc(i.name) + '</td>' +
        '<td><span class="pill" style="background:' + ct[1] + ';color:' + ct[2] + '">' + esc(ct[0]) + '</span></td>' +
        '<td class="mut arch">' + esc(i.hsn || '—') + '</td>' +
        '<td class="b7">' + qtl(i.stock_kg) + ' qtl</td>' +
        '<td class="b6">' + (i.typical_otr_pct != null ? i.typical_otr_pct + '%' : '—') + '</td>' +
        '<td class="mut">' + esc(i.display_unit || i.unit || 'Quintal') + '</td><td>' + (can('EDIT') ? '<button class="btn sm" data-act="item-edit" data-id="' + esc(i.id) + '">Edit</button>' : '') + '</td></tr>';
    }).join('') || '<tr><td colspan="7" class="empty">No items.</td></tr>';
    return '<div class="card"><div class="card-top"><div><div class="card-h">Items</div>' +
      '<div class="hint" style="font-weight:500;margin-top:2px">Paddy varieties, rice SKUs &amp; by-products. OTR = out-turn ratio.</div></div>' +
      (can('CREATE') ? '<button class="btn acc" data-act="item-new">+ Add item</button>' : '') + '</div>' +
      filterToolbar(S.ov.items, 'items') +
      '<div class="twrap ms-scroll"><table class="ms" style="min-width:720px"><thead><tr>' +
      '<th>Item</th><th>Category</th><th>HSN</th><th>Stock</th><th>Typical OTR</th><th>Unit</th><th></th></tr></thead><tbody>' + body + '</tbody></table></div>' + pager(page, 'items') + '</div>';
  }

  function loadBugReports() {
    S.bugsError = '';
    return fetch('/api/feedback/tickets').then(function (r) {
      return r.json().then(function (j) {
        if (!r.ok) throw new Error(j.error || 'Could not load bug reports');
        S.bugs = j.tickets || [];
      });
    }).catch(function (err) {
      S.bugsError = err.message;
      S.bugs = [];
    }).then(function () {
      var pg = document.getElementById('ms-page');
      if (S.page === 'bugs' && pg) pg.innerHTML = pageBugReports();
    });
  }
  function loadProcessTypes() {
    return fetch('/api/process-types?include_archived=1').then(function (r) { return r.json(); }).then(function (j) { S.processTypes = j.process_types || []; render(); });
  }
  function loadProcessRuns() {
    return fetch('/api/process-runs').then(function (r) { return r.json(); }).then(function (j) { S.processRuns = j.runs || []; render(); });
  }
  function activeProcessTypes() { return (S.processTypes || []).filter(function (p) { return !p.deleted_at; }); }
  function preferredProcessUnit() { return (S.ov && S.ov.me && S.ov.me.preferred_unit) || 'QUINTAL'; }
  function processUnitOptions() { return [{ value: 'KG', label: 'kg' }, { value: 'QUINTAL', label: 'quintal' }, { value: 'TONNE', label: 'tonne' }, { value: 'BAG', label: 'bag' }, { value: 'PIECE', label: 'piece' }]; }
  function processUnitBase(item, unit) {
    var u = String(unit || '').toUpperCase(), multipliers = { KG: 1, QUINTAL: 100, TONNE: 1000 };
    if (multipliers[u]) return multipliers[u];
    if (item && String(item.package_unit || '').toUpperCase() === u && Number(item.package_quantity_base) > 0) return Number(item.package_quantity_base);
    return null;
  }
  function processQuantityBase(item, quantity, unit) { var m = processUnitBase(item, unit); return m == null ? null : num(quantity) * m; }
  function processItem(id, workspace) { return ((workspace && workspace.items) || (S.ov && S.ov.items) || []).find(function (item) { return String(item.id) === String(id); }) || null; }
  function processTemplateLines(workspace) { return (workspace && workspace.template_lines) || []; }
  function processDraftKey(typeId) { return 'millsaathi:process-draft:' + String((S.ov && S.ov.mill && S.ov.mill.id) || 'current') + ':' + typeId; }
  function readProcessDraft(typeId) { try { var raw = localStorage.getItem(processDraftKey(typeId)); return raw ? JSON.parse(raw) : null; } catch (_) { return null; } }
  function persistProcessDraft() { if (!S.processDraft) return; try { localStorage.setItem(processDraftKey(S.processDraft.processTypeId), JSON.stringify(S.processDraft)); } catch (_) {} }
  function clearProcessDraft(typeId) { try { localStorage.removeItem(processDraftKey(typeId)); } catch (_) {} }
  function processWorkspaceFor(typeId) {
    return fetch('/api/process-workspace?process_type_id=' + encodeURIComponent(typeId)).then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.error || 'Could not load process workspace'); return j; }); }).then(function (j) {
      S.processWorkspace = j;
      var saved = readProcessDraft(typeId);
      S.processDraft = saved && saved.processTypeId === typeId ? saved : { processTypeId: typeId, inputs: [], outputs: processTemplateLines(j).filter(function (line) { return line.line_type === 'OUTPUT' || line.line_type === 'LOSS'; }).map(function (line) {
        return { template_line_id: line.id, line_type: line.line_type, semantic_type: line.semantic_type, item_id: line.item_id, item_name: line.item_name, quantity: '', unit: line.default_unit || j.process_type.default_unit || preferredProcessUnit(), auto_calculate: !!line.auto_calculate, required: !!line.required, godown_id: line.default_godown_id || j.process_type.default_destination_godown_id || '' };
      }), destinationGodownId: j.process_type.default_destination_godown_id || '', notes: '' };
      if (!S.processDraft.destinationGodownId) S.processDraft.destinationGodownId = j.process_type.default_destination_godown_id || '';
      render();
    }).catch(function (err) { S.processWorkspace = { error: err.message }; S.processDraft = null; toast(err.message, 'error'); render(); });
  }
  function processLotById(id) { return S.processWorkspace && (S.processWorkspace.lots || []).find(function (lot) { return String(lot.id) === String(id); }); }
  function processInputModal(lot) {
    var item = processItem(lot.item_id, S.processWorkspace);
    var unit = (item && (item.display_unit || item.unit)) || preferredProcessUnit();
    var available = Number(lot.qty_kg || 0) / (processUnitBase(item, unit) || 1);
    modal('How much to process?', [
      { name: 'material', label: 'Selected material', type: 'info', value: (lot.item_name || 'Material') + ' · ' + lot.code + ' · ' + available.toLocaleString('en-IN', { maximumFractionDigits: 3 }) + ' ' + String(unit).toLowerCase() + ' available' },
      { name: 'quantity', label: 'Quantity (' + String(unit).toLowerCase() + ')', type: 'number', step: '0.001', min: '0', max: available, required: true, value: '' },
      { name: 'unit', label: 'Unit', type: 'select', value: unit, options: processUnitOptions() },
    ], 'Use in process', function (d) {
      var selectedUnit = d.unit || unit, base = processQuantityBase(item, d.quantity, selectedUnit);
      if (!base || base <= 0 || base > Number(lot.qty_kg || 0)) throw new Error('Enter a positive quantity within the available lot quantity.');
      var existing = S.processDraft.inputs.find(function (input) { return input.lot_id === lot.id; });
      if (existing) { existing.quantity = d.quantity; existing.unit = selectedUnit; existing.quantity_base = base; }
      else S.processDraft.inputs.push({ lot_id: lot.id, lot_code: lot.code, item_id: lot.item_id, item_name: lot.item_name, godown_id: lot.godown_id, godown_name: lot.godown_name, quantity: d.quantity, quantity_base: base, unit: selectedUnit, available_base: Number(lot.qty_kg || 0) });
      persistProcessDraft();
      render();
    });
    var dlg = document.getElementById('ms-modal');
    if (dlg) {
      var quick = document.createElement('div'); quick.className = 'process-quick-actions'; quick.innerHTML = '<span>Quick amount</span><button type="button" data-process-quick="25">25%</button><button type="button" data-process-quick="50">50%</button><button type="button" data-process-quick="100">All</button>';
      dlg.querySelector('.form-err').before(quick);
      quick.querySelectorAll('[data-process-quick]').forEach(function (button) { button.onclick = function () { var qty = dlg.querySelector('[name="quantity"]'); if (qty) qty.value = (available * Number(button.getAttribute('data-process-quick')) / 100).toFixed(3).replace(/\.000$/, ''); }; });
    }
  }
  function processInputSelectionModal() {
    var lots = (S.processWorkspace && S.processWorkspace.lots) || [];
    modal('Add another input', [
      { name: 'lot_id', label: 'Available lot', type: 'select', options: optList(lots.map(function (lot) { return { id: lot.id, name: (lot.item_name || 'Material') + ' · ' + lot.code + ' · ' + lotQty(lot) }; })), },
      { name: 'quantity', label: 'Quantity', type: 'number', step: '0.001', required: true },
      { name: 'unit', label: 'Unit', type: 'select', value: preferredProcessUnit(), options: processUnitOptions() },
    ], 'Add input', function (d) {
      var lot = processLotById(d.lot_id), item = lot && processItem(lot.item_id, S.processWorkspace), base = lot && processQuantityBase(item, d.quantity, d.unit);
      if (!lot || !item || !base || base <= 0 || base > Number(lot.qty_kg || 0)) throw new Error('Enter a positive quantity within the available lot quantity.');
      S.processDraft.inputs.push({ lot_id: lot.id, lot_code: lot.code, item_id: lot.item_id, item_name: lot.item_name, godown_id: lot.godown_id, godown_name: lot.godown_name, quantity: d.quantity, quantity_base: base, unit: d.unit, available_base: Number(lot.qty_kg || 0) });
      persistProcessDraft();
      render();
    });
  }
  function processOutputModal() {
    var itemOptions = optList((S.processWorkspace && S.processWorkspace.items) || S.ov.items, [{ value: '', label: 'Choose item' }]);
    modal('Add output', [
      { name: 'item_id', label: 'Item', type: 'select', options: itemOptions },
      { name: 'semantic_type', label: 'Output type', type: 'select', options: [{ value: 'main', label: 'Main output' }, { value: 'byproduct', label: 'By-product' }, { value: 'waste', label: 'Waste / loss' }] },
      { name: 'quantity', label: 'Quantity', type: 'number', step: '0.001', required: true },
      { name: 'unit', label: 'Unit', type: 'select', value: preferredProcessUnit(), options: processUnitOptions() },
    ], 'Add output', function (d) {
      var item = processItem(d.item_id, S.processWorkspace);
      if (!item || num(d.quantity) <= 0) throw new Error('Choose an item and enter a positive quantity.');
      S.processDraft.outputs.push({ line_type: d.semantic_type === 'waste' ? 'LOSS' : 'OUTPUT', semantic_type: d.semantic_type, item_id: d.item_id, item_name: item.name, quantity: d.quantity, unit: d.unit || preferredProcessUnit(), auto_calculate: false, required: true, godown_id: S.processDraft.destinationGodownId || '' });
      persistProcessDraft();
      render();
    });
  }
  function processBalance(draft) {
    var input = draft && draft.inputs.length ? draft.inputs.reduce(function (total, line) { return total + Number(line.quantity_base || 0); }, 0) : 0;
    var allMass = input > 0 && draft.outputs.every(function (line) { var item = processItem(line.item_id, S.processWorkspace); return processUnitBase(item, line.unit) != null; });
    var accounted = allMass ? draft.outputs.reduce(function (total, line) { return total + (processQuantityBase(processItem(line.item_id, S.processWorkspace), line.quantity, line.unit) || 0); }, 0) : 0;
    var difference = allMass ? Math.round((input - accounted) * 1000) / 1000 : null;
    var loss = draft.outputs.find(function (line) { return line.line_type === 'LOSS' && line.auto_calculate; });
    if (loss && difference != null && difference >= 0) { var item = processItem(loss.item_id, S.processWorkspace); var multiplier = processUnitBase(item, loss.unit); if (multiplier) loss.quantity = difference / multiplier; }
    return { input: input, accounted: accounted, difference: difference, allMass: allMass };
  }
  function processBalanceMarkup(balance) {
    if (!balance || !balance.input) return '<div class="process-balance muted">Add an input lot to see the mass balance.</div>';
    if (!balance.allMass) return '<div class="process-balance"><span>Input <b>' + qtl(balance.input) + ' qtl</b></span><span class="muted">Balance available for compatible mass units.</span></div>';
    var difference = balance.difference || 0, good = Math.abs(difference) < 0.001;
    return '<div class="process-balance ' + (good ? 'good' : 'attention') + '"><span>Input <b>' + qtl(balance.input) + ' qtl</b></span><span>Accounted <b>' + qtl(balance.accounted) + ' qtl</b></span><span>Difference <b>' + qtl(Math.abs(difference)) + ' qtl</b> ' + (good ? '✓' : '') + '</span></div>';
  }
  function processWorkspaceMarkup() {
    var types = activeProcessTypes(), workspace = S.processWorkspace, draft = S.processDraft;
    if (!types.length) return '<div class="card pad"><div class="empty">Create a process type before opening a Process Workspace.</div></div>';
    if (!workspace || !draft || workspace.error) return '<div class="card pad"><div class="empty">' + esc(workspace && workspace.error ? workspace.error : 'Loading Process Workspace…') + '</div></div>';
    persistProcessDraft();
    var lots = workspace.lots || [], selectedIds = draft.inputs.map(function (input) { return input.lot_id; });
    var materials = lots.map(function (lot) { var used = selectedIds.indexOf(lot.id) >= 0; return '<article class="process-material ' + (used ? 'used' : '') + '" draggable="true" data-process-lot="' + esc(lot.id) + '"><div class="process-material-head"><div><strong>' + esc(lot.item_name || 'Material') + '</strong><span>' + esc(lot.code) + '</span></div>' + (used ? '<span class="pill" style="background:#E6F0E9;color:#256238">Added</span>' : '<button class="btn sm" data-act="process-lot-use" data-id="' + esc(lot.id) + '">Use</button>') + '</div><div class="process-material-qty">' + esc(lotQty(lot)) + ' available</div><div class="hint">' + esc(lot.godown_name || 'No godown') + '</div></article>'; }).join('') || '<div class="empty">No available lots.</div>';
    var inputSummary = draft.inputs.map(function (input) { return '<div class="process-selected-line"><span>' + esc(input.item_name || 'Material') + ' · ' + esc(input.lot_code) + '</span><b>' + esc(input.quantity) + ' ' + esc(String(input.unit).toLowerCase()) + '</b></div>'; }).join('') || '<div class="hint">Drag or select a material card.</div>';
    var balance = processBalance(draft);
    var outputs = draft.outputs.map(function (output, index) { var label = output.semantic_type === 'byproduct' ? 'By-product' : output.semantic_type === 'waste' ? 'Loss' : 'Main output'; return '<div class="process-output-card"><div class="process-output-card-head"><div><strong>' + esc(output.item_name || 'Output') + '</strong><span>' + esc(label) + '</span></div>' + (output.template_line_id ? '' : '<button class="btn sm\" data-act=\"process-output-remove\" data-id=\"' + index + '\">Remove</button>') + '</div><div class=\"process-output-input\"><input data-process-output=\"' + index + '\" type=\"number\" step=\"0.001\" value=\"' + esc(output.quantity == null ? '' : output.quantity) + '\"' + (output.auto_calculate ? ' readonly' : '') + ' placeholder=\"Quantity\"><select data-process-unit=\"' + index + '\">' + processUnitOptions().map(function (unit) { return '<option value=\"' + unit.value + '\"' + (unit.value === output.unit ? ' selected' : '') + '>' + unit.label + '</option>'; }).join('') + '</select></div><div class=\"hint\">' + (output.auto_calculate ? 'Calculated from mass balance' : 'Enter actual quantity') + '</div></div>'; }).join('');
    return '<div class="process-toolbar"><div><div class="card-h">Process Workspace</div><div class="hint">Select a lot, confirm the quantity, then record the actual outputs.</div></div><div class="process-toolbar-actions"><div class="process-stepper">' + types.map(function (type, index) { return (index ? '<span class="process-step-arrow">→</span>' : '') + '<button class="' + (type.id === draft.processTypeId ? 'on' : '') + '" data-act="process-step" data-id="' + esc(type.id) + '">' + esc(type.name) + '</button>'; }).join('') + '</div><select class="process-select" data-process-select aria-label="Choose process">' + types.map(function (type) { return '<option value="' + esc(type.id) + '"' + (type.id === draft.processTypeId ? ' selected' : '') + '>' + esc(type.name) + '</option>'; }).join('') + '</select>' + (can('MANAGE_ORGANISATION') ? '<button class="btn sm" data-act="process-template-edit" data-id="' + esc(draft.processTypeId) + '">Configure process</button>' : '') + '</div></div>' +
      '<div class="process-flow"><section class="process-column"><div class="process-column-title">Available materials <span>' + lots.length + '</span></div><div class="process-materials">' + materials + '</div></section><section class="process-column process-center"><div class="process-column-title">Process</div><div class="process-dropzone" data-process-drop="1"><div class="process-drop-title">' + esc(workspace.process_type.name) + '</div><div class="hint">Drop a lot here or use a material card</div><div class="process-selected">' + inputSummary + '</div></div><div class="process-inline-actions"><button class="btn sm" data-act="process-input-add">+ Add input</button>' + (draft.inputs.length ? '<button class="btn sm" data-act="process-input-clear">Clear inputs</button>' : '') + '</div></section><section class="process-column"><div class="process-column-title">Outputs</div><div class="process-outputs">' + (outputs || '<div class="empty">Configure outputs or add one manually.</div>') + '</div><button class="btn ghost process-add-output" data-act="process-output-add">+ Add output</button><label class="process-godown-label">Destination godown<select data-process-destination>' + [{ value: '', label: 'Choose godown' }].concat((workspace.godowns || []).map(function (godown) { return { value: godown.id, label: godown.name }; })).map(function (godown) { return '<option value="' + esc(godown.value) + '"' + (godown.value === draft.destinationGodownId ? ' selected' : '') + '>' + esc(godown.label) + '</option>'; }).join('') + '</select></label></section></div>' +
      '<div id="process-balance">' + processBalanceMarkup(balance) + '</div><div class="process-actions"><button class="btn acc" data-act="process-run-post"' + (draft.inputs.length ? '' : ' disabled') + '>Post Run</button><span class="hint">Posting will consume the selected source lot and create traceable output stock.</span></div>';
  }
  function bindProcessWorkspace() {
    if (!S.processDraft || !S.processWorkspace) return;
    var select = document.querySelector('[data-process-select]');
    if (select) select.onchange = function () { S.processWorkspace = null; S.processDraft = null; processWorkspaceFor(select.value); };
    var destination = document.querySelector('[data-process-destination]');
    if (destination) destination.onchange = function () { S.processDraft.destinationGodownId = destination.value; S.processDraft.outputs.forEach(function (output) { if (!output.godown_id) output.godown_id = destination.value; }); persistProcessDraft(); };
    document.querySelectorAll('[data-process-output]').forEach(function (input) {
      input.oninput = function () { var index = Number(input.getAttribute('data-process-output')); if (S.processDraft.outputs[index]) S.processDraft.outputs[index].quantity = input.value; persistProcessDraft(); updateProcessBalance(); };
    });
    document.querySelectorAll('[data-process-unit]').forEach(function (unit) {
      unit.onchange = function () { var index = Number(unit.getAttribute('data-process-unit')); if (S.processDraft.outputs[index]) { S.processDraft.outputs[index].unit = unit.value; persistProcessDraft(); updateProcessBalance(); } };
    });
    document.querySelectorAll('[data-process-lot]').forEach(function (card) {
      card.ondragstart = function (event) { event.dataTransfer.setData('text/plain', card.getAttribute('data-process-lot')); event.dataTransfer.effectAllowed = 'copy'; };
    });
    var dropzone = document.querySelector('[data-process-drop]');
    if (dropzone) {
      dropzone.ondragover = function (event) { event.preventDefault(); dropzone.classList.add('drag-over'); };
      dropzone.ondragleave = function () { dropzone.classList.remove('drag-over'); };
      dropzone.ondrop = function (event) { event.preventDefault(); dropzone.classList.remove('drag-over'); var lot = processLotById(event.dataTransfer.getData('text/plain')); if (lot) processInputModal(lot); };
    }
  }
  function updateProcessBalance() {
    if (!S.processDraft) return;
    var balance = processBalance(S.processDraft), node = document.getElementById('process-balance');
    if (node) node.innerHTML = processBalanceMarkup(balance);
    S.processDraft.outputs.forEach(function (output, index) { var field = document.querySelector('[data-process-output="' + index + '"]'); if (field && output.auto_calculate) field.value = output.quantity == null ? '' : output.quantity; });
  }
  function loadTeam() {
    return fetch('/api/team').then(function (r) { return r.json(); }).then(function (j) { S.team = j.members || []; render(); });
  }
  function pageProcessing() {
    if (!S.processTypes || !S.processRuns) { if (!S.processTypes) loadProcessTypes(); if (!S.processRuns) loadProcessRuns(); return '<div class="card pad"><div class="empty">Loading processing…</div></div>'; }
    var firstType = activeProcessTypes()[0];
    if (firstType && (!S.processWorkspace || !S.processDraft || S.processDraft.processTypeId !== firstType.id) && !S.processWorkspace) { processWorkspaceFor(firstType.id); return '<div class="card pad"><div class="empty">Loading Process Workspace…</div></div>'; }
    var runRows = S.processRuns.map(function (run) { var summary = (run.lines || []).map(function (line) { return esc(line.line_type.toLowerCase()) + ': ' + esc(line.item_name || line.item_id) + ' ' + esc(line.quantity) + ' ' + esc(line.unit); }).join(' · '); var voidButton = run.status === 'POSTED' && can('VOID') ? '<button class="btn sm" data-act="process-run-void" data-id="' + esc(run.id) + '">Void</button>' : ''; return '<tr><td class="b7">' + esc(run.run_date) + '</td><td>' + esc(run.process_type_name || '—') + '</td><td>' + summary + '</td><td>' + esc(run.creator_name || '—') + '</td><td>' + pill(String(run.status || '').toLowerCase()) + ' ' + voidButton + '</td></tr>'; }).join('') || '<tr><td colspan="5" class="empty">No process runs yet.</td></tr>';
    return processWorkspaceMarkup() + '<div class="card process-types-card"><div class="card-top"><div><div class="card-h">Process Types</div><div class="hint">Configure reusable inputs, outputs and defaults for each process.</div></div><div style="display:flex;gap:8px">' + (can('MANAGE_ORGANISATION') ? '<button class="btn sm" data-act="process-type-new">+ Type</button>' + (firstType ? '<button class="btn sm icon-btn" title="Edit process flow" aria-label="Edit process flow" data-act="process-template-edit" data-id="' + esc(firstType.id) + '">✎</button>' : '') : '') + '</div></div><div class="twrap ms-scroll"><table class="ms"><thead><tr><th>Name</th><th>Description</th><th>Template</th><th>Status</th><th></th></tr></thead><tbody>' + (S.processTypes.map(function (p) { var archived = !!p.deleted_at, configured = (p.template_lines || []).length > 0; return '<tr><td class="b7">' + esc(p.name) + '</td><td>' + esc(p.description || '—') + '</td><td>' + (configured ? 'Configured' : 'Manual fallback') + '</td><td>' + (archived ? 'Archived' : 'Active') + '</td><td>' + (can('MANAGE_ORGANISATION') ? '<button class="btn sm" data-act="process-template-edit" data-id="' + esc(p.id) + '">Configure</button> ' : '') + (can('MANAGE_ORGANISATION') ? '<button class="btn sm" data-act="process-type-' + (archived ? 'restore' : 'archive') + '" data-id="' + esc(p.id) + '">' + (archived ? 'Unarchive' : 'Archive') + '</button>' : '') + '</td></tr>'; }).join('') || '<tr><td colspan="5" class="empty">No process types yet.</td></tr>') + '</tbody></table></div></div><div class="card"><div class="card-top"><div><div class="card-h">Recent process runs</div><div class="hint">Inputs, outputs and by-products remain linked to the stock ledger.</div></div></div><div class="twrap ms-scroll"><table class="ms"><thead><tr><th>Date</th><th>Process</th><th>Lines</th><th>Posted by</th><th>Status</th></tr></thead><tbody>' + runRows + '</tbody></table></div></div>';
  }
  function openProcessTemplateEditor(processType) {
    var old = document.getElementById('process-template-modal'); if (old) old.remove();
    var dlg = document.createElement('dialog'); dlg.className = 'modal process-template-modal'; dlg.id = 'process-template-modal';
    var items = (S.ov.items || []).map(function (item) { return { value: item.id, label: item.name }; });
    var godowns = [{ value: '', label: 'Process default' }].concat((S.ov.godowns || []).map(function (godown) { return { value: godown.id, label: godown.name }; }));
    var lines = (processType.template_lines || []).map(function (line) { return { line_type: line.line_type, semantic_type: line.semantic_type, item_id: line.item_id, default_unit: line.default_unit || '', default_godown_id: line.default_godown_id || '', required: line.required !== 0, auto_calculate: line.auto_calculate === 1 }; });
    function selectOptions(options, value) { return options.map(function (option) { return '<option value="' + esc(option.value) + '"' + (String(option.value) === String(value || '') ? ' selected' : '') + '>' + esc(option.label) + '</option>'; }).join(''); }
    function rowHtml(line) {
      line = line || { line_type: 'OUTPUT', semantic_type: 'main', item_id: '', default_unit: '', default_godown_id: '', required: true, auto_calculate: false };
      return '<div class="template-row"><select data-template-field="line_type"><option value="INPUT"' + (line.line_type === 'INPUT' ? ' selected' : '') + '>Input</option><option value="OUTPUT"' + (line.line_type === 'OUTPUT' ? ' selected' : '') + '>Output</option><option value="LOSS"' + (line.line_type === 'LOSS' ? ' selected' : '') + '>Loss</option></select><select data-template-field="semantic_type"><option value="input"' + (line.semantic_type === 'input' ? ' selected' : '') + '>Input</option><option value="main"' + (line.semantic_type === 'main' ? ' selected' : '') + '>Main output</option><option value="byproduct"' + (line.semantic_type === 'byproduct' ? ' selected' : '') + '>By-product</option><option value="waste"' + (line.semantic_type === 'waste' ? ' selected' : '') + '>Waste / loss</option></select><select data-template-field="item_id">' + selectOptions([{ value: '', label: 'Choose item' }].concat(items), line.item_id) + '</select><select data-template-field="default_unit">' + selectOptions([{ value: '', label: 'Default unit' }].concat(processUnitOptions()), line.default_unit) + '</select><select data-template-field="default_godown">' + selectOptions(godowns, line.default_godown_id) + '</select><label class="template-check"><input type="checkbox" data-template-field="required"' + (line.required ? ' checked' : '') + '>Required</label><label class="template-check"><input type="checkbox" data-template-field="auto_calculate"' + (line.auto_calculate ? ' checked' : '') + '>Auto loss</label><button type="button" class="btn sm" data-template-remove>Remove</button></div>';
    }
    dlg.innerHTML = '<div class="modal-h">Configure ' + esc(processType.name) + '</div><form class="modal-b"><div class="hint">Define the repeatable inputs and outputs used by the Process Workspace.</div><div class="frow modal-row"><div class="fld"><label>Default unit</label><select name="default_unit">' + selectOptions([{ value: '', label: 'Choose unit' }].concat(processUnitOptions()), processType.default_unit || '') + '</select></div><div class="fld"><label>Default destination godown</label><select name="default_destination_godown_id">' + selectOptions(godowns, processType.default_destination_godown_id || '') + '</select></div></div><div class="template-grid-head"><span>Flow line</span><span>Meaning</span><span>Item</span><span>Unit</span><span>Godown</span><span>Rules</span><span></span></div><div class="template-rows"></div><button type="button" class="btn ghost" data-template-add>+ Add flow line</button><div class="form-err"></div><div class="frow"><button type="button" class="btn ghost" data-template-cancel>Cancel</button><button type="submit" class="btn acc">Save template</button></div></form>';
    document.body.appendChild(dlg);
    var rowsEl = dlg.querySelector('.template-rows');
    function bindTemplateRows() {
      rowsEl.querySelectorAll('.template-row').forEach(function (row) {
        row.draggable = true;
        row.ondragstart = function (event) { event.dataTransfer.setData('text/plain', 'template-row'); row.classList.add('dragging'); };
        row.ondragend = function () { row.classList.remove('dragging'); };
        row.ondragover = function (event) { event.preventDefault(); };
        row.ondrop = function (event) { event.preventDefault(); var dragging = rowsEl.querySelector('.template-row.dragging'); if (dragging && dragging !== row) rowsEl.insertBefore(dragging, row); };
      });
    }
    function appendRow(line) { rowsEl.insertAdjacentHTML('beforeend', rowHtml(line)); bindTemplateRows(); }
    lines.forEach(appendRow); if (!lines.length) { appendRow({ line_type: 'INPUT', semantic_type: 'input' }); appendRow(); }
    dlg.querySelector('[data-template-add]').onclick = function () { appendRow(); };
    dlg.querySelector('[data-template-cancel]').onclick = function () { dlg.close(); dlg.remove(); };
    rowsEl.addEventListener('click', function (event) { var remove = event.target.closest('[data-template-remove]'); if (remove) remove.parentElement.remove(); });
    dlg.querySelector('form').onsubmit = function (event) {
      event.preventDefault();
      var payload = { default_unit: dlg.querySelector('[name="default_unit"]').value || null, default_destination_godown_id: dlg.querySelector('[name="default_destination_godown_id"]').value || null, lines: [] };
      rowsEl.querySelectorAll('.template-row').forEach(function (row, index) {
        var value = function (name) { var field = row.querySelector('[data-template-field="' + name + '"]'); return field.type === 'checkbox' ? field.checked : field.value; };
        if (!value('item_id')) return;
        payload.lines.push({ line_type: value('line_type'), semantic_type: value('semantic_type'), item_id: value('item_id'), default_unit: value('default_unit') || null, default_godown_id: value('default_godown') || null, required: value('required'), auto_calculate: value('auto_calculate'), sort_order: index });
      });
      apiPost('/api/process-types/' + encodeURIComponent(processType.id) + '/template', payload, 'PUT').then(function () { clearProcessDraft(processType.id); dlg.close(); dlg.remove(); S.processTypes = null; S.processWorkspace = null; S.processDraft = null; toast('Process template saved.', 'success'); render(); }).catch(function (err) { dlg.querySelector('.form-err').textContent = err.message; });
    };
    dlg.showModal();
  }
  function pageTeam() {
    if (!S.team) { loadTeam(); return '<div class="card pad"><div class="empty">Loading team…</div></div>'; }
    var rows = S.team.map(function (m) { var edit = can('MANAGE_MEMBERS') && m.role !== 'owner' && m.id !== (S.ov.me && S.ov.me.id) ? '<button class="btn sm" data-act="team-edit" data-id="' + esc(m.id) + '">Manage</button>' : ''; return '<tr><td class="b7">' + esc(m.name) + '</td><td>' + esc(m.email) + '</td><td>' + esc(m.role) + '</td><td>' + (m.active ? 'Active' : 'Invited / inactive') + '</td><td>' + edit + '</td></tr>'; }).join('') || '<tr><td colspan="5" class="empty">No members yet.</td></tr>';
    return '<div class="card"><div class="card-top"><div><div class="card-h">Organisation team</div><div class="hint">Create shareable invites or owner-created accounts, change access, or deactivate access without deleting history.</div></div><div style="display:flex;gap:8px">' + (can('MANAGE_ORGANISATION') ? '<button class="btn sm" data-act="org-edit">Edit profile</button>' : '') + (can('MANAGE_MEMBERS') ? '<button class="btn sm" data-act="team-account">+ Create account</button><button class="btn acc" data-act="team-invite">+ Invite member</button>' : '') + '</div></div><div class="twrap ms-scroll"><table class="ms"><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th></th></tr></thead><tbody>' + rows + '</tbody></table></div></div>';
  }
  function loadDocuments() {
    return fetch('/api/documents').then(function (r) { return r.json(); }).then(function (j) { S.documents = j.documents || []; render(); });
  }
  function pageDocuments() {
    if (!S.documents) { loadDocuments(); return '<div class="card pad"><div class="empty">Loading documents…</div></div>'; }
    var documentPage = pageSlice(filt(S.documents), 'documents');
    var rows = documentPage.rows.map(function (d) { var voidButton = d.status === 'POSTED' && can('VOID') ? ' <button class="btn sm" data-act="document-void" data-id="' + esc(d.id) + '">Void</button>' : ''; var printButton = can('EXPORT') ? '<a class="btn sm" target="_blank" rel="noopener" href="/api/documents/' + encodeURIComponent(d.id) + '/print">Print / PDF</a>' : ''; return '<tr><td class="tok">' + esc(d.document_no) + '</td><td>' + esc(d.document_type) + '</td><td>' + esc(d.issue_date) + '</td><td class="b7">' + (canMoney() ? money(d.total_paise) : '—') + '</td><td>' + pill(String(d.status || '').toLowerCase()) + '</td><td>' + printButton + voidButton + '</td></tr>'; }).join('') || '<tr><td colspan="6" class="empty">No documents yet.</td></tr>';
    return '<div class="card"><div class="card-top"><div><div class="card-h">Business documents</div><div class="hint">Posted records remain available for export and printing.</div></div><div style="display:flex;gap:8px">' + (can('EXPORT') ? '<a class="btn sm" href="/api/documents/export.csv">CSV</a><a class="btn sm" href="/api/documents/export.xls">Excel</a>' : '') + (['owner', 'admin', 'manager', 'accountant'].indexOf(S.role) >= 0 && can('CREATE') ? '<button class="btn acc" data-act="document-new">+ New document</button>' : '') + '</div></div>' + filterToolbar(S.documents, 'documents') + '<div class="twrap ms-scroll"><table class="ms"><thead><tr><th>Number</th><th>Type</th><th>Issue date</th><th>Total</th><th>Status</th><th></th></tr></thead><tbody>' + rows + '</tbody></table></div>' + pager(documentPage, 'documents') + '</div>';
  }
  function parseCsv(text) {
    var rows = [], row = [], cell = '', quoted = false;
    for (var i = 0; i < text.length; i++) { var ch = text[i], next = text[i + 1]; if (ch === '"' && quoted && next === '"') { cell += '"'; i++; } else if (ch === '"') quoted = !quoted; else if (ch === ',' && !quoted) { row.push(cell.trim()); cell = ''; } else if ((ch === '\n' || ch === '\r') && !quoted) { if (ch === '\r' && next === '\n') i++; row.push(cell.trim()); if (row.some(Boolean)) rows.push(row); row = []; cell = ''; } else cell += ch; }
    row.push(cell.trim()); if (row.some(Boolean)) rows.push(row); if (!rows.length) return [];
    var headers = rows.shift().map(function (h) { return h.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, ''); });
    return rows.map(function (values) { var out = {}; headers.forEach(function (h, index) { out[h] = values[index] || ''; }); return out; });
  }
  function zipU16(view, offset) { return view.getUint16(offset, true); }
  function zipU32(view, offset) { return view.getUint32(offset, true); }
  async function unzipXlsx(buffer) {
    var bytes = new Uint8Array(buffer), view = new DataView(buffer), eocd = -1;
    for (var i = Math.max(0, bytes.length - 65557); i <= bytes.length - 22; i++) {
      if (zipU32(view, i) === 0x06054b50) eocd = i;
    }
    if (eocd < 0) throw new Error('This XLSX file is not a valid ZIP workbook.');
    var count = zipU16(view, eocd + 10), centralOffset = zipU32(view, eocd + 16);
    if (!count || count > 100 || centralOffset >= bytes.length) throw new Error('This XLSX file has an unsupported structure.');
    var files = {};
    for (var pos = centralOffset, n = 0; n < count; n++) {
      if (zipU32(view, pos) !== 0x02014b50) throw new Error('This XLSX file has an invalid directory.');
      var method = zipU16(view, pos + 10), compressed = zipU32(view, pos + 20), uncompressed = zipU32(view, pos + 24);
      var nameLength = zipU16(view, pos + 28), extraLength = zipU16(view, pos + 30), commentLength = zipU16(view, pos + 32), localOffset = zipU32(view, pos + 42);
      var name = new TextDecoder().decode(bytes.slice(pos + 46, pos + 46 + nameLength));
      if (uncompressed > 8 * 1024 * 1024 || compressed > bytes.length || localOffset >= bytes.length) throw new Error('This XLSX file exceeds the safe import limits.');
      var localNameLength = zipU16(view, localOffset + 26), localExtraLength = zipU16(view, localOffset + 28), dataStart = localOffset + 30 + localNameLength + localExtraLength;
      var compressedData = bytes.slice(dataStart, dataStart + compressed), data;
      if (method === 0) data = compressedData;
      else if (method === 8 && typeof DecompressionStream === 'function') data = new Uint8Array(await new Response(new Blob([compressedData]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer());
      else throw new Error('This XLSX file uses an unsupported compression method.');
      files[name] = new TextDecoder().decode(data);
    }
    return files;
  }
  function xlsxColumn(cellRef) {
    var letters = String(cellRef || '').match(/^[A-Z]+/i); if (!letters) return 0;
    return letters[0].toUpperCase().split('').reduce(function (value, letter) { return value * 26 + letter.charCodeAt(0) - 64; }, 0) - 1;
  }
  function xlsxText(node) { return node ? String(node.textContent || '').replace(/\s+/g, ' ').trim() : ''; }
  async function parseXlsx(buffer) {
    var files = await unzipXlsx(buffer), sheet = files['xl/worksheets/sheet1.xml'];
    if (!sheet) throw new Error('The XLSX workbook does not contain a first worksheet.');
    var shared = [];
    if (files['xl/sharedStrings.xml']) {
      var sharedDoc = new DOMParser().parseFromString(files['xl/sharedStrings.xml'], 'application/xml');
      Array.prototype.forEach.call(sharedDoc.getElementsByTagName('si'), function (node) { shared.push(xlsxText(node)); });
    }
    var doc = new DOMParser().parseFromString(sheet, 'application/xml');
    if (doc.getElementsByTagName('parsererror').length) throw new Error('The XLSX worksheet could not be read.');
    var rows = [];
    Array.prototype.forEach.call(doc.getElementsByTagName('row'), function (rowNode) {
      var cells = [], cellsByColumn = {};
      Array.prototype.forEach.call(rowNode.getElementsByTagName('c'), function (cell) {
        var col = xlsxColumn(cell.getAttribute('r')), valueNode = cell.getElementsByTagName('v')[0], value = valueNode ? xlsxText(valueNode) : '';
        if (cell.getAttribute('t') === 's') value = shared[Number(value)] || '';
        else if (cell.getAttribute('t') === 'inlineStr') value = xlsxText(cell.getElementsByTagName('is')[0]);
        cellsByColumn[col] = value;
      });
      var max = Object.keys(cellsByColumn).reduce(function (m, key) { return Math.max(m, Number(key)); }, -1);
      for (var col = 0; col <= max; col++) cells.push(cellsByColumn[col] || '');
      if (cells.some(Boolean)) rows.push(cells);
    });
    if (!rows.length) return [];
    var headers = rows.shift().map(function (h) { return h.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, ''); });
    return rows.slice(0, 1000).map(function (values) { var out = {}; headers.forEach(function (h, index) { out[h] = values[index] || ''; }); return out; });
  }
  function mapPartyImportRows(kind, rows) {
    var targets = kind === 'supplier'
      ? ['name', 'type', 'place', 'phone', 'email', 'gstin', 'address']
      : ['name', 'type', 'location', 'phone', 'email', 'gstin', 'address'];
    var aliases = {
      name: ['name', 'party_name', 'supplier_name', 'buyer_name', 'customer_name', 'vendor_name'],
      type: ['type', 'party_type', 'category', 'kind'],
      place: ['place', 'location', 'city', 'district', 'town'],
      location: ['location', 'place', 'city', 'district', 'town'],
      phone: ['phone', 'mobile', 'mobile_no', 'phone_number', 'contact', 'contact_number'],
      email: ['email', 'email_address', 'mail'],
      gstin: ['gstin', 'gst', 'gst_no', 'gst_number', 'tax_id'],
      address: ['address', 'postal_address', 'full_address'],
    };
    var headers = [];
    rows.forEach(function (row) { Object.keys(row).forEach(function (key) { if (headers.indexOf(key) < 0) headers.push(key); }); });
    var mapping = {};
    targets.forEach(function (target) {
      var candidates = aliases[target] || [target];
      mapping[target] = candidates.find(function (candidate) { return headers.indexOf(candidate) >= 0; }) || '';
    });
    return {
      rows: rows.map(function (row) {
        var mapped = {};
        targets.forEach(function (target) { if (mapping[target]) mapped[target] = row[mapping[target]] || ''; });
        return mapped;
      }),
      summary: targets.filter(function (target) { return mapping[target]; }).map(function (target) { return mapping[target] + ' → ' + target; }),
    };
  }
  function importParties(kind) {
    var input = document.createElement('input'); input.type = 'file'; input.accept = '.csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    function validateAndCommit(rows) {
      if (!rows.length || rows.length > 1000) return Promise.reject(new Error('File must contain between 1 and 1,000 data rows.'));
      var mapped = mapPartyImportRows(kind, rows);
      if (!mapped.summary.length) return Promise.reject(new Error('No recognized party columns were found. Download the template or use name, phone, email and GSTIN headers.'));
      if (!confirm('Detected column mapping:\n' + mapped.summary.join('\n') + '\n\nContinue to preview and validate these rows?')) return null;
      return apiPost('/api/parties/import/validate', { kind: kind, rows: mapped.rows }).then(function (check) { var clean = check.rows.filter(function (r) { return !r.error && !r.duplicate; }).map(function (r) { return r.row; }); if (!clean.length || !confirm('Preview: ' + clean.length + ' valid, ' + check.duplicates + ' duplicate(s), ' + check.errors + ' error(s). Import valid rows?')) return null; return apiPost('/api/parties/import/commit', { kind: kind, rows: clean, skip_duplicates: true }); });
    }
    input.onchange = function () { var file = input.files && input.files[0]; if (!file || file.size > 2 * 1024 * 1024) return alert('Choose a CSV or XLSX file up to 2 MB.'); var isXlsx = /\.xlsx$/i.test(file.name); file.arrayBuffer().then(function (buffer) { if (isXlsx && new Uint8Array(buffer)[0] !== 80) throw new Error('The selected XLSX file is invalid.'); return isXlsx ? parseXlsx(buffer) : Promise.resolve(parseCsv(new TextDecoder().decode(buffer))); }).then(validateAndCommit).then(function (result) { if (result) { alert('Imported ' + result.imported + ', skipped ' + result.skipped + ', failed ' + result.failed + '.'); refresh(); } }).catch(function (err) { alert(err.message); }); }; input.click();
  }

  function pageBugReports() {
    if (!isSupportAdmin()) return '<div class="empty">Not found.</div>';
    if (!S.bugs) {
      loadBugReports();
      return '<div class="empty">Loading bug reports...</div>';
    }
    if (S.bugsError) return '<div class="card pad"><div class="card-h">Could not load reports</div><div class="empty">' + esc(S.bugsError) + '</div></div>';
    var rows = filt(S.bugs);
    var open = S.bugs.filter(function (t) { return t.status === 'open'; }).length;
    var bugs = S.bugs.filter(function (t) { return t.kind === 'bug'; }).length;
    var latest = S.bugs[0] ? ago(S.bugs[0].created_at) : 'Never';
    var body = rows.map(function (t) {
      var next = t.status === 'open' ? 'reviewed' : (t.status === 'reviewed' ? 'closed' : 'open');
      return '<tr><td>' + pill(t.kind) + '</td>' +
        '<td><div class="b7">' + esc(t.mill_name || 'Unknown mill') + '</div><div class="mut">' + esc(t.user_name || 'Unknown user') + ' &middot; ' + esc(t.user_email || t.contact || '') + '</div></td>' +
        '<td class="mut">' + esc(t.page || '-') + '</td>' +
        '<td style="min-width:280px;white-space:normal;line-height:1.45">' + esc(t.message) + '</td>' +
        '<td class="mut">' + esc(t.contact || '-') + '</td>' +
        '<td>' + pill(t.status) + '</td>' +
        '<td class="mut">' + ago(t.created_at) + '</td>' +
        '<td><button class="btn sm" data-act="bug-status" data-id="' + esc(t.id) + '" data-status="' + next + '">' + (next === 'reviewed' ? 'Review' : next === 'closed' ? 'Close' : 'Reopen') + '</button></td></tr>';
    }).join('') || '<tr><td colspan="8" class="empty">No reports match.</td></tr>';
    return '<div class="kpis" style="grid-template-columns:repeat(auto-fit,minmax(180px,1fr));margin-bottom:18px">' +
      kpiCard('Open reports', open, 'need triage', open ? 'var(--red)' : null, open ? 'var(--red)' : null) +
      kpiCard('Bug reports', bugs, 'all time in queue') +
      kpiCard('Latest report', latest, 'most recent ticket') + '</div>' +
      '<div class="card"><div class="card-top"><div class="card-h">Feedback &amp; bug reports</div>' +
      '<div style="display:flex;gap:10px;align-items:center"><span class="hint">' + rows.length + ' shown</span>' +
      '<button class="btn sm" data-act="bugs-refresh">Refresh</button></div></div>' +
      '<div class="twrap ms-scroll"><table class="ms" style="min-width:1080px"><thead><tr>' +
      '<th>Type</th><th>Mill / user</th><th>Page</th><th>Message</th><th>Contact</th><th>Status</th><th>Age</th><th></th>' +
      '</tr></thead><tbody>' + body + '</tbody></table></div></div>';
  }

  function pageDigest() {
    var wrap = document.createElement('div');
    function paint(d) {
      var mb = d.mass_balance;
      var over = mb.in_kg > 0 && mb.unexplained_pct > S.ov.mill.loss_limit_pct;
      var el = document.getElementById('digest-box');
      if (!el) return;
      el.innerHTML =
        '<div style="display:flex;flex-wrap:wrap;gap:40px;align-items:flex-start;max-width:1000px">' +
        '<div class="phone"><div class="scr"><div class="hd">' +
        '<div style="display:flex;justify-content:space-between;font-size:11px;color:#8B97A6;font-weight:600"><span>9:14 PM</span><span>● synced</span></div>' +
        '<div class="arch" style="font-weight:700;font-size:17px;margin-top:14px">Night Digest · ' + esc(dstr(d.date)) + '</div>' +
        '<div style="font-size:12px;color:#C7CFDA;font-weight:500">' + esc(S.ov.mill.name) + '</div></div>' +
        '<div class="bd">' +
        '<div class="row"><span class="mut">Paddy in today</span><span class="b7">' + d.trucks_in + ' trucks · ' + qtl(d.paddy_in_kg) + ' qtl</span></div>' +
        '<div class="row"><span class="mut">Dispatched</span><span class="b7">' + qtl(d.dispatched_kg) + ' qtl</span></div>' +
        (d.cash_paid_paise != null ? '<div class="row"><span class="mut">Cash paid</span><span class="b7">' + money(d.cash_paid_paise) + '</span></div>' : '') +
        (mb.in_kg > 0
          ? '<div class="' + (over ? 'warn-box' : 'ok-box') + '" style="margin-top:4px"><div style="display:flex;justify-content:space-between;align-items:center">' +
            '<span style="font-size:13px;font-weight:700;color:' + (over ? 'var(--red-ink)' : '#256238') + '">' + (over ? '⚠' : '✓') + ' Unexplained loss</span>' +
            '<span class="arch" style="font-weight:800;font-size:17px;color:' + (over ? 'var(--red)' : 'var(--green)') + '">' + pct(mb.unexplained_pct) + '</span></div>' +
            '<div style="font-size:12px;font-weight:600;margin-top:3px;color:' + (over ? 'var(--red-ink)' : '#256238') + '">' + (over ? 'Above' : 'Within') + ' your ' + S.ov.mill.loss_limit_pct + '% limit.</div></div>'
          : '<div class="empty" style="padding:14px 0">No production entered today.</div>') +
        '<div class="deva" style="font-size:13px;color:var(--muted2);font-weight:500;text-align:center;margin-top:4px">पता चलेगा माल कहाँ जा रहा है।</div>' +
        '</div></div></div>' +
        '<div style="flex:1 1 320px;min-width:280px">' +
        '<div class="arch" style="font-weight:800;font-size:24px;letter-spacing:-.02em">The owner’s whole day, on one screen.</div>' +
        '<p style="font-size:15.5px;line-height:1.6;color:var(--muted2);font-weight:500;margin:14px 0 0">The same summary you call your manager for every night — automatic and accurate. Share it on WhatsApp in one tap. Free, like everything else here.</p>' +
        (d.wa_share_url ? '<a class="btn acc" style="margin-top:22px;text-decoration:none" href="' + esc(d.wa_share_url) + '" target="_blank" rel="noopener">Share on WhatsApp</a>' : '') +
        '</div></div>';
    }
    wrap.id = 'digest-box';
    wrap.innerHTML = '<div class="empty">Building tonight’s digest…</div>';
    if (MODE === 'demo') {
      setTimeout(function () { paint(window.DEMO_DIGEST); }, 0);
    } else {
      fetch('/api/digest').then(function (r) { return r.json(); }).then(paint);
    }
    return wrap;
  }

  // ---------- actions ----------
  function openAction(act, el) {
    var ov = S.ov;
    if (act === 'profile') {
      var me = ov.me || {};
      modal('Your profile', [
        { name: 'profile_name', label: 'Name', type: 'info', value: me.name },
        { name: 'profile_email', label: 'Email', type: 'info', value: me.email },
        { name: 'profile_role', label: 'Role', type: 'info', value: me.role },
        { name: 'preferred_unit', label: 'Preferred quantity unit', type: 'select', value: me.preferred_unit || 'QUINTAL', options: [{ value: 'KG', label: 'kg' }, { value: 'QUINTAL', label: 'quintal' }, { value: 'TONNE', label: 'tonne' }, { value: 'BAG', label: 'bag' }, { value: 'PIECE', label: 'piece' }] },
        { name: 'theme', label: 'Appearance', type: 'toggle', value: me.theme || 'light', options: [{ value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }] },
      ], 'Save preference', function (d) { return apiPost('/api/auth/me', { preferred_unit: d.preferred_unit, theme: d.theme }, 'PATCH').then(function () { ov.me.preferred_unit = d.preferred_unit; ov.me.theme = d.theme; document.documentElement.setAttribute('data-theme', d.theme); }); });
    } else if (act === 'nav-open') {
      var menu = document.getElementById('mobile-nav');
      if (menu) { menu.classList.add('open'); document.body.classList.add('nav-open'); }
      var trigger = document.querySelector('.menu-trigger');
      if (trigger) trigger.setAttribute('aria-expanded', 'true');
    } else if (act === 'nav-close') {
      var closed = document.getElementById('mobile-nav');
      if (closed) { closed.classList.remove('open'); document.body.classList.remove('nav-open'); }
      var opener = document.querySelector('.menu-trigger');
      if (opener) { opener.setAttribute('aria-expanded', 'false'); opener.focus(); }
    } else if (act === 'period') {
      var nextPeriod = el.getAttribute('data-period');
      if (nextPeriod && nextPeriod !== S.period) { S.period = nextPeriod; loadOverview().then(render); }
    } else if (act === 'page-prev' || act === 'page-next') {
      var pageKey = el.getAttribute('data-page-key');
      S.pageIndex[pageKey] = Math.max(0, (S.pageIndex[pageKey] || 0) + (act === 'page-next' ? 1 : -1));
      render();
    } else if (act === 'filters-clear') {
      S.q = ''; delete S.filters[S.page]; S.pageIndex = {}; render();
    } else if (act === 'party-import') {
      importParties(el.getAttribute('data-kind'));
    } else if (act === 'bugs-refresh') {
      S.bugs = null;
      render();
    } else if (act === 'process-type-new') {
      modal('New process type', [{ name: 'name', label: 'Name', required: true, placeholder: 'Dehusking' }, { name: 'description', label: 'Description' }], 'Create', function (d) { return apiPost('/api/process-types', d).then(function () { S.processTypes = null; S.processWorkspace = null; S.processDraft = null; }); });
    } else if (act === 'process-type-archive') {
      if (!confirm('Archive this process type? Existing runs will remain available.')) return;
      return apiPost('/api/process-types/' + encodeURIComponent(el.getAttribute('data-id')), {}, 'DELETE').then(function () { S.processTypes = null; render(); });
    } else if (act === 'process-type-restore') {
      return apiPost('/api/process-types/' + encodeURIComponent(el.getAttribute('data-id')) + '/restore', {}, 'PATCH').then(function () { S.processTypes = null; render(); });
    } else if (act === 'process-run-void') {
      if (!confirm('Void this process run? Its posted stock movements will be reversed and source-lot quantities restored.')) return;
      return apiPost('/api/process-runs/' + encodeURIComponent(el.getAttribute('data-id')) + '/void', { reason: 'Voided from Processing' }).then(function () { S.processRuns = null; render(); });
    } else if (act === 'process-template-edit') {
      var templateType = (S.processTypes || []).find(function (type) { return type.id === el.getAttribute('data-id'); });
      if (templateType) openProcessTemplateEditor(templateType);
    } else if (act === 'process-step') {
      var stepId = el.getAttribute('data-id');
      if (stepId && (!S.processDraft || S.processDraft.processTypeId !== stepId)) { S.processWorkspace = null; S.processDraft = null; processWorkspaceFor(stepId); }
    } else if (act === 'process-lot-use') {
      var useLot = processLotById(el.getAttribute('data-id'));
      if (useLot && S.processDraft) processInputModal(useLot);
    } else if (act === 'process-input-add') {
      if (S.processDraft) processInputSelectionModal();
    } else if (act === 'process-input-clear') {
      if (S.processDraft) { S.processDraft.inputs = []; persistProcessDraft(); render(); }
    } else if (act === 'process-output-add') {
      if (S.processDraft) processOutputModal();
    } else if (act === 'process-output-remove') {
      if (S.processDraft) { S.processDraft.outputs.splice(Number(el.getAttribute('data-id')), 1); persistProcessDraft(); render(); }
    } else if (act === 'process-run-post') {
      if (!can('CREATE') || !S.processDraft || !S.processDraft.inputs.length) return;
      var draft = S.processDraft, balance = processBalance(draft);
      var missing = draft.outputs.some(function (output) { return output.required && num(output.quantity) <= 0; });
      if (missing) { window.alert('Enter the actual quantity for every required output.'); return; }
      if (balance.allMass && balance.difference < -0.001) { window.alert('Accounted output is greater than the selected input. Check the quantities.'); return; }
      var lines = draft.inputs.map(function (input) { return { line_type: 'INPUT', semantic_type: 'input', item_id: input.item_id, lot_id: input.lot_id, quantity: input.quantity, unit: input.unit }; }).concat(draft.outputs.filter(function (output) { return num(output.quantity) > 0; }).map(function (output) { return { line_type: output.line_type, semantic_type: output.semantic_type, template_line_id: output.template_line_id || null, item_id: output.item_id, godown_id: output.godown_id || draft.destinationGodownId || null, quantity: output.quantity, unit: output.unit }; }));
      return apiPost('/api/process-runs', { process_type_id: draft.processTypeId, destination_godown_id: draft.destinationGodownId || null, lines: lines }).then(function () { clearProcessDraft(draft.processTypeId); S.processRuns = null; S.processWorkspace = null; S.processDraft = null; toast('Process run posted successfully.', 'success'); return refresh(); });
    } else if (act === 'process-run-new') {
      var itemOptions = optList(ov.items, [{ value: '', label: '—' }]);
      var processUnitOptions = [{ value: 'KG', label: 'kg' }, { value: 'QUINTAL', label: 'quintal' }, { value: 'TONNE', label: 'tonne' }, { value: 'BAG', label: 'bag' }, { value: 'PIECE', label: 'piece' }];
      var lineFields = [{ name: 'process_type_id', label: 'Process type', type: 'select', options: (S.processTypes || []).map(function (p) { return { value: p.id, label: p.name }; }) }, { name: 'input_item', label: 'Input item', type: 'select', options: itemOptions }, { name: 'source_lot', label: 'Source lot (optional)', type: 'select', options: optList(ov.lots, [{ value: '', label: '—' }]) }, { name: 'input_qty', label: 'Input quantity', type: 'number', step: '0.001', required: true }, { name: 'input_unit', label: 'Input unit', type: 'select', options: processUnitOptions }, { name: 'input_item_2', label: 'Second input (optional)', type: 'select', options: itemOptions }, { name: 'input_lot_2', label: 'Second input lot (optional)', type: 'select', options: optList(ov.lots, [{ value: '', label: '—' }]) }, { name: 'input_qty_2', label: 'Second input quantity', type: 'number', step: '0.001' }, { name: 'input_unit_2', label: 'Second input unit', type: 'select', options: processUnitOptions }, { name: 'output_item', label: 'Output item', type: 'select', options: itemOptions }, { name: 'output_qty', label: 'Output quantity', type: 'number', step: '0.001', required: true }, { name: 'output_unit', label: 'Output unit', type: 'select', options: processUnitOptions }, { name: 'output_item_2', label: 'Second output (optional)', type: 'select', options: itemOptions }, { name: 'output_qty_2', label: 'Second output quantity', type: 'number', step: '0.001' }, { name: 'output_unit_2', label: 'Second output unit', type: 'select', options: processUnitOptions }, { name: 'destination_godown', label: 'Output godown (optional)', type: 'select', options: optList(ov.godowns, [{ value: '', label: '—' }]) }, { name: 'byproduct_item', label: 'By-product output (optional)', type: 'select', options: itemOptions }, { name: 'byproduct_qty', label: 'By-product quantity', type: 'number', step: '0.001' }, { name: 'byproduct_unit', label: 'By-product unit', type: 'select', options: processUnitOptions }, { name: 'loss_item', label: 'Process loss / waste item (optional)', type: 'select', options: itemOptions }, { name: 'loss_qty', label: 'Process loss quantity', type: 'number', step: '0.001' }, { name: 'loss_unit', label: 'Process loss unit', type: 'select', options: processUnitOptions }];
      modal('New process run', lineFields, 'Post run', function (d) { var lines = [{ line_type: 'INPUT', item_id: d.input_item, lot_id: d.source_lot || null, quantity: d.input_qty, unit: d.input_unit || 'KG' }, { line_type: 'OUTPUT', item_id: d.output_item, godown_id: d.destination_godown || null, quantity: d.output_qty, unit: d.output_unit || 'KG' }]; if (d.input_item_2 && num(d.input_qty_2) > 0) lines.push({ line_type: 'INPUT', item_id: d.input_item_2, lot_id: d.input_lot_2 || null, quantity: d.input_qty_2, unit: d.input_unit_2 || 'KG' }); if (d.output_item_2 && num(d.output_qty_2) > 0) lines.push({ line_type: 'OUTPUT', item_id: d.output_item_2, godown_id: d.destination_godown || null, quantity: d.output_qty_2, unit: d.output_unit_2 || 'KG' }); if (d.byproduct_item && num(d.byproduct_qty) > 0) lines.push({ line_type: 'OUTPUT', item_id: d.byproduct_item, godown_id: d.destination_godown || null, quantity: d.byproduct_qty, unit: d.byproduct_unit || 'KG' }); if (d.loss_item && num(d.loss_qty) > 0) lines.push({ line_type: 'LOSS', item_id: d.loss_item, godown_id: d.destination_godown || null, quantity: d.loss_qty, unit: d.loss_unit || 'KG' }); return apiPost('/api/process-runs', { process_type_id: d.process_type_id, destination_godown_id: d.destination_godown || null, lines: lines }).then(function (j) { S.processRuns = null; return j; }); });
    } else if (act === 'org-edit') {
      var org = ov.mill || {};
      modal('Organisation profile', [
        { name: 'name', label: 'Organisation name', required: true, value: org.name || '' },
        { name: 'address', label: 'Address', type: 'textarea', value: org.address || '' },
        { name: 'phone', label: 'Phone', value: org.phone || '' },
        { name: 'email', label: 'Email', type: 'email', value: org.email || '' },
        { name: 'gstin', label: 'GSTIN (optional)', value: org.gstin || '' },
        { name: 'place_of_supply', label: 'Place of supply', value: org.place_of_supply || '' },
      ], 'Save profile', function (d) { return apiPost('/api/organisation', d, 'PATCH').then(refresh); });
    } else if (act === 'team-invite') {
      modal('Invite team member', [{ name: 'name', label: 'Name', required: true }, { name: 'email', label: 'Email', type: 'email', required: true }, { name: 'role', label: 'Role', type: 'select', options: [{ value: 'admin', label: 'Admin' }, { value: 'manager', label: 'Manager' }, { value: 'accountant', label: 'Accountant' }, { value: 'gate_operator', label: 'Gate operator' }, { value: 'production_operator', label: 'Production operator' }, { value: 'viewer', label: 'Viewer' }] }], 'Create invite', function (d) { return apiPost('/api/team/invite', d).then(function (j) { S.team = null; window.prompt('Share this invite link with the member:', location.origin + j.invite_url); }); });
    } else if (act === 'team-account') {
      modal('Create team account', [{ name: 'name', label: 'Name', required: true }, { name: 'email', label: 'Email', type: 'email', required: true }, { name: 'password', label: 'Temporary password', type: 'password', required: true }, { name: 'role', label: 'Role', type: 'select', options: [{ value: 'admin', label: 'Admin' }, { value: 'manager', label: 'Manager' }, { value: 'accountant', label: 'Accountant' }, { value: 'gate_operator', label: 'Gate operator' }, { value: 'production_operator', label: 'Production operator' }, { value: 'viewer', label: 'Viewer' }] }], 'Create account', function (d) { return apiPost('/api/team/account', d).then(function () { S.team = null; }); });
    } else if (act === 'team-edit') {
      var member = (S.team || []).find(function (m) { return m.id === el.getAttribute('data-id'); });
      if (!member) return;
      modal('Manage ' + member.name, [{ name: 'role', label: 'Role', type: 'select', options: [{ value: 'admin', label: 'Admin' }, { value: 'manager', label: 'Manager' }, { value: 'accountant', label: 'Accountant' }, { value: 'gate_operator', label: 'Gate operator' }, { value: 'production_operator', label: 'Production operator' }, { value: 'viewer', label: 'Viewer' }], value: member.role }, { name: 'active', label: 'Access', type: 'select', options: [{ value: '1', label: 'Active' }, { value: '0', label: 'Deactivate access' }], value: member.active ? '1' : '0' }], 'Save access', function (d) { return apiPost('/api/team/' + encodeURIComponent(member.id), { role: d.role, active: Number(d.active) }, 'PATCH').then(function () { S.team = null; }); });
    } else if (act === 'document-new') {
      var partyOptions = [{ value: '', label: '—' }].concat((ov.suppliers || []).map(function (p) { return { value: 'supplier:' + p.id, label: 'Supplier · ' + p.name }; })).concat((ov.buyers || []).map(function (p) { return { value: 'buyer:' + p.id, label: 'Buyer · ' + p.name }; }));
      var saudaOptions = [{ value: '', label: '—' }].concat((ov.saudas || []).map(function (s) { return { value: s.id, label: s.code + ' · ' + (s.item_name || '') }; }));
      var gateOptions = [{ value: '', label: '—' }].concat((ov.gate || []).map(function (g) { return { value: g.id, label: g.token_no + ' · ' + (g.item_name || '') }; }));
      modal('New business document', [{ name: 'document_type', label: 'Document type', type: 'select', options: [{ value: 'PURCHASE_STATEMENT', label: 'Purchase statement' }, { value: 'SALES_INVOICE', label: 'Sales invoice' }, { value: 'PAYMENT_RECEIPT', label: 'Payment receipt' }, { value: 'WEIGHMENT_SLIP', label: 'Weighment slip' }] }, { name: 'party_ref', label: 'Party (optional)', type: 'select', options: partyOptions }, { name: 'sauda_id', label: 'Linked Sauda (optional)', type: 'select', options: saudaOptions }, { name: 'gate_entry_id', label: 'Linked gate entry (optional)', type: 'select', options: gateOptions }, { name: 'item_id', label: 'Item (optional)', type: 'select', options: optList(ov.items, [{ value: '', label: '—' }]) }, { name: 'description', label: 'Line description', required: true }, { name: 'hsn', label: 'HSN' }, { name: 'quantity', label: 'Quantity', type: 'number', step: '0.001' }, { name: 'unit', label: 'Unit', value: 'KG' }, { name: 'rate', label: 'Rate (₹)', type: 'number', step: '0.01' }, { name: 'taxable', label: 'Taxable amount (₹)', type: 'number', step: '0.01' }, { name: 'cgst', label: 'CGST (₹)', type: 'number', step: '0.01' }, { name: 'sgst', label: 'SGST (₹)', type: 'number', step: '0.01' }, { name: 'igst', label: 'IGST (₹)', type: 'number', step: '0.01' }, { name: 'notes', label: 'Notes', type: 'textarea' }], 'Post document', function (d) { var party = String(d.party_ref || '').split(':'); return apiPost('/api/documents', { document_type: d.document_type, party_kind: party[0] || null, party_id: party[1] || null, sauda_id: d.sauda_id || null, gate_entry_id: d.gate_entry_id || null, lines: [{ item_id: d.item_id || null, description: d.description, hsn: d.hsn, quantity: d.quantity ? num(d.quantity) : null, unit: d.unit, rate_paise: Math.round(num(d.rate) * 100), taxable_paise: Math.round(num(d.taxable) * 100) }], cgst_paise: Math.round(num(d.cgst) * 100), sgst_paise: Math.round(num(d.sgst) * 100), igst_paise: Math.round(num(d.igst) * 100), notes: d.notes || null }).then(function () { S.documents = null; }); });
    } else if (act === 'document-void') {
      var docId = el.getAttribute('data-id');
      var reason = window.prompt('Why is this posted document being voided?');
      if (reason && reason.trim().length >= 3) return apiPost('/api/documents/' + encodeURIComponent(docId) + '/void', { reason: reason.trim() }).then(function () { S.documents = null; render(); });
    } else if (act === 'bug-status') {
      return apiPost('/api/feedback/tickets/' + el.getAttribute('data-id') + '/status', { status: el.getAttribute('data-status') }, 'PATCH')
        .then(function () { S.bugs = null; render(); });
    } else if (act === 'gate-new') {
      function setGateSaudas(dlg, direction) {
        var sel = dlg.querySelector('[name="sauda_id"]'); if (!sel) return;
        var current = sel.value;
        sel.innerHTML = '<option value="">—</option>' + ov.saudas.filter(function (s) { return (s.status === 'open' || s.status === 'advance_paid') && s.direction === direction; }).map(function (s) { return '<option value="' + esc(s.id) + '">' + esc(s.code + ' · ' + (s.direction === 'out' ? 'Sale' : 'Purchase')) + '</option>'; }).join('');
        if ([].some.call(sel.options, function (o) { return o.value === current; })) sel.value = current;
      }
      modal('New gate entry', [
        { name: 'direction', label: 'Direction', type: 'toggle', options: [{ value: 'in', label: 'In · Arriving' }, { value: 'out', label: 'Out · Dispatch' }], onChange: function (value, dlg) { setGateSaudas(dlg, value); } },
        { name: 'vehicle_no', label: 'Vehicle number', required: true, placeholder: 'AP 16 TG 5544' },
        { name: 'sauda_id', label: 'Sauda (optional)', type: 'select', options: [{ value: '', label: '—' }], onChange: function (id, dlg) {
          var info = dlg.querySelector('[data-info="sauda_info"]'); if (info) info.textContent = saudaSummary(id, ov);
          var selected = ov.saudas.find(function (s) { return s.id === id; });
          var item = dlg.querySelector('[name="item_id"]'); var supplier = dlg.querySelector('[name="supplier_id"]'); var buyer = dlg.querySelector('[name="buyer_id"]'); var rate = dlg.querySelector('[name="rate"]');
          if (selected) {
            if (item && selected.item_id) { item.value = selected.item_id; item.disabled = true; }
            if (selected.supplier_id && supplier) { supplier.value = selected.supplier_id; supplier.disabled = true; }
            if (selected.buyer_id && buyer) { buyer.value = selected.buyer_id; buyer.disabled = true; }
            if (rate) { rate.value = Math.round((selected.rate_paise_per_qtl || 0) / 100); rate.disabled = true; }
          } else { if (item) item.disabled = false; if (supplier) supplier.disabled = false; if (buyer) buyer.disabled = false; if (rate) rate.disabled = false; }
        } },
        { name: 'supplier_id', label: 'Supplier', type: 'select', options: optList(ov.suppliers, [{ value: '', label: '—' }]), quickAdd: 'suppliers', quickAddLabel: 'supplier', when: 'in' },
        { name: 'buyer_id', label: 'Buyer', type: 'select', options: optList(ov.buyers, [{ value: '', label: '—' }]), quickAdd: 'buyers', quickAddLabel: 'buyer', when: 'out' },
        { name: 'item_id', label: 'Material', type: 'select', options: optList(ov.items, [{ value: '', label: '—' }]), quickAdd: 'items', quickAddLabel: 'item', quickAddCategory: 'paddy' },
        { name: 'sauda_info', label: 'Agreement details', type: 'info' },
        { name: 'rate', label: 'Rate ₹/qtl (for Out sales)', type: 'number', step: '1', when: 'out' },
      ], 'Create token', function (d) {
        return apiPost('/api/gate', {
          direction: d.direction, vehicle_no: d.vehicle_no, supplier_id: d.supplier_id || null, buyer_id: d.buyer_id || null,
          item_id: d.item_id || null, sauda_id: d.sauda_id || null,
          rate_paise_per_qtl: d.rate ? Math.round(num(d.rate) * 100) : null,
        });
      });
    } else if (act === 'gate-upd') {
      var g = ov.gate.find(function (x) { return x.id === el.getAttribute('data-id'); });
      if (!g) return;
      modal('Update ' + g.token_no, [
        { name: 'gross_kg', label: 'Gross weight (kg)', type: 'number', step: '1', value: g.gross_kg || '' },
        { name: 'tare_kg', label: 'Tare weight (kg)', type: 'number', step: '1', value: g.tare_kg || '' },
        { name: 'moisture_pct', label: 'Moisture %', type: 'number', step: '0.1', value: g.moisture_pct || '' },
        { name: 'broken_pct', label: 'Broken %', type: 'number', step: '0.1', value: qualityValue(g, 'broken_pct') },
        { name: 'foreign_matter_pct', label: 'Foreign matter %', type: 'number', step: '0.1', value: qualityValue(g, 'foreign_matter_pct') },
        { name: 'damaged_pct', label: 'Damaged %', type: 'number', step: '0.1', value: qualityValue(g, 'damaged_pct') },
        { name: 'grade', label: 'Grade / quality note', value: qualityValue(g, 'grade') },
        { name: 'status', label: 'Status', type: 'select', options: ['at_gate', 'weighing', 'in_lab', 'weighed', 'unloading', 'done'].map(function (s) { return { value: s, label: ST[s][0] }; }) },
      ], 'Save', function (d) {
        var body = { status: d.status };
        if (d.gross_kg) body.gross_kg = num(d.gross_kg);
        if (d.tare_kg) body.tare_kg = num(d.tare_kg);
        if (d.moisture_pct !== '') body.moisture_pct = num(d.moisture_pct);
        ['broken_pct', 'foreign_matter_pct', 'damaged_pct'].forEach(function (field) { if (d[field] !== '') body[field] = num(d[field]); });
        if (d.grade !== '') body.grade = d.grade;
        return apiPost('/api/gate/' + g.id, body, 'PATCH');
      });
      var sel = document.querySelector('#ms-modal [name="status"]');
      if (sel) sel.value = g.status;
    } else if (act === 'sauda-new') {
      modal('New sauda', [
        { name: 'direction', label: 'Agreement direction', type: 'select', options: [{ value: 'in', label: 'Purchase / arriving' }, { value: 'out', label: 'Sale / dispatch' }] },
        { name: 'supplier_id', label: 'Supplier', type: 'select', options: optList(ov.suppliers, [{ value: '', label: '—' }]), quickAdd: 'suppliers', quickAddLabel: 'supplier', when: 'in' },
        { name: 'buyer_id', label: 'Buyer', type: 'select', options: optList(ov.buyers, [{ value: '', label: '—' }]), quickAdd: 'buyers', quickAddLabel: 'buyer', when: 'out' },
        { name: 'broker_name', label: 'Broker', value: 'Direct' },
        { name: 'item_id', label: 'Item', type: 'select', options: optList(ov.items), quickAdd: 'items', quickAddLabel: 'item', quickAddCategory: 'paddy' },
        { name: 'quantity', label: 'Agreed quantity', type: 'number', step: '0.001', required: true, row: 'agreement' },
        { name: 'unit', label: 'Agreed unit', type: 'select', value: (ov.me && ov.me.preferred_unit) || 'QUINTAL', options: [{ value: 'KG', label: 'kg' }, { value: 'QUINTAL', label: 'quintal' }, { value: 'TONNE', label: 'tonne' }, { value: 'BAG', label: 'bag' }, { value: 'PIECE', label: 'piece' }], row: 'agreement' },
        { name: 'rate', label: 'Rate ₹/qtl', type: 'number', step: '1', required: true, row: 'pricing' },
        { name: 'moisture_pct', label: 'Agreed moisture %', type: 'number', step: '0.1', row: 'pricing' },
        { name: 'agreement_date', label: 'Agreement date', type: 'date' },
        { name: 'delivery_start', label: 'Delivery window starts', type: 'date' },
        { name: 'delivery_end', label: 'Delivery window ends', type: 'date' },
        { name: 'delivery_tolerance_pct', label: 'Over-delivery tolerance %', type: 'number', step: '0.1', value: '5' },
        { name: 'commission_type', label: 'Broker commission', type: 'select', options: [{ value: '', label: 'None' }, { value: 'fixed', label: 'Fixed ₹' }, { value: 'per_unit', label: '₹ per quintal' }, { value: 'percentage', label: '% of deal value' }] },
        { name: 'commission_value', label: 'Commission value', type: 'number', step: '0.01' },
        { name: 'advance', label: 'Advance paid ₹ (optional)', type: 'number', step: '1' },
        { name: 'note', label: 'Terms / notes', type: 'textarea' },
      ], 'Create sauda', function (d) {
        return apiPost('/api/saudas', {
          direction: d.direction, supplier_id: d.supplier_id || null, buyer_id: d.buyer_id || null, broker_name: d.broker_name || 'Direct', item_id: d.item_id,
          quantity: num(d.quantity), unit: d.unit, rate_paise_per_qtl: Math.round(num(d.rate) * 100),
          moisture_pct: d.moisture_pct ? num(d.moisture_pct) : null, agreement_date: d.agreement_date || null, delivery_start: d.delivery_start || null, delivery_end: d.delivery_end || null, delivery_tolerance_pct: d.delivery_tolerance_pct === '' ? 5 : num(d.delivery_tolerance_pct), commission_type: d.commission_type || null, commission_value: d.commission_type === 'fixed' ? num(d.commission_value) : d.commission_type === 'per_unit' ? num(d.commission_value) * 100 : num(d.commission_value), advance_paise: Math.round(num(d.advance) * 100), note: d.note || null,
        });
      });
    } else if (act === 'sauda-upd') {
      var sa = ov.saudas.find(function (x) { return x.id === el.getAttribute('data-id'); });
      if (!sa) return;
      modal('Update ' + sa.code, [
        { name: 'status', label: 'Status', type: 'select', options: ['open', 'advance_paid', 'settled', 'disputed'].map(function (s) { return { value: s, label: ST[s][0] }; }) },
      ], 'Save', function (d) { return apiPost('/api/saudas/' + sa.id, { status: d.status }, 'PATCH'); });
      var sel2 = document.querySelector('#ms-modal [name="status"]');
      if (sel2) sel2.value = sa.status;
    } else if (act === 'delivery-new') {
      var deliverySauda = ov.saudas.find(function (x) { return x.id === el.getAttribute('data-id'); });
      if (!deliverySauda) return;
      modal('Record delivery against ' + deliverySauda.code, [
        { name: 'actual_qty', label: 'Actual quantity', type: 'number', step: '0.001', required: true },
        { name: 'actual_unit', label: 'Unit', type: 'select', options: [{ value: 'KG', label: 'kg' }, { value: 'QUINTAL', label: 'quintal' }, { value: 'TONNE', label: 'tonne' }, { value: 'BAG', label: 'bag' }, { value: 'PIECE', label: 'piece' }] },
        { name: 'actual_weight_kg', label: 'Actual weighbridge weight (kg, optional)', type: 'number', step: '1' },
        { name: 'godown_id', label: 'Godown', type: 'select', options: optList(ov.godowns, [{ value: '', label: '—' }]) },
        { name: 'notes', label: 'Notes' },
      ], 'Save delivery', function (d) { return apiPost('/api/saudas/' + deliverySauda.id + '/deliveries', { actual_qty: d.actual_qty, actual_unit: d.actual_unit, actual_weight_kg: d.actual_weight_kg ? num(d.actual_weight_kg) : null, godown_id: d.godown_id || null, notes: d.notes || null }).then(function (j) { if (j.warning) alert('Delivery saved with an over-delivery warning.'); }); });
    } else if (act === 'delivery-history') {
      var historySauda = ov.saudas.find(function (x) { return x.id === el.getAttribute('data-id'); });
      if (historySauda) showDeliveryHistory(historySauda);
    } else if (act === 'lot-new') {
      modal('New lot', [
        { name: 'godown_id', label: 'Godown', type: 'select', options: optList(ov.godowns), quickAdd: 'godowns', quickAddLabel: 'godown' },
        { name: 'item_id', label: 'Item', type: 'select', options: optList(ov.items), quickAdd: 'items', quickAddLabel: 'item', quickAddCategory: 'paddy' },
        { name: 'qty_qtl', label: 'Quantity (qtl)', type: 'number', step: '0.1', required: true },
        { name: 'moisture_pct', label: 'Moisture %', type: 'number', step: '0.1' },
        { name: 'broken_pct', label: 'Broken %', type: 'number', step: '0.1' },
        { name: 'foreign_matter_pct', label: 'Foreign matter %', type: 'number', step: '0.1' },
        { name: 'damaged_pct', label: 'Damaged %', type: 'number', step: '0.1' },
        { name: 'grade', label: 'Grade / quality note' },
        { name: 'value', label: 'Value ₹ (optional)', type: 'number', step: '1' },
        { name: 'note', label: 'Note / variation (optional)', type: 'textarea', placeholder: 'Shortage, bag count difference, quality note…' },
      ], 'Create lot', function (d) {
        return apiPost('/api/lots', {
          godown_id: d.godown_id, item_id: d.item_id, quantity: num(d.qty_qtl), unit: 'QUINTAL',
          moisture_pct: d.moisture_pct ? num(d.moisture_pct) : null, broken_pct: d.broken_pct ? num(d.broken_pct) : null, foreign_matter_pct: d.foreign_matter_pct ? num(d.foreign_matter_pct) : null, damaged_pct: d.damaged_pct ? num(d.damaged_pct) : null, grade: d.grade || null, value_paise: Math.round(num(d.value) * 100), note: d.note || null,
        });
      });
    } else if (act === 'receipt-add') {
      var row = el.closest('[data-receipt]');
      if (!row) return;
      return apiPost('/api/lots', {
        gate_entry_id: el.getAttribute('data-id'),
        godown_id: row.querySelector('[data-r-godown]').value,
        item_id: el.getAttribute('data-item') || null,
        qty_kg: Math.round(num(row.querySelector('[data-r-qty]').value) * 100),
        moisture_pct: el.getAttribute('data-moisture') ? num(el.getAttribute('data-moisture')) : null,
        value_paise: Math.round(num(el.getAttribute('data-value')) || 0),
        note: row.querySelector('[data-r-note]').value || null,
      }).then(refresh);
    } else if (act === 'receipt-skip') {
      var skipRow = el.closest('[data-receipt]');
      var note = skipRow && skipRow.querySelector('[data-r-note]') ? skipRow.querySelector('[data-r-note]').value : '';
      return apiPost('/api/stock-receipts/' + el.getAttribute('data-id') + '/skip', { note: note || null }).then(refresh);
    } else if (act === 'receipt-accept') {
      if (!el.getAttribute('data-godown')) {
        modal('Add godown first', [
          { name: 'name', label: 'Godown name', required: true, value: 'Godown 1' },
          { name: 'capacity_qty', label: 'Capacity quantity (optional)', type: 'number', step: '0.001' },
          { name: 'capacity_unit', label: 'Capacity unit', type: 'select', options: [{ value: 'QUINTAL', label: 'quintal' }, { value: 'KG', label: 'kg' }, { value: 'TONNE', label: 'tonne' }, { value: 'BAG', label: 'bag' }, { value: 'PIECE', label: 'piece' }] },
        ], 'Add godown', function (d) { return apiPost('/api/godowns', d); });
        return;
      }
      return apiPost('/api/lots', {
        gate_entry_id: el.getAttribute('data-id'),
        godown_id: el.getAttribute('data-godown'),
        item_id: el.getAttribute('data-item') || null,
        qty_kg: Math.round(num(el.getAttribute('data-qty'))),
        moisture_pct: el.getAttribute('data-moisture') ? num(el.getAttribute('data-moisture')) : null,
        value_paise: Math.round(num(el.getAttribute('data-value')) || 0),
      }).then(refresh);
    } else if (act === 'receipt-reject') {
      return apiPost('/api/stock-receipts/' + el.getAttribute('data-id') + '/skip', { note: 'Rejected from stock page' }).then(refresh);
    } else if (act === 'lot-edit') {
      var lot = ov.lots.find(function (x) { return x.id === el.getAttribute('data-id'); });
      if (!lot) return;
      modal('Edit ' + lot.code, [
        { name: 'godown_id', label: 'Godown', type: 'select', options: optList(ov.godowns), quickAdd: 'godowns', quickAddLabel: 'godown' },
        { name: 'qty_qtl', label: 'Quantity (qtl)', type: 'number', step: '0.1', required: true, value: qtl(lot.qty_kg, 1).replace(/,/g, '') },
        { name: 'moisture_pct', label: 'Moisture %', type: 'number', step: '0.1', value: lot.moisture_pct == null ? '' : lot.moisture_pct },
        { name: 'broken_pct', label: 'Broken %', type: 'number', step: '0.1', value: qualityValue(lot, 'broken_pct') },
        { name: 'foreign_matter_pct', label: 'Foreign matter %', type: 'number', step: '0.1', value: qualityValue(lot, 'foreign_matter_pct') },
        { name: 'damaged_pct', label: 'Damaged %', type: 'number', step: '0.1', value: qualityValue(lot, 'damaged_pct') },
        { name: 'grade', label: 'Grade / quality note', value: qualityValue(lot, 'grade') },
        { name: 'value', label: 'Value ₹ (optional)', type: 'number', step: '1', value: lot.value_paise ? Math.round(lot.value_paise / 100) : '' },
        { name: 'note', label: 'Note / variation (optional)', type: 'textarea', value: lot.note || '', placeholder: 'Shortage, bag count difference, quality note...' },
      ], 'Save', function (d) {
        return apiPost('/api/lots/' + lot.id, {
          godown_id: d.godown_id, quantity: num(d.qty_qtl), unit: 'QUINTAL',
          moisture_pct: d.moisture_pct ? num(d.moisture_pct) : null, broken_pct: d.broken_pct ? num(d.broken_pct) : null, foreign_matter_pct: d.foreign_matter_pct ? num(d.foreign_matter_pct) : null, damaged_pct: d.damaged_pct ? num(d.damaged_pct) : null, grade: d.grade || null, value_paise: Math.round(num(d.value) * 100), note: d.note || '',
        }, 'PATCH');
      });
      var gsel = document.querySelector('#ms-modal [name="godown_id"]');
      if (gsel && lot.godown_id) gsel.value = lot.godown_id;
    } else if (act === 'production') {
      modal('Today’s production (quintals)', [
        { name: 'paddy', label: 'Paddy milled (qtl)', type: 'number', step: '0.1', required: true },
        { name: 'rice', label: 'Rice out (qtl)', type: 'number', step: '0.1', required: true },
        { name: 'bran', label: 'Bran out (qtl)', type: 'number', step: '0.1' },
        { name: 'husk', label: 'Husk out (qtl)', type: 'number', step: '0.1' },
        { name: 'broken', label: 'Broken out (qtl)', type: 'number', step: '0.1' },
      ], 'Save production', function (d) {
        return apiPost('/api/production', {
          paddy_in_kg: Math.round(num(d.paddy) * 100), rice_out_kg: Math.round(num(d.rice) * 100),
          bran_out_kg: Math.round(num(d.bran) * 100), husk_out_kg: Math.round(num(d.husk) * 100),
          broken_out_kg: Math.round(num(d.broken) * 100),
        });
      });
    } else if (act === 'pay') {
      var kind = el.getAttribute('data-kind'), pid = el.getAttribute('data-id');
      modal(kind === 'supplier' ? 'Record payment to supplier' : 'Record receipt from buyer', [
        { name: 'amount', label: 'Amount ₹', type: 'number', step: '1', required: true },
        { name: 'method', label: 'Method', type: 'select', options: ['cash', 'bank', 'upi'].map(function (v) { return { value: v, label: v.toUpperCase() }; }) },
      ], 'Save', function (d) {
        return apiPost('/api/payments', { party_kind: kind, party_id: pid, amount_paise: Math.round(num(d.amount) * 100), method: d.method }).then(function (j) { S.payments = null; return j; });
      });
    } else if (act === 'payment-void') {
      var paymentId = el.getAttribute('data-id');
      var paymentReason = window.prompt('Why is this payment being voided?');
      if (paymentReason && paymentReason.trim().length >= 3) return apiPost('/api/payments/' + encodeURIComponent(paymentId) + '/void', { reason: paymentReason.trim() }).then(function () { S.payments = null; refresh(); });
    } else if (act === 'sup-edit' || act === 'buy-edit' || act === 'item-edit') {
      var editMaster = act === 'sup-edit' ? 'suppliers' : act === 'buy-edit' ? 'buyers' : 'items';
      var editRow = (editMaster === 'suppliers' ? ov.suppliers : editMaster === 'buyers' ? ov.buyers : ov.items).find(function (row) { return row.id === el.getAttribute('data-id'); });
      if (!editRow) return;
      modal('Edit ' + masterLabel(editMaster), masterFormFields(editMaster, editRow), 'Save', function (d) { return apiPost('/api/' + editMaster + '/' + encodeURIComponent(editRow.id), d, 'PATCH'); });
    } else if (act === 'sup-new') {
      modal('Add supplier', partyFields('supplier'), 'Add', function (d) { return apiPost('/api/suppliers', d); });
    } else if (act === 'buy-new') {
      modal('Add buyer', partyFields('buyer'), 'Add', function (d) { return apiPost('/api/buyers', d); });
    } else if (act === 'item-new') {
      modal('Add item', ITEM_FIELDS, 'Add', function (d) { return apiPost('/api/items', d); });
    } else if (act === 'godown-new') {
      modal('Add godown', godownFields(), 'Add', function (d) { return apiPost('/api/godowns', d); });
    } else if (act === 'feedback') {
      modal('Tell us what is stuck', [
        { name: 'kind', label: 'Type', type: 'select', options: [{ value: 'help', label: 'Need help' }, { value: 'bug', label: 'Bug' }, { value: 'feature', label: 'Missing feature' }] },
        { name: 'message', label: 'Message', type: 'textarea', placeholder: 'What were you trying to do? What was confusing or missing?' },
        { name: 'contact', label: 'Phone or WhatsApp (optional)', placeholder: 'So we can reply if needed' },
      ], 'Send', function (d) {
        return apiPost('/api/feedback', { kind: d.kind, message: d.message, contact: d.contact || null, page: S.page });
      });
    }
  }

  // ---------- shell ----------
  var NAV = [
    ['dashboard', 'Dashboard'], ['gate', 'Gate & Weighbridge'], ['purchase', 'Purchase & Saudas'],
    ['stock', 'Stock & Lots'], ['suppliers', 'Suppliers'], ['buyers', 'Buyers'], ['items', 'Items'], ['processing', 'Processing'], ['team', 'Team'], ['documents', 'Documents'], ['digest', 'Night Digest'],
  ];
  var NAV_PERMS = { team: 'MANAGE_MEMBERS' };
  var NAV_ROLES = { dashboard: ['owner','admin','manager','accountant','gate_operator','production_operator','operator','viewer'], gate: ['owner','admin','manager','gate_operator','operator'], purchase: ['owner','admin','manager','accountant'], stock: ['owner','admin','manager','accountant','production_operator'], suppliers: ['owner','admin','manager','accountant'], buyers: ['owner','admin','manager','accountant'], items: ['owner','admin','manager','accountant','production_operator'], processing: ['owner','admin','manager','production_operator','operator'], team: ['owner','admin'], documents: ['owner','admin','manager','accountant'], digest: ['owner','admin','manager','accountant'] };
  function navItems() {
    var all = isSupportAdmin() ? NAV.concat([['bugs', 'Bug Reports']]) : NAV;
    var role = S.ov && S.ov.me ? S.ov.me.role : '';
    return all.filter(function (n) { var required = NAV_PERMS[n[0]]; var roles = NAV_ROLES[n[0]]; return (!roles || roles.indexOf(role) >= 0) && (!required || !S.ov || !S.ov.me.permissions || S.ov.me.permissions.indexOf(required) >= 0); });
  }
  function navMarkup() {
    return navItems().map(function (n) {
      return '<button data-nav="' + n[0] + '" class="' + (S.page === n[0] ? 'on' : '') + '" aria-current="' + (S.page === n[0] ? 'page' : 'false') + '">' + ICONS[n[0]] + n[1] + '</button>';
    }).join('');
  }
  function periodToggle() {
    if (MODE !== 'live' || S.page !== 'dashboard') return '';
    return '<div class="period-toggle" role="group" aria-label="Chart period">' +
      [['daily', 'Daily'], ['weekly', 'Weekly'], ['monthly', 'Monthly']].map(function (p) {
        return '<button type="button" data-act="period" data-period="' + p[0] + '" class="' + (S.period === p[0] ? 'on' : '') + '" aria-pressed="' + (S.period === p[0] ? 'true' : 'false') + '">' + p[1] + '</button>';
      }).join('') + '</div>';
  }
  var ICONS = {
    dashboard: '<svg width="19" height="19" viewBox="0 0 24 24" fill="none"><rect x="3" y="3" width="7" height="9" rx="1.5" stroke="currentColor" stroke-width="1.9"/><rect x="14" y="3" width="7" height="5" rx="1.5" stroke="currentColor" stroke-width="1.9"/><rect x="14" y="12" width="7" height="9" rx="1.5" stroke="currentColor" stroke-width="1.9"/><rect x="3" y="16" width="7" height="5" rx="1.5" stroke="currentColor" stroke-width="1.9"/></svg>',
    gate: '<svg width="19" height="19" viewBox="0 0 24 24" fill="none"><path d="M12 3v3M5 9h14l-2 7H7L5 9Z" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"/><path d="M4 20h16" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/></svg>',
    purchase: '<svg width="19" height="19" viewBox="0 0 24 24" fill="none"><path d="M5 4h14v16H5z" stroke="currentColor" stroke-width="1.9"/><path d="M8 9h8M8 13h8M8 17h5" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/></svg>',
    stock: '<svg width="19" height="19" viewBox="0 0 24 24" fill="none"><path d="M3 8l9-5 9 5v8l-9 5-9-5V8Z" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"/><path d="M3 8l9 5 9-5M12 13v8" stroke="currentColor" stroke-width="1.9"/></svg>',
    suppliers: '<svg width="19" height="19" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="8" r="3.5" stroke="currentColor" stroke-width="1.9"/><path d="M5 20a7 7 0 0 1 14 0" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/></svg>',
    buyers: '<svg width="19" height="19" viewBox="0 0 24 24" fill="none"><path d="M4 8h16l-1.4 10.5A2 2 0 0 1 16.6 20H7.4a2 2 0 0 1-2-1.5L4 8Z" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"/><path d="M9 8a3 3 0 0 1 6 0" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/></svg>',
    items: '<svg width="19" height="19" viewBox="0 0 24 24" fill="none"><path d="M4 7h16v13H4z" stroke="currentColor" stroke-width="1.9"/><path d="M9 7V4h6v3M4 12h16" stroke="currentColor" stroke-width="1.9"/></svg>',
    processing: '<svg width="19" height="19" viewBox="0 0 24 24" fill="none"><path d="M4 5h6v6H4zM14 13h6v6h-6zM10 8h4v8h-4z" stroke="currentColor" stroke-width="1.9"/></svg>',
    team: '<svg width="19" height="19" viewBox="0 0 24 24" fill="none"><circle cx="9" cy="8" r="3" stroke="currentColor" stroke-width="1.9"/><circle cx="17" cy="9" r="2.5" stroke="currentColor" stroke-width="1.9"/><path d="M3 20a6 6 0 0 1 12 0M15 20a4 4 0 0 1 6 0" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/></svg>',
    documents: '<svg width="19" height="19" viewBox="0 0 24 24" fill="none"><path d="M6 3h9l3 3v15H6z" stroke="currentColor" stroke-width="1.9"/><path d="M9 11h6M9 15h6M9 7h4" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/></svg>',
    digest: '<svg width="19" height="19" viewBox="0 0 24 24" fill="none"><rect x="7" y="2" width="10" height="20" rx="2" stroke="currentColor" stroke-width="1.9"/><path d="M10 5h4" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/></svg>',
    bugs: '<svg width="19" height="19" viewBox="0 0 24 24" fill="none"><path d="M8 8h8v8a4 4 0 0 1-8 0V8Z" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"/><path d="M9 4l2 4M15 4l-2 4M5 11h3M16 11h3M5 16h3M16 16h3" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/></svg>',
  };

  function render() {
    var root = document.getElementById('ms-root');
    if (!S.ov) { renderLogin(root); return; }
    document.documentElement.setAttribute('data-theme', S.ov.me && S.ov.me.theme === 'dark' ? 'dark' : 'light');
    if (S.page === 'bugs' && !isSupportAdmin()) S.page = 'dashboard';
    var meta = PAGES[S.page];
    var today = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

    root.innerHTML =
      '<div class="shell">' +
      '<aside class="side">' +
      '<div class="side-logo"><span class="mark"><svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M4 20V9l8-5 8 5v11" stroke="#1B2431" stroke-width="2.1" stroke-linejoin="round" stroke-linecap="round"/><path d="M9 20v-5h6v5" stroke="#1B2431" stroke-width="2.1" stroke-linecap="round"/></svg></span>' +
      '<div><div class="name">MillSaathi</div><div class="mill">' + esc(S.ov.mill.name) + '</div></div></div>' +
      (MODE === 'demo'
        ? '<div class="role-wrap"><div class="role-label">Viewing as</div><div class="role-tabs">' +
          ['owner', 'manager', 'accountant'].map(function (r) {
            return '<button data-role="' + r + '" class="' + (S.role === r ? 'on' : '') + '">' + { owner: 'Owner', manager: 'Manager', accountant: 'Accts' }[r] + '</button>';
          }).join('') + '</div></div>'
        : '') +
      '<nav class="nav ms-scroll">' + navMarkup() +
      '</nav>' +
      '<div class="side-user"><button class="side-profile" data-act="profile" aria-label="Open your profile"><div class="av">' + esc(initials(userName())) + '</div>' +
      '<div style="min-width:0"><div class="nm">' + esc(userName()) + '</div><div class="ds">' + esc(roleDesc()) + '</div></div>' +
      '</button>' +
      (MODE === 'live' ? '<button class="out" data-act="logout">Log out</button>' : '<a class="out" style="text-decoration:none" href="/">Exit demo</a>') +
      '</div></aside>' +
      '<main class="main">' +
      '<header class="topbar"><button class="menu-trigger" type="button" aria-label="Open application navigation" aria-controls="mobile-nav" aria-expanded="false" data-act="nav-open">☰</button><div class="grow"><h1>' + esc(meta.t) + '</h1><div class="sub">' + esc(meta.s()) + '</div></div>' +
      periodToggle() + '<div class="date-chip"><div class="d">' + today + '</div><div class="s">' + esc(S.ov.mill.season_label || '') + '</div></div></header>' +
      '<div class="content ms-scroll"><div class="page" id="ms-page"></div></div>' +
      '</main>' +
      '<div class="nav-backdrop" data-act="nav-close"></div><aside class="mobile-nav" id="mobile-nav" aria-label="Application navigation"><div class="mobile-nav-head"><div><div class="name">MillSaathi</div><div class="mill">' + esc(S.ov.mill.name) + '</div></div><button class="nav-close" type="button" aria-label="Close application navigation" data-act="nav-close">×</button></div><nav class="nav">' + navMarkup() + '</nav><div class="mobile-profile"><button class="side-profile" data-act="profile" aria-label="Open your profile"><div class="av">' + esc(initials(userName())) + '</div><div style="min-width:0"><div class="nm">' + esc(userName()) + '</div><div class="ds">' + esc(roleDesc()) + '</div></div></button>' + (MODE === 'live' ? '<button class="out" data-act="logout">Log out</button>' : '<a class="out" style="text-decoration:none" href="/">Exit demo</a>') + '</div></aside>' +
      (MODE === 'live' ? '<button class="help-fab" data-act="feedback">Need help?</button>' : '') +
      '</div>';

    var page = document.getElementById('ms-page');
    if (S.page === 'dashboard') page.innerHTML = pageDashboard();
    else if (S.page === 'gate') page.innerHTML = pageGate();
    else if (S.page === 'purchase') page.innerHTML = pagePurchase();
    else if (S.page === 'stock') page.innerHTML = pageStock();
    else if (S.page === 'suppliers') page.innerHTML = partyPage('suppliers');
    else if (S.page === 'buyers') page.innerHTML = partyPage('buyers');
    else if (S.page === 'items') page.innerHTML = pageItems();
    else if (S.page === 'processing') page.innerHTML = pageProcessing();
    else if (S.page === 'team') page.innerHTML = pageTeam();
    else if (S.page === 'documents') page.innerHTML = pageDocuments();
    else if (S.page === 'bugs') page.innerHTML = pageBugReports();
    else if (S.page === 'digest') { page.innerHTML = ''; page.appendChild(pageDigest()); }

    var q = document.getElementById('ms-q');
    if (q) {
      q.oninput = function () { S.q = q.value; S.focusSearch = true; S.pageIndex = {}; render(); };
      if (S.focusSearch) { q.focus(); q.setSelectionRange(q.value.length, q.value.length); S.focusSearch = false; }
    }
    document.querySelectorAll('.table-filter').forEach(function (filter) {
      var update = function () { var pageFilters = S.filters[S.page] || {}; var key = filter.getAttribute('data-filter-key'); if (!key) return; if (filter.value) pageFilters[key] = filter.value; else delete pageFilters[key]; S.filters[S.page] = pageFilters; S.pageIndex = {}; render(); };
      filter.onchange = update;
    });
    if (S.page === 'processing') bindProcessWorkspace();
  }
  function userName() {
    if (MODE === 'demo') return { owner: 'Ramesh Reddy', manager: 'Suresh Kumar', accountant: 'Prakash Rao' }[S.role] || 'Demo user';
    return S.ov && S.ov.me ? S.ov.me.name : '';
  }

  // ---------- login (live mode) ----------
  function renderLogin(root) {
    var signup = root.getAttribute('data-auth') === 'signup';
    var invite = new URLSearchParams(location.search).get('invite');
    loadAuthConfig(root);
    var turnstileMarkup = !invite && AUTH_CONFIG && AUTH_CONFIG.turnstile_site_key ? '<div id="turnstile-widget"></div>' : '';
    root.innerHTML =
      '<div class="auth-wrap"><div class="auth-card">' +
      '<span style="display:inline-flex;align-items:center;justify-content:center;width:42px;height:42px;background:#E8B93B;border-radius:9px">' +
      '<svg width="23" height="23" viewBox="0 0 24 24" fill="none"><path d="M4 20V9l8-5 8 5v11" stroke="#1B2431" stroke-width="2.1" stroke-linejoin="round" stroke-linecap="round"/><path d="M9 20v-5h6v5" stroke="#1B2431" stroke-width="2.1" stroke-linecap="round"/></svg></span>' +
      '<h1>' + (invite ? 'Join your MillSaathi team' : signup ? 'Start your mill on MillSaathi' : 'Log in to your mill') + '</h1>' +
      '<p class="auth-sub">' + (invite ? 'Set your password to accept this invite.' : signup ? 'Free forever — no card needed.' : 'Welcome back.') + '</p>' +
      '<form id="auth-form" style="display:flex;flex-direction:column;gap:12px">' +
      (invite ? '' : signup ? '<div class="fld"><label>Mill name</label><input name="mill_name" required placeholder="Sri Venkatesh Rice Mill"></div>' +
        '<div class="fld"><label>Your name</label><input name="name" required placeholder="Ramesh Reddy"></div>' : '') +
      (invite ? '' : '<div class="fld"><label>Email</label><input name="email" type="email" required placeholder="you@mill.com"></div>') +
      '<div class="fld"><label>Password</label><input name="password" type="password" required minlength="8"></div>' +
      turnstileMarkup +
      '<div class="form-err"></div>' +
      '<button class="btn acc" style="padding:13px;font-size:15px">' + (invite ? 'Accept invite' : signup ? 'Create my mill' : 'Log in') + '</button></form>' +
      (invite ? '' : '<div class="auth-alt">' + (signup ? 'Already using MillSaathi? <button data-auth-to="login">Log in</button>' : 'New here? <button data-auth-to="signup">Create your mill</button>') + '</div>') +
      '<div class="demo-hint">Just looking? <a href="/demo" style="color:#8A6A16">Open the demo mill</a> — no account needed.</div>' +
      '</div></div>';
    var authSwitch = root.querySelector('[data-auth-to]');
    if (authSwitch) authSwitch.onclick = function (e) {
      root.setAttribute('data-auth', e.target.getAttribute('data-auth-to'));
      renderLogin(root);
    };
    root.querySelector('#auth-form').onsubmit = function (e) {
      e.preventDefault();
      var f = e.target, body = {};
      ['mill_name', 'name', 'email', 'password'].forEach(function (k) { if (f[k]) body[k] = f[k].value; });
      var widget = root.querySelector('#turnstile-widget');
      if (widget) body.turnstile_token = widget.dataset.token || '';
      if (invite) body.token = invite;
      apiPost(invite ? '/api/auth/accept-invite' : signup ? '/api/auth/signup' : '/api/auth/login', body)
        .then(function () { return refresh(); })
        .catch(function (err) { f.querySelector('.form-err').textContent = err.message; });
    };
    mountTurnstile(root);
  }

  // ---------- events ----------
  document.addEventListener('click', function (e) {
    var t = e.target.closest('[data-nav],[data-role],[data-act]');
    if (!t) return;
    if (t.hasAttribute('data-nav')) { S.page = t.getAttribute('data-nav'); S.q = ''; S.pageIndex = {}; history.pushState({ page: S.page }, '', '?page=' + encodeURIComponent(S.page)); document.body.classList.remove('nav-open'); render(); }
    else if (t.hasAttribute('data-role')) { S.role = t.getAttribute('data-role'); render(); }
    else if (t.getAttribute('data-act') === 'logout') {
      apiPost('/api/auth/logout', {}).then(function () { S.ov = null; render(); });
    } else { Promise.resolve(openAction(t.getAttribute('data-act'), t)).catch(function (err) { toast(err.message || 'Something went wrong.', 'error'); }); }
  });
  window.addEventListener('popstate', function () {
    var page = new URLSearchParams(location.search).get('page');
    if (page && ['dashboard', 'gate', 'purchase', 'stock', 'suppliers', 'buyers', 'items', 'processing', 'team', 'documents', 'digest', 'bugs'].indexOf(page) >= 0) { S.page = page; S.q = ''; S.pageIndex = {}; render(); }
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && document.getElementById('mobile-nav') && document.getElementById('mobile-nav').classList.contains('open')) openAction('nav-close');
  });

  loadOverview().then(render);
})();
