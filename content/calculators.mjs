// Free calculator pages. Each one is a real working tool — the point is that a
// mill owner can get an answer without signing up, and discover the product by
// noticing the tool is doing by hand what MillSaathi does automatically.

const CALC_JS = '<script src="/assets/calc.js"></script>';

export const calculators = [
  {
    slug: 'rice-mill-outturn',
    navTitle: 'Outturn & unexplained loss',
    cardBlurb:
      'Put in paddy, rice, bran and husk. Get your outturn %, your by-product %, and the gap nobody can explain — in quintals and in rupees.',
    title: 'Rice Mill Outturn Calculator — Free Yield & Loss Tool',
    description:
      'Free rice mill outturn calculator. Enter paddy in and rice, bran and husk out to get your milling yield percentage and the unexplained loss in quintals and rupees. No signup.',
    h1: 'Rice mill outturn &amp; unexplained loss calculator',
    lede:
      'Enter one lot — or one whole day — and see your outturn percentage, your by-product recovery, and the part of the paddy that nothing accounts for. That last number is the one that quietly eats a season.',
    body: `
  <section class="wrap-narrow prose">
    <h2>The calculator</h2>
    <p>Weights in quintals (1 qtl = 100 kg). Use one lot, one shift or one day — the arithmetic is the same.</p>

    <div class="calc">
      <div class="calc-inputs">
        <div class="calc-label">What went in and what came out</div>
        <div class="fld">
          <label for="paddy">Paddy in (qtl)</label>
          <input id="paddy" type="number" min="0" step="0.01" value="1000">
        </div>
        <div class="fld">
          <label for="rice">Rice out (qtl)</label>
          <input id="rice" type="number" min="0" step="0.01" value="670">
        </div>
        <div class="fld">
          <label for="bran">Bran out (qtl)</label>
          <input id="bran" type="number" min="0" step="0.01" value="80">
        </div>
        <div class="fld">
          <label for="husk">Husk out (qtl)</label>
          <input id="husk" type="number" min="0" step="0.01" value="200">
        </div>
        <div class="fld">
          <label for="rate">Paddy rate (₹ per qtl)</label>
          <input id="rate" type="number" min="0" step="1" value="2300">
          <div class="hint">Used to price the unexplained gap. Your purchase rate is the honest number here.</div>
        </div>
      </div>

      <div class="calc-out">
        <div class="calc-label">Your mass balance</div>
        <div class="res-hero" id="lossBox">
          <div class="k">Unexplained</div>
          <div class="v" id="lossPct">—</div>
          <div class="sub" id="lossLine">—</div>
        </div>
        <div class="res">
          <div class="res-row"><span class="k">Rice outturn</span><span class="v" id="outturn">—</span></div>
          <div class="res-row"><span class="k">Bran recovery</span><span class="v" id="branPct">—</span></div>
          <div class="res-row"><span class="k">Husk recovery</span><span class="v" id="huskPct">—</span></div>
          <div class="res-row"><span class="k">Total accounted</span><span class="v" id="acct">—</span></div>
          <div class="res-row"><span class="k">Unexplained qty</span><span class="v" id="lossQtl">—</span></div>
        </div>
        <p class="calc-note">Nothing is sent anywhere — this runs entirely in your browser.</p>
      </div>
    </div>

    <h2>How outturn is actually calculated</h2>
    <p>Outturn is the share of your paddy that leaves the mill as rice:</p>
    <div class="callout">
      <p><strong>Outturn % = (rice out ÷ paddy in) × 100</strong></p>
      <p><strong>Unexplained % = 100 − outturn % − bran % − husk %</strong></p>
    </div>
    <p>The first line is the number everyone quotes. The second is the one that matters. Paddy does not disappear — it becomes rice, bran, husk, or a gap. Moisture driven off in drying is real and belongs in that gap, which is why a small unexplained figure is normal and a large one is not.</p>

    <h2>What a normal range looks like</h2>
    <p>Rice outturn in Indian mills usually sits somewhere in the mid-sixties as a percentage, with husk the largest by-product and bran a much smaller slice. Your own mill's honest range depends on variety, paddy moisture at intake, how the paddy was dried, whether you are milling raw or parboiled, and the condition of your huller and polisher.</p>
    <p>That is the important point: <strong>there is no universal correct number, only your number.</strong> A mill that knows its own settled range for a given variety can spot a bad lot immediately. A mill that has never measured it cannot tell a bad lot from a bad day.</p>
    <p>If you do custom milling for state procurement, the outturn ratio you must deliver is fixed by the procurement order rather than by your machinery — check your current season's order for the exact figure, and treat any shortfall against it as a cost you are absorbing.</p>

    <h2>Why the gap is the whole game</h2>
    <p>On the two to six percent margins a mill actually runs, a couple of points of unexplained loss is not a rounding error — it is the profit. And it never shows up in Tally as a line item, because there is no transaction to record. It is simply an absence.</p>
    <ul class="leak">
      <li>Wet paddy weighed and paid for as dry — you bought water</li>
      <li>Bag counts that drift between the gate and the godown</li>
      <li>By-products sold without ever touching the books</li>
      <li>Genuine process loss and moisture, which is fine — once you know how much of it is genuine</li>
    </ul>
    <p>Running this calculator once tells you today's number. The reason mills keep leaking is that nobody runs it every day, for every lot, against the record. That is exactly what MillSaathi does — free.</p>
  </section>
${CALC_JS}`,
    script: `(function(){
  var C = window.MSCalc;
  C.bind(function(){
    var paddy = C.n('paddy'), rice = C.n('rice'), bran = C.n('bran'), husk = C.n('husk'), rate = C.n('rate');
    if (paddy <= 0) {
      C.set('outturn','—'); C.set('branPct','—'); C.set('huskPct','—');
      C.set('acct','—'); C.set('lossQtl','—'); C.set('lossPct','—');
      C.set('lossLine','Enter the paddy that went in to get a balance.');
      C.tone('lossBox', null);
      return;
    }
    var op = rice / paddy * 100, bp = bran / paddy * 100, hp = husk / paddy * 100;
    var acct = op + bp + hp, loss = 100 - acct, lossQ = paddy - (rice + bran + husk);
    C.set('outturn', C.pct(op));
    C.set('branPct', C.pct(bp));
    C.set('huskPct', C.pct(hp));
    C.set('acct', C.pct(acct));
    C.set('lossQtl', C.qtl(lossQ));
    C.set('lossPct', C.pct(loss) );
    if (loss < -0.005) {
      C.set('lossLine', 'Your outputs weigh more than your paddy. Check the weights — something is double-counted.');
      C.tone('lossBox', 'bad');
    } else if (rate > 0) {
      C.set('lossLine', 'Worth ' + C.inrBig(lossQ * rate) + ' at ₹' + Math.round(rate).toLocaleString('en-IN') + '/qtl of paddy.');
      C.tone('lossBox', loss > 3 ? 'bad' : loss > 1.5 ? null : 'good');
    } else {
      C.set('lossLine', 'Add a paddy rate to price this gap.');
      C.tone('lossBox', null);
    }
  });
})();`,
    faqs: [
      {
        q: 'What is a good outturn percentage for a rice mill?',
        a: 'There is no single right answer — it depends on your variety, intake moisture, drying, raw versus parboiled milling, and machine condition. What matters far more is knowing your own settled range for each variety, because that is what lets you recognise a bad lot on the day it happens instead of at the end of the season.',
      },
      {
        q: 'Why is my unexplained loss so high?',
        a: 'The four usual causes are wet paddy weighed as dry at the gate, bag counts drifting between weighbridge and godown, by-products leaving without a sale record, and genuine moisture loss in drying. Genuine loss is fine — the problem is that without a per-lot record you cannot tell which portion is genuine.',
      },
      {
        q: 'Does moisture loss count as unexplained loss?',
        a: 'Physically it is real weight that leaves as water, so it shows up in the gap. Measure your paddy moisture at intake and it stops being a mystery: you can separate the water you paid for from the grain you actually lost. The moisture deduction calculator on this site does that part.',
      },
      {
        q: 'Is this calculator free?',
        a: 'Yes, and so is MillSaathi itself. There is no signup on this page, nothing is sent to a server, and the full product — gate, weighbridge, lab, saudas, stock and the nightly mass balance — is free with unlimited users.',
      },
    ],
  },

  {
    slug: 'paddy-moisture-deduction',
    navTitle: 'Moisture deduction',
    cardBlurb:
      "Wet paddy weighed as dry is the oldest leak at the gate. Work out the dry-weight equivalent and exactly what you'd overpay.",
    title: 'Paddy Moisture Deduction Calculator — Free Tool',
    description:
      'Free paddy moisture deduction calculator for Indian rice mills. Convert wet weight to dry-weight equivalent, see the deduction in quintals, and the rupees you would overpay by paying on gross weight.',
    h1: 'Paddy moisture deduction calculator',
    lede:
      'A truck arrives at 21% moisture and gets paid at gross weight. You just bought water at the price of paddy. This works out the dry-weight equivalent, the deduction, and what the difference is worth.',
    body: `
  <section class="wrap-narrow prose">
    <h2>The calculator</h2>

    <div class="calc">
      <div class="calc-inputs">
        <div class="calc-label">The lot at the gate</div>
        <div class="fld">
          <label for="gross">Weighed quantity (qtl)</label>
          <input id="gross" type="number" min="0" step="0.01" value="250">
        </div>
        <div class="fld">
          <label for="obs">Moisture measured (%)</label>
          <input id="obs" type="number" min="0" max="40" step="0.1" value="21">
          <div class="hint">What your lab meter actually read for this lot.</div>
        </div>
        <div class="fld">
          <label for="base">Accepted moisture (%)</label>
          <input id="base" type="number" min="0" max="30" step="0.1" value="17">
          <div class="hint">The specification you buy against. Confirm the current figure for your procurement or your own purchase terms.</div>
        </div>
        <div class="fld">
          <label for="prate">Rate (₹ per qtl)</label>
          <input id="prate" type="number" min="0" step="1" value="2300">
        </div>
      </div>

      <div class="calc-out">
        <div class="calc-label">What you should pay</div>
        <div class="res-hero" id="overBox">
          <div class="k">Overpayment if you ignore it</div>
          <div class="v" id="over">—</div>
          <div class="sub" id="overLine">—</div>
        </div>
        <div class="res">
          <div class="res-row"><span class="k">Dry-weight equivalent</span><span class="v" id="dry">—</span></div>
          <div class="res-row"><span class="k">Deduction</span><span class="v" id="ded">—</span></div>
          <div class="res-row"><span class="k">Deduction %</span><span class="v" id="dedPct">—</span></div>
          <div class="res-row"><span class="k">Pay on dry weight</span><span class="v" id="payDry">—</span></div>
          <div class="res-row"><span class="k">Pay on gross weight</span><span class="v" id="payGross">—</span></div>
        </div>
        <p class="calc-note">Runs in your browser. Nothing is stored or sent.</p>
      </div>
    </div>

    <h2>The formula</h2>
    <div class="callout">
      <p><strong>Dry-weight equivalent = weighed qty × (100 − measured moisture) ÷ (100 − accepted moisture)</strong></p>
      <p><strong>Deduction = weighed qty − dry-weight equivalent</strong></p>
    </div>
    <p>The logic is simply that you pay for grain, not for water. If a lot reads above your accepted moisture, part of what the weighbridge recorded is moisture that will evaporate in drying and never become rice. The formula converts the wet weight into the equivalent weight at your accepted moisture level, so two lots at different moistures can be compared and paid on the same basis.</p>
    <p>Some mills instead apply a flat percentage cut per point of excess moisture. That is quicker but crude, and it is usually the thing suppliers argue about, because a flat cut is a negotiating position while the formula above is arithmetic.</p>

    <h2>Why this is the most-argued number at the gate</h2>
    <p>Moisture deduction is the one point in the day where a small judgement call, repeated across every truck of the season, becomes a very large number. A point or two of moisture waved through because the supplier is a regular, or because the queue is long and the meter is in the other room, costs real money — and because it is a decision rather than a transaction, it never leaves a trace anyone can audit later.</p>
    <ul>
      <li>Measure at the gate, before the lot is unloaded and mixed</li>
      <li>Record the reading against the lot, not on a loose slip</li>
      <li>Apply the same basis to every supplier, and let them see it</li>
      <li>Reconcile at the end of the day against what actually got dried</li>
    </ul>
    <p>The argument stops being an argument the moment there is a record. In MillSaathi the lab reading is captured against the lot before the purchase is priced, so the deduction is computed rather than negotiated — and the owner sees it that night.</p>
  </section>
${CALC_JS}`,
    script: `(function(){
  var C = window.MSCalc;
  C.bind(function(){
    var g = C.n('gross'), obs = C.n('obs'), base = C.n('base'), r = C.n('prate');
    if (g <= 0 || base >= 100) {
      ['dry','ded','dedPct','payDry','payGross','over'].forEach(function(id){ C.set(id,'—'); });
      C.set('overLine','Enter a quantity to see the deduction.');
      C.tone('overBox', null);
      return;
    }
    // A lot at or below the accepted moisture attracts no deduction — mills do
    // not pay a bonus for dry paddy, so clamp instead of showing a negative.
    var wet = obs > base;
    var dry = wet ? g * (100 - obs) / (100 - base) : g;
    var ded = g - dry;
    var payDry = dry * r, payGross = g * r, over = payGross - payDry;
    C.set('dry', C.qtl(dry));
    C.set('ded', C.qtl(ded));
    C.set('dedPct', C.pct(ded / g * 100));
    C.set('payDry', C.inrBig(payDry));
    C.set('payGross', C.inrBig(payGross));
    C.set('over', C.inrBig(over));
    if (!wet) {
      C.set('overLine', 'This lot is at or below your accepted moisture — no deduction is due, pay on the weighed quantity.');
      C.tone('overBox', 'good');
    } else {
      C.set('overLine', 'On this one lot, at ' + obs.toFixed(1) + '% against an accepted ' + base.toFixed(1) + '%. Multiply by a season of trucks.');
      C.tone('overBox', 'bad');
    }
  });
})();`,
    faqs: [
      {
        q: 'How is moisture deduction calculated for paddy?',
        a: 'Dry-weight equivalent = weighed quantity × (100 − measured moisture) ÷ (100 − accepted moisture). The deduction is the difference between the weighed quantity and that equivalent. It converts a wet lot into what it is worth at your accepted moisture level so every supplier is paid on the same basis.',
      },
      {
        q: 'What moisture level is paddy accepted at?',
        a: 'It is set by the specification you are buying against rather than by the mill, and it can change between seasons and between procurement and open-market purchases. Confirm the current figure for your own state and season, then use it consistently — the number matters less than applying the same one to everybody.',
      },
      {
        q: 'Should I use a flat percentage cut instead?',
        a: 'You can, and many mills do because it is faster. It is also the reason moisture becomes a negotiation: a flat cut is a position, while the dry-weight formula is arithmetic that both sides can check. If you use a flat cut, at least record the meter reading so the two can be reconciled later.',
      },
      {
        q: 'Where should moisture be measured?',
        a: 'At the gate, against the lot, before unloading and before the paddy is mixed with anything already in the godown. Once it is unloaded the reading belongs to a heap rather than to a supplier, and you have lost the ability to price that specific purchase correctly.',
      },
    ],
  },

  {
    slug: 'rice-cost-per-quintal',
    navTitle: 'Cost per quintal of rice',
    cardBlurb:
      'Your paddy rate is not your cost. Fold in outturn, by-product credit and milling cost to get what a quintal of rice really costs you — and your break-even.',
    title: 'Rice Cost Per Quintal Calculator — Free Mill Tool',
    description:
      'Free calculator for the true cost of a quintal of rice: paddy rate, outturn percentage, bran and husk credit, milling and transport cost. Shows break-even selling rate and margin per quintal.',
    h1: 'What a quintal of rice actually costs you',
    lede:
      'The paddy rate is the number everyone quotes, and it is never the cost. Outturn, by-product credit and milling cost decide what a quintal of rice really costs — and therefore the rate below which a sale loses money.',
    body: `
  <section class="wrap-narrow prose">
    <h2>The calculator</h2>
    <p>Everything here is per quintal of <em>paddy</em>, except the results, which are per quintal of <em>rice</em>. That conversion is the part most back-of-the-envelope sums get wrong.</p>

    <div class="calc">
      <div class="calc-inputs">
        <div class="calc-label">Cost side (per qtl of paddy)</div>
        <div class="fld">
          <label for="prate2">Paddy rate (₹ per qtl)</label>
          <input id="prate2" type="number" min="0" step="1" value="2300">
        </div>
        <div class="fld">
          <label for="mill">Milling &amp; labour cost (₹ per qtl of paddy)</label>
          <input id="mill" type="number" min="0" step="1" value="120">
          <div class="hint">Power, labour, consumables, maintenance — your own figure.</div>
        </div>
        <div class="fld">
          <label for="trans">Transport &amp; handling (₹ per qtl of paddy)</label>
          <input id="trans" type="number" min="0" step="1" value="40">
        </div>

        <div class="calc-label" style="margin-top:24px;">Recovery &amp; by-product credit</div>
        <div class="fld">
          <label for="ot">Rice outturn (%)</label>
          <input id="ot" type="number" min="1" max="100" step="0.1" value="67">
        </div>
        <div class="fld">
          <label for="branPc">Bran recovery (%) and rate (₹ per qtl)</label>
          <div style="display:flex;gap:10px;">
            <input id="branPc" type="number" min="0" max="100" step="0.1" value="8">
            <input id="branRt" type="number" min="0" step="1" value="1800">
          </div>
        </div>
        <div class="fld">
          <label for="huskPc">Husk recovery (%) and rate (₹ per qtl)</label>
          <div style="display:flex;gap:10px;">
            <input id="huskPc" type="number" min="0" max="100" step="0.1" value="20">
            <input id="huskRt" type="number" min="0" step="1" value="180">
          </div>
        </div>
        <div class="fld">
          <label for="sell">Your rice selling rate (₹ per qtl)</label>
          <input id="sell" type="number" min="0" step="1" value="4200">
        </div>
      </div>

      <div class="calc-out">
        <div class="calc-label">What it really costs</div>
        <div class="res-hero" id="costBox">
          <div class="k">Cost per qtl of rice</div>
          <div class="v" id="cost">—</div>
          <div class="sub" id="costLine">—</div>
        </div>
        <div class="res">
          <div class="res-row"><span class="k">Total cost per qtl paddy</span><span class="v" id="tot">—</span></div>
          <div class="res-row"><span class="k">By-product credit</span><span class="v" id="cred">—</span></div>
          <div class="res-row"><span class="k">Net cost per qtl paddy</span><span class="v" id="net">—</span></div>
          <div class="res-row"><span class="k">Break-even rice rate</span><span class="v" id="be">—</span></div>
          <div class="res-row"><span class="k">Margin per qtl of rice</span><span class="v" id="marg">—</span></div>
          <div class="res-row"><span class="k">Margin %</span><span class="v" id="margPct">—</span></div>
        </div>
        <p class="calc-note">Runs in your browser. Nothing is stored or sent.</p>
      </div>
    </div>

    <h2>How the conversion works</h2>
    <div class="callout">
      <p><strong>Net cost per qtl of paddy = paddy rate + milling + transport − by-product credit</strong></p>
      <p><strong>Cost per qtl of rice = net cost per qtl of paddy ÷ (outturn ÷ 100)</strong></p>
    </div>
    <p>That division is where the money is. At a 67% outturn every quintal of paddy yields roughly two-thirds of a quintal of rice, so every rupee of net paddy cost becomes about one and a half rupees of rice cost. It also means a single point of outturn is worth far more than it looks — losing one point does not cost you one percent, it raises your rice cost by roughly one and a half percent of itself, every single lot.</p>
    <p>By-product credit works in the other direction and is routinely undercounted. Bran in particular carries a real price, and mills that sell it casually — without it ever appearing against the lot it came from — are giving away margin they have already earned.</p>

    <h2>Why break-even is the number to know before you sell</h2>
    <p>Most rate decisions get made on the phone, against a memory of what paddy cost. Break-even is what actually protects a sale: below it you are converting working capital into losses at speed, and because rice moves in large lots, one badly-priced sale can undo a good month.</p>
    <ul class="leak">
      <li>Outturn drifting down quietly raises your break-even without anyone announcing it</li>
      <li>By-products sold off the books make your true cost look higher than it is</li>
      <li>Milling cost per quintal rises as throughput falls — a slow season is a more expensive one</li>
      <li>Paddy bought wet and paid as dry inflates every number on this page</li>
    </ul>
    <p>This calculator gives you the figure for one set of assumptions. MillSaathi keeps the same sum running on your real lots, every day, from the weights actually captured at the bridge — and it is free.</p>
  </section>
${CALC_JS}`,
    script: `(function(){
  var C = window.MSCalc;
  C.bind(function(){
    var pr = C.n('prate2'), mc = C.n('mill'), tr = C.n('trans'), ot = C.n('ot');
    var bp = C.n('branPc'), br = C.n('branRt'), hp = C.n('huskPc'), hr = C.n('huskRt'), sell = C.n('sell');
    if (ot <= 0) {
      ['tot','cred','net','cost','be','marg','margPct'].forEach(function(id){ C.set(id,'—'); });
      C.set('costLine','Enter an outturn percentage above zero.');
      C.tone('costBox', null);
      return;
    }
    var tot = pr + mc + tr;
    var cred = (bp / 100) * br + (hp / 100) * hr;
    var net = tot - cred;
    var cost = net / (ot / 100);
    var marg = sell - cost;
    C.set('tot', C.inr(tot));
    C.set('cred', C.inr(cred));
    C.set('net', C.inr(net));
    C.set('cost', C.inr(cost));
    C.set('be', C.inr(cost));
    C.set('marg', C.inr(marg));
    C.set('margPct', sell > 0 ? C.pct(marg / sell * 100) : '—');
    if (sell <= 0) {
      C.set('costLine', 'Add your rice selling rate to see the margin.');
      C.tone('costBox', null);
    } else if (marg < 0) {
      C.set('costLine', 'You are selling ' + C.inr(-marg) + '/qtl below cost at ₹' + Math.round(sell).toLocaleString('en-IN') + '.');
      C.tone('costBox', 'bad');
    } else {
      C.set('costLine', 'At ₹' + Math.round(sell).toLocaleString('en-IN') + '/qtl you keep ' + C.inr(marg) + ' per qtl of rice.');
      C.tone('costBox', marg / sell < 0.02 ? null : 'good');
    }
  });
})();`,
    faqs: [
      {
        q: 'How do I calculate the cost of one quintal of rice?',
        a: 'Add paddy rate, milling cost and transport per quintal of paddy, subtract the bran and husk credit, then divide by your outturn expressed as a fraction. Dividing by outturn is the step that is usually skipped, and it is the step that turns a paddy rate into a rice cost.',
      },
      {
        q: 'Why does one point of outturn matter so much?',
        a: 'Because cost per quintal of rice is net paddy cost divided by outturn. At around two-thirds recovery, every rupee of paddy cost becomes roughly one and a half rupees of rice cost, so a point lost on recovery raises your cost by more than a point — on every lot, all season.',
      },
      {
        q: 'Should by-products be counted as income or as a cost reduction?',
        a: 'Either works arithmetically, as long as you do it consistently and actually record the sale. The real risk is not the accounting treatment — it is bran and husk leaving the mill without ever being tied to the lot that produced them, which makes your rice look more expensive than it is and hides a genuine leak.',
      },
      {
        q: 'Is MillSaathi free to use for this?',
        a: 'Yes. This calculator needs no signup, and MillSaathi itself is free — all modules, unlimited users, no card. The difference is that the product runs this calculation on your real captured weights every day instead of on the assumptions you typed here.',
      },
    ],
  },
];
