const test = require("node:test");
const assert = require("node:assert");
const { DRACUT, milesBetween, mapLookup } = require("../lookup.js");

// Shapes follow RentCast's documented property record and estimate responses.
const record = {
  propertyType: "Multi-Family", bedrooms: 9, bathrooms: 3, squareFootage: 3912, yearBuilt: 1906, lotSize: 5227,
  zipCode: "03103", latitude: 42.9889, longitude: -71.4480, lastSaleDate: "2019-07-03T00:00:00.000Z", lastSalePrice: 430000,
  features: { unitCount: 3 }, ownerOccupied: false,
  taxAssessments: { "2023": { year: 2023, value: 380000 }, "2024": { year: 2024, value: 402000 } },
  propertyTaxes: { "2023": { year: 2023, total: 7500 }, "2024": { year: 2024, total: 7855 } }
};

test("distance from Dracut to Manchester NH is about 24 miles", () => {
  const m = milesBetween(DRACUT, [42.995, -71.455]);
  assert.ok(m >= 23 && m <= 25, String(m));
});

test("a full lookup fills units, type, latest taxes, distance and total rent", () => {
  const { fill, facts } = mapLookup(record, { rent: 2380, rentRangeLow: 2100, rentRangeHigh: 2650 }, { price: 740000, priceRangeLow: 690000, priceRangeHigh: 790000 });
  assert.strictEqual(fill.units, 3);
  assert.strictEqual(fill.type, "Three-family");
  assert.strictEqual(fill.taxes, 7855);
  assert.strictEqual(facts.taxYear, 2024);
  assert.strictEqual(fill.rent, 7150);            // 2380 x 3, rounded to the nearest 25
  assert.strictEqual(facts.rentPerUnit, 2380);
  assert.strictEqual(facts.valueEst, 740000);
  assert.strictEqual(facts.lastSaleDate, "2019-07-03");
  assert.strictEqual(facts.assessed, 402000);
  assert.ok(fill.miles >= 22 && fill.miles <= 25);
});

test("the unit count the user typed wins when sizing the rent", () => {
  const { fill } = mapLookup({ ...record, features: {} }, { rent: 2000 }, null, 2);
  assert.strictEqual(fill.rent, 4000);
  assert.strictEqual(fill.units, undefined);
});

test("a single-family record counts as one unit, and five units is not offered as a type", () => {
  assert.strictEqual(mapLookup({ propertyType: "Single Family" }, { rent: 3000 }, null).fill.units, 1);
  const five = mapLookup({ features: { unitCount: 5 } }, null, null);
  assert.strictEqual(five.fill.units, undefined);
  assert.strictEqual(five.facts.units, 5);
});

test("missing or empty responses fill nothing and do not throw", () => {
  for (const args of [[null, null, null], [{}, {}, {}], [{ propertyTaxes: {} }, { rent: "x" }, { price: null }]]) {
    const { fill, facts } = mapLookup(...args);
    assert.deepStrictEqual(fill, {});
    assert.deepStrictEqual(facts, {});
  }
});
