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
| `lookup.js` | Turns a RentCast lookup into form values and property facts, tested by `tools/test-lookup.js` |
| `sync.js` | Merge rules for Google Drive sync, tested by `tools/test-sync.js` |
| `version.json` | Current version and plain-language release notes |
| `tools/test-calc.js` | Checks on the math |
| `tools/check-version.js` | Confirms the version matches in both places |

## Shipping rules

- **Two places carry the version and must match:** `APP_VERSION` in
  `index.html` and `version` in `version.json`.
- Bump patch for fixes and listing updates, minor for visible features.
- Add notes to `version.json` written for Kevin in plain language.
- Run `node --test tools/test-calc.js tools/test-sync.js tools/test-lookup.js` and `node tools/check-version.js` before every push.
- **All changed files go in ONE commit.** Separate pushes cancel each other's
  Pages builds.
- **Claude commits and pushes directly to `main`.** Kevin pulls in GitHub
  Desktop when he wants to review. (This differs from DebtFree Dashboard, where
  Kevin commits. Files here use plain LF line endings, so the line-ending
  problem that drove that rule does not apply.)
- Use real dates. Kevin's date is authoritative if it differs from Claude's.

## How the app is organized

Five tabs, opening on Review. The fifth is Settings (gear icon): Google Drive backup and sync, file backup and restore, and release notes.

- **Review:** listings Claude has loaded that Kevin has not decided on. Keep moves one to In flight; Remove asks for a reason and archives it.
- **In flight:** deals Kevin is working, each with a stage: Interested, Inquired, Toured, Offer made, Under contract. Mark as bought moves it to Owned.
- **Owned:** properties Kevin owns, with value, equity and net rental income. Entered on the device only. Never put owned-property figures in this repo; it is public.
- **Archive:** removed properties and lost deals, with reason and date.

Review has a Show filter: Buy box only, Worth a look (Buy box and Negotiate, the default), or Everything.

Dollar boxes are text inputs with class `money`: they accept plain or formatted numbers and reformat as $1,234.56 on leaving the box. Read them with `num()`, never `parseFloat`. Other number inputs must use `step="any"`. A fixed step rejects real figures (cents, prices that are not round thousands) on iPhone. Inputs stay at 16px so the iPhone does not zoom into them.

An owned property marked `home` is Kevin's residence and is left out of rental income.

An owned property holds a `loans` list (type, balance, rate, payment). Properties saved before 1.4.0 have a single `balance` and `payment`; the page reads those as one Mortgage.

A listing in `data/listings.js` has no status, so it lands in Review on every device.

Every listing carries `miles`, the straight-line distance from Dracut, MA to its town center. The Review tab filters on it using the distance Kevin picks (default 50). When loading listings, load out to 100 miles so widening the distance has something to show, and always set `miles`.

## Off-market deals, lookup and deal financing

- A deal has `source`: `listing` or `offmarket`. Off-market deals are entered by Kevin in the app and live only on his devices and in his Drive file. Never put an off-market deal in `data/listings.js`; the repo is public.
- Address and price are enough to save. A deal with no rent is shown as Needs rent, not scored.
- Look up this address calls RentCast straight from the page with Kevin's own key, stored on the device under `dealdesk_rentcast_key` (never synced, exported or committed). One lookup is three requests. RentCast's rent estimate for a multi-family address is per unit, so `mapLookup` multiplies by the unit count.
- The page cannot reach Claude. Copy for Claude copies a deal as text so Kevin can paste it into a chat for deeper research.
- A deal may carry `fin: {kind:"custom", down, rate, term, balloon}`. `dealTerms()` in `calc.js` applies it over the buy box for that deal only; `analyze` and `explain` both honour it.

## Explain this deal

Every deal sheet has an Explain this deal button that opens a plain-language walk-through. The numbers come from `explain()` in `calc.js` (tested); the wording lives in `openExplain()` in `index.html`. Kevin wants this written for someone new to the terms: short sentences, every term defined with this deal's own figure, no jargon left unexplained. Keep it that way when adding to it.

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

## Google Drive sync

Same design as DebtFree Dashboard: one action that downloads `dealdesk-backup.json` from Kevin's Drive, merges it with the device (`mergeData` in `sync.js`), saves, and uploads the result. Sign-in is a full-page redirect, not a popup, because a popup never returns to an installed iPhone app. The token lives in memory only.

- The backup module mirrors DebtFree Dashboard: a cloud button with a status dot in the header (grey never, amber stale, green ok, blue working) that opens a sheet, the same card on the Settings tab, and a toast for results. Keep the two apps' wording and behaviour in step.
- `DRIVE_CLIENT_ID` in `index.html` is DealDesk's own OAuth client, in Google Cloud project DealDesk, in Testing mode with Kevin as the only test user. Setting it to empty disables the Sync button; that is the kill switch.
- Use a separate OAuth client from DebtFree Dashboard's. Never edit that client or its consent screen for this project.
- The redirect URI is the page's own address. Both `/DealDesk/` and `/DealDesk/index.html` must be registered on the client.
- Every change to a deal, an owned property or the settings must set `updatedAt`, and every permanent delete must go into `removed` or `removedOwned`. The merge depends on both.

## Hosting

GitHub Pages from `main`, root folder. Pages only serves a public repo on a free
plan, so treat everything committed here as public: no API keys, no personal
financial details, no notes about negotiating position.
