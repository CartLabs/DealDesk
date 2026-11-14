// Deal math for DealDesk. Used by index.html and by test/calc.test.js.
// Change formulas here only, then run: node --test
const DEFAULTS={maxPrice:700000,maxPriceSingle:550000, // price ceilings: 2-4 units, and a single-family home (Kevin, Nov 7 2026)
  minCF:200,minCoC:0,minDSCR:1.2,down:25,rate:7.25,term:30,closing:3,vac:5,maint:8,capex:7,mgmt:8,
  lenderDSCR:1.0,  // a DSCR lender's own test: gross rent / PITIA (principal, interest, taxes, insurance, HOA). 0 = off
  points:1,        // lender points, % of the loan, paid at closing
  reserves:6,      // months of PITIA the lender wants to see in the bank after closing (shown, not spent)
  dpSource:1,      // where the cash to close comes from: 0 = cash, 1 = a home equity loan (its payment is a cost of the deal)
  heRate:8,heTerm:20, // that home equity loan's rate and term
  funds:0,         // cash plus equity you can draw, for cash to close and reserves. 0 = not set, no check
  // Flips and BRRRR (1.22.0). The purchase and rehab go on a short-term (hard-money) loan; everything else it does not
  // cover comes from the same place as a rental's cash to close (dpSource: the home equity line, or cash).
  hmLTC:90,        // short-term loan: % of the purchase price it lends
  hmRehab:100,     // and % of the rehab (paid out in draws as the work is done)
  hmRate:11,       // its interest rate, interest only
  hmPoints:2,      // its points, % of the loan
  months:6,        // a flip: months from buying to sold (rehab plus time on the market)
  sellCost:6,      // selling costs, % of the sale price (agent, transfer tax, seller's closing costs)
  contingency:10,  // added to the GC's number, % of the rehab, for what the walkthrough misses
  holdMonthly:300, // utilities, lawn and snow, while it is empty
  minFlipProfit:50000, // a flip must clear this before tax
  flipTax:30,      // rough tax on flip profit, %. Ordinary income; ask a CPA
  refiLTV:75,      // BRRRR: the refinance lends this % of the after-repair value
  refiMonths:6,    // BRRRR: months from buying to the refinance (many lenders want 6 months of ownership)
  refiCost:3};     // BRRRR: refinance closing costs and points, % of the new loan
// the ceiling that applies to this deal: single-family homes have their own, lower one
const ceilingFor=(d,s)=>+d.units===1?opt(s,"maxPriceSingle"):+s.maxPrice;
function loanK(rate,term){const r=rate/1200,n=term*12;return r===0?1/term:12*r/(1-Math.pow(1+r,-n));}
// A deal can carry its own financing (a lender's quote, seller financing, an assumable loan, a private note).
// When it does, those terms replace the buy box's down payment, rate and term for that deal only.
function dealTerms(d,s){
  const f=d&&d.fin; if(!f||f.kind!=="custom")return s;
  const o={...s}; ["down","rate","term","points","heRate"].forEach(k=>{const v=f[k]; if(v!==""&&v!==null&&v!==undefined&&isFinite(+v))o[k]=+v;});
  if(!(o.term>=1))o.term=s.term;
  return o;
}
const opt=(s,k)=>s[k]===undefined?DEFAULTS[k]:+s[k]; // settings saved before a key existed fall back to its default
// Every figure for the deal at a given price. Estimated taxes and insurance move with the price.
function metrics(d,s,price,downOverride){
  const units=Math.max(1,+d.units||1),rehab=+d.rehab||0;
  const taxEst=!(+d.taxes>0),insEst=!(+d.ins>0);
  const taxes=taxEst?price*(d.state==="NH"?0.019:0.012):+d.taxes;
  const ins=insEst?Math.max(1500,price*0.004):+d.ins;
  const gross=(+d.rent||0)*12, vacancy=gross*s.vac/100, egi=gross-vacancy;
  const maint=egi*s.maint/100,capex=egi*s.capex/100,mgmt=egi*s.mgmt/100,hoa=(+d.hoa||0)*12;
  const opex=taxes+ins+hoa+maint+capex+mgmt, noi=egi-opex;
  const dn=(downOverride??s.down)/100, cl=s.closing/100, k=loanK(s.rate,s.term);
  const loan=price*(1-dn), debt=loan*k, points=loan*opt(s,"points")/100;
  const cash=price*(dn+cl)+points+rehab;                       // cash to close: down payment, closing costs, points, rehab
  const pitia=debt+taxes+ins+hoa, reserves=pitia/12*opt(s,"reserves");
  const fromEquity=opt(s,"dpSource")===1, heLoan=fromEquity?cash:0, heDebt=heLoan*loanK(opt(s,"heRate"),opt(s,"heTerm"));
  const cf=noi-debt-heDebt;                                    // what is left after the mortgage and the home equity loan
  const coc=cash>0?cf/cash*100:0, dscr=debt>0?noi/debt:99, lenderDscr=pitia>0?gross/pitia:99, cap=price>0?noi/price*100:0;
  const cfUnit=cf/12/units, need=cash+reserves, funds=opt(s,"funds");
  return {price,units,taxes,ins,taxEst,insEst,gross,vacancy,egi,maint,capex,mgmt,hoa,opex,noi,loan,debt,points,cash,pitia,reserves,need,
    fromEquity,heLoan,heDebt,cf,coc,dscr,lenderDscr,cap,cfUnit,overFunds:funds>0&&need>funds,rentRatio:price>0?(+d.rent||0)/price*100:0};
}
// The buy box rules, in the order they are named when one sets the maximum offer.
function failing(x,s){const f=[];
  if(x.cfUnit<s.minCF)f.push("cash flow per unit");
  if(x.coc<s.minCoC)f.push("cash-on-cash return");
  if(x.dscr<s.minDSCR)f.push("debt coverage");
  if(opt(s,"lenderDSCR")>0&&x.lenderDscr<opt(s,"lenderDSCR"))f.push("lender's debt coverage");
  if(opt(s,"funds")>0&&x.need>opt(s,"funds"))f.push("your available funds");
  return f;}
