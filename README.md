# DealDesk

Scores rental properties within 50 miles of Dracut, MA against a buy box and works each one back to a maximum offer. Personal tool, buy-and-hold only (one to four units, investor loan).

## Use it

Open `index.html` in a browser. No install, no build step.

- The first time it opens, it loads the listings in `data/listings.js`.
- After that, deals and the buy box are saved in that browser only. They are not written back to this repo, and they do not sync between devices.

## Files

| File | What it is |
|---|---|
| `index.html` | The page: buy box, ranked pipeline, deal sheet, add/edit form |
| `calc.js` | All the deal math, in one place |
| `data/listings.js` | Starting listings |
| `test/calc.test.js` | Checks on the math |

## How a deal is scored

1. Rent, less vacancy, less taxes, insurance, HOA, repairs, capital reserves and management, gives net operating income.
2. The mortgage payment comes from price, down payment, rate and term.
3. The maximum offer is the highest price that still meets every buy box rule: cash flow per unit, cash-on-cash return, debt coverage, and the price ceiling.
4. Verdict: **Buy box** if the asking price is at or under the maximum offer, **Negotiate** if it is within 10% over, **Pass** beyond that.

## Assumptions to replace with real numbers

- **Buy box defaults** (in `calc.js`): $1,000,000 ceiling, $200 per unit per month, 6% cash-on-cash, 1.20 debt coverage, 25% down at 7.25% for 30 years, 3% closing costs. The rate is a placeholder, not a quote.
- **Expenses:** 5% vacancy, 8% repairs, 7% capital reserves, 8% management, each as a share of collected rent.
- **Rents in the starting listings** are estimates from Zumper city averages by bedroom count (Oct 2, 2026), not leases.
- **Blank taxes** are estimated at 1.9% of price in NH and 1.2% in MA. **Blank insurance** is 0.4% of price, minimum $1,500. Both are flagged as estimated on the deal sheet.

## Data sources

- Listings, prices, unit mix and tax bills: Redfin listing pages, pulled 2026-10-02.
- Rent averages: Zumper rent research for Manchester and Nashua, NH.

## Release

1. Run `node --test` if `calc.js` changed. All tests should pass.
2. Commit and push to `main`.
3. Pull in GitHub Desktop on the laptop and open `index.html`.

Keep this repo private. It holds buy criteria and the deals being pursued. If the page is ever published with GitHub Pages, the page and `data/listings.js` become public.
