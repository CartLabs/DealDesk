// Deal math for DealDesk. Used by index.html and by test/calc.test.js.
// Change formulas here only, then run: node --test
const DEFAULTS={maxPrice:1000000,minCF:200,minCoC:6,minDSCR:1.2,down:25,rate:7.25,term:30,closing:3,vac:5,maint:8,capex:7,mgmt:8};
function loanK(rate,term){const r=rate/1200,n=term*12;return r===0?1/term:12*r/(1-Math.pow(1+r,-n));}
function analyze(d,s,downOverride){
  const price=+d.price||0,units=Math.max(1,+d.units||1),rehab=+d.rehab||0;
  const taxEst=!(+d.taxes>0),insEst=!(+d.ins>0);
  const taxes=taxEst?price*(d.state==="NH"?0.019:0.012):+d.taxes;
  const ins=insEst?Math.max(1500,price*0.004):+d.ins;
  const gross=(+d.rent||0)*12, vacancy=gross*s.vac/100, egi=gross-vacancy;
  const maint=egi*s.maint/100,capex=egi*s.capex/100,mgmt=egi*s.mgmt/100,hoa=(+d.hoa||0)*12;
  const opex=taxes+ins+hoa+maint+capex+mgmt, noi=egi-opex;
  const dn=(downOverride??s.down)/100, cl=s.closing/100, k=loanK(s.rate,s.term);
  const loan=price*(1-dn), debt=loan*k, cf=noi-debt;
  const cash=price*(dn+cl)+rehab;
  const coc=cash>0?cf/cash*100:0, dscr=debt>0?noi/debt:0, cap=price>0?noi/price*100:0;
  const cfUnit=cf/12/units;
  // max price that satisfies each rule (NOI held constant)
  const m=s.minCoC/100;
  const byCF=(noi-s.minCF*units*12)/(k*(1-dn));
  const byDSCR=(noi/s.minDSCR)/(k*(1-dn));
  const byCoC=(noi-m*rehab)/(k*(1-dn)+m*(dn+cl));
  const cands=[["cash flow per unit",byCF],["debt coverage",byDSCR],["cash-on-cash return",byCoC],["price ceiling",s.maxPrice]];
  cands.sort((a,b)=>a[1]-b[1]);
  const maxOffer=Math.max(0,Math.floor(cands[0][1]/1000)*1000), binding=cands[0][0];
  const gap=price>0?(price-maxOffer)/price*100:0;
  const verdict=gap<=0?"Buy box":gap<=10?"Negotiate":"Pass";
  return {price,units,taxes,ins,taxEst,insEst,gross,vacancy,egi,maint,capex,mgmt,hoa,opex,noi,loan,debt,cf,cash,coc,dscr,cap,cfUnit,maxOffer,binding,gap,verdict,rentRatio:price>0?(+d.rent||0)/price*100:0};
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
  const a = analyze(d, s), units = a.units, rent = +d.rent || 0;
  const at = (dd, ss) => analyze(dd, ss);
  const passes = x => x.gap <= 0;
  const overCeiling = a.price > s.maxPrice;
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
    monthly: { rent, vacancy: a.vacancy / 12, taxes: a.taxes / 12, ins: a.ins / 12, hoa: a.hoa / 12, maint: a.maint / 12, capex: a.capex / 12, mgmt: a.mgmt / 12, mortgage: a.debt / 12, left: a.cf / 12 },
    principalY1: y1, principalY5: y5,
    totalReturnY1: a.cash > 0 ? (a.cf + y1) / a.cash * 100 : 0,
    growth3: a.price * 0.03,                                   // what a 3% rise in value would be worth, for illustration
    breakEvenOccupancy: a.gross > 0 ? Math.min(999, (a.gross - a.vacancy - a.cf) / a.gross * 100) : 0,
    monthsEmptyToZero: a.cf > 0 && units > 0 && rent > 0 ? a.cf / (rent / units) : 0,
    rentDown10: { cfUnit: lower.cfUnit, cf: lower.cf / 12, verdict: lower.verdict },
    rateUp1: { cfUnit: higher.cfUnit, cf: higher.cf / 12, verdict: higher.verdict },
    selfManage: { cfUnit: self.cfUnit, cf: self.cf / 12, verdict: self.verdict, gain: (self.cf - a.cf) / 12 },
    overCeiling, passRate, breakEvenRate, perQuarterPoint: quarter, rentToPass, rates
  };
}

if (typeof module !== "undefined") module.exports = { DEFAULTS, loanK, analyze, principalPaid, explain };