function analyze(d,s,downOverride){
  s=dealTerms(d,s);
  const price=+d.price||0, a=metrics(d,s,price,downOverride);
  // max offer: the highest price, in thousands, at which every rule passes. Every rule only gets worse as the price rises.
  const ok=p=>failing(metrics(d,s,p,downOverride),s).length===0;
  let maxOffer=0,binding="";
  const top=Math.max(0,ceilingFor(d,s)||0);
  if(ok(top)){maxOffer=Math.floor(top/1000)*1000;binding="price ceiling";}
  else if(ok(1000)){let lo=1000,hi=top;for(let i=0;i<32;i++){const m=(lo+hi)/2;if(ok(m))lo=m;else hi=m;}
    maxOffer=Math.floor(lo/1000)*1000;binding=failing(metrics(d,s,hi,downOverride),s)[0]||"price ceiling";}
  else binding=failing(metrics(d,s,1000,downOverride),s)[0]||"";
  const gap=price>0?(price-maxOffer)/price*100:0;
  const verdict=gap<=0?"Buy box":gap<=10?"Negotiate":"Pass";
  return {...a,maxOffer,binding,gap,verdict};
}

// ---- Plain-language explainer: the extra numbers behind "Explain this deal" ----
// Largest x in [lo, hi] for which ok(x) is true, when ok is true below a point and false above it.
function lastTrue(ok, lo, hi) {
  if (!ok(lo)) return null;
  if (ok(hi)) return hi;
  for (let i = 0; i < 60; i++) { const mid = (lo + hi) / 2; if (ok(mid)) lo = mid; else hi = mid; }
  return lo;
}
// Loan principal paid off after `years` of payments.
function principalPaid(loan, rate, term, years) {
  const r = rate / 1200, N = term * 12, n = Math.min(years * 12, N);
  if (r === 0) return loan * n / N;
  const g = Math.pow(1 + r, N), bal = loan * (g - Math.pow(1 + r, n)) / (g - 1);
  return loan - bal;
}
function explain(d, s) {
  s = dealTerms(d, s);                       // from here on `s` already holds this deal's own financing
  const fin = d.fin; d = { ...d }; delete d.fin;
  const a = analyze(d, s), units = a.units, rent = +d.rent || 0;
  const at = (dd, ss) => analyze(dd, ss);
  const passes = x => x.gap <= 0;
  const overCeiling = a.price > ceilingFor(d, s);
  // Interest rate: the highest rate at which the asking price still meets every rule.
  const passRateRaw = overCeiling ? null : lastTrue(r => passes(at(d, { ...s, rate: r })), 0, 15);
  const passRate = passRateRaw === null ? null : Math.floor(passRateRaw * 8) / 8;          // lenders quote in eighths
  const breakEvenRaw = lastTrue(r => at(d, { ...s, rate: r }).cf >= 0, 0, 25);
  const breakEvenRate = breakEvenRaw === null ? null : Math.floor(breakEvenRaw * 8) / 8;
  const quarter = (at(d, { ...s, rate: Math.max(0, s.rate - 0.25) }).cf - a.cf) / 12;      // monthly gain per 0.25 point
  // Rent: the lowest total monthly rent at which the asking price meets every rule.
  let rentToPass = null;
  if (!overCeiling) {
    const hi = Math.max(rent * 4, a.price * 0.03);
    const failBelow = lastTrue(x => !passes(at({ ...d, rent: x }, s)), 0, hi);
    rentToPass = failBelow === null ? 0 : failBelow >= hi ? null : Math.ceil(failBelow / 25) * 25;
    if (rentToPass !== null && !passes(at({ ...d, rent: rentToPass }, s))) rentToPass += 25;
  }
  const y1 = principalPaid(a.loan, s.rate, s.term, 1), y5 = principalPaid(a.loan, s.rate, s.term, 5);
  const outgo = a.opex + a.debt;
  const lower = at({ ...d, rent: rent * 0.9 }, s), higher = at(d, { ...s, rate: s.rate + 1 }), self = at(d, { ...s, mgmt: 0 });
  const rates = [-1.5, -1, -0.5, 0, 0.5, 1].map(x => Math.max(0, s.rate + x)).filter((v, i, arr) => arr.indexOf(v) === i)
    .map(r => { const x = at(d, { ...s, rate: r }); return { rate: r, payment: x.debt / 12, cfUnit: x.cfUnit, coc: x.coc, verdict: x.verdict, current: r === s.rate }; });
  return {
    a, units, rent,
    monthly: { rent, vacancy: a.vacancy / 12, taxes: a.taxes / 12, ins: a.ins / 12, hoa: a.hoa / 12, maint: a.maint / 12, capex: a.capex / 12, mgmt: a.mgmt / 12, mortgage: a.debt / 12, equity: a.heDebt / 12, left: a.cf / 12 },
    principalY1: y1, principalY5: y5,
    totalReturnY1: a.cash > 0 ? (a.cf + y1) / a.cash * 100 : 0,
    growth3: a.price * 0.03,                                   // what a 3% rise in value would be worth, for illustration
    breakEvenOccupancy: a.gross > 0 ? Math.min(999, (a.gross - a.vacancy - a.cf) / a.gross * 100) : 0,
    monthsEmptyToZero: a.cf > 0 && units > 0 && rent > 0 ? a.cf / (rent / units) : 0,
    rentDown10: { cfUnit: lower.cfUnit, cf: lower.cf / 12, verdict: lower.verdict },
    rateUp1: { cfUnit: higher.cfUnit, cf: higher.cf / 12, verdict: higher.verdict },
    selfManage: { cfUnit: self.cfUnit, cf: self.cf / 12, verdict: self.verdict, gain: (self.cf - a.cf) / 12 },
    overCeiling, passRate, breakEvenRate, perQuarterPoint: quarter, rentToPass, rates,
    terms: s, custom: !!(fin && fin.kind === "custom"),
    balloon: fin && fin.kind === "custom" && +fin.balloon > 0 && +fin.balloon < s.term
      ? { years: +fin.balloon, balance: a.loan - principalPaid(a.loan, s.rate, s.term, +fin.balloon) } : null
  };
}

