const test = require("node:test");
const assert = require("node:assert");
const { DEFAULTS: ALL, loanK, analyze, metrics, dealTerms, principalPaid, explain } = require("../calc.js");
// The original checks use plain cash financing with no points or lender test, so their figures stay put.
const DEFAULTS = { ...ALL, minCoC: 6, dpSource: 0, points: 0, lenderDSCR: 0 };

const deal = { price: 600000, units: 3, rent: 6300, taxes: 9000, ins: 3000, state: "NH" };

test("loan constant matches a 30-year payment at 7.25%", () => {
  // $100,000 at 7.25% for 30 years is $682.18 a month
  assert.ok(Math.abs((100000 * loanK(7.25, 30)) / 12 - 682.18) < 0.01);
});

test("year-one numbers for a sample three-family", () => {
  const a = analyze(deal, DEFAULTS);
  assert.strictEqual(Math.round(a.noi), 43301);
  assert.strictEqual(Math.round(a.debt), 36838);
  assert.strictEqual(Math.round(a.cfUnit), 180);
  assert.strictEqual(Math.round(a.cash), 168000);
  assert.strictEqual(a.verdict, "Negotiate");
});

test("buying at the maximum offer satisfies every buy box rule", () => {
  const a = analyze(deal, DEFAULTS);
  const b = analyze({ ...deal, price: a.maxOffer }, DEFAULTS);
  assert.ok(b.cfUnit >= DEFAULTS.minCF);
  assert.ok(b.coc >= DEFAULTS.minCoC);
  assert.ok(b.dscr >= DEFAULTS.minDSCR);
  assert.ok(a.maxOffer <= DEFAULTS.maxPrice);
});

test("blank taxes and insurance are estimated and flagged", () => {
  const a = analyze({ price: 500000, units: 2, rent: 5000, state: "NH" }, DEFAULTS);
  assert.ok(a.taxEst && a.insEst);
  assert.strictEqual(a.taxes, 9500);
});

test("principal paid: first year matches payments minus interest, full term pays the loan off", () => {
  // $450,000 at 7.25% for 30 years pays down about $4,356 in year one
  assert.ok(Math.abs(principalPaid(450000, 7.25, 30, 1) - 4356) < 5);
  assert.ok(Math.abs(principalPaid(450000, 7.25, 30, 30) - 450000) < 0.01);
  assert.strictEqual(principalPaid(120000, 0, 30, 10), 40000);
});

test("explainer: the rate it names makes a failing deal pass, and a touch higher does not", () => {
  const e = explain(deal, DEFAULTS);
  assert.strictEqual(e.a.verdict, "Negotiate");
  assert.ok(e.passRate !== null && e.passRate < DEFAULTS.rate);
  assert.ok(analyze(deal, { ...DEFAULTS, rate: e.passRate }).gap <= 0);
  assert.ok(analyze(deal, { ...DEFAULTS, rate: e.passRate + 0.125 }).gap > 0);
  assert.ok(analyze(deal, { ...DEFAULTS, rate: e.breakEvenRate }).cf >= 0);
});

test("explainer: the rent it names is the lowest that passes", () => {
  const e = explain(deal, DEFAULTS);
  assert.ok(e.rentToPass > deal.rent);
  assert.ok(analyze({ ...deal, rent: e.rentToPass }, DEFAULTS).gap <= 0);
  assert.ok(analyze({ ...deal, rent: e.rentToPass - 50 }, DEFAULTS).gap > 0);
});

test("explainer: a passing deal reports how high the rate can go, and a deal over the ceiling has no fix by rate or rent", () => {
  const good = { price: 400000, units: 3, rent: 6300, taxes: 6000, ins: 2500, state: "NH" };
  const e = explain(good, DEFAULTS);
  assert.strictEqual(e.a.verdict, "Buy box");
  assert.ok(e.passRate > DEFAULTS.rate);
  const big = explain({ ...good, price: 1200000, rent: 20000 }, DEFAULTS);
  assert.strictEqual(big.passRate, null);
  assert.strictEqual(big.rentToPass, null);
});

test("explainer: monthly lines add up to what is left", () => {
  const m = explain(deal, DEFAULTS).monthly;
  const left = m.rent - m.vacancy - m.taxes - m.ins - m.hoa - m.maint - m.capex - m.mgmt - m.mortgage - m.equity;
  assert.ok(Math.abs(left - m.left) < 0.01);
});

