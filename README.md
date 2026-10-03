# DealDesk

Scores rental properties within 50 miles of Dracut, MA against a buy box and works each one back to a maximum offer. Personal tool, buy-and-hold only (one to four units, investor loan).

## Use it

Open the hosted page on your phone or laptop, or open `index.html` from a local clone. No install, no build step.

- Each device starts with the listings in `data/listings.js` and picks up new ones the next time the page opens.
- Deals you add or edit, and the buy box, are saved in that browser only. They do not sync between devices and are not written back to this repo.

## Files

| File | What it is |
|---|---|
| `index.html` | The page: buy box, ranked pipeline, deal sheet, add/edit form |
| `calc.js` | All the deal math, in one place |
| `data/listings.js` | Starting listings |
| `version.json` | Current version and release notes |
| `tools/test-calc.js` | Checks on the math |
| `tools/check-version.js` | Confirms the version matches in both places |
| `Project_Instructions.md` | Working rules for this repo |

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

1. Bump the version in `index.html` and `version.json`, and add notes to `version.json`.
2. Run `node --test tools/test-calc.js` and `node tools/check-version.js`.
3. Commit everything in one commit and push to `main`. GitHub Pages republishes in a minute or two.

This page is served publicly by GitHub Pages. Do not commit API keys or personal financial details.