// ---- Flips and BRRRR (1.22.0) ----
// After-repair value (ARV): what the home should sell for once it is fixed up. Kevin's own figure wins; otherwise
// an estimate from price per square foot in the same town and home type, recent sales first, then homes for sale.
// The top quarter is used because fixed-up homes sell at the top of a town's range.
const kindOf = d => (Math.max(1, +d.units || 1) === 1 ? "house" : "multi");
const townKey = d => `${d.town}|${d.state}|${kindOf(d)}`;
const sqftOf = d => (+d.sqft > 0 ? +d.sqft : d.facts && +d.facts.squareFootage > 0 ? +d.facts.squareFootage : 0);
function quantile(arr, q) {
  if (!arr.length) return 0;
  const b = [...arr].sort((x, y) => x - y), i = (b.length - 1) * q, lo = Math.floor(i), hi = Math.ceil(i);
  return b[lo] + (b[hi] - b[lo]) * (i - lo);
}
const MIN_COMPS = 5;
// Price per square foot by town and home type. `listings`: homes for sale (sold and withdrawn ones are skipped,
// but a listing's own sale counts as a sale). `sales`: [{town, state, kind, price, sqft, date}] from the daily check.
function ppsfTable(listings, sales, now) {
  const T = {}, add = (k, which, v) => { if (v > 20 && v < 2000) ((T[k] = T[k] || { sold: [], listed: [] })[which]).push(v); };
  const t0 = Date.parse(now || new Date().toISOString());
  const seen = new Set();
  for (const c of sales || []) {
    if (!(+c.price > 0 && +c.sqft > 0)) continue;
    if (c.date && t0 - Date.parse(c.date) > 365 * 864e5) continue;
    if (c.id) seen.add(c.id);
    add(`${c.town}|${c.state}|${c.kind}`, "sold", c.price / c.sqft);
  }
  for (const d of listings || []) {
    const sf = sqftOf(d); if (!sf) continue;
    if (d.sold) { if (+d.sold.price > 0 && !seen.has(d.id)) add(townKey(d), "sold", d.sold.price / sf); continue; }
    if (d.gone || !(+d.price > 0)) continue;
    add(townKey(d), "listed", d.price / sf);
  }
  return T;
}
function arvEstimate(d, table) {
  const sf = sqftOf(d), t = table && table[townKey(d)];
  if (!sf || !t) return null;
  for (const [src, arr] of [["sold", t.sold], ["listed", t.listed]]) {
    if (arr.length >= MIN_COMPS) { const p = quantile(arr, 0.75); return { value: Math.round(sf * p / 1000) * 1000, ppsf: Math.round(p), townPpsf: Math.round(quantile(arr, 0.5)), n: arr.length, src, sqft: sf }; }
  }
  return null;
}
const arvOf = d => (+d.arv > 0 ? +d.arv : +d.arvEst > 0 ? +d.arvEst : 0);
const holdTaxIns = (d, price) => ({ taxes: +d.taxes > 0 ? +d.taxes : price * (d.state === "NH" ? 0.019 : 0.012), ins: +d.ins > 0 ? +d.ins : Math.max(1500, price * 0.004) });
// Buying and fixing on a short-term loan: what it lends, its points, the buyer's closing costs, and the cash that leaves.
function shortTerm(P, R, s) {
  const loan = P * opt(s, "hmLTC") / 100 + R * opt(s, "hmRehab") / 100;
  const points = loan * opt(s, "hmPoints") / 100, closing = P * s.closing / 100;
  return { loan, points, closing, cashIn: Math.max(0, P + R + closing + points - loan),
    down: P * Math.max(0, 1 - opt(s, "hmLTC") / 100), rehabCash: R * Math.max(0, 1 - opt(s, "hmRehab") / 100) };
}
// Costs common to both while the home is being worked on: contingency, holding costs and loan interest for M months.
function project(d, s, P, R, M) {
  const st = shortTerm(P, R, s), cont = R * opt(s, "contingency") / 100, ti = holdTaxIns(d, P);
  const holdTax = ti.taxes / 12 * M, holdIns = ti.ins / 12 * M, holdOther = opt(s, "holdMonthly") * M;
  const loanInt = st.loan * opt(s, "hmRate") / 1200 * M;
  const ongoing = cont + holdTax + holdIns + holdOther + loanInt;
  const cashNeed = st.cashIn + ongoing;                                     // the most cash out at once
  const fromEquity = opt(s, "dpSource") === 1;
  // home equity line, interest only: the cash at closing for the whole time, the rest drawn as it goes (half on average)
  const heInt = fromEquity ? (st.cashIn + ongoing / 2) * opt(s, "heRate") / 1200 * M : 0;
  return { ...st, cont, holdTax, holdIns, holdOther, loanInt, heInt, cashNeed, fromEquity, M };
}
function flipAt(d, s, P, R, V) {
  const M = Math.max(1, opt(s, "months")), p = project(d, s, P, R, M);
  const sell = V * opt(s, "sellCost") / 100;
  const profit = V - sell - P - p.closing - p.points - R - p.cont - p.holdTax - p.holdIns - p.holdOther - p.loanInt - p.heInt;
  const tax = profit > 0 ? profit * opt(s, "flipTax") / 100 : 0, net = profit - tax;
  const roi = p.cashNeed > 0 ? profit / p.cashNeed * 100 : 0;
  return { ...p, price: P, rehab: R, arv: V, sell, profit, tax, net, roi, annual: roi * 12 / M };
}
function brrrrAt(d, s, P, R, V) {
  const M = Math.max(1, opt(s, "refiMonths")), p = project(d, s, P, R, M);
  // The refinance lends up to refiLTV% of the after-repair value, but only as much as the rent can carry: lenders size a
  // rental loan by its debt coverage, so the loan shrinks until your DSCR and the lender's both pass.
  const rs = { ...s, closing: 0, points: 0, dpSource: 0 }, cap = opt(s, "refiLTV");
  const fits = l => { const r = metrics(d, rs, V, 100 - l); return r.dscr >= s.minDSCR && !(opt(s, "lenderDSCR") > 0 && r.lenderDscr < opt(s, "lenderDSCR")); };
  const ltvRaw = lastTrue(fits, 0, cap), ltv = ltvRaw === null ? 0 : ltvRaw >= cap ? cap : Math.floor(ltvRaw * 10) / 10;
  const newLoan = V * ltv / 100, refiCost = newLoan * opt(s, "refiCost") / 100;
  const cashBack = newLoan - p.loan - refiCost;                             // what the refinance hands back after paying off the short-term loan
  const putIn = p.cashNeed + p.heInt, left = putIn - cashBack;              // cash still in the deal afterwards (negative: you took out more)
  // kept as a rental on the new loan: the rental math at the after-repair value, with the refinance as the mortgage
  const r = metrics(d, rs, V, 100 - ltv);
  const heDebt = p.fromEquity && left > 0 ? left * loanK(opt(s, "heRate"), opt(s, "heTerm")) : 0;
  const cf = r.noi - r.debt - heDebt, units = r.units;
  return { ...p, price: P, rehab: R, arv: V, newLoan, ltv, sized: ltv < cap, refiCost, cashBack, putIn, left, back: putIn > 0 ? Math.min(100, Math.max(0, cashBack / putIn * 100)) : 0,
    rent: r.gross / 12, noi: r.noi, opex: r.opex, vacancy: r.vacancy, debt: r.debt, heDebt, cf, cfUnit: cf / 12 / units, units,
    dscr: r.debt > 0 ? r.noi / r.debt : 99, lenderDscr: r.lenderDscr };
}
const flipOk = (d, s) => (P, R) => flipAt(d, s, P, R, arvOf(d)).profit >= opt(s, "minFlipProfit");
const brrrrOk = (d, s) => (P, R) => { const x = brrrrAt(d, s, P, R, arvOf(d));
  return x.cfUnit >= s.minCF && x.dscr >= s.minDSCR && !(opt(s, "lenderDSCR") > 0 && x.lenderDscr < opt(s, "lenderDSCR"))
    && x.back >= BRRRR_MIN_BACK; };
