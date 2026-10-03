# DealDesk — Project Instructions

Same working rules as DebtFree Dashboard, adapted to this repo.

## Before touching any code: pull the live files

The repo on `main` is the source of truth. Never build on an uploaded or
remembered file, or on the old Claude-hosted "Deal Desk" page, without checking
it against the repo first.

```bash
git pull
node tools/check-version.js     # index.html and version.json must agree
```

If they disagree, stop and tell Kevin.

## The product

A personal tool for Kevin. It scores buy-and-hold rental deals (one to four
units, investor loan) within 50 miles of Dracut, MA against a buy box and works
each one back to a maximum offer. Not for sale, no customers.

Kevin is a non-coder founder and product owner. He decides direction; Claude
handles technical execution end to end.

## Repo layout

| Path | What |
|---|---|
| `index.html` | The whole page: buy box, pipeline, deal sheet, add/edit form |
| `calc.js` | All deal math. Change formulas here only |
| `data/listings.js` | Listings Claude has loaded. Every device picks up new ones on next open |
| `assets/` | Logo (`logo.svg`), icon (`icon.svg`) and home-screen icons |
| `manifest.json` | Name and icons for Add to Home Screen |
| `version.json` | Current version and plain-language release notes |
| `tools/test-calc.js` | Checks on the math |
| `tools/check-version.js` | Confirms the version matches in both places |

## Shipping rules

- **Two places carry the version and must match:** `APP_VERSION` in
  `index.html` and `version` in `version.json`.
- Bump patch for fixes and listing updates, minor for visible features.
- Add notes to `version.json` written for Kevin in plain language.
- Run `node --test tools/test-calc.js` and `node tools/check-version.js` before every push.
- **All changed files go in ONE commit.** Separate pushes cancel each other's
  Pages builds.
- **Claude commits and pushes directly to `main`.** Kevin pulls in GitHub
  Desktop when he wants to review. (This differs from DebtFree Dashboard, where
  Kevin commits. Files here use plain LF line endings, so the line-ending
  problem that drove that rule does not apply.)
- Use real dates. Kevin's date is authoritative if it differs from Claude's.

## How the app is organized

Four tabs, opening on Review:

- **Review:** listings Claude has loaded that Kevin has not decided on. Keep moves one to In flight; Remove asks for a reason and archives it.
- **In flight:** deals Kevin is working, each with a stage: Interested, Inquired, Toured, Offer made, Under contract. Mark as bought moves it to Owned.
- **Owned:** properties Kevin owns, with value, equity and net rental income. Entered on the device only. Never put owned-property figures in this repo; it is public.
- **Archive:** removed properties and lost deals, with reason and date.

Review hides Pass verdicts unless Kevin chooses to show everything.

Number inputs must use `step="any"`. A fixed step rejects real figures (cents, prices that are not round thousands) on iPhone. Inputs stay at 16px so the iPhone does not zoom into them.

An owned property holds a `loans` list (type, balance, rate, payment). Properties saved before 1.4.0 have a single `balance` and `payment`; the page reads those as one Mortgage.

A listing in `data/listings.js` has no status, so it lands in Review on every device.

Every listing carries `miles`, the straight-line distance from Dracut, MA to its town center. The Review tab filters on it using the distance Kevin picks (default 50). When loading listings, load out to 100 miles so widening the distance has something to show, and always set `miles`.

## Look

Light theme only, on every device. Kevin asked for this; do not add a dark theme
back without asking.

## How data works

- Deals and the buy box are saved in each browser separately. The phone and the
  laptop do not sync with each other.
- `data/listings.js` is the shared layer. A listing added there appears on every
  device the next time the page opens, unless that device already has it or
  deleted it. Edits made in the page are never written back to the repo.
- Listing ids must stay stable (`man-217-spruce`). Changing an id creates a
  duplicate on devices that already have the old one.
- There is no service worker. If one is ever added, its cache name must carry
  the version, as on DebtFree Dashboard.

## Hosting

GitHub Pages from `main`, root folder. Pages only serves a public repo on a free
plan, so treat everything committed here as public: no API keys, no personal
financial details, no notes about negotiating position.