test("a deal's own financing replaces the buy box terms for that deal only", () => {
  const seller = { ...deal, fin: { kind: "custom", down: 10, rate: 5, term: 30, balloon: 5 } };
  const a = analyze(seller, DEFAULTS), base = analyze(deal, DEFAULTS);
  assert.strictEqual(Math.round(a.loan), 540000);
  assert.ok(Math.abs(a.debt / 12 - 2898.84) < 0.5);          // $540,000 at 5% for 30 years
  assert.strictEqual(Math.round(base.loan), 450000);         // the same deal without those terms is unchanged
  assert.strictEqual(dealTerms(deal, DEFAULTS), DEFAULTS);
  assert.strictEqual(analyze({ ...deal, fin: { kind: "bank", rate: 1 } }, DEFAULTS).debt, base.debt);
});

test("explainer works from the deal's own financing and reports the balloon balance", () => {
  const seller = { ...deal, fin: { kind: "custom", down: 10, rate: 5, term: 30, balloon: 5 } };
  const e = explain(seller, DEFAULTS);
  assert.strictEqual(e.custom, true);
  assert.strictEqual(e.terms.rate, 5);
  assert.ok(e.rates.some(r => r.current && r.rate === 5));
  assert.ok(Math.abs(e.balloon.balance - 495875) < 50);       // owed after five years of payments
  // varying the rate must really vary it, not snap back to the deal's 5%
  assert.ok(e.rates[0].payment < e.rates[e.rates.length - 1].payment);
  assert.strictEqual(explain(deal, DEFAULTS).balloon, null);
});

test("lender's debt coverage is gross rent over PITIA", () => {
  const a = analyze(deal, ALL);
  const pitia = a.debt + 9000 + 3000;
  assert.ok(Math.abs(a.lenderDscr - (6300 * 12) / pitia) < 1e-9);
});

test("cash to close adds points; reserves are months of PITIA on top", () => {
  const a = analyze(deal, { ...ALL, points: 1, reserves: 6, dpSource: 0 });
  assert.strictEqual(Math.round(a.cash), 168000 + 4500);
  assert.ok(Math.abs(a.reserves - a.pitia / 2) < 1e-6);
  assert.ok(Math.abs(a.need - (a.cash + a.reserves)) < 1e-6);
});

test("a home equity loan for the cash to close is a cost of the deal", () => {
  const cash = analyze(deal, { ...ALL, dpSource: 0 }), he = analyze(deal, { ...ALL, dpSource: 1, heRate: 8, heTerm: 20 });
  assert.ok(Math.abs(he.heDebt - he.cash * loanK(8, 20)) < 1e-6);
  assert.ok(Math.abs(cash.cf - he.cf - he.heDebt) < 1e-6);
  assert.ok(he.maxOffer < cash.maxOffer);
  const m = explain(deal, { ...ALL, dpSource: 1 }).monthly;
  assert.ok(Math.abs(m.equity - he.heDebt / 12) < 1e-6);
});

test("max offer passes every rule, including the lender's and your funds, and $1,000 more does not", () => {
  const s = { ...ALL, lenderDSCR: 1.25, funds: 150000 };
  for (const d of [deal, { price: 500000, units: 2, rent: 5000, state: "NH" }, { price: 420000, units: 3, rent: 6900, state: "MA" }]) {
    const a = analyze(d, s);
    if (a.maxOffer === 0 || a.binding === "price ceiling") continue;
    const at = p => metrics(d, s, p);
    const ok = x => x.cfUnit >= s.minCF && x.coc >= s.minCoC && x.dscr >= s.minDSCR && x.lenderDscr >= s.lenderDSCR && x.need <= s.funds;
    assert.ok(ok(at(a.maxOffer)), "passes at the max offer");
    assert.ok(!ok(at(a.maxOffer + 1000)), "fails just above it");
  }
});

test("over your funds is flagged", () => {
  assert.ok(analyze(deal, { ...ALL, funds: 50000 }).overFunds);
  assert.ok(!analyze(deal, { ...ALL, funds: 0 }).overFunds);
});

test("a lender quote on one deal replaces the buy box rate, points and home equity rate for that deal", () => {
  const q = { ...deal, fin: { kind: "custom", lender: "Test Bank", rate: 6.5, points: 2, heRate: 7 } };
  const a = analyze(q, ALL), t = dealTerms(q, ALL);
  assert.strictEqual(t.rate, 6.5); assert.strictEqual(t.points, 2); assert.strictEqual(t.heRate, 7); assert.strictEqual(t.down, ALL.down);
  assert.ok(Math.abs(a.points - a.loan * 0.02) < 1e-6);
  assert.ok(Math.abs(a.heDebt - a.cash * loanK(7, ALL.heTerm)) < 1e-6);
});