// A BRRRR that hands back less than half the cash is really a rental with repairs.
const BRRRR_MIN_BACK = 50;
// Enough room in the rehab budget to call it a flip or BRRRR candidate before the GC has priced it.
const roomFor = P => Math.max(30000, 0.1 * P);
// Score one strategy: with the GC's number, the max offer and verdict; without it, the most the rehab can cost.
function rehabPlay(d, s, kind) {
  const P = +d.price || 0, V = arvOf(d), R = +d.rehab || 0, hasRehab = R > 0;
  const atFn = kind === "flip" ? flipAt : brrrrAt, ok = (kind === "flip" ? flipOk : brrrrOk)(d, s);
  if (!(P > 0)) return { kind, needs: "price", verdict: "Needs price", gap: 1e9 };
  if (!V) return { kind, needs: "arv", verdict: "Needs ARV", gap: 1e9 };
  if (kind === "brrrr" && !(+d.rent > 0)) return { kind, needs: "rent", verdict: "Needs rent", gap: 1e9 };
  const mr = lastTrue(r => ok(P, r), 0, V), maxRehab = mr === null ? 0 : Math.floor(mr / 1000) * 1000;
  const room = mr !== null && maxRehab >= roomFor(P);
  if (!hasRehab) {
    const at = atFn(d, s, P, Math.max(maxRehab, 0), V);
    return { kind, needs: "rehab", verdict: room ? "Needs GC" : "Pass", gap: room ? 1e8 - maxRehab : 1e9, maxRehab, room, at, arv: V };
  }
  const at = atFn(d, s, P, R, V);
  const mo = lastTrue(p => ok(p, R), 1000, V), maxOffer = mo === null ? 0 : Math.floor(mo / 1000) * 1000;
  const gap = P > 0 ? (P - maxOffer) / P * 100 : 0;
  return { kind, at, maxOffer, gap, verdict: gap <= 0 ? "Buy box" : gap <= 10 ? "Negotiate" : "Pass", maxRehab, room, arv: V,
    binding: kind === "flip" ? "minimum profit" : "cash flow after the refinance" };
}
const PREFER = ["rental", "brrrr", "flip"];            // on a near tie, keep the property
const NAMES = { rental: "Rental", flip: "Flip", brrrr: "BRRRR" };
// All three ways to play a property, and which one fits best. `d.arvEst` may carry the estimate from arvEstimate().
function strategies(d, s) {
  const rental = analyze(d, s);
  if (!(+d.rent > 0)) { rental.verdict = "Needs rent"; rental.gap = 1e9; rental.needs = true; }
  const t = dealTerms(d, s), flip = rehabPlay(d, t, "flip"), brrrr = rehabPlay(d, t, "brrrr"), all = { rental, flip, brrrr };
  let rec = "rental";
  const scored = PREFER.filter(k => all[k].gap < 1e8);
  if (scored.length) {
    const best = Math.min(...scored.map(k => all[k].gap));
    rec = scored.filter(k => all[k].gap <= best + 2).sort((a, b) => PREFER.indexOf(a) - PREFER.indexOf(b))[0];
  }
  // nothing works as priced (or the rental is the only one scored and it is a Pass): a rehab with room in the budget is the better lead
  if (all[rec].gap > 10) {
    const open = ["brrrr", "flip"].filter(k => all[k].needs === "rehab" && all[k].room).sort((a, b) => all[b].maxRehab - all[a].maxRehab);
    if (open.length) rec = open[0];
  }
  return { ...all, rec };
}

