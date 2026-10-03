// Turning a RentCast lookup into DealDesk fields. Pure: no network here, so it can be tested.
// index.html makes the three calls (property record, rent estimate, value estimate) and passes the results in.
const DRACUT = [42.670, -71.302];
function milesBetween(a, b) {
  const R = 3958.8, rad = x => x * Math.PI / 180;
  const dLat = rad(b[0] - a[0]), dLon = rad(b[1] - a[1]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dLon / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
}
// Most recent year's entry from an object keyed by year, e.g. {"2023":{...},"2024":{...}}
function latestYear(obj) {
  if (!obj || typeof obj !== "object") return null;
  const years = Object.keys(obj).filter(k => /^\d{4}$/.test(k)).sort();
  return years.length ? obj[years[years.length - 1]] : null;
}
const TYPE_BY_UNITS = ["", "Single-family", "Two-family", "Three-family", "Four-family"];
// record: one RentCast property record (or null). rentEst / valueEst: the two estimate responses (or null).
// knownUnits: what the user typed, if anything. Returns { fill, facts } where `fill` holds form values
// and `facts` is kept on the deal for display.
function mapLookup(record, rentEst, valueEst, knownUnits) {
  const r = record || {}, fill = {}, facts = {};
  const num = v => (typeof v === "number" && isFinite(v)) ? v : null;
  let units = num(r.features && r.features.unitCount);
  if (!units && r.propertyType === "Single Family") units = 1;
  if (units) facts.units = units;
  const useUnits = +knownUnits > 0 ? +knownUnits : units;
  if (units && units >= 1 && units <= 4) { fill.units = units; fill.type = TYPE_BY_UNITS[units]; }
  ["bedrooms", "bathrooms", "squareFootage", "yearBuilt", "lotSize"].forEach(k => { if (num(r[k]) !== null) facts[k] = r[k]; });
  if (r.propertyType) facts.propertyType = r.propertyType;
  if (typeof r.ownerOccupied === "boolean") facts.ownerOccupied = r.ownerOccupied;
  if (r.zipCode) { fill.zip = String(r.zipCode); }
  if (r.lastSaleDate) facts.lastSaleDate = String(r.lastSaleDate).slice(0, 10);
  if (num(r.lastSalePrice) !== null) facts.lastSalePrice = r.lastSalePrice;
  const tax = latestYear(r.propertyTaxes), assess = latestYear(r.taxAssessments);
  if (tax && num(tax.total) !== null) { fill.taxes = tax.total; facts.taxYear = tax.year; }
  if (assess && num(assess.value) !== null) { facts.assessed = assess.value; facts.assessedYear = assess.year; }
  if (num(r.latitude) !== null && num(r.longitude) !== null) fill.miles = milesBetween(DRACUT, [r.latitude, r.longitude]);
  const v = valueEst || {};
  if (num(v.price) !== null) { facts.valueEst = v.price; facts.valueLow = num(v.priceRangeLow); facts.valueHigh = num(v.priceRangeHigh); }
  // RentCast's rent estimate for a multi-family address is for ONE unit, so multiply by the unit count.
  const e = rentEst || {};
  if (num(e.rent) !== null) {
    const n = useUnits || 1;
    facts.rentPerUnit = e.rent; facts.rentLow = num(e.rentRangeLow); facts.rentHigh = num(e.rentRangeHigh); facts.rentUnits = n;
    fill.rent = Math.round(e.rent * n / 25) * 25;
  }
  return { fill, facts };
}
if (typeof module !== "undefined") module.exports = { DRACUT, milesBetween, latestYear, mapLookup };
