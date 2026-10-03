const test = require("node:test");
const assert = require("node:assert");
const { DEFAULTS, loanK, analyze } = require("../calc.js");

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