// The best flips waiting on a GC walkthrough (1.23.0, Kevin Nov 14 2026: show the best 10 to 15 under Buy box, the rest
// under Worth a look). The estimated after-repair value uses the town's top-quarter price per square foot, which flatters
// every flip, so the ranking re-runs the math at the town's middle price per square foot instead: the more rehab budget
// left at that plainer value, as a share of the asking price, the better the lead. Only values from 5+ sales count, or
// Kevin's own; an estimate more than double the asking usually means wrong square feet or a teardown, so it is not ranked.
const TOP_FLIPS = 12, FLIP_ARV_MAX = 2;
function flipLead(d, s, ai) {
  const P = +d.price || 0;
  if (!(P > 0) || !ai || !(ai.value > 0) || +d.rehab > 0) return null;
  const mine = ai.src === "you";
  if (!mine && (ai.src !== "sold" || ai.value > FLIP_ARV_MAX * P)) return null;
  const t = dealTerms(d, s), est = rehabPlay(mine ? d : { ...d, arvEst: ai.value }, t, "flip");
  if (est.needs !== "rehab" || !est.room) return null;
  const midArv = mine ? +d.arv : Math.round(ai.sqft * ai.townPpsf / 1000) * 1000;
  const mid = mine ? est : rehabPlay({ ...d, arv: 0, arvEst: midArv }, t, "flip");
  const midRehab = mid.maxRehab || 0;
  return { lead: midRehab / P, midArv, midRehab };
}
// items: [{d, ai}] where ai is the after-repair value info (arvEstimate, or {value, src:"you"}). Best first, at most n.
function rankFlips(items, s, n = TOP_FLIPS) {
  return items.map(x => ({ id: x.d.id, ...(flipLead(x.d, s, x.ai) || { lead: null }) })).filter(x => x.lead !== null)
    .sort((a, b) => b.lead - a.lead || String(a.id).localeCompare(String(b.id))).slice(0, n)
    .map((x, i) => ({ ...x, rank: i + 1 }));
}

if (typeof module !== "undefined") module.exports = { DEFAULTS, ceilingFor, loanK, analyze, metrics, dealTerms, principalPaid, explain,
  kindOf, townKey, sqftOf, quantile, ppsfTable, arvEstimate, arvOf, flipAt, brrrrAt, rehabPlay, strategies, roomFor, NAMES, flipLead, rankFlips, TOP_FLIPS };
