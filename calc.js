// Deal math for DealDesk. Used by index.html and by test/calc.test.js.
// Change formulas here only, then run: node --test
const DEFAULTS={maxPrice:1000000,minCF:200,minCoC:6,minDSCR:1.2,down:25,rate:7.25,term:30,closing:3,vac:5,maint:8,capex:7,mgmt:8,
  lenderDSCR:1.0,  // a DSCR lender's own test: gross rent / PITIA (principal, interest, taxes, insurance, HOA). 0 = off
  points:1,        // lender points, % of the loan, paid at closing
  reserves:6,      // months of PITIA the lender wants to see in the bank after closing (shown, not spent)
  dpSource:1,      // where the cash to close comes from: 0 = cash, 1 = a home equity loan (its payment is a cost of the deal)
  heRate:8,heTerm:20, // that home equity loan's rate and term
  funds:0};        // cash plus equity you can draw, for cash to close and reserves. 0 = not set, no check
function loanK(rate,term){const r=rate/1200,n=term*12;return r===0?1/term:12*r/(1-Math.pow(1+r,-n));}
// A deal can carry its own financing (seller financing, an assumable loan, a private note).
// When it does, those terms replace the buy box's down payment, rate and term for that deal only.
function dealTerms(d,s){
  const f=d&&d.fin; if(!f||f.kind!=="custom")return s;
  const o={...s}; ["down","rate","term"].forEach(k=>{const v=f[k]; if(v!==""&&v!==null&&v!==undefined&&isFinite(+v))o[k]=+v;});
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
  const top=Math.max(0,+s.maxPrice||0);
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

if (typeof module !== "undefined") module.exports = { DEFAULTS, loanK, analyze, metrics, dealTerms, principalPaid, explain };
