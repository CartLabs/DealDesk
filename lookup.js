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
function mapLookup(record, rentEst, valueEst, knownUnits, from) {
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
  if (num(r.latitude) !== null && num(r.longitude) !== null) fill.miles = milesBetween(from || DRACUT, [r.latitude, r.longitude]);
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

// ---------- Paste a link or an address ----------
// Reads an address out of a listing link without opening the site (Redfin, Zillow, Realtor.com, Trulia, Homes.com),
// or tidies a typed address. Returns { address, street, town, state, zip, site, url, homeId } or null.
const STATES = "AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY DC".split(" ");
const SUFFIX = new Set("st street ave avenue rd road dr drive ln lane ct court pl place way blvd boulevard ter terrace cir circle pkwy parkway hwy highway sq square trl trail row aly alley xing loop path pike tpke turnpike ext hl hill hts heights park pt point run walk vw view crst crest grn green".split(" "));
const titleCase = w => /^\d/.test(w) ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
// tokens like ["123","Main","St","Lowell","MA","01850"] → street / town / state / zip
function splitTokens(tokens) {
  let t = tokens.filter(Boolean), zip = "", state = "";
  if (/^\d+$/.test(t[0] || "") && /^\d+$/.test(t[1] || "") && t.length > 4) t = [t[0] + "-" + t[1], ...t.slice(2)]; // "57-59 Marshall St" in a link
  if (t.length && /^\d{5}(-\d{4})?$/.test(t[t.length - 1])) zip = t.pop().slice(0, 5);
  if (t.length && STATES.includes(t[t.length - 1].toUpperCase())) state = t.pop().toUpperCase();
  if (!/^\d/.test(t[0] || "") || t.length < 3) return null;      // needs a house number, a street and a town
  let cut = -1;
  for (let i = 1; i < t.length - 1; i++) if (SUFFIX.has(t[i].toLowerCase().replace(/\.$/, ""))) cut = i;
  if (cut < 0) cut = t.length - 2;                                 // no street word found: assume a one-word town
  const unit = t.slice(cut + 1).findIndex(w => !/^(unit|apt|#\S*|\d+[a-z]?)$/i.test(w));
  const ts = cut + 1 + Math.max(0, unit);                          // skip "Unit 2" / "#3" before the town
  const street = t.slice(0, cut + 1).map(titleCase).join(" "), town = t.slice(ts).map(titleCase).join(" ");
  if (!town) return null;
  return { street, town, state, zip };
}
function parseInput(text) {
  const raw = String(text || "").trim();
  if (!raw) return null;
  const m = raw.match(/https?:\/\/\S+/i);
  if (m) {
    let u; try { u = new URL(m[0]); } catch (e) { return null; }
    const host = u.hostname.replace(/^www\./, ""), path = decodeURIComponent(u.pathname);
    let r = null, site = host, homeId;
    if (/redfin\.com$/.test(host)) {                                 // /MA/Lowell/891-Bridge-St-01850/home/123
      site = "Redfin";
      const p = path.match(/^\/([A-Z]{2})\/([^/]+)\/([^/]+?)(?:\/unit-[^/]+)?\/home\/(\d+)/i);
      if (p) { const tk = p[3].split("-"), zip = /^\d{5}$/.test(tk[tk.length - 1]) ? tk.pop() : "";
        r = { street: tk.map(titleCase).join(" "), town: p[2].replace(/-/g, " ").split(" ").map(titleCase).join(" "), state: p[1].toUpperCase(), zip }; homeId = p[4]; }
    } else if (/realtor\.com$/.test(host)) {                         // /realestateandhomes-detail/123-Main-St_Lowell_MA_01850_M123
      site = "Realtor.com";
      const p = path.match(/detail\/([^/]+)/);
      if (p) { const q = p[1].split("_");
        if (q.length >= 3) r = { street: q[0].split("-").map(titleCase).join(" "), town: q[1].split("-").map(titleCase).join(" "), state: (q[2] || "").toUpperCase(), zip: /^\d{5}$/.test(q[3] || "") ? q[3] : "" }; }
    } else {                                                         // Zillow /homedetails/123-Main-St-Lowell-MA-01850/..., Trulia, Homes.com
      site = /zillow/.test(host) ? "Zillow" : /trulia/.test(host) ? "Trulia" : /homes\.com$/.test(host) ? "Homes.com" : host;
      const seg = path.split("/").filter(Boolean).find(x => /^\d+[a-z]?-.*-[a-z]{2}(-\d{5})?(-|$)/i.test(x));
      if (seg) { const tk = seg.split("-"); const si = tk.findIndex((w, i) => i > 1 && STATES.includes(w.toUpperCase()));
        if (si > 0) r = splitTokens(tk.slice(0, si + 1 + (/^\d{5}$/.test(tk[si + 1] || "") ? 1 : 0))); }
    }
    if (!r || !r.street || !r.town) return { url: u.href, site, error: "noaddress" };
    return { ...r, address: [r.street, r.town, r.state, r.zip].filter(Boolean).join(", "), site, url: u.href, ...(homeId ? { homeId } : {}) };
  }
  if (raw.includes(",")) {                                           // "123 Main St, Lowell, MA 01850"
    const parts = raw.split(",").map(x => x.trim()).filter(Boolean);
    const tail = parts.slice(2).join(" ").split(/\s+/), street = parts[0], town = parts[1] || "";
    let state = "", zip = "";
    tail.forEach(w => { if (/^\d{5}/.test(w)) zip = w.slice(0, 5); else if (STATES.includes(w.toUpperCase())) state = w.toUpperCase(); });
    const tw = town.split(/\s+/);                                    // "Lowell MA 01850" in the second part
    if (tw.length > 1 && /^\d{5}$/.test(tw[tw.length - 1])) zip = tw.pop();
    if (tw.length > 1 && STATES.includes(tw[tw.length - 1].toUpperCase())) state = tw.pop().toUpperCase();
    if (!/^\d/.test(street) || !tw.join("")) return { error: "noaddress" };
    const r = { street, town: tw.join(" "), state, zip };
    return { ...r, address: [r.street, r.town, r.state, r.zip].filter(Boolean).join(", ") };
  }
  const r = splitTokens(raw.split(/\s+/));
  if (!r) return { error: "noaddress" };
  return { ...r, address: [r.street, r.town, r.state, r.zip].filter(Boolean).join(", ") };
}
// "145-147 Pearl Street" and "145 Pearl St" are the same building: compare the first house number and the street words.
const ABBR = { street: "st", avenue: "ave", road: "rd", drive: "dr", lane: "ln", court: "ct", place: "pl", boulevard: "blvd", terrace: "ter", circle: "cir", parkway: "pkwy", highway: "hwy", north: "n", south: "s", east: "e", west: "w" };
function sameKey(street, town) {
  const w = String(street || "").toLowerCase().replace(/[.,#]/g, " ").split(/\s+/).filter(Boolean);
  if (!w.length) return "";
  const n = (w[0].match(/^\d+/) || [""])[0];
  const rest = w.slice(1).filter(x => !/^(unit|apt)$/.test(x) && !/^\d+[a-z]?$/.test(x)).map(x => ABBR[x] || x);
  return [n, ...rest, "|", String(town || "").toLowerCase().replace(/\s+/g, " ").trim()].join(" ");
}
// RentCast /listings/sale answer for one address → the active listing's price, or null.
function pickListing(list) {
  const a = (Array.isArray(list) ? list : list ? [list] : []).filter(x => x && x.price > 0);
  const act = a.filter(x => /^(active|pending|contingent)/i.test(x.status || ""));
  const l = (act.length ? act : []).sort((x, y) => String(y.listedDate || "").localeCompare(String(x.listedDate || "")))[0];
  return l ? { price: l.price, status: l.status, listedDate: String(l.listedDate || "").slice(0, 10), daysOnMarket: l.daysOnMarket } : null;
}
if (typeof module !== "undefined") module.exports = { DRACUT, milesBetween, latestYear, mapLookup, parseInput, sameKey, pickListing };
