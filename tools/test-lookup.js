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

test('parseInput reads addresses from links and typed text', () => {
  const { parseInput, sameKey, pickListing } = require('../lookup.js');
  let r = parseInput('https://www.redfin.com/MA/Lowell/891-Bridge-St-01850/home/11641103');
  assert.equal(r.address, '891 Bridge St, Lowell, MA, 01850'); assert.equal(r.homeId, '11641103'); assert.equal(r.site, 'Redfin');
  r = parseInput('https://www.redfin.com/NH/Manchester/145-Pearl-St-03104/home/205041924?utm=x');
  assert.equal(r.town, 'Manchester'); assert.equal(r.state, 'NH');
  r = parseInput('check this https://www.zillow.com/homedetails/57-59-Marshall-St-Fitchburg-MA-01420/56789_zpid/');
  assert.equal(r.street, '57-59 Marshall St'); assert.equal(r.town, 'Fitchburg'); assert.equal(r.zip, '01420'); assert.equal(r.site, 'Zillow');
  r = parseInput('https://www.zillow.com/homedetails/12-Lake-View-Ave-North-Andover-MA-01845/1_zpid/');
  assert.equal(r.street, '12 Lake View Ave'); assert.equal(r.town, 'North Andover');
  r = parseInput('https://www.realtor.com/realestateandhomes-detail/10-Hollywood-St_Worcester_MA_01610_M12345-67890');
  assert.equal(r.address, '10 Hollywood St, Worcester, MA, 01610');
  assert.equal(parseInput('123 Main St, Lowell, MA 01850').address, '123 Main St, Lowell, MA, 01850');
  assert.equal(parseInput('123 Main St, Lowell MA').address, '123 Main St, Lowell, MA');
  r = parseInput('55 gerrish ave dracut ma'); assert.equal(r.street, '55 Gerrish Ave'); assert.equal(r.town, 'Dracut');
  assert.equal(parseInput('https://www.zillow.com/homes/for_sale/').error, 'noaddress');
  assert.equal(parseInput('Lowell').error, 'noaddress');
  assert.equal(sameKey('145-147 Pearl Street', 'Manchester'), sameKey('145 Pearl St', 'manchester'));
  assert.notEqual(sameKey('145 Pearl St', 'Manchester'), sameKey('147 Pearl St', 'Manchester'));
  assert.deepEqual(pickListing([{ price: 500000, status: 'Inactive', listedDate: '2025-01-01' }, { price: 525000, status: 'Active', listedDate: '2026-10-20T00:00:00Z', daysOnMarket: 18 }]),
    { price: 525000, status: 'Active', listedDate: '2026-10-20', daysOnMarket: 18 });
  assert.equal(pickListing([{ price: 500000, status: 'Inactive' }]), null);
});
