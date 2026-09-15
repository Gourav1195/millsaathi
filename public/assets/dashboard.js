/* MillSaathi dashboard SPA. Runs in two modes:
   - demo: window.MS_MODE==='demo' — uses window.DEMO_OVERVIEW, role switcher enabled, no writes.
   - live: fetches /api/overview, actions enabled, role comes from the session. */
(function () {
  'use strict';

  var MODE = window.MS_MODE || 'live';
  var S = { page: 'dashboard', role: 'owner', q: '', ov: null };

  // ---------- helpers ----------
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function qtl(kg, dec) {
    if (kg == null) return '—';
    return (kg / 100).toLocaleString('en-IN', { maximumFractionDigits: dec == null ? 0 : dec });
  }
  function kgFmt(kg) { return kg == null ? '—' : Number(kg).toLocaleString('en-IN') + ' kg'; }
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
  };
  function pill(status) {
    var m = ST[status] || [status, '#EEF1F5', '#475467'];
    return '<span class="pill" style="background:' + m[1] + ';color:' + m[2] + '">' + esc(m[0]) + '</span>';
  }
  var CAT = { paddy: ['Paddy', '#FEF3D6', '#8A6A16'], rice: ['Rice', '#E6F0E9', '#256238'], byproduct: ['By-product', '#EEF1F5', '#475467'] };
  var SUPTYPE = { farmer: ['Farmer', '#E6F0E9', '#256238'], trader: ['Trader', '#E7EEF8', '#2A5CA8'], broker: ['Broker', '#FEF3D6', '#8A6A16'] };

  function canMoney() { return S.role !== 'manager'; }
  function net(g) {
    if (g.gross_kg == null || g.tare_kg == null) return 0;
    return Math.max(0, g.gross_kg - g.tare_kg);
  }
  function filt(rows) {
    if (!S.q) return rows;
    var q = S.q.toLowerCase();
    return rows.filter(function (r) {
      return Object.keys(r).some(function (k) { return String(r[k] == null ? '' : r[k]).toLowerCase().indexOf(q) >= 0; });
    });
  }

  // ---------- data ----------
  function loadOverview() {
    if (MODE === 'demo') {
      S.ov = window.DEMO_OVERVIEW;
      S.role = S.role || 'owner';
      return Promise.resolve(true);
    }
    return fetch('/api/overview').then(function (r) {
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

  // ---------- modal forms ----------
  function modal(title, fields, submitLabel, onSubmit) {
    var old = document.getElementById('ms-modal');
    if (old) old.remove();
    var dlg = document.createElement('dialog');
    dlg.className = 'modal'; dlg.id = 'ms-modal';
    dlg.innerHTML =
      '<div class="modal-h">' + esc(title) + '</div>' +
      '<form class="modal-b" method="dialog">' +
      fields.map(function (f) {
        if (f.type === 'select') {
          var opts = f.quickAdd ? f.options.concat([{ value: '__add:' + f.quickAdd, label: '+ Add new ' + f.quickAddLabel }]) : f.options;
          return '<div class="fld"><label>' + esc(f.label) + '</label><select name="' + f.name + '">' +
            opts.map(function (o) { return '<option value="' + esc(o.value) + '">' + esc(o.label) + '</option>'; }).join('') +
            '</select></div>';
        }
        if (f.type === 'textarea') {
          return '<div class="fld"><label>' + esc(f.label) + '</label><textarea name="' + f.name + '"' +
            (f.placeholder ? ' placeholder="' + esc(f.placeholder) + '"' : '') + '>' + esc(f.value || '') + '</textarea></div>';
        }
        return '<div class="fld"><label>' + esc(f.label) + '</label><input name="' + f.name + '" type="' + (f.type || 'text') + '"' +
          (f.step ? ' step="' + f.step + '"' : '') + (f.required ? ' required' : '') +
          (f.placeholder ? ' placeholder="' + esc(f.placeholder) + '"' : '') + (f.value != null ? ' value="' + esc(f.value) + '"' : '') + '></div>';
      }).join('') +
      '<div class="form-err"></div>' +
      '<div class="frow"><button type="button" class="btn ghost" style="flex:1" data-x>Cancel</button>' +
      '<button type="submit" class="btn acc" style="flex:1">' + esc(submitLabel) + '</button></div></form>';
    document.body.appendChild(dlg);
    dlg.querySelector('[data-x]').onclick = function () { dlg.close(); dlg.remove(); };
    fields.forEach(function (f) {
      if (!f.quickAdd) return;
      var sel = dlg.querySelector('[name="' + f.name + '"]');
      if (!sel) return;
      sel.onchange = function () {
        if (sel.value.indexOf('__add:') !== 0) return;
        var name = window.prompt('Name for new ' + f.quickAddLabel + ':');
        if (!name || !name.trim()) { sel.value = ''; return; }
        var body = { name: name.trim() };
        if (f.quickAdd === 'suppliers') body.type = 'farmer';
        else if (f.quickAdd === 'buyers') body.type = 'Wholesaler';
        else if (f.quickAdd === 'items') { body.category = f.quickAddCategory || 'paddy'; body.hsn = body.category === 'byproduct' ? '2302' : '1006'; }
        else if (f.quickAdd === 'godowns') body.capacity_qtl = 0;
        apiPost('/api/' + f.quickAdd, body).then(function (j) {
          var opt = document.createElement('option');
          opt.value = j.id; opt.textContent = name.trim();
          sel.insertBefore(opt, sel.querySelector('option[value^="__add:"]'));
          sel.value = j.id;
          return loadOverview();
        }).catch(function (err) {
          sel.value = '';
          dlg.querySelector('.form-err').textContent = err.message;
        });
      };
    });
    dlg.querySelector('form').onsubmit = function (e) {
      e.preventDefault();
      var data = {};
      fields.forEach(function (f) {
        var el = dlg.querySelector('[name="' + f.name + '"]');
        data[f.name] = el ? el.value : '';
      });
      Promise.resolve(onSubmit(data)).then(function () { dlg.close(); dlg.remove(); refresh(); })
        .catch(function (err) { dlg.querySelector('.form-err').textContent = err.message; });
    };
    dlg.showModal();
  }
  function num(v) { var n = parseFloat(v); return isNaN(n) ? 0 : n; }
  function optList(rows, extra) {
    var o = (extra || []).concat(rows.map(function (r) { return { value: r.id, label: r.name || r.code }; }));
    return o.length ? o : [{ value: '', label: '—' }];
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
      (withAction ? '<button class="btn sm" data-act="production">+ Enter production</button>' : '') + '</div>' +
      (i <= 0
        ? '<div class="empty">No production entered for today yet.' + (withAction ? '<br>Use “+ Enter production” to log paddy milled vs output.' : '') + '</div>'
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

  function onboardingCard() {
    if (MODE !== 'live') return '';
    var ov = S.ov;
    var ob = ov.onboarding || {};
    var created = ov.mill.created_at ? new Date(ov.mill.created_at).getTime() : Date.now();
    var daysOld = Math.floor((Date.now() - created) / 86400000);
    var active = ob.active_days || 0;
    if (daysOld > 10 && active >= 5) return '';
    var steps = [
      ['Add suppliers', ov.suppliers.length > 0, 'Farmers, traders or brokers you buy from.', 'sup-new'],
      ['Add buyers', ov.buyers.length > 0, 'Customers who buy rice or by-products.', 'buy-new'],
      ['Check items', ov.items.length > 0, 'Paddy, parboiled rice, bran, husk and other SKUs.', 'item-new'],
      ['Create a sauda', ov.saudas.length > 0, 'Record the purchase deal before the truck arrives.', 'sauda-new'],
      ['Record gate entry', (ob.gate_count || ov.gate.length) > 0, 'Enter incoming/outgoing trucks and weights.', 'gate-new'],
      ['Move to stock', ov.lots.length > 0, 'Add completed incoming trucks into a godown lot.', 'lot-new'],
    ];
    return '<div class="card pad guide-card"><div style="display:flex;justify-content:space-between;gap:14px;align-items:flex-start">' +
      '<div><div class="card-h">First days flow</div><div class="hint" style="margin-top:4px">Follow this order until the mill data starts feeling natural.</div></div>' +
      '<span class="pill" style="background:#FEF3D6;color:#8A6A16">' + active + ' active days</span></div>' +
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
        kpiCard('Paddy in today', qtl(k.paddy_in_today_kg) + ' qtl', k.weighed_today + ' trucks weighed'),
        kpiCard('Rice dispatched', qtl(k.rice_out_today_kg) + ' qtl', 'today', null, 'var(--green)'),
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

    var max = Math.max.apply(null, ov.week.map(function (d) { return Math.max(d.in_kg, d.out_kg, 1); }));
    var bars = ov.week.map(function (d) {
      var lab = new Date(d.date + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'short' });
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

    return onboardingCard() +
      '<div class="kpis">' + kpis.join('') + '</div>' +
      '<div class="grid2">' +
      '<div class="card pad" style="min-width:0"><div style="display:flex;justify-content:space-between;align-items:baseline">' +
      '<div class="card-h">Paddy in vs. rice out</div><div class="hint">quintals · last 7 days</div></div>' +
      '<div style="display:flex;align-items:flex-end;gap:clamp(8px,1.5vw,20px);height:180px;margin-top:22px;padding-bottom:26px;position:relative">' + bars + '</div>' +
      '<div style="display:flex;gap:20px;margin-top:8px;font-size:13px;font-weight:600">' +
      '<span style="display:flex;align-items:center;gap:7px"><span style="width:11px;height:11px;border-radius:2px;background:#BE8A16"></span>Paddy in</span>' +
      '<span style="display:flex;align-items:center;gap:7px"><span style="width:11px;height:11px;border-radius:2px;background:#2E7D46"></span>Rice out</span></div></div>' +
      massBalanceCard(mb, S.ov.mill.loss_limit_pct, MODE === 'live') +
      '</div>' +
      '<div class="grid2r">' +
      '<div class="card pad"><div class="card-h" style="margin-bottom:6px">Needs your eyes</div>' + alerts + '</div>' +
      '<div class="card" style="min-width:0;padding-bottom:8px"><div class="pad" style="padding-bottom:0"><div class="card-h">Recent gate activity</div></div>' +
      '<div class="twrap ms-scroll"><table class="ms" style="min-width:440px;margin-top:12px"><thead><tr><th>Token</th><th>Party</th><th>Net</th><th>Status</th></tr></thead><tbody>' +
      recent + '</tbody></table></div></div></div>';
  }

  function pageGate() {
    var ov = S.ov, k = ov.kpis;
    var rows = filt(ov.gate);
    var live = MODE === 'live';
    var body = rows.map(function (g) {
      var canAct = live && g.status !== 'done';
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
      kpiCard('Paddy in today', qtl(k.paddy_in_today_kg) + ' qtl', 'net weight') +
      kpiCard('Avg moisture', k.avg_moisture != null ? pct(k.avg_moisture) : '—', 'weighed lots') + '</div>' +
      '<div class="card"><div class="card-top"><div class="card-h">Weighbridge queue</div>' +
      '<div style="display:flex;gap:10px;align-items:center"><span class="hint">' + rows.length + ' shown</span>' +
      (MODE === 'live' ? '<button class="btn acc" data-act="gate-new">+ New gate entry</button>' : '') + '</div></div>' +
      '<div class="twrap ms-scroll"><table class="ms" style="min-width:860px"><thead><tr>' +
      '<th>Token</th><th>Vehicle</th><th>Party</th><th>Material</th><th>Gross</th><th>Net</th><th>Moisture</th><th>Status</th></tr></thead><tbody>' +
      body + '</tbody></table></div></div>';
  }

  function pagePurchase() {
    var ov = S.ov;
    var rows = filt(ov.saudas);
    var openVal = ov.saudas.filter(function (s) { return s.status === 'open' || s.status === 'advance_paid'; })
      .reduce(function (a, s) { return a + (s.value_paise || 0); }, 0);
    var m = canMoney();
    var body = rows.map(function (p) {
      return '<tr><td class="tok">' + esc(p.code) + '</td>' +
        '<td><div class="b6">' + esc(p.broker_name) + '</div><div style="font-size:12px;color:var(--muted)">' + esc(p.supplier_name || '') + '</div></td>' +
        '<td>' + esc(p.item_name || '—') + '</td>' +
        '<td class="b7">' + qtl(p.qty_kg) + ' qtl</td>' +
        (m ? '<td class="b6">' + rate(p.rate_paise_per_qtl) + '</td>' : '') +
        '<td class="b6">' + (p.moisture_pct != null ? pct(p.moisture_pct) : '—') + '</td>' +
        (m ? '<td class="b7">' + money(p.value_paise) + '</td>' : '') +
        '<td>' + pill(p.status) +
        (MODE === 'live' && m && (p.status === 'open' || p.status === 'advance_paid' || p.status === 'disputed')
          ? ' <button class="btn sm" data-act="sauda-upd" data-id="' + esc(p.id) + '">Update</button>' : '') + '</td></tr>';
    }).join('') || '<tr><td colspan="8" class="empty">No saudas yet.</td></tr>';
    return '<div class="card"><div class="card-top"><div class="card-h">Saudas &amp; purchases</div>' +
      '<div style="display:flex;gap:10px;align-items:center">' + (m ? '<span class="hint">Open value: ' + money(openVal) + '</span>' : '') +
      (MODE === 'live' && m ? '<button class="btn acc" data-act="sauda-new">+ New sauda</button>' : '') + '</div></div>' +
      '<div class="twrap ms-scroll"><table class="ms" style="min-width:' + (m ? 900 : 700) + 'px"><thead><tr>' +
      '<th>Sauda</th><th>Broker / Supplier</th><th>Variety</th><th>Qty</th>' + (m ? '<th>Rate</th>' : '') + '<th>Moisture</th>' + (m ? '<th>Value</th>' : '') + '<th>Status</th>' +
      '</tr></thead><tbody>' + body + '</tbody></table></div>' +
      (!m ? '<div class="note-locked">🔒 Purchase rates and values are hidden for the Manager role.</div>' : '') + '</div>';
  }

  function pageStock() {
    var ov = S.ov;
    var m = canMoney();
    var live = MODE === 'live';
    var cards = ov.godowns.map(function (gd) {
      var cap = (gd.capacity_qtl || 0) * 100;
      var fill = cap > 0 ? Math.min(100, Math.round((gd.stock_kg / cap) * 100)) : 0;
      var color = fill > 85 ? 'var(--red)' : fill > 60 ? 'var(--gold-dark)' : 'var(--green)';
      var pillBg = fill > 85 ? '#FBEDE7' : fill > 60 ? '#FEF3D6' : '#E6F0E9';
      var pillFg = fill > 85 ? '#8F2E12' : fill > 60 ? '#8A6A16' : '#256238';
      return '<div class="kpi"><div style="display:flex;justify-content:space-between;align-items:center">' +
        '<div style="font-weight:700;font-size:15px">' + esc(gd.name) + '</div>' +
        '<span class="pill" style="background:' + pillBg + ';color:' + pillFg + '">' + fill + '% full</span></div>' +
        '<div class="v" style="font-size:25px;margin:10px 0 2px">' + qtl(gd.stock_kg) + ' qtl</div>' +
        '<div class="s">of ' + (gd.capacity_qtl || 0).toLocaleString('en-IN') + ' qtl capacity</div>' +
        '<div class="gd-fill"><div style="width:' + fill + '%;background:' + color + '"></div></div></div>';
    }).join('');
    var pending = ov.pending_receipts || [];
    var receiptPanel = pending.length ? '<div class="card receipt-card"><div class="card-top"><div><div class="card-h">Incoming trucks waiting for stock</div>' +
      '<div class="hint">These trucks are done at the weighbridge. Add them to a godown lot, or skip if the stock was handled elsewhere.</div></div></div>' +
      '<div class="receipt-list">' + pending.map(function (g) {
        var id = esc(g.id);
        var amount = Math.round(Math.max(0, g.net_kg || 0) * ((g.sauda_rate_paise_per_qtl || 0) / 100));
        return '<div class="receipt-row" data-receipt="' + id + '">' +
          '<div><div><span class="tok">' + esc(g.token_no) + '</span> <span class="pill" style="background:#E6F0E9;color:#256238">IN</span></div>' +
          '<div class="mut" style="margin-top:4px">' + esc(g.supplier_name || 'Supplier') + ' · ' + esc(g.item_name || 'Item') + ' · ' + qtl(g.net_kg) + ' qtl' +
          (g.moisture_pct != null ? ' · ' + pct(g.moisture_pct) : '') + (g.sauda_code ? ' · ' + esc(g.sauda_code) : '') + '</div></div>' +
          '<div class="receipt-controls">' +
          '<select data-r-godown>' + optList(ov.godowns).map(function (o) { return '<option value="' + esc(o.value) + '">' + esc(o.label) + '</option>'; }).join('') + '</select>' +
          '<input data-r-qty type="number" step="0.1" value="' + esc(qtl(g.net_kg, 1).replace(/,/g, '')) + '" title="Quantity in qtl">' +
          '<input data-r-note placeholder="Note, shortage or variation">' +
          '<button class="btn acc sm" data-act="receipt-add" data-id="' + id + '" data-item="' + esc(g.item_id || '') + '" data-moisture="' + esc(g.moisture_pct == null ? '' : g.moisture_pct) + '" data-value="' + esc(amount) + '">Add lot</button>' +
          '<button class="btn sm" data-act="receipt-skip" data-id="' + id + '">Skip</button>' +
          '</div></div>';
      }).join('') + '</div></div>' : '<div class="card pad receipt-empty"><div class="card-h">No pending stock receipts</div><div class="hint" style="margin-top:4px">When an incoming truck is marked Done at the gate, it will appear here before becoming a lot.</div></div>';
    var rows = filt(ov.lots);
    var body = rows.map(function (s) {
      return '<tr><td class="tok">' + esc(s.code) + '</td><td class="b6">' + esc(s.godown_name || '—') + '</td>' +
        '<td>' + esc(s.item_name || '—') + '</td><td class="b7">' + qtl(s.qty_kg) + ' qtl</td>' +
        '<td class="b6">' + (s.moisture_pct != null ? pct(s.moisture_pct) : '—') + '</td>' +
        '<td class="mut">' + dstr(s.in_date) + '</td>' + (m ? '<td class="b7">' + money(s.value_paise) + '</td>' : '') +
        '<td class="mut">' + esc(s.note || '') + '</td></tr>';
    }).join('') || '<tr><td colspan="7" class="empty">No lots on hand.</td></tr>';
    return '<div class="kpis" style="grid-template-columns:repeat(auto-fit,minmax(200px,1fr));margin-bottom:18px">' + cards + '</div>' +
      (live ? receiptPanel : '') +
      '<div class="card"><div class="card-top"><div class="card-h">Lots on hand</div>' +
      '<div style="display:flex;gap:10px;align-items:center"><span class="hint">' + rows.length + ' lots</span>' +
      (MODE === 'live' ? '<button class="btn acc" data-act="lot-new">+ New lot</button>' : '') + '</div></div>' +
      '<div class="twrap ms-scroll"><table class="ms" style="min-width:800px"><thead><tr>' +
      '<th>Lot</th><th>Godown</th><th>Item</th><th>Qty</th><th>Moisture</th><th>In date</th>' + (m ? '<th>Value</th>' : '') + '<th>Note</th>' +
      '</tr></thead><tbody>' + body + '</tbody></table></div></div>';
  }

  function partyPage(kind) {
    var ov = S.ov;
    var m = canMoney();
    var isSup = kind === 'suppliers';
    var rows = filt(isSup ? ov.suppliers : ov.buyers);
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
          (MODE === 'live' && out > 0 ? ' <button class="btn sm" data-act="pay" data-kind="' + (isSup ? 'supplier' : 'buyer') + '" data-id="' + esc(s.id) + '">' + (isSup ? 'Pay' : 'Receive') + '</button>' : '') + '</td>' : '') +
        '<td class="mut">' + ago(s.last_at) + '</td></tr>';
    }).join('') || '<tr><td colspan="6" class="empty">Nobody here yet.</td></tr>';
    return '<div class="card"><div class="card-top"><div class="card-h">' + (isSup ? 'Suppliers' : 'Buyers') + '</div>' +
      '<div style="display:flex;gap:10px;align-items:center"><span class="hint">' + rows.length + (isSup ? ' · farmers, traders & brokers' : ' customers') + '</span>' +
      (MODE === 'live' ? '<button class="btn acc" data-act="' + (isSup ? 'sup-new' : 'buy-new') + '">+ Add</button>' : '') + '</div></div>' +
      '<div class="twrap ms-scroll"><table class="ms" style="min-width:760px"><thead><tr>' +
      '<th>Name</th><th>Type</th><th>' + (isSup ? 'Village / Place' : 'Location') + '</th><th>' + (isSup ? 'Supplied (season)' : 'Bought (season)') + '</th>' +
      (m ? '<th>' + (isSup ? 'Outstanding' : 'Receivable') + '</th>' : '') + '<th>Last</th></tr></thead><tbody>' + body + '</tbody></table></div></div>';
  }

  function pageItems() {
    var rows = filt(S.ov.items);
    var body = rows.map(function (i) {
      var ct = CAT[i.category] || [i.category, '#EEF1F5', '#475467'];
      return '<tr><td class="b7">' + esc(i.name) + '</td>' +
        '<td><span class="pill" style="background:' + ct[1] + ';color:' + ct[2] + '">' + esc(ct[0]) + '</span></td>' +
        '<td class="mut arch">' + esc(i.hsn || '—') + '</td>' +
        '<td class="b7">' + qtl(i.stock_kg) + ' qtl</td>' +
        '<td class="b6">' + (i.typical_otr_pct != null ? i.typical_otr_pct + '%' : '—') + '</td>' +
        '<td class="mut">' + esc(i.unit || 'Quintal') + '</td></tr>';
    }).join('') || '<tr><td colspan="6" class="empty">No items.</td></tr>';
    return '<div class="card"><div class="card-top"><div><div class="card-h">Items</div>' +
      '<div class="hint" style="font-weight:500;margin-top:2px">Paddy varieties, rice SKUs &amp; by-products. OTR = out-turn ratio.</div></div>' +
      (MODE === 'live' ? '<button class="btn acc" data-act="item-new">+ Add item</button>' : '') + '</div>' +
      '<div class="twrap ms-scroll"><table class="ms" style="min-width:720px"><thead><tr>' +
      '<th>Item</th><th>Category</th><th>HSN</th><th>Stock</th><th>Typical OTR</th><th>Unit</th></tr></thead><tbody>' + body + '</tbody></table></div></div>';
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
    if (act === 'gate-new') {
      modal('New gate entry', [
        { name: 'direction', label: 'Direction', type: 'select', options: [{ value: 'in', label: 'In — paddy arriving' }, { value: 'out', label: 'Out — dispatch to buyer' }] },
        { name: 'vehicle_no', label: 'Vehicle number', required: true, placeholder: 'AP 16 TG 5544' },
        { name: 'supplier_id', label: 'Supplier (for In)', type: 'select', options: optList(ov.suppliers, [{ value: '', label: '—' }]), quickAdd: 'suppliers', quickAddLabel: 'supplier' },
        { name: 'buyer_id', label: 'Buyer (for Out)', type: 'select', options: optList(ov.buyers, [{ value: '', label: '—' }]), quickAdd: 'buyers', quickAddLabel: 'buyer' },
        { name: 'item_id', label: 'Material', type: 'select', options: optList(ov.items, [{ value: '', label: '—' }]), quickAdd: 'items', quickAddLabel: 'item', quickAddCategory: 'paddy' },
        { name: 'sauda_id', label: 'Against sauda (optional)', type: 'select', options: optList(ov.saudas.filter(function (s) { return s.status === 'open' || s.status === 'advance_paid'; }), [{ value: '', label: '—' }]) },
        { name: 'rate', label: 'Rate ₹/qtl (for Out sales)', type: 'number', step: '1' },
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
        { name: 'status', label: 'Status', type: 'select', options: ['at_gate', 'weighing', 'in_lab', 'weighed', 'unloading', 'done'].map(function (s) { return { value: s, label: ST[s][0] }; }) },
      ], 'Save', function (d) {
        var body = { status: d.status };
        if (d.gross_kg) body.gross_kg = num(d.gross_kg);
        if (d.tare_kg) body.tare_kg = num(d.tare_kg);
        if (d.moisture_pct) body.moisture_pct = num(d.moisture_pct);
        return apiPost('/api/gate/' + g.id, body, 'PATCH');
      });
      var sel = document.querySelector('#ms-modal [name="status"]');
      if (sel) sel.value = g.status;
    } else if (act === 'sauda-new') {
      modal('New sauda', [
        { name: 'supplier_id', label: 'Supplier', type: 'select', options: optList(ov.suppliers), quickAdd: 'suppliers', quickAddLabel: 'supplier' },
        { name: 'broker_name', label: 'Broker', value: 'Direct' },
        { name: 'item_id', label: 'Variety', type: 'select', options: optList(ov.items.filter(function (i) { return i.category === 'paddy'; })), quickAdd: 'items', quickAddLabel: 'paddy variety', quickAddCategory: 'paddy' },
        { name: 'qty_qtl', label: 'Quantity (qtl)', type: 'number', step: '1', required: true },
        { name: 'rate', label: 'Rate ₹/qtl', type: 'number', step: '1', required: true },
        { name: 'moisture_pct', label: 'Agreed moisture %', type: 'number', step: '0.1' },
        { name: 'advance', label: 'Advance paid ₹ (optional)', type: 'number', step: '1' },
      ], 'Create sauda', function (d) {
        return apiPost('/api/saudas', {
          supplier_id: d.supplier_id, broker_name: d.broker_name || 'Direct', item_id: d.item_id,
          qty_kg: Math.round(num(d.qty_qtl) * 100), rate_paise_per_qtl: Math.round(num(d.rate) * 100),
          moisture_pct: d.moisture_pct ? num(d.moisture_pct) : null, advance_paise: Math.round(num(d.advance) * 100),
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
    } else if (act === 'lot-new') {
      modal('New lot', [
        { name: 'godown_id', label: 'Godown', type: 'select', options: optList(ov.godowns), quickAdd: 'godowns', quickAddLabel: 'godown' },
        { name: 'item_id', label: 'Item', type: 'select', options: optList(ov.items), quickAdd: 'items', quickAddLabel: 'item', quickAddCategory: 'paddy' },
        { name: 'qty_qtl', label: 'Quantity (qtl)', type: 'number', step: '0.1', required: true },
        { name: 'moisture_pct', label: 'Moisture %', type: 'number', step: '0.1' },
        { name: 'value', label: 'Value ₹ (optional)', type: 'number', step: '1' },
        { name: 'note', label: 'Note / variation (optional)', type: 'textarea', placeholder: 'Shortage, bag count difference, quality note…' },
      ], 'Create lot', function (d) {
        return apiPost('/api/lots', {
          godown_id: d.godown_id, item_id: d.item_id, qty_kg: Math.round(num(d.qty_qtl) * 100),
          moisture_pct: d.moisture_pct ? num(d.moisture_pct) : null, value_paise: Math.round(num(d.value) * 100), note: d.note || null,
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
        return apiPost('/api/payments', { party_kind: kind, party_id: pid, amount_paise: Math.round(num(d.amount) * 100), method: d.method });
      });
    } else if (act === 'sup-new') {
      modal('Add supplier', [
        { name: 'name', label: 'Name', required: true },
        { name: 'type', label: 'Type', type: 'select', options: [{ value: 'farmer', label: 'Farmer' }, { value: 'trader', label: 'Trader' }, { value: 'broker', label: 'Broker' }] },
        { name: 'place', label: 'Village / Place' }, { name: 'phone', label: 'Phone' },
      ], 'Add', function (d) { return apiPost('/api/suppliers', d); });
    } else if (act === 'buy-new') {
      modal('Add buyer', [
        { name: 'name', label: 'Name', required: true },
        { name: 'type', label: 'Type', type: 'select', options: ['Wholesaler', 'Distributor', 'Retailer', 'Exporter', 'Bran buyer', 'Husk buyer'].map(function (v) { return { value: v, label: v }; }) },
        { name: 'location', label: 'Location' }, { name: 'phone', label: 'Phone' },
      ], 'Add', function (d) { return apiPost('/api/buyers', d); });
    } else if (act === 'item-new') {
      modal('Add item', [
        { name: 'name', label: 'Name', required: true },
        { name: 'category', label: 'Category', type: 'select', options: [{ value: 'paddy', label: 'Paddy' }, { value: 'rice', label: 'Rice' }, { value: 'byproduct', label: 'By-product' }] },
        { name: 'hsn', label: 'HSN', value: '1006' },
        { name: 'typical_otr_pct', label: 'Typical OTR % (rice/by-products)', type: 'number', step: '1' },
      ], 'Add', function (d) { return apiPost('/api/items', d); });
    } else if (act === 'godown-new') {
      modal('Add godown', [
        { name: 'name', label: 'Name', required: true },
        { name: 'capacity_qtl', label: 'Capacity (qtl)', type: 'number', step: '1' },
      ], 'Add', function (d) { return apiPost('/api/godowns', d); });
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
    ['stock', 'Stock & Lots'], ['suppliers', 'Suppliers'], ['buyers', 'Buyers'], ['items', 'Items'], ['digest', 'Night Digest'],
  ];
  var ICONS = {
    dashboard: '<svg width="19" height="19" viewBox="0 0 24 24" fill="none"><rect x="3" y="3" width="7" height="9" rx="1.5" stroke="currentColor" stroke-width="1.9"/><rect x="14" y="3" width="7" height="5" rx="1.5" stroke="currentColor" stroke-width="1.9"/><rect x="14" y="12" width="7" height="9" rx="1.5" stroke="currentColor" stroke-width="1.9"/><rect x="3" y="16" width="7" height="5" rx="1.5" stroke="currentColor" stroke-width="1.9"/></svg>',
    gate: '<svg width="19" height="19" viewBox="0 0 24 24" fill="none"><path d="M12 3v3M5 9h14l-2 7H7L5 9Z" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"/><path d="M4 20h16" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/></svg>',
    purchase: '<svg width="19" height="19" viewBox="0 0 24 24" fill="none"><path d="M5 4h14v16H5z" stroke="currentColor" stroke-width="1.9"/><path d="M8 9h8M8 13h8M8 17h5" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/></svg>',
    stock: '<svg width="19" height="19" viewBox="0 0 24 24" fill="none"><path d="M3 8l9-5 9 5v8l-9 5-9-5V8Z" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"/><path d="M3 8l9 5 9-5M12 13v8" stroke="currentColor" stroke-width="1.9"/></svg>',
    suppliers: '<svg width="19" height="19" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="8" r="3.5" stroke="currentColor" stroke-width="1.9"/><path d="M5 20a7 7 0 0 1 14 0" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/></svg>',
    buyers: '<svg width="19" height="19" viewBox="0 0 24 24" fill="none"><path d="M4 8h16l-1.4 10.5A2 2 0 0 1 16.6 20H7.4a2 2 0 0 1-2-1.5L4 8Z" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"/><path d="M9 8a3 3 0 0 1 6 0" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/></svg>',
    items: '<svg width="19" height="19" viewBox="0 0 24 24" fill="none"><path d="M4 7h16v13H4z" stroke="currentColor" stroke-width="1.9"/><path d="M9 7V4h6v3M4 12h16" stroke="currentColor" stroke-width="1.9"/></svg>',
    digest: '<svg width="19" height="19" viewBox="0 0 24 24" fill="none"><rect x="7" y="2" width="10" height="20" rx="2" stroke="currentColor" stroke-width="1.9"/><path d="M10 5h4" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/></svg>',
  };

  function render() {
    var root = document.getElementById('ms-root');
    if (!S.ov) { renderLogin(root); return; }
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
      '<nav class="nav ms-scroll">' +
      NAV.map(function (n) {
        return '<button data-nav="' + n[0] + '" class="' + (S.page === n[0] ? 'on' : '') + '">' + ICONS[n[0]] + n[1] + '</button>';
      }).join('') +
      '</nav>' +
      '<div class="side-user"><div class="av">' + esc(initials(userName())) + '</div>' +
      '<div style="min-width:0"><div class="nm">' + esc(userName()) + '</div><div class="ds">' + esc(roleDesc()) + '</div></div>' +
      (MODE === 'live' ? '<button class="out" data-act="logout">Log out</button>' : '<a class="out" style="text-decoration:none" href="/">Exit demo</a>') +
      '</div></aside>' +
      '<main class="main">' +
      '<header class="topbar"><div class="grow"><h1>' + esc(meta.t) + '</h1><div class="sub">' + esc(meta.s()) + '</div></div>' +
      (meta.search ? '<div class="search"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" style="flex-shrink:0"><circle cx="11" cy="11" r="7" stroke="#98A2B3" stroke-width="2"/><path d="m20 20-3-3" stroke="#98A2B3" stroke-width="2" stroke-linecap="round"/></svg>' +
        '<input id="ms-q" placeholder="Search…" value="' + esc(S.q) + '"></div>' : '') +
      '<div class="date-chip"><div class="d">' + today + '</div><div class="s">' + esc(S.ov.mill.season_label || '') + '</div></div></header>' +
      '<div class="content ms-scroll"><div class="page" id="ms-page"></div></div>' +
      '</main>' +
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
    else if (S.page === 'digest') { page.innerHTML = ''; page.appendChild(pageDigest()); }

    var q = document.getElementById('ms-q');
    if (q) {
      q.oninput = function () { S.q = q.value; var pg = document.getElementById('ms-page');
        if (S.page === 'gate') pg.innerHTML = pageGate();
        else if (S.page === 'purchase') pg.innerHTML = pagePurchase();
        else if (S.page === 'stock') pg.innerHTML = pageStock();
        else if (S.page === 'suppliers') pg.innerHTML = partyPage('suppliers');
        else if (S.page === 'buyers') pg.innerHTML = partyPage('buyers');
        else if (S.page === 'items') pg.innerHTML = pageItems();
      };
      q.focus(); q.setSelectionRange(q.value.length, q.value.length);
    }
  }
  function userName() {
    if (MODE === 'demo') return { owner: 'Ramesh Reddy', manager: 'Suresh Kumar', accountant: 'Prakash Rao' }[S.role] || 'Demo user';
    return S.ov && S.ov.me ? S.ov.me.name : '';
  }

  // ---------- login (live mode) ----------
  function renderLogin(root) {
    var signup = root.getAttribute('data-auth') === 'signup';
    root.innerHTML =
      '<div class="auth-wrap"><div class="auth-card">' +
      '<span style="display:inline-flex;align-items:center;justify-content:center;width:42px;height:42px;background:#E8B93B;border-radius:9px">' +
      '<svg width="23" height="23" viewBox="0 0 24 24" fill="none"><path d="M4 20V9l8-5 8 5v11" stroke="#1B2431" stroke-width="2.1" stroke-linejoin="round" stroke-linecap="round"/><path d="M9 20v-5h6v5" stroke="#1B2431" stroke-width="2.1" stroke-linecap="round"/></svg></span>' +
      '<h1>' + (signup ? 'Start your mill on MillSaathi' : 'Log in to your mill') + '</h1>' +
      '<p class="auth-sub">' + (signup ? 'Free forever — no card needed.' : 'Welcome back.') + '</p>' +
      '<form id="auth-form" style="display:flex;flex-direction:column;gap:12px">' +
      (signup ? '<div class="fld"><label>Mill name</label><input name="mill_name" required placeholder="Sri Venkatesh Rice Mill"></div>' +
        '<div class="fld"><label>Your name</label><input name="name" required placeholder="Ramesh Reddy"></div>' : '') +
      '<div class="fld"><label>Email</label><input name="email" type="email" required placeholder="you@mill.com"></div>' +
      '<div class="fld"><label>Password</label><input name="password" type="password" required minlength="8"></div>' +
      '<div class="form-err"></div>' +
      '<button class="btn acc" style="padding:13px;font-size:15px">' + (signup ? 'Create my mill' : 'Log in') + '</button></form>' +
      '<div class="auth-alt">' + (signup ? 'Already using MillSaathi? <button data-auth-to="login">Log in</button>' : 'New here? <button data-auth-to="signup">Create your mill</button>') + '</div>' +
      '<div class="demo-hint">Just looking? <a href="/demo" style="color:#8A6A16">Open the demo mill</a> — no account needed.</div>' +
      '</div></div>';
    root.querySelector('[data-auth-to]').onclick = function (e) {
      root.setAttribute('data-auth', e.target.getAttribute('data-auth-to'));
      renderLogin(root);
    };
    root.querySelector('#auth-form').onsubmit = function (e) {
      e.preventDefault();
      var f = e.target, body = {};
      ['mill_name', 'name', 'email', 'password'].forEach(function (k) { if (f[k]) body[k] = f[k].value; });
      apiPost(signup ? '/api/auth/signup' : '/api/auth/login', body)
        .then(function () { return refresh(); })
        .catch(function (err) { f.querySelector('.form-err').textContent = err.message; });
    };
  }

  // ---------- events ----------
  document.addEventListener('click', function (e) {
    var t = e.target.closest('[data-nav],[data-role],[data-act]');
    if (!t) return;
    if (t.hasAttribute('data-nav')) { S.page = t.getAttribute('data-nav'); S.q = ''; render(); }
    else if (t.hasAttribute('data-role')) { S.role = t.getAttribute('data-role'); render(); }
    else if (t.getAttribute('data-act') === 'logout') {
      apiPost('/api/auth/logout', {}).then(function () { S.ov = null; render(); });
    } else { openAction(t.getAttribute('data-act'), t); }
  });

  loadOverview().then(render);
})();
