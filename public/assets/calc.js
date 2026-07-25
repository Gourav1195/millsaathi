// Shared helpers for the free calculator pages. No dependencies, no network.
(function () {
  function el(id) { return document.getElementById(id); }
  function n(id) {
    var e = el(id), v = e ? parseFloat(e.value) : NaN;
    return isFinite(v) ? v : 0;
  }
  // Sign goes outside the rupee symbol: −₹403, not ₹-403.
  function inr(v) {
    if (!isFinite(v)) v = 0;
    var s = v < 0 ? '−' : '';
    return s + '₹' + Math.round(Math.abs(v)).toLocaleString('en-IN');
  }
  function inrBig(v) {
    if (!isFinite(v)) v = 0;
    var s = v < 0 ? '−' : '', a = Math.abs(v);
    if (a >= 1e7) return s + '₹' + (a / 1e7).toFixed(2) + ' Cr';
    if (a >= 1e5) return s + '₹' + (a / 1e5).toFixed(2) + ' lakh';
    return inr(v);
  }
  function pct(v, d) {
    if (!isFinite(v)) v = 0;
    return v.toFixed(d == null ? 2 : d) + '%';
  }
  function qtl(v) {
    if (!isFinite(v)) v = 0;
    return v.toLocaleString('en-IN', { maximumFractionDigits: 2 }) + ' qtl';
  }
  function set(id, val) { var e = el(id); if (e) e.textContent = val; }
  function tone(id, cls) {
    var e = el(id);
    if (!e) return;
    e.classList.remove('good', 'bad');
    if (cls) e.classList.add(cls);
  }
  function bind(fn) {
    var nodes = document.querySelectorAll('.calc input, .calc select');
    for (var i = 0; i < nodes.length; i++) {
      nodes[i].addEventListener('input', fn);
      nodes[i].addEventListener('change', fn);
    }
    fn();
  }
  window.MSCalc = { el: el, n: n, inr: inr, inrBig: inrBig, pct: pct, qtl: qtl, set: set, tone: tone, bind: bind };
})();
