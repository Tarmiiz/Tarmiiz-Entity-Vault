# Changelog — Entity Vault

All notable changes to this project are documented in this file.

The format is inspired by [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). This file is updated on demand via the **"update changes doc"** trigger and is committed alongside the source changes that produced each entry.

## Current Themes

_Living preamble describing the broad direction this sub-project is currently moving in. Refreshed when the focus shifts. Keep to ~5–10 lines._

- **Single merged Vault.** The standalone Service Dashboard is retired; its unique Custody surface is folded in here. A per-tenant, admin-managed menu-toggle control plane lets each deployment enable only the modules it uses (a token-issuer tenant vs. a service-provider tenant enable different subsets).
- **Catching the non-issuer modes up (2026-08-09/10).** Entity mode is now a Global Variables id with a server-served allow-list, and modes 5 (Brokerage) and 6 (Exchange / Venue Operator) exist — so surfaces that were quietly built for an ISSUER keep surfacing as gaps for everyone else. The pattern to watch: a control hung off `asset_services` (the distributor registration) is invisible to a venue operator, who reaches the same asset through `dex_asset_venues`. Recent passes moved venue fees and added the venue's hosting Accept / Halt / Remove leg on that basis. A purpose-built venue home is still missing — mode 6 lands on the service-provider dashboard.
- **Viewer = admin-granted allow-list (2026-07-13).** Role 3 is read-only everywhere (every action button role-gated, mirrored by API 403s) and starts with NO menu modules and NO system functions — the admin grants pages, exports, and document viewing per user from User Details (Menu Access + System Functions tabs; the three shared function keys group as `Action - …`).
- **Audit visibility (2026-07-10).** The logs surface is growing into the tenant's complete audit picture: on-chain audit trail with persisted readable action labels + user/IP columns + per-row verification, plus a new Activity Logs page over the off-chain operational trail (`logs_activity` / `logs_state_changes`). New role 4 = **Security officer** sees only these pages (deny-by-default `RoleGuard`; server-enforced by the Entity API's `securityRoleGate`) — and since 2026-07-11 the reverse also holds: the audit pages are role-4-exclusive in the UI, the officer's default view is the full tenant-wide trail, and both Activity Logs tabs export to Excel/PDF.

## Changes

### 2026-09-11

#### Changed — numbers in the body face; `font-mono` means identifiers only

- [global.scss](src/global.scss) adds `font-variant-numeric: tabular-nums` on right-aligned `td`/`th`, so digits still line up down a column in the body face. Money, counts and dates drop `font-mono` on the dashboard, service details, transactions list, asset compliance tab and coverage-assets table; the monospace face now marks addresses, hashes and selectors only. The transactions list's Service cell follows its value: mono for a shortened address, body face for a service name.

#### Fixed — `EntityTemplate.json` ABI matches the compiled contract (Phase 18 salt)

- [src/assets/ABIs/EntityTemplate.json](src/assets/ABIs/EntityTemplate.json) carried the pre-Phase-18 signatures. It now matches the Entities Registry artifact: `createUser`, `createUserWithKey`, `adminClaim`, `resetUserCredentials`, `resetUserPassword(ById)` and `initialize` take the per-user salt, and `resetUserPasswordWithProof` is present. `GlobalVariablesProxy.json` was reformatted only. Both were uncommitted working-tree changes; committed and built into the image shipped to Staging contabo-1.

#### Changed — v4 shell classes renamed `vault-*` → `shell-*`, shared with the Regulator Dashboard

- [global.scss](src/global.scss) + [authorized-layout.component.html](src/app/shared/layouts/authorized-layout/authorized-layout.component.html) / [.scss](src/app/shared/layouts/authorized-layout/authorized-layout.component.scss) / [.ts](src/app/shared/layouts/authorized-layout/authorized-layout.component.ts) — 60 occurrences: `.vault-shell` → `.shell-root`, every other `.vault-*` shell class → `.shell-*`, `--vault-gutter` / `--vault-side` → `--shell-*`, and the collapse key `vault-menu-collapsed` → `shell-menu-collapsed` (a one-time reset of each user's collapsed-rail preference). The Regulator Dashboard took the same v4 shell today under the same names, so the two apps now follow one standard and can be changed in lockstep. Non-class `vault` tokens (`/vault/` paths, `vault:updated`, `tarmiizVaultLang`, method names) are untouched. No visual change intended.

#### Changed — (recorded late) the button + control sweeps of 2026-09-10

- `a385d37` + `c1ac5cc` shipped without an entry: 436 buttons `rounded` → `rounded-xl`, the standard `px-3 py-1.5` buttons → `font-medium px-4 py-1.5`, `border border-transparent` on the 266 borderless ones so a filled button matches the 30px inputs, 196 form fields → `rounded-xl`, 165 filter labels gain `ps-2`. Colours unchanged.

#### Fixed — the top bar's RTL logo rule never matched

- [global.scss](src/global.scss) — `:host-context([dir='rtl']) .vault-topbar-brand img` moved into the global stylesheet with the bar on 2026-09-09, where Angular does not rewrite `:host-context`; the built CSS carried it verbatim and it matched nothing, so an Arabic session kept the logo left-aligned. Now `[dir='rtl'] .shell-topbar-brand img`.

#### Fixed — collapse button tooltip was hardcoded English

- [authorized-layout.component.html](src/app/shared/layouts/authorized-layout/authorized-layout.component.html) — `'Expand menu'` / `'Collapse menu'` → `sidebar.expandMenu` / `sidebar.collapseMenu` (en + ar).

#### Fixed — status-tinted `.table-v4` rows lost their tint on every even row

- [global.scss](src/global.scss) — the zebra + hover rules are unlayered and beat Tailwind's `@layer utilities`, so `services/details` warn/bad rows (`bg-amber-50` / `bg-red-50`), the `subscriptions/details` holds row, the `logs/details` current event (`bg-indigo-50`) and both pickers' selected row (`bg-blue-100`) were repainted on alternate lines. Explicit `.table-v4 tbody tr.bg-*` rules after the zebra restore them.

#### Fixed — messages list All/Unread switch had no fill in light mode

- [messages/list/list.page.html:17-18](src/app/pages/secure/messages/list/list.page.html#L17) — only `dark:` colours; now `bg-gray-300 peer-checked:bg-violet-600` / `bg-white`.

#### Changed — Placed By shows the placer's NAME, address in the tooltip

- [subscriptions/details/details.page.html:476](src/app/pages/secure/subscriptions/details/details.page.html#L476) + `RegulatorHold.placedByName/releasedByName` in `data.model.ts` — the Entity API now resolves the acting authority to a name ("MCDR Central Custody"); the cell renders it and keeps the address as `title`, falling back to the shortened address when the API has no name. [custody.page.ts:208](src/app/pages/secure/custody/custody.page.ts#L208) — a non-own hold renders the resolved name too; only an unresolved foreign placer keeps the "Regulator" label (previously every non-own hold did, which would have labelled a second custodian's hold as the regulator's).

#### Fixed — subscription Holdings → Regulator Holds showed "—" under Placed By for every hold

- [subscriptions/details/details.page.ts:661](src/app/pages/secure/subscriptions/details/details.page.ts#L661) — the hold rows are built with `new RegulatorHold(...)`, whose two trailing params `placedBy` / `releasedBy` default to `''`; this call never passed them although the API has carried both since the custodian hold grant (2026-07-30). Found on base on the first custodian-placed hold after the reset (MCDR on a Granite EGP Fund subscriber): the chain and all three mirrors named the custody service, the Vault printed a dash.

### 2026-09-10

#### Changed — service detail → Licenses: function permissions on a family rail

- The Function permissions section of the service detail Licenses tab shows its families
  (Entities / Credit / Assets / …) as a Standard 2.1 left rail, each item carrying its granted-row
  count, with that family's table straight in the pane — the family heading is no longer repeated
  above each table. The section header, Refresh and the could-not-read / mirror-behind / none-granted
  notices stay above the rail. A rail selection whose family loses its last grant falls back to the
  first family.

#### Changed — Custody page split into tabs; the duplicate "My Services" list removed

- [Custody](src/app/pages/secure/custody/custody.page.html) shows its groups — Services Under My
  Custody / Assets Under Custody — as tabs (the Settlements / Clearing tab-bar shape) instead of
  stacked cards, each tab carrying its row count so an empty group is visible without clicking
  into it. Holds stay under Assets Under Custody.
- **The "My custodian services" card is gone.** It listed the entity's own type-2 services until
  Phase 28 step (e) removed the `serviceType` filter, after which it was the Services module's list
  repeated. The own-services load stays: it feeds the Place Hold "acting service" picker and the
  Placed-by labels. Its `custody.myServices.*` strings are removed (en + ar).

#### Changed — Entity Mode retired: navigation follows the regulator's licences and grants (Phase 28.13 + Phase 17 A6a)

- [FeaturesService](src/app/shared/services/features.service.ts) dropped `mode` / `modeMenu` /
  `modeAllows`. `menuEnabled` = licence (`features.licenses`) ∧ the served map (the admin toggle
  with the regulator's Phase 17 grants folded in server-side). `isServiceProvider()` /
  `isClearingHouse()` are DERIVED from `features.licenses.held` (Token Issuer 27; Clearing House
  5 / 6), so the dashboard variant no longer depends on a tenant setting. A fresh entity sees the
  basic set only.
- Menu Settings, User Details (Menu Access + System Functions) and the User Group editor **HIDE**
  rows whose licence is `not-covered` or whose grant is denied (user ruling 2026-09-10: hidden, not
  locked). **API Endpoints hides the sections its licences do not cover** — their routes 403 every
  external caller at the licence ceiling whatever the toggle says.
- `FeaturesService` refreshes on `vault:updated` of type `party_grants` (1 s trailing debounce), so a
  regulator's grant change reaches a live session.
- Service-provider dashboard: a "No licences issued yet" state (en + ar) when the licence set is
  known and empty, in both the operator and admin views.
- System Configuration loses its Entity mode row (the page is content-driven — no page change).
  Production build clean.

#### Changed — service detail → Function permissions lists only the GRANTED functions

- The Licenses tab's Function permissions card rendered the whole Phase 17 catalog, so a fresh
  service showed rows of "Not granted — refused by default". It now renders only rows with
  `granted === true` (`grantedGrants` in
  [details.page.ts](src/app/pages/secure/services/details/details.page.ts)); groups with no grant
  disappear, and an empty list reads "Your regulator has not granted this service any functions
  yet". Default, refused and withdrawn rows are no longer shown, and the refusal-only pill/meaning
  helpers were removed. The API response is unchanged — the full catalog still drives the
  `mirrored` sync-health warning, whose wording was adjusted. Production build clean.

#### Changed — the Add Asset class picker offers only the classes this issuer is GRANTED (Phase 4.2 as Phase 17 rows)

- [asset-creator.page.ts](src/app/pages/secure/assets/creator/asset-creator.page.ts) reads
  `GET /entity/grants` alongside the regulator's formulas and narrows the picker to formulas whose
  base class the issuer holds a `grant.assets.class.<slug>` row for — `Assets.registerAsset`
  refuses the rest, after the token has been deployed. A **failed grants read hides nothing**: the
  list stays whole and a footnote says it is un-narrowed (`classGrantsUnread`). A new empty state
  (`noClassGrants`) distinguishes "definitions exist, none granted to you" from "none published";
  the fix it names is a Permissions-tab act, not a new definition. en + ar. Production build clean.

#### Changed — navigation is licence-aware: a module the regulator has not licensed is hidden, not opened into a 403

- `FeaturesService.menuEnabled()` now folds THREE server-resolved layers — entity mode, the
  regulator's licences (new, from `features.licenses`), the admin's menu toggle — so all 26
  `menuEnabled` call sites in the sidebar and the `menuFeatureGuard` on every module route inherit
  it with no template change: a hidden module is also unreachable by URL. Only `not-covered`
  hides; `undetermined` (the API could not read the licence set) stays visible on purpose, because
  "we could not ask" must never look like "you were refused". A failed fetch keeps the last known
  fold, like the mode. `licenseFor(key)` is exposed for a surface that wants to explain an absence.
  [features.service.ts](src/app/shared/services/features.service.ts), `VaultFeatures.licenses` on
  [api.service.ts](src/app/shared/services/api.service.ts).

#### Changed — the Asset Creator is a routed PAGE, the app's first stepped page (R18 / Phase 4.9, A2)

- **`modal-asset-add` (864 + 621 lines) is promoted in place to
  [pages/secure/assets/creator/](src/app/pages/secure/assets/creator/)** — `git mv`, so the history
  follows the file — as `AssetCreatorPage` at `/authorized/assets/creator`, per frontend Standard
  2.5 (written 09-04 for exactly this page, before it existed). Same eight steps, same stepper
  markup; what changed is the shell: Standard 2's header + breadcrumb, the step indicator where a
  detail page's tab rail sits, a page-anchored footer, no backdrop. **The step lives in `?step=N`**
  so refresh and back behave. **Cancel confirms when work is in flight and routes to the list, and
  the route's `canDeactivate` runs the same confirm for the sidebar and browser exits** — guarding
  only the button would cover one exit of three.
- **The create-then-upload flow moved from the assets LIST page into the page that owns the
  data** (it used to await the modal's promise, then create, then upload attachments). Success
  lands on the new asset's detail page; a failed create keeps everything typed. The modal's
  promise service is gone; its interfaces survive as `asset-creator.model.ts`.
- **Reachability is its own menu key, `asset-creator`** (sidebar entry beside Assets; a viewer sees
  it only when granted, since viewers start with every module hidden). The submit stays gated by
  the existing `asset-create` System Function — one act, one key. The list's "Add Asset" button now
  routes to the page. `MENU_LABELS` + en/ar strings added.

#### Changed — DEX Offerings: the create form offers all three kinds; the list shows the kind; Buy is tap-only (Phase 16 A7)

- **Create Offering** gained a kind selector (Tap [default] · Window · Auction) with a per-kind
  hint, a close-time picker (`datetime-local`, converted to unix SECONDS with the place-order
  modal's recipe, refused inline when blank or in the past) for window and auction, and an
  allocation selector (first-come / pro-rata) for a window; the auction's price field is labelled
  as the reserve price. The two dead inputs — min fill and max per subscription — are gone: the API
  had ignored them since the 2026-08-28 split, so they promised bounds nobody set.
  [offerings.page.ts](src/app/pages/secure/dex/offerings/offerings.page.ts),
  [offerings.page.html](src/app/pages/secure/dex/offerings/offerings.page.html),
  [api.service.ts](src/app/shared/services/api.service.ts) `vaultDexOfferingCreate`.
- **The offerings list shows a Kind pill, and the Buy button appears on TAP offerings only.** The
  fill route relays `offeringTapFill` and the API refuses any other kind; a window or auction is bid
  through the venue. Without the gate, making those kinds creatable would have put a Buy button on
  rows whose every click fails. en + ar.

#### Security — Phase 18 client legs: Argon2id + stored per-user salt (H1 / 18.B4), hashes-only user management (18.5), proof-verified password change (18.2)

- **`parse-proof.utils.ts` is the ONE derivation** (byte-identical to the ZK repo's client copy;
  `check-clients.mjs`): `derivePassword` (Argon2id via `hash-wasm`, m=64 MiB / t=3 / p=1 over the
  per-user salt), `stretch`, `randomSalt`, `generateCommitment` over the stretched value.
  `passwordToBigInt` is GONE on purpose.
- **Login builds the proof over the salt the API returns** (`/staff/credentials-data` →
  `{ nonce, commitment, salt }`), never `environment.globalSalt`; the bootstrap-claim login keeps
  the RAW OTP path (`passwordIsRawBigInt`) because the placeholder is committed from the raw OTP.
- **Users page / user details: the password never leaves the browser.** `EthersService.
  deriveCredential(username, password)` mints a fresh salt and sends `{ loginHash, commitment,
  salt }` to `POST /staff` / `PUT /staff/:id/credentials`, and `{ commitment, salt }` to
  `PUT /staff/:id/password`.
- **My Profile → Change Password is PROOF-VERIFIED**: `proveCurrentPassword` builds a login proof
  over the current credentials, `deriveCredential` the new tuple, `PUT /staff/:id/self-credentials`
  carries both, and the contract verifies. The session is revoked by the rotation, so the page
  drops it (`AuthService.forgetSession()`, new — no confirm, no server logout) and returns to
  login.
- **Claim wizard**: `adminClaim(newCommitment, newSalt)` with a freshly minted salt; the optional
  username rotation derives its own tuple; the entity-DID claim keeps the entity API's globalSalt
  (identities store no salt until Phase 22.0).
- `assets/zk/Login.wasm` + `Login_entities.zkey` / `Login_identities.zkey` — the Phase 18 circuit
  (in-circuit stretch) per-product setups. ⚠️ Dev one-shot; the real ceremony re-installs them.

### 2026-09-09

#### Changed — the v4 design lands: login, app shell, and one table style Vault-wide

The v4 concept in [`Tarmiiz Design Components/v4/`](../../../Tarmiiz%20Design%20Components/v4/)
is now the Vault's actual look. Three passes, all deliberately additive — every binding, route,
handler and permission gate was preserved:

**Login.** [login.page.html](src/app/pages/public/user/login/login.page.html) became the v4 hero
with an inline sign-in card (no marketing sections, no contact form, no footer). All 33 bindings
carried over, plus a `showPassword` toggle. **Forgot-password is HIDDEN, not deleted** —
`forgotPasswordEnabled = false`; the page still exists and only lacks a route, so restoring it is
one flag. The CTA is a white fill with an indigo label rather than the indigo fill the mock used:
measured against the hero's light band, indigo-on-gradient was **1.01:1**; the inversion is
**6.37:1**.

**App shell.** [authorized-layout](src/app/shared/layouts/authorized-layout/) gained a global top
bar spanning the full window (logo, page title, Live, welcome, messages, language, profile,
logout), the v4 gradient page background, and the `ion-split-pane` restyled into a floating panel
with a collapse control persisted to `localStorage`. Page titles and the per-page Live indicator
**moved into that bar** — via two new reporter services,
[page-title.service.ts](src/app/shared/services/page-title.service.ts) (route-keyed, because
back-navigation re-runs no lifecycle hook) and
[live-status.service.ts](src/app/shared/services/live-status.service.ts) (Symbol-keyed, so
retained pages can report in any order). `app-header` and `app-live-indicator` keep their tags and
inputs in all 59 templates and simply report instead of rendering, so the move cost **zero page
edits**; the now-empty per-page title bars were removed.

**Tables.** `.table-v4` (in [global.scss](src/global.scss)) is now on **all 105 tables outside the
dashboard pages** — 58 files. Signature: a gradient header band with a matching gradient rule
beneath it, zebra rows, hairline separators, no vertical rules. The hardcoded `#4a5568` header is
gone Vault-wide. Per table the padding utilities, zebra bindings (`[class.bg-gray-100]`/
`[class.bg-white]`) and now-dead `let isEven = $even` were removed — the class owns all three, and
being unlayered it beats Tailwind's layered utilities, so leaving them would only have misled.
Column alignment, click handlers, `cursor-pointer` and the `row-new` pulses are untouched. The
**dashboard pages are deliberately excluded** and verifiably unmodified.

Three things here are measurements, not preferences, and each would have caused visible damage:

- **The header band is darkened 22%.** The hero gradient as-is is **3.59:1** against white 12.5px
  text; its cyan stop sits at 130%, past the element, so the real painted endpoint is `#3488e9`
  rather than the nominal `#0ea5e9`. Darkening gives **5.30:1** and keeps the gradient.
- **The rule under the header is a background LAYER, not a border** — a border cannot hold a
  gradient, and a flat rule matched the band at exactly one point. Same three hues at full
  strength (the 22% the band gives up), `90deg` because on a 2px strip only the horizontal
  component of a gradient exists at all.
- **Row height is floored by the status pill, not the padding.** Measured: at 8px cell padding a
  row was 39.5px = `8 + 23 (pill) + 8`; the 13px text sits in a 17.3px line-box and never reaches
  the floor. Trimming padding alone bottoms out near 32px, so the pill is tightened too — scoped
  to `tbody td` and to `span`, so pills elsewhere and any buttons are unaffected. Result **28.5px**,
  header unchanged.

A `td[colspan]` carve-out keeps "No records found" rows readable: without it the unlayered cell
padding would flatten them AND — being `first-child` by definition — they would have picked up the
lead-cell dark ink and semi-bold weight, rendering an empty state as bold dark text in a cramped
row. `text-align` is deliberately left unset throughout so each template's own `text-center` /
`text-right` still applies.

#### Fixed — sidebar menu icons were invisible on a light-mode OS

All 27 menu icons carried `text-gray-800 dark:text-white`. Tailwind compiles `dark:` under
`@media (prefers-color-scheme: dark)`, so on a machine set to **light** they rendered white on the
near-white panel — **1.02:1**, i.e. blank space where the icons should be. It looked perfect on a
dark-mode machine, which is why it survived. All 45 icon colour classes were stripped so the icons
inherit the row's colour. Same family as the header defect fixed 2026-09-08. Pre-existing, found
while porting the shell — not introduced by it.

#### Fixed — the Credit page shows the service pools and keeps a currency column at zero

[credit/credit.page](src/app/pages/secure/credit/) rendered only the subscribers' CLAIMS and
hid every currency column whose claims were all zero — so on granite, where each subscriber's
deposit was spent at once through deposit-buy, the page read "No credit balances" with no
balance column at all while the service's pool held 565,000 EGP. The summary now shows both
halves of Reading B: **Subscriber claims** per currency and **Service pool** per service and
currency (with the claims on it), and a currency earns a table column whenever any claim, hold
or pool is non-zero, so the EGP column appears with 0.00 per row. Amounts render through the
`money` pipe. The overview itself is ~10× faster (see the Entity API changelog). i18n
`credit.subscriberClaims` / `servicePool` / `claimsOnPool` in en + ar.

Follow-up the same day: the first cut showed all four platform currencies as columns of zeros.
Two causes — the row mapping dropped `withheld`, so `undefined !== 0` marked every currency
live; and "any non-zero" is the wrong rule for the columns anyway. The columns are now the
entity's regulator-**approved** currencies (`vaultGetApprovedCurrencies`, every state) plus any
currency that carries a non-zero claim, hold or pool — money is never hidden, but an unapproved
currency with nothing in it earns no column.

#### Fixed — the asset Price chart and exports follow the asset's price mode

On [assets/details](src/app/pages/secure/assets/details/) the Price chart always drew Bid and
Ask, and both exports always emitted both columns — for a fixed-priced asset (`priceMode` 1)
that is one line drawn twice under a label naming a quote side the asset does not have. The
chart, the Excel export and the PDF export now branch on `priceMode` exactly as the table
already did: one **Price / NAV** series and column for a fixed-priced asset, **Bid** / **Ask**
for a market-priced one. `assets.details.price.priceColumn` reads "Price / NAV" (was "Price")
in en + ar.

#### Changed — the credit transaction modal resolves its SP receipt by CID

[modal-credit-trx-info](src/app/shared/components/modal-credit-trx-info/) opened a row's receipt
by listing the service's documents and matching `dataCid`. The Entity API's service documents
list now DROPS receipts (they are per-transaction records, not documents of the service), so the
modal calls the new `serviceDocumentByCid(service, cid)` → `GET /services/:address/documents/by-cid/:cid`
instead. Same file-view flow after that; a CID nothing carries still shows the existing
"receipt not found" alert.

#### Added — **Disclosed by your regulator** on the subscription Identity tab (Phase 22.10 / C.5)

The Identity Data tab on [subscriptions/details](src/app/pages/secure/subscriptions/details/)
showed only the verifications THIS entity originated — which, for a subscriber onboarded on the
plugin (sealed) path, is nothing at all: the regulator held the only key. What the regulator chooses
to avail this service is now the tab's first section, read from the Entity API's
`GET /disclosures/:didHash?service=` via the new `ApiService.disclosureRead`.

- Renders the projection **verbatim** — scope pills, issued-at + document id, the source
  verification's ref / level / custody, a `<dl>` of the availed `fields` (labels reused from the
  own-originated table where the key is known), the `contacts` block (this service's OWN onboarding
  contacts only, with the OTP / attested pill), ID images, market identifiers, a collapsed raw
  provider payload, and **`unfulfilled`** in amber — availed but absent at the source, so a blank is
  attributable rather than reading as "this person has no address". There is nothing to filter here
  and nothing was added: the document holds only what was availed.
- **404 and 502 are kept apart.** `disclosureRead` deliberately bypasses `authGet`, which collapses
  every non-2xx to null: "nothing has been availed" (grey empty state) and "something was availed
  and will not open" (red) send an operator to different places.
- **Read by SUBSCRIPTION, not by DID hash, and not behind the identity-hash call** (same day, found
  on the first live delivery: the section stayed empty although the projection was mirrored). The
  identity-hash read reverts on chain for entities by design, so `loadIdentityData()` had never
  reached the disclosure call. The disclosure now loads in parallel with it, keyed by the
  subscription address the page already has. The own-verifications list below it is still empty on
  every tenant for the same reason — recorded in BUGS.md, not fixed here.
- Same `view-identity-data` gate and the same short-circuit as the eKYC reads. The tab's hint copy
  no longer claims only own-originated verifications are visible. `IdentityDisclosure` model;
  `subscriptions.details.identity.disclosure.*` i18n in en + ar.

### 2026-09-08

#### Changed — liquidity shortfall surfaces restored, class-aware and issuer-keyed (Phase 31)

Earlier today every shortfall / coverage surface in this app was wrapped in a disabled block
("HIDDEN 2026-09-08 — pending revision"). That hide was **interim and lasted hours**: this is the
revision, and every wrapper is gone — `rg "HIDDEN 2026-09-08|showShortfallUi"` returns nothing. The
three details the hide had to touch beyond wrappers are reverted: the Liquidity tab's loading /
empty rows span **9** again (the original 8 plus the new expander column), the `tinted` row binding
is back (a shortfall — or now an unassessed λ — replaces the zebra striping with red / amber), and
the services list calls `vaultGetServicesCoverage()` again alongside the services fetch.

**What changed underneath (Entity API, same pass):** the obligation is no longer "every holder
balance × bid grouped by the distributor". It is **Σ over the ISSUER service's assets of
λ × units outstanding × bid**, where **λ is the redemption-coverage coefficient the asset's
regulator sets on its 4.9 class formula** (`redemptionCoverage`, basis points). An equity or an
environmental certificate is never redeemed for money, a money-market fund meets redemptions from
its portfolio — the class-blind rule was raising alarms those issuers could never clear.

- **Per-asset decomposition** — new shared
  [coverage-assets-table](src/app/shared/components/coverage-assets-table/coverage-assets-table.component.ts)
  (Asset · Symbol · Class · Formula · λ · Outstanding · Bid · Gross · Contribution), opened by a row
  expander on the Home card's per-service table and on the service details Liquidity tab. Class
  names come from the on-chain `Asset Class` catalog (one memoised fetch), not a local map.
- **λ is shown per asset, and "Not set" when the regulator has not decided.** An unset λ
  **contributes nothing** (contribution `—`, never 0) and marks the row **`not-assessed`** — an amber
  pill in the Coverage cell and a footer line "not assessed — N asset(s) without a redemption
  coefficient". It is deliberately NOT assessed at λ = 1: that would be a platform default by another
  name. A stored value outside 0..10000 bps reads "invalid — treated as not set".
- **Coverage "n/a" at λ = 0** — every assessed λ is 0, the issuer owes nothing on redemption
  (the API's `idle`). One cell rule everywhere: unset λ ⇒ "Not assessed" (it outranks "n/a", since
  "n/a" reads as *nothing owed*, which an unassessed asset cannot vouch for); no ratio with assessed
  assets ⇒ "n/a"; otherwise the floored percentage.
- **The per-currency tile is now a ROLLUP of the per-service table** — obligation Σ, liquidity Σ,
  shortfall = Σ row shortfall (pools are per service and not fungible), `unsetCount` Σ. The two
  halves of one card can no longer disagree; a tile gains the "not assessed — N asset(s)" line.
- **Assets with no issuer service** are listed under the card as a warning ("N asset(s) with no
  issuer service — not attributed to any pool"), never folded into any pool.
- **The 100% cap is dropped, the FLOOR stays** — `coveragePercent` on Home, the services list and
  the service details now all floor to one decimal and never cap, so a pool covering its obligation
  1.9× reads **191.2%**, matching the Regulator Dashboard and this tab's own hint. Resolves the
  Vault-vs-Dashboard entry in [BUGS.md](../../../BUGS.md#L632). The services list previously
  ROUNDED (`minRatio * 100 | number:'1.1-1'`), so 99.97% read "100.0%" there too — now floored.
- **Compliance tab decodes formula parameter keys** — `param_key` was rendered as raw bytes32 hex,
  so λ would have appeared as `0x7265…` the day it was set. Keys decode via
  `ethers.decodeBytes32String` (hex fallback); λ has its own always-present line, "Redemption
  coverage (λ)" as a percent or an amber "Not set" — an absent row is *not set*, never 0.
- **Models / API service**: `CoverageAssetRow`, `ServiceCoverageRow`, `ServiceLiquidityRow`,
  `ServiceCoverageAggregate`, `UnattributedAsset` in `data.model.ts`; `vaultGetServicesCoverage` /
  `vaultGetServiceLiquidity` typed, no path changes. The λ counts are coerced to numbers client-side
  so an API that omits them cannot hide a row.
- **i18n (en + ar)** — `dashboard.liquidity.{notAssessed, notAssessedPill, na, showAssets,
  hideAssets, lambdaNotSet, lambdaInvalid, formulaMissing, unattributed, breakdown.*}`,
  `services.table.notAssessed`, `assets.details.compliance.{paramRedemptionCoverage, paramNotSet,
  paramInvalid}`; `services.details.liquidity.helpText` rewritten to the λ formula.

Not changed here: `dashboard.liquidity.subtitle` still reads "if all holders redeemed now", which
under λ is only true at λ = 1 — flagged for a copy decision rather than reworded unasked.

#### Fixed — an idle screen issued 451 requests per second and exhausted the API's rate limit

Reported as "the Entity API broke" while attaching documents to an asset. The uploads had all
succeeded; what failed was everything after them, with a 429 the API never logged. Measured on the
Granite tenant: **451 requests in one second**, 140 of them to `/connect/inbox`, 2,344 in twenty
minutes, **with no user interaction** — enough to burn the 10,000-per-15-minutes ceiling in about
22 seconds. Peak after the fix: **20/s**.

⚠️ **The endpoint was never polled.** There is no timer and never was — every call came from a
`vault:updated` socket handler. The bug was fan-out, so "poll less" would have fixed nothing.

- **New [shared/services/unread-messages.service.ts](src/app/shared/services/unread-messages.service.ts)** — the
  one owner of the unread badge count: a single socket subscription, an in-flight guard, and a
  400 ms trailing debounce. The header badge and the sidebar badge each held their own
  subscription and each called `connectInboxInfo()` on every event, so one broadcast always cost
  two identical fetches of the same endpoint. Both now read its `count` signal; neither fetches.
  Templates are unchanged.
- **[authorized-layout.component.ts](src/app/shared/layouts/authorized-layout/authorized-layout.component.ts)
  gained `ngOnDestroy`.** It made three subscriptions and tore down none. `SocketService` is
  `providedIn: 'root'` and the login page lives outside this layout, so every logout→login in one
  tab stacked a new layout's subscriptions on the previous one's — after k cycles a single event
  fired k badge refreshes.
- **[socket.service.ts](src/app/shared/services/socket.service.ts) — the duplicate-socket race.**
  `connect()` guarded on `this.socket?.connected` *before* an `await`, and is called un-awaited
  from both `AuthService.login` and the layout constructor. Both passed the guard while
  `this.socket` was still null, creating two connections; the orphan stayed connected with its own
  handler pushing into the same Subject, so **every broadcast was delivered twice**. Evidence: 14
  `CONNECT` against 9 `DISCONNECT`. Now an in-flight promise plus a `this.socket` (not
  `.connected`) test — socket.io reconnects on its own, so an existing-but-disconnected socket
  must not be replaced.

### 2026-09-06

#### Added — Function permissions, under Licenses on the service detail page

An entity could see which markets it was licensed for and had **no way to see which individual
functions its regulator permits** — so a service refused by a Phase 17 grant gate had nothing in its
own dashboard able to say which grant. A second table now sits under the Licenses table on the same
tab: a licence says which MARKET this service may operate in, a grant says which FUNCTIONS, and
that is one question at two granularities.

🔴 **READ ONLY — no Grant / Deny / Clear.** A grant is the regulator's act, the Entity API has no
setter to call, and a control the entity cannot use would imply a power it does not have. Verified
by assertion, not by intent: the card contains **zero** `(click)` handlers, `<button>` tags,
`<input>`s and `<select>`s — the only control is the shared `<app-refresh-button>`, a read action.

⚠️ **Three refusals that look identical and are not**, each with its own sentence, because the
entity decides nothing here and explaining the state is the only useful thing this surface can do:

| status | what it says |
|---|---|
| Permitted | *Permitted by your regulator* (with the level, where the row is graded) |
| Refused | *Your regulator considered this and declined it* |
| Withdrawn | *Your regulator granted this and a later supervisory action voided it* |
| Not granted | *No decision recorded — refused by default* |

🔴 **Withdrawn must never borrow "no decision recorded".** A regulator *did* decide and an epoch
bump voided it; calling that "no decision" is a false statement about a real event and points the
operator at the wrong conversation. Amber for either DECIDED refusal (someone acted, so there is
someone to ask), gray for the default (nobody has looked yet).

⚠️ **An empty list is never rendered as "no permissions".** A failed read shows *"Your permissions
could not be read just now — this is not a decision about what this service may do"*, and a service
whose mirror holds zero cells says the records have not reached the dashboard rather than showing
forty rows of "not granted", which is indistinguishable from a genuine default-deny.

#### Added — what this tenant's LICENSES mean, on every admin screen

Five admin surfaces now show, per row, whether the tenant's licenses actually cover the thing being
configured: **Menu Settings**, **API Endpoints**, **Approval Settings**, **User Details** (Menu
Access + System Functions) and **User Group Details** (both tabs). One shared
[`<app-license-pill>`](src/app/shared/components/license-pill/license-pill.component.ts) — the
`<app-refresh-button>` precedent, for the same reason: the same fact rendered five ways is five
things to keep in step.

🔴 **The rule the component exists to get right: the license ceiling gates ROUTES, not KEYS.** A
system function spanning six sections has its routes spread across them, and a route in an unlocked
section still works. So a key is "not licensed" only when EVERY section it touches is closed;
partial coverage is available and shows the split (`Licensed 3/6`).

⚠️ Rendering the partial case as blocked — or as "requires any of X, Y, Z" — would tell an admin
that one threshold decides the key, when each route decides itself. **An admin who believes a live
key is already dead will disable it, taking the surfaces it still governs with it: a wrong answer
that ACTS rather than one that merely misinforms.**

⚠️ **Four absences, four different sentences**, because each sends an admin somewhere different and
collapsing them into one em-dash is the failure mode:

| state | means | renders |
|---|---|---|
| core | deliberately outside licensing | nothing at all — a pill on every core row trains admins to ignore the pill |
| retired | the route is GONE | *No longer in use* — says nothing about licenses, because none will bring it back |
| undetermined | the license set could not be READ | *Licenses unread* — chase the chain or the sync, **not** the regulator |
| unknown | no mapping exists | *Unmapped* — never rendered as "unrestricted", which is unearned |

- **Fixed in the same pass — five explicit row mappers silently DROPPED the new field.**
  [api.service.ts](src/app/shared/services/api.service.ts) and
  [data.model.ts](src/app/shared/models/data.model.ts) build result objects field by field, so an
  unnamed field never reaches the page. The rows would have rendered *Unmapped* — the reassuring
  answer — on every screen. Each mapper now names `license` and says in-source why it must.
- Wording is *"your licenses do not cover this"*, never *"blocked"*: the enforcing ceiling is not
  deployed, so a row claiming to be blocked would describe something that is not happening.
- Amber, not red, for *Not licensed* — the tenant is not misconfigured; a license it does not hold
  is a normal state to obtain from its regulator, not an error to fix on this page.

### 2026-09-02

#### Added — Phase 4.9: an issuer picks a regulator's PRODUCT, not a base class

- **The Add Asset wizard's class picker is now a CLASS DEFINITION picker.** An issuer no longer
  selects "Debt / Sukuk"; it selects one of its regulator's named products built over that base
  class — "Green Sukuk" or "Conventional Bond", which may impose opposite requirements over the
  same class 3. `registerAsset` requires a formula and has no default, so this is the wizard's
  fail-closed gate.
  - **`SUPPLY_MODE_FOR_CLASS` DELETED.** It was a verbatim mirror of `AssetClassLib.supplyModeFor`,
    a function that no longer exists — the class → supply map, per-row defaults and per-role
    independence rules were all removed from the library, because a base class fixes nothing now.
    Supply model and price mode come from the formula's policies: pinned where the regulator
    decided, a picker only where the policy says *Issuer chooses*.
  - The class-11-is-special branch went with it. "Custom lets the issuer choose" stopped being a
    class fact — any formula may leave the choice open, and a Custom-class formula may pin one.
  - ⚠️ **The REGULATOR picker on step 5 is gone.** It was a free choice three steps after the class,
    so an issuer could pick a product authored by FRA and then select a different regulator — a
    pairing `registerAsset` refuses, discovered only **after** the token had been deployed and its
    name and symbol permanently taken in that country. A formula belongs to exactly one regulator,
    so choosing the product settles the authority and the invalid pair is now unrepresentable
    rather than validated. Step 5 shows it read-only; `regulator` moved out of that step's
    validated fields, which would otherwise have gated Next on a control nobody can edit.
  - **A price mode the regulator pinned can no longer be silently overwritten.** The supply-mode
    subscription used to reset `priceMode` unconditionally, which after 4.9 meant picking a
    Market-priced product and watching the choice flip back — then reverting at registration
    against its own formula's policy. The suggestion now applies only when the policy is *Issuer
    chooses*.
  - Empty is a real, expected state on a fresh chain (zero formulas exist until a regulator authors
    one) and says so explicitly, rather than rendering as a broken picker.
- **Register Existing gained the same picker, narrowed harder.** `assetRegisterExisting` now sends
  a formula (the API 400s without one). Path B is better placed than the wizard to enforce the
  on-chain rule, because the preview has already read the regulator and the declared class off the
  contract — so the list is filtered by both halves and every option can succeed. Auto-selects when
  there is exactly one.
- **Asset detail → Compliance gained a Class Definition panel**: the product, its state (Retired is
  amber — the asset keeps resolving against it, but no new asset may use it), both policies, the
  permitted A23 standards and the R20 parameters, plus the regulator's own named document rows.
  Before this there was nothing to name: the asset showed a bare class label, and the rules it was
  actually held to were a model default written in Solidity in another country.
  - The matrix's Role column now shows the **regulator's named role definition** with an
    "Independence waived" pill where one applies — which answers the question the party list cannot:
    *why was an issuer-owned party accepted here?*
  - `reqStateName(0)` relabelled "Not set". It no longer falls through to anything, but Off (a
    recorded refusal) and Unset (silence) are still different acts and only one leaves a record.
  - The `requirementsHint` and `onlyBaselineRequirement` rationale both described the deleted model
    default; corrected in en + ar.
- `ApiService`: `assetClassFormulas()` + `assetClassFormula()`.

#### Fixed

- **The Register Existing preview labelled every contract `TarmiizT3643` — a standard the platform
  no longer has.** `p.tokenType === 1 ? 'TarmiizT20' : 'TarmiizT3643'` read a field that is not in
  `RegistrationPreview` (retired with the t3643 tree), so it was `undefined`, always took the false
  branch, and never looked like an error. Now reports the base class, which is the fact the formula
  is matched on. The orphaned `tokenTypeLabel` key was dropped from en + ar. See BUGS.md.

#### Changed

- **The Add Subscription modal is now driven by the generated canonical rules instead of a
  hand-copy.** `isModeBValid()` re-implemented v3's required set inline (`BASE` + *"passports also
  need nationality"*), which is exactly how it would have been stranded when the schema moved to
  v4 — and the failure mode is the worst available: the operator completes the whole form and the
  API rejects at submit. It now walks `ekycRequiredFieldsForLevel()` from the regenerated
  [ekyc-canonical.ts](src/app/shared/constants/ekyc-canonical.ts) mirror, so the modal and the
  server read the same table.
  - `isPassport()` **removed** — it hard-coded a rule that was true under v3 and is wrong under v4,
    where nationality is mandatory for every document type. Replaced by `isRequired(field)`, which
    resolves the tier from `EKYC_FIELD_RULES` for the chosen `idType`.
  - `nationality`, `issuingCountry` and `addressCountry` promoted into the main block (all
    mandatory now); `addressStreet`, `addressCity`, `issuingAuthority`, `placeOfBirth`, `gender`,
    `idReleaseDate` and `nationalIdSerial` surfaced there too with a `*` marker that appears only
    for the document types that actually require them. The nine controls this duplicated were
    removed from the "more fields" block — two inputs bound to one control is a latent editing bug.
  - A **"Still required for this document type"** hint lists what is outstanding, so the operator
    sees it before submitting rather than after. en + ar.
- **`ekyc-canonical.ts` regenerated** for v4 — exports `EKYC_FIELD_RULES`, `EKYC_EVIDENCE_RULES`,
  `ekycRuleApplies`, `ekycRequiredEvidenceForLevel`; the retired `EKYC_REQUIRED_BASE` /
  `EKYC_PER_ID_TYPE_REQUIRED` are gone. Generated file — do not edit by hand.

### 2026-09-01

#### Added

- **A Contract tab on DEX venue detail (Phase 16 A6)** — the venue's bound contract, the platform
  kit-library addresses to link against, verify-then-bind for an address the operator deployed, a
  deploy-and-bind path, and unbind.
  [details.page.ts](src/app/pages/secure/dex/venues/details/details.page.ts) +
  [details.page.html](src/app/pages/secure/dex/venues/details/details.page.html), gated on
  `dex-venue-set-contract` and `role !== 3`; en + ar.
  - **The Vault does NOT build creation code, deliberately.** Per the platform ruling the operator
    brings fixed, reviewable code from the downloadable kit and the platform neither generates nor
    holds an implementation. What the page adds is the two things genuinely missing: the published
    kit-library addresses (they become bytecode literals and are the conformance fingerprint) and a
    route to a `CREATE` the tenant relay wallet is not permitted to perform.
  - **Capabilities are read from `hasBook` / `hasDeals` / `hasOfferings`, never inferred from
    `templateKind`** — kind implies capability only for the stock templates, and kind 9 (Custom)
    composes its own, so those flags come from the bound contract's own `info()`.
  - **The halt-first requirement is shown, not discovered as a 409**, and the success alert always
    surfaces the API's `notice`: binding AUTO-SUSPENDS the venue pending regulator review, and an
    operator who is not told reads their own dark venue as a failure of the action.
  - `DexVenue` in [data.model.ts](src/app/shared/models/data.model.ts) gained the eight contract
    fields the API now returns. A null `venueContract` means **bookless**, not "centrally
    operated"; a null `artifactHash` means **"template unrecognised"**, never "template mismatch".

#### Fixed

- 🔴 **The DEX orders/trades surface was never swept for Phase 16 / V36, so it read fields the API
  stopped returning.** `Orders` became `Commitments` (`uint256 orderId` → `bytes32 ref`) and a
  trade's venue PAIR collapsed to one `dexService`; both APIs and both sync plugins were swept
  then, this frontend was not. Measured against live data:
  - Orders list ID column rendered a bare `#`; the detail breadcrumb read `#NaN`, because
    `Number(paramMap.get('orderId'))` on a hex ref is `NaN` and the page then fetched nothing.
  - **Match Selected could never have worked** — `vaultDexMatchOrders` posted
    `{buyOrderId, sellOrderId}`, which the API refuses by name rather than aliasing.
  - **The trades list THREW on the first real trade** — `t.buyDexService.toLowerCase()` in the
    filter and `.slice(0,10)` in the template, both on a field that is now `undefined`.
  - The trades PDF head carried **10** columns to the body's **9**: `Scope` was dropped from the
    body only (V36) and left in the head, so every cell after `Credit` sat one to the left and
    `Executed` rendered under `Scope`.
  - Swept: `DexOrder.orderId → ref: string`, `DexTrade.buyOrderId/sellOrderId → buyRef/sellRef`,
    `DexTrade.buyDexService/sellDexService → dexService`, `DexDeal.buyOrderId/sellOrderId` retyped
    `string` (those columns are `TEXT` refs — the names are historical), route param
    `:orderId → :ref`, and the four API-client signatures. A `shortRef` helper renders head+tail
    with the full value on `title`, since 64 hex characters is not a table cell.
- 🔴 **Both Transactions exports dropped the counterparty on every Transfer row.** The screen falls
  back to `to` when a row has no `subscription` — a Transfer names a counterparty, not a
  subscription — while the Excel and PDF bodies read `t.subscription` directly, so the cell came
  out EMPTY. A blank there reads as "no counterparty" rather than as a missing lookup, and only
  shows up by holding an export next to the screen. The rule is now expressed once as
  `partyAddress(t)` and the template and both exports share it.
- 🔴 **Create Venue could never succeed — the modal sent no `settlementMode` and the API requires
  it with no default, so every attempt returned 400.** With the DEX venue routes living in
  `routes/vault.js` (which rejects the automation principal by design), a venue could not be
  created on a running stack by ANY path. Found while standing up a native-P2P venue for
  `TK MMF 1`.
  - **A half-applied two-axis change.** On 2026-08-09 PARTICIPATION (`allowP2P`) became derived on
    chain from whether the service has a registered payment processor; SETTLEMENT stayed
    caller-supplied and immutable. The Vault was updated as though BOTH had gone — and its own
    comment asserted it, which is what would talk a reviewer past the defect. The Entity API was
    corrected (its handler comment: *"TWO AXES, and this handler used to ignore the one that is
    still the caller's"*); this frontend never was.
  - `modal-venue-create` gains a required **Settlement Mode** select — 1 = Venue-settled (performs
    its own DvP) / 2 = Member-settled (books and matching only). `vaultDexVenueCreate` now takes
    and posts it, and the venues list passes it through.
  - **Deliberately no default and no pre-selection.** `settlementMode` is immutable at
    `venueCreate`, and mode 2 additionally demands an escrow clearing house attached to the service
    at EVERY placement — so a wrong pick is uncorrectable and can only be abandoned by registering
    another service. The field carries an amber warning saying so. A default here would be a
    permanent decision made by a form.
- **Every alert message in the app broke MID-WORD** — the shared alert body carried `break-all`,
  so prose rendered as *"pending regulat / or review"*. `break-all` is correct for a hash or an
  address and wrong for sentences; `break-words` still breaks an unbreakable token when it would
  overflow. **Present in five frontends** (Entity Vault, Regulator Dashboard, Directory Search,
  Entity Registration Portal, Regulator Registration Portal) — all five fixed.
- 🔴 **`AlertService.hideCancel` had never been used by a single caller.** Measured: **370
  `alertService.show(` sites in this app, 0 passing the flag, 145 of them `alerts.error`** (the
  Regulator Dashboard: 60 sites, 0). The flag exists and its own comment reserves it for
  "informational/success messages where a Cancel makes no sense" — and nothing ever asked for it,
  so **informational dialogs offer to cancel actions that have already completed**, including a
  mined on-chain transaction. Fixed at this phase's four call sites via a local `notify()` helper;
  the rest are logged in [Phase 16](../../../Docs/rules/phases/code-fix-phase-16.md), not swept —
  ⚠️ **flipping the parameter's default would be harmful**, stripping Cancel from the ~200 genuine
  confirmations and removing the ability to DECLINE a destructive action. It is a per-site
  judgement: is this dialog a question or a statement?
  - Same failure shape as Phase 16's headline defect and Phase 25.2 — **a capability whose producer
    was built and whose consumers are zero.** Invisible to every drift checker, because a surface
    that never had a caller has nothing to drift from.
- **The Contract tab labelled the catalog-match field "Runtime Codehash"**, so an empty value read
  as *"we cannot see what code is running"* — alarming and false: the runtime hash IS pinned on
  chain at bind time and matches. What is absent is the per-chain creation-code catalog, so the
  field is now "Catalog Match" and its empty state reads *"template unrecognised"*.
- **The Credit Deposit modal offered a "Provider Trx Time" field that reverts 100% of the time on
  any service without the backdating grant — which is the default — and only said so at submit, as
  a raw contract string.** `CreditProxy.deposit` refuses a timestamp that is neither `0` nor exactly
  `block.timestamp` unless the grant is held. The modal now pre-flights the new
  `GET /services/:service/backdating` and **disables** the input with a line saying why, rather than
  letting the operator fill the whole form and meet
  `CreditProxy: backdating is not granted for this service`.
  - ⚠️ **"Just enter the current time" was never an option either, which is why the field is
    disabled rather than merely warned about.** The gate wants *exactly* `block.timestamp`; measured
    on the live chain the same minute, head was `1788250359` against a wall clock of `1788250386` —
    **27 s of drift** on ~4 s blocks — and `datetime-local` has a 60 s step, so its seconds are
    always `00`. No browser value can satisfy it. Empty (⇒ `0` ⇒ block time) is the only working
    input, and now the only reachable one.
  - Even WITH the grant, entering "now" would mark an ordinary real-time deposit as backdated
    evidence on chain, so the enabled-state copy says explicitly that the field is for the payment
    processor's own transaction time and should otherwise stay empty.
  - **Disabled through the FormControl**, not just visually: `form.value` omits a disabled control,
    so the field cannot contribute a timestamp even if the class binding were bypassed. Starts
    `false` and only opens on a measured `granted` — an unreachable API reads as not-granted.
  - ⚠️ **The two sibling modals with the same-looking field were checked and deliberately left
    alone.** `_mayBackdate` is read at exactly ONE site on chain — `deposit` — so
    `modal-route-transfer`'s date is genuinely usable (`serviceRouteTransfer` carries no such gate),
    and `modal-add-subscription`'s `providerTrxTime` is the eKYC provider's verification time on the
    identity's Verification row, which never reaches CreditProxy at all. Disabling those would have
    removed working capability.
  - New `credit.backdating.{granted,notGranted}` in en + ar.

- **"Edit Venue Fees" could silently WIPE a fee that was only inherited — the modal's own guard
  against that was fed by only one of its three call sites.** `modal-service-fee-config` computes
  `inheriting = input.mode !== 'default' && input.isSet === false` and keeps Save disabled until the
  operator actually changes something, because "opening and saving an inherited row must NOT
  silently pin an override" — an all-None override does not mean *inherit*, it means *this asset is
  free* and outranks the service default. The DEX venue detail page passes `mode` / `inherited` /
  `isSet`; the **service detail** and **distribution** pages passed none of them, so `isSet` was
  `undefined`, `undefined === false` was **false**, and the guard never engaged on either. Both now
  pass all three.
  - They also showed **None / None** on an inheriting asset rather than the inherited value, since
    `inherited` was absent too — so the operator could not see what was actually being charged.
  - **Both call sites now REFUSE to open on a failed read.** `vaultGetServiceFeeConfig` returns
    `null` for a transport failure and for any non-envelope body alike, and both pages did
    `res?.feeConfig ?? null` — indistinguishable from "no fee configured". That is how the same
    surface's API-side envelope bug (see the Entity API CHANGELOG for 2026-09-01) presented as a
    blank editor over a live 1 bp override on `TK Onc Fund` / `TK MMF 1`. New
    `services.details.info.loadVenueFeeConfigError` / `distribution.loadFeesError` in en + ar.

- **Add Identifier could never be saved** — the Save button was permanently disabled with no error
  shown, on both the asset detail and the entity profile. The API serves `variable_id` and the
  shared identifier modal reads `variableId`, so the id was `undefined` at every use: the option
  value was empty while the option TEXT still rendered "ISIN" (which is why the select *looked*
  correctly filled), the ISIN validator was skipped entirely (hence no format error either), and
  `canSave()` was `false` forever. New `toGlobalVariables()` normaliser in
  [data.model.ts](src/app/shared/models/data.model.ts), applied at both loaders.
  - ⚠️ **Deliberately NOT normalised inside `vaultGetGlobalVariablesByCategory`.** 12 call sites
    already map `variable_id` themselves (`modal-asset-add`, `modal-service-add`, the four
    `modal-*-state` modals, `system.page`, three document lists…), so a central change would have
    broken every one of them to fix three. The helper's docstring records this.
  - **A third instance the report missed:** the subscription detail's credit-origin map read only
    `variableId`, so `originMap` stayed empty and every row fell through to a hardcoded fallback —
    correct-looking for the seeded origins, `Origin #N` for anything a chain adds later, which
    defeats the point of reading the vocabulary from Global Variables at all.
- **Document upload from the standalone asset-documents page failed 100% of the time**, and the
  **service twin had the identical defect** (not in the report — found by checking the siblings).
  Both called the JSON `*DocumentAdd`; a `File` serialises to `{}` under `JSON.stringify`, so no
  multipart part was ever sent and the API returned `400 cid required (or attach a file)`. Both now
  use the `*AddMultipart` variant the documents *tab* already used. There is no subscription twin.
- **Ten tabbed detail pages changed content width between tabs** — `max-w-6xl mx-auto` removed from
  12 tab-content wrappers (services, subscriptions, documents, dex/venues, messages,
  dex/asset-listings, dex/orders, logs, assets/documents, services/documents); the page's own
  `container mx-auto` already bounds them. Re-measured rather than taken on trust:
  `dex/trades/details` and `documents/shared-details` have **zero** tab blocks, so their constraint
  is a uniform page-width choice and they were left alone, like `profile` and `users/details`.
- **The Messages list now opens on Unread instead of All** — the unread set is the working set; an
  inbox that opens on everything ever received buries what the user came for. `clearFilters()`
  moved in the same edit (signal **and** the imperative toggle write), so Clear returns to the
  opening state rather than becoming the one control that switches you off the default with no way
  back.
- **`MoneyPipe` imported but unused by `ClearingHouseDashboardPage`** (`NG8113`) — the only warning
  the production build emitted, so it trained everyone to ignore a clean signal. Checked the realer
  possibility first: every value on that page is a **count**, and the one numeric binding already
  uses `| number` — no money was rendering raw. Import dropped; **the Vault build is now
  warning-free.**

#### Changed

- **Dashboard section headers are a slate→indigo gradient instead of a flat `bg-gray-600`** — the
  issuer dashboard's 6 card headers (Top Assets by AUM, Latest Transactions and the rest) plus the
  service-provider dashboard's. Matches the Regulator Dashboard, which changed in the same pass.
  The rationale is the same on both: a dashboard is a wall of these bars, and the flat neutral fill
  read as dead space beside the indigo status banner at the top of the same screen. The gradient
  lands on that banner's own `indigo-800` so the page reads as one system, while staying darker and
  duller than the banner so it does not compete with it. The clearing-house dashboard has no such
  headers and is untouched.
- **Both indigo banners and every new gradient carry an `rtl:bg-linear-to-l` twin.** `to-r` is
  physical, not logical, so without it the gradient runs backwards in Arabic and the section title
  lands on the saturated end. Tailwind emits the `rtl:` variant after the base utility, so it wins
  on source order (both are single-class specificity) — confirmed in the built `styles-*.css`.
- **The page header bar carries a grey-tone gradient** —
  `linear-gradient(to right, #3b4453, #566175)` on the shared `<app-header>`'s `ion-toolbar`,
  replacing the flat `#4a5568`, with the `to left` twin under `[dir=rtl]`. Grey rather than the
  dashboard's slate→indigo on purpose: this bar sits above every page, so it is chrome and must
  stay background. The stops straddle the old value (midpoint ≈ `#485264`) so it reads as the same
  header. `--border-color` went to `transparent` — it had been matched to the flat fill purely to
  hide the bottom rule, and against a gradient a solid line shows through.
- **The sidebar's typography now matches the Permissioning Admin's menu** — `ion-label` at
  `0.875rem` / weight 400, plus greyscale font smoothing, scoped to `ion-menu`. The family was
  never the difference (all three apps resolve to Inter); Ionic's `ion-label` default of `1rem`
  under the platform's subpixel smoothing was. **`font-family` is deliberately NOT set here** — the
  Arabic stack (`html.lang-ar` → Noto Kufi Arabic) reaches the menu by inheritance, and a direct
  rule would beat it and drop the Arabic sidebar to a fallback face.
- [docs/frontend-standards.md](../../../docs/frontend-standards.md) updated in the same pass:
  Standard 4 codified the flat `bg-gray-600` card header, and the app shell (page header bar +
  sidebar) had no standard at all — it is now **Standard 0**.

### 2026-08-31

#### Fixed

- **Holders at Block showed every custodial holder as `0`, with a `Total balance 0` footer.** The
  cause was entirely server-side and is fixed there — both APIs' `holders-at` / `balance-at` read
  `balanceOfAt`, which checkpoints the ERC-20 holder of record; under custody that is the CUSTODIAN,
  so every subscriber read zero. They now use `ownedAt`, the record-date entitlement read. **No page
  change was needed** — reload and re-run the snapshot. Noted here because the symptom was
  exclusively visible on this tab, and because the page's own comment named the old primitive
  (*"Driven by ITarmiizAsset.balanceOfAt"*) and would have sent the next reader the wrong way. See
  [Phase 25.4](../../../Docs/rules/phases/code-fix-phase-25.md).
  - Worth knowing for the export feature built on this tab: every evidence pack produced from a
    custodial asset before 2026-08-31 carries zeroes. Re-export.

- **Asset detail tabs no longer change width when you switch between them.** Information,
  Compliance and Metadata carried `max-w-6xl mx-auto` on their content card while Overview,
  Holders, Transactions, Services, Price, Documents, Distributions and Holders-at-Block did not —
  so the card visibly jumped narrower on three of eleven tabs. All eleven now share the page's own
  `container mx-auto` and nothing else.
  - ⚠️ **The same mixed pattern is still live on ten other tabbed detail pages** — services (2 of
    10 tabs constrained), subscriptions (1 of 7), dex/venues (1 of 5), documents (1 of 6),
    messages (2 of 3), dex asset-listings / orders, logs, and the three per-owner document detail
    pages. Left alone deliberately: this pass fixed the page that was reported. `profile` and
    `users/details` are NOT in that list — they constrain every tab, which is uniform and
    therefore a choice, not this defect.

#### Changed

- **The asset detail's `Registration` tab is now `Compliance`, and is four left-rail sub-tabs
  instead of one 280-line scroll** — Info / Declaration / Documents / Class parties, extracted from
  [details.page.html](src/app/pages/secure/assets/details/details.page.html) into
  [compliance-tab.component.ts](src/app/pages/secure/assets/details/compliance-tab/compliance-tab.component.ts)
  on the `documents-tab` precedent. The approval pill, the rejection reason and the Refresh control
  sit ABOVE the rail because the approval state governs every pane.
  - Renamed for accuracy, not taste: by the time an operator reaches this tab the asset IS
    registered (`registerAsset` ran and left it in `approvalState 1`); what is outstanding is the
    declaration, the evidence and the parties. **Only display strings moved** — the `activeTab()`
    key, the API routes (`/assets/:address/class`, `/declaration`, `/composition`, `/parties`) and
    the contract functions all keep saying `registration` / `assetClass`. The Declaration pane
    labels its first section "Compliance profile" so the narrower on-chain sense of that word stays
    visible where it is the one that applies.
  - i18n namespace `assets.details.registration.*` → `assets.details.compliance.*`, moved wholesale
    in both locales (79 keys each, en/ar verified at parity).
- **"Requirements in force" answers the question it is asked.** Its `State` column was
  `Required` / `Optional` — *is this demanded of me* — and never said whether it had been done, so
  the operator's actual question had no answer on screen. `State` → **Obligation**, plus a new
  **Status** column derived client-side, mirroring `approveAsset`'s three checks exactly: the
  wrapper's id is non-zero, and every role-implying row has an ACCEPTED party. A `Missing` row
  carries a **Resolve** link that jumps to the pane that fixes it.
  - The other evidence rows (Insurance evidence, SPV documentation, Concentration limits, Debtor
    verification) report **"Held off-platform"**, deliberately not a tick: the legal wrapper is the
    only evidence field with an on-chain slot, and `approveAsset` does not check the others.
  - The four-layer provenance blurb is replaced. `Classes.assetRequirement` returns a bare `uint8`
    with no source field and the regulator-override layer has no getter, so `Origin` is a two-value
    inference (`Composed by us` / `Policy`) and now says only that.
  - A lone baseline row is labelled as the complete answer — for a Fund or an Equity that is the
    CORRECT rendering (`AssetClassLib.defaultRequirement` makes requirement 1 Required for every
    class and Off for everything outside the class's own list), and unexplained it read as broken.

#### Added

- **Shared `modal-document-picker`** — pick one of an owner's documents, with **Upload New** inline
  (it reuses the existing `ModalDocumentAddComponent` + multipart upload and auto-selects the
  `documentId` off the 201). The legal-wrapper field was a bare `<input type="number">` and the
  Documents tab never rendered an id anywhere, so the number was only learnable out of band; it is
  now a read-only `{title} (#id)` row plus **Choose Document**. Keyed by `resourceType` +
  `address`, so service and subscription surfaces can use it unchanged.
- **Shared `modal-party-picker`** — Class parties took a free-text `0x` box, so both of
  `Classes.attachParty`'s refusals (right party class; independence for every role but Servicer)
  were discoverable only by trying. It lists `GET /asset-class/providers?role=`, where the server
  has already applied both, so every row offered is attachable. One button per role replaces the
  address box + role select.
- **The two compliance-profile fields the Vault could never declare.** `saveDeclaration` hardcoded
  `eligibleJurisdictions: []` and never sent `requiredClaimTopic` / `requiredClaimLevel`, though
  `declareAssetCompliance` accepts all three and the **Regulator Dashboard already displayed
  them** — so an issuer could not restrict a jurisdiction or require a claim at all, and the
  regulator's view of both was permanently empty. Declaration now carries a jurisdiction chip
  picker (empty = all) and a claim-topic dropdown over the `Claim Topic` Global Variables catalog
  (`bytes32(uint256(id))`, matching `ITarmiizIdentity`'s `TOPIC_*`) with its level.
  - A stored topic outside the catalogue is shown raw, locked, and **preserved on save** — mapping
    it to "None" would silently clear a live restriction on the next unrelated edit.

### 2026-08-30

#### Removed

- ⚠️ **THE MARKET-SCOPE PICKERS ARE GONE FROM THE DEX SURFACE (V36).** This was not dead code: the
  place-order modal, the deal-terms modal and the RFQ-create modal each rendered a LIVE control the
  user chose from, and the Entity API discards the value. A control that silently throws away a
  choice is worse than no control — it tells the user they decided something.
- The same field was read across ORDERS (list column, details, exports), TRADES (details badge,
  exports, **and the scope FILTER**) and RFQ details. `market_scope` is a dropped column, so every
  one of those reads was `undefined`: the filter matched nothing whichever scope was picked, the
  badges rendered a blank tier, and the exports wrote an empty column. `marketScope` /
  `marketScopeName` are removed from all four `data.model.ts` interfaces so the compiler enforces it.

  There is ONE book per (asset, venue) and the reach of an order IS its venue’s tier on that
  listing, read live at settlement; a per-ticket scope could only ever contradict it.
  `availableScopes()` is KEPT in the place-order modal — it still answers "may this venue trade this
  asset at all" by running the five gates. What it no longer does is offer a choice.

#### Changed

- **The deal-suspension explainer now describes what actually happens.** It said a suspension
  "blocks acceptance and the venue’s approval only" — true of the RETIRED flag. A regulator now
  HOLDS THE DEAL’S COMMITMENT LEGS, enforced one layer lower at settlement, so it covers every path
  the trade could be crossed on. The old wording understated the intervention AND named an approval
  step that no longer exists (settlement is permissionless once both sides have agreed and funded).
  en + ar.
### 2026-08-29

#### Added
- **Straight-through transactions (Phase 21)** — on a fund-style service a cash-in IS a purchase of units and a cash-out IS a redemption, and the Vault can now drive both as one step.
  - **Service detail → a "Straight-Through Transactions" row** with an Enabled/Disabled pill and an Enable/Disable action (`systemFunctionEnabled('service-straight-through')` + `role !== 3` + `entityActive`, confirmed through the shared `AlertService`). Token-issuer services only. It writes the service's ON-CHAIN metadata, which is why it confirms rather than toggling silently.
  - **Deposit modal → an optional "Buy with deposit" section**, rendered only when the service has declared the mode and opt-in per call even then. Asset picker filtered to credit-settled assets settling in the deposited currency (the API 400s a mismatch, so offering one would be a picker whose every choice fails), with a current-ask / estimated-tokens / residual-cash preview **labelled as an estimate** — the API re-resolves the price when the purchase actually runs.
  - **New `modal-sell-withdraw`** on the subscription detail page (asset, tokens, payout instrument hash, reference, optional minter of record). Its copy says **requested**, never *withdrawn*, and it carries an explicit amber notice: this redeems the units and OPENS a withdrawal request; the money moves when the request is fulfilled. Reporting a payout at the moment a claim was held is exactly what the request/fulfil split exists to prevent.
  - **Partial success is reported as its own outcome, not as success.** A combined verb can land leg 1 and fail leg 2, so the page distinguishes three endings per verb — both legs done, leg 1 done with the cash/proceeds safely on the claim plus the error, or a plain failure. `_creditMutation` forwards `buyError` / `withdrawError` for that reason; dropping them would turn a partial into a silent full success.
  - `straightThrough` added to the service-detail metadata editor's RESERVED set and to the shared `metadata-edit-modal`'s key rejection. Unlike `sp` it needs no client-side re-attach (the API carries it forward) — it only has to stay out of the flat KV editor, where a typed `true` would be written back as the STRING `"true"` and read as OFF.
  - `Service.straightThrough`, `vaultSetServiceStraightThrough` / `creditDepositBuy` / `creditSellWithdraw`, the `service-straight-through` System Function label, and 54 i18n leaves in **each** of en + ar (key sets verified identical — a missing `ar` leaf renders the raw key path, there is no English fallback).

#### Changed
- **[CLAUDE.md](CLAUDE.md)'s Mode-7 (Clearing House) dashboard bullet caught up with the cycles
  retirement** — it still promised a pay-in board, cycle counts and the `net < 0` filter rule; the
  shipped dashboard renders delivery/member/approval/unread counts, and the page's own comments
  record why (netting is continuous, the cycle mirrors are dropped). The open gap is the
  margin-coverage board that replaces the pay-in board. Found by the 2026-08-29 analytics-catalog
  schema survey; tracked as Phase 24.5 in the platform code-fix plan. No code changes.

### 2026-08-27

#### Changed
- **Internal rule-spec notation removed from user-visible copy** — `Registration (A8)`,
  `Requirements you compose (A24)`, `Class parties (A2)`, and the Add Asset wizard's
  *"The A1 class this asset belongs to"*. 7 strings here (en + ar); 13 platform-wide with the
  Regulator Dashboard. Code comments keep the notation on purpose. Now
  [Standard 5.5](../../../docs/frontend-standards.md).

#### Fixed
- **"What the approval checks" on the asset Registration tab rendered as three bare ✓/✗ marks with
  invisible labels.** The `<li>` text inherits its colour and the inherited value here is
  near-white; only the tick/cross `<span>` carried an explicit `text-green-600` / `text-red-600`,
  so the marks showed and the sentences beside them did not. Added `text-gray-700` to the parent
  `<ul>` ([details.page.html:449](src/app/pages/secure/assets/details/details.page.html#L449)).
  The i18n keys were verified present and populated in **both** locales first — this was never a
  missing-translation bug, which is the other way this failure mode presents.
  - Same class as the Connect To-picker / Add-participants defect: any text placed on an
    unstyled container in this app inherits an invisible colour. Scanned the rest of the
    Registration block for siblings — these three `<li>`s were the only ones.
  - Only became visible once the Entity API's `.result`/`.data` defect was fixed the same day (see
    that repo's CHANGELOG); before it, the whole tab was an empty state and the invisible labels
    were unreachable.
- **The election table told the ENTITY that its regulator had declined a request the entity had
  never made.** The Pending-request cell branched on `lastActorKind` — *who made the last election
  transition of ANY kind* — and rendered that as a verdict on the last pending REQUEST. They are
  not the same question. A DECLARE is a regulator act, so a freshly declared election read
  "Declined by the regulator" from the moment it existed: measured live on service
  `0x1966f613…` / currency 818, the row carried that accusation for 53 blocks before any request
  had been made. A SUCCESSFUL approval zeroes `requested` too, so an approval ALSO rendered as a
  refusal. The cell now branches on the Entity API's new plugin-derived `clearedByKind`, which is
  populated only when a pending request was genuinely cleared and NULL on every other transition —
  so `unknown` means "nothing was cleared" and the template correctly falls through to the bare
  em-dash ([details.page.html:453](src/app/pages/secure/services/details/details.page.html#L453)).
  - **`lastActorKind()` is KEPT beside the new `clearedByKind()`**
    ([details.page.ts:497](src/app/pages/secure/services/details/details.page.ts#L497)) rather than
    renamed away — it is still the honest answer to "who touched this last", which a future audit
    surface may want. Its comment now says in as many words that it is not the field to render a
    verdict from; deleting it would have left the next reader free to re-derive the same wrong
    branch from the same data.
  - Withdrawing your own request and having it declined remain the SAME on-chain transition, so the
    ACTOR is still the entire signal — that half of the original design was right, and both
    branches (`regulator` ⇒ Declined pill, `entity` ⇒ "withdrawn by you") are otherwise unchanged.
  - **Of the two surfaces carrying this defect, the Vault was the worse one.** The Regulator
    Dashboard twin showed a regulator a wrong label on its own act; this page showed an entity an
    accusation about somebody else.
- **The same cell's copy was HARDCODED ENGLISH** — four strings with no `| translate`, on a page
  where everything around them is keyed, while the Regulator Dashboard twin had been i18n'd from
  the start. An Arabic tenant read the entire verdict in English. Added an `election` block
  (`awaitingRegulator` / `declinedPill` / `declinedHint` / `withdrawnHint`) to **both**
  [en.json](src/assets/i18n/en.json) and [ar.json](src/assets/i18n/ar.json) — the two locales move
  together, per the standing rule that a missing `ar` leaf renders the raw key path with no English
  fallback — and the template now reads the keys.

### 2026-08-24

#### Fixed
- **The Add Asset wizard could not be completed — Next stayed disabled on step 1 no matter what was selected, so no asset could be created at all.** `supplyMode` kept `Validators.required` and its place in `stepFields[1]` after its PICKER was removed from the step (the asset class fixes the supply model, A5), so the control could never be satisfied. Nothing rendered an error either: a disabled Next with every visible field filled reads as a UI glitch, not a blocked form. The same omission silently hid the **Initial Supply** input, which renders on `isFixedSupply`.
  - The class now DERIVES the supply mode from a map mirroring the Assets Registry's `AssetClassLib.supplyModeFor` — the authority, since `Assets.create` refuses a mismatched pair, so a wrong value is a revert rather than a preference. Verified against the on-chain `Asset Class` category: ids 1-11 match the contract constants exactly.
  - Non-Custom classes show the derived model **read-only** (a picker could only offer ways to build a reverting transaction); **Custom (11)** is the one class that genuinely lets the issuer choose, so it gets the select and `required` blocks Next until they pick. An unknown class id — the category is on-chain and extensible — is treated like Custom rather than guessing.
- **The Price Mode hint still described the RETIRED Single / Bid-Ask meaning** while the dropdown had already been corrected to Fixed-priced / Market-priced (V30). Both vocabularies use 1 and 2, so the stale hint rendered plausibly over a different meaning — exactly the trap the component's own comment warns about. `step1Intro` likewise still said "asset standard and supply mode" though the standard radio is gone.

#### Changed
- **Every election surface displays On-Chain / Off-Chain instead of `onc` / `offc`** — `electionLabel()`, `payRoleLabel()` (which also names the election each role belongs to, since the pay-role ids are INVERTED relative to the election ids), the election tab header and prose, the switch modal's title and both radio labels, and the System Function label. en + ar moved together.

### 2026-08-19

#### Changed
- **`tokenType` + `assetType` -> `assetClass`** across the model, both read paths, service detail and
  the public view. The Add Asset wizard lost its STANDARD step (8 -> 7: `tokenType` chose between the
  T20 and T3643 factories, and there is one factory now) and its class dropdown reads `Asset Class`.
- **`priceMode` labels corrected for a MEANING change** (V30: 1 = Fixed-priced, 2 = Market-priced —
  NOT the old Single / Bid-Ask pair, which described the shape of a QUOTE). Both vocabularies use 1
  and 2, so the stale labels rendered plausibly over a different meaning.
- The create payload drops the `|| 0` fallback: class 0 is invalid, not "unspecified".
- The Cycles + Pay-ins tabs and the three cycle client methods are gone with the cycle family.

### 2026-08-13

#### Added
- **Asset detail → Identifiers section** — security identifiers (ISIN, …) on the Metadata tab, with Add / Edit / **Remove**, backed by the Entity API's new `PUT`/`DELETE /assets/:address/identifiers`. A section rather than a tab of its own: one identifier is the expected case. The ID Type picker reads `ID Type - Asset` from Global Variables (never a hardcoded list) and Add offers only unheld types, since the array holds one entry per type and offering a held one would look like a second slot while silently replacing.
  - **No Bound / Out-of-sync pill here, unlike the entity tab** — nothing is bound on-chain for an asset, so there is no second half to disagree with. For the same reason **Remove exists** where the entity tab has none: the entity's contract is REPLACE-never-release, which is not a constraint on a plain metadata edit.
- **An optional ISIN field on Add Asset step 3**, hidden entirely when the `ID Type - Asset` category is not seeded (there would be no `idType` to submit). Optional because an ISIN is frequently assigned *after* issuance — the detail page is the primary path. The type id is resolved by NAME from Global Variables.
- `vaultSetAssetIdentifier` / `vaultRemoveAssetIdentifier` in [api.service.ts](src/app/shared/services/api.service.ts); `asset-edit-identifiers` label + en/ar leaves.

#### Changed
- **`modal-entity-identifier` promoted to [shared/components/modal-identifier/](src/app/shared/components/modal-identifier/)** and now serves both the entity profile and the asset detail page. Nothing in it was ever entity-specific — its input already took the ID-type vocabulary from the caller — so a near-identical copy would have been pure future drift. Gained an optional `showReason` (the asset write is a plain metadata edit with nowhere to record one) and a per-type placeholder example. Its i18n moved to a neutral top-level **`identifiers.*`** namespace in en + ar; the page-scoped keys stay under `profile.identifiers.*`.
- **[identifier.utils.ts](src/app/shared/utils/identifier.utils.ts) gained ISO 6166** (`isValidIsin` + branches in `validateIdentifierValue` / `normalizeIdentifierValue`), kept byte-equivalent to the Entity API's `identifiers.js`. ISIN is Luhn mod-10, structurally different from the LEI's MOD 97-10 — and the easy way to get it wrong is to alternate over the original 12 characters instead of the expanded digit string.
- **`identifiers` added to the asset detail page's `RESERVED` set** so it never also renders as raw JSON in the Additional Fields table, and to the reserved-key REJECTION in both the shared [metadata-edit-modal](src/app/shared/components/metadata-edit-modal/) and the Add Asset wizard. **Both reject `isin` too** — that is what people typed before the field existed, and the wizard's step-3 hint used to suggest it. That hint no longer names ISIN.

### 2026-08-12

#### Added
- **Entity Profile → Identifiers tab** ([pages/secure/profile/](src/app/pages/secure/profile/)) — a fourth tab where the admin records the entity's identifiers (LEI, commercial registry, tax id …) against its own on-chain identity, via the Entity API's new `GET`/`PUT /entity/identifiers`.
  - **Each row shows BOTH halves**: the readable value and the on-chain hash, with a Bound / **Out of sync** / Not bound pill driven by the API's `matches`. The amber out-of-sync state is the point — a regulator-driven rotation or a metadata blob edited elsewhere leaves a displayed value that no longer hashes to what the identity holds, and rendering it as a confident value would be a lie. A row bound on-chain with no readable copy shows a "Hash only" chip rather than vanishing.
  - **The ID Type picker reads `ID Type - Entity` from Global Variables**, never a hardcoded list — the Regulator Dashboard's rotation modal hardcodes the *Individual* vocabulary on an entity-only feature, and that mistake is not copied here. The Add picker offers only types not yet held, since the chain holds one hash per type and offering a held one would look like a second slot while silently replacing.
  - **The type is immutable when editing.** Rebinding a value under a different type is not an edit — on-chain it would leave the original hash bound under the original type and add a second one.
  - New `modal-entity-identifier` pair following the local `modal-profile-metadata-edit` shape: promise-returning service, `OnPush`, no backdrop dismiss, and the open-effect reset wrapped in `untracked()` (the body writes form state while the effect tracks `isVisible`, so reading those writes back would loop it and hang the page).
  - Gated on `systemFunctionEnabled('entity-edit-identifiers')` + `entityActive`. A partial save (hash bound, readable value not stored) surfaces its own alert rather than reporting success over a half-written state.
- **[shared/utils/identifier.utils.ts](src/app/shared/utils/identifier.utils.ts)** — client-side ISO 17442 LEI validation (MOD 97-10) + normalisation, the browser half of the Entity API's `src/services/identifiers.js`. **Keep the two in step**: the client copy rejects a bad value before a transaction is signed, the server copy is the boundary, and drift makes the page either block a value the API accepts or admit one it rejects. Upper-casing on save mirrors the server exactly, because the hash is case-sensitive.
- `EntityIdentifier` model; `vaultGetEntityIdentifiers` / `vaultUpdateEntityIdentifier` in [api.service.ts](src/app/shared/services/api.service.ts); `entity-edit-identifiers` in `SYSTEM_FUNCTION_LABELS` + `profile.identifiers.*` / `profile.tabs.identifiers` in **both** en and ar.

#### Changed
- **Party-type renumber: Clearing House is `spType` / `partyType` 4.** Touches the SP-add modal (option value + `loadOptions` branch), the service-add modal (`curatedAddresses(4)`), the clearing-house picker modal, and the service detail page's party badge + detach label. The Data Provider is retired platform-wide, which is what makes the band contiguous 1..4 — the Vault's numbering, the curated `sp_type`, and `ServicePartiesLib`'s on-chain roles are now literally one enum.
- **The Add Service provider-type dropdown filters to the registrable band.** `loadProviderTypes()` reads the `Regulator Party Type` category live off the chain mirror, so the new Consultant(5) / Appraiser(6) catalog entries would have appeared as selectable options whose submit reverts (`ServiceTemplate.initialize` rejects anything above 4). Bounded by a named constant with a comment saying when to widen it.
- `PROVIDER_TYPE_NAMES` on the service-provider dashboard drops Data Provider, moves Clearing House to 4 and names 5/6 so the chip stays readable if either is ever given a registration path.

#### Fixed
- **`_replaceServiceParty` had no clearing-house branch, so a type-4 replace read the CUSTODIANS bucket** and detached custodians instead. Pre-existing (it predates clearing houses being replaceable) — surfaced by the sweep, fixed here. [api.service.ts](src/app/shared/services/api.service.ts).

#### Removed
- `'Data Provider'` + `'Data Provider Endorsement'` from the Activity Logs category filter.

### 2026-08-11

#### Added
- **A purpose-built Clearing House home (entity mode 7)** — `pages/secure/dashboard/clearing-house/`, picked by a third branch on the `dashboard` route. A CCP landed on the generic service-provider dashboard, which shows a service portfolio and provider-type chips and answers none of the questions a clearing house has: the page now leads with the pay-in board (who owes fiat on a closed cycle, and the latest settlement they have actually sent on that pair), cycle counts, deliveries ready / held / past-deadline, and member counts including pending admissions. Read-only by construction — every write lives on the Clearing page, so this links there rather than duplicating gated buttons.
  - **`FeaturesService.isClearingHouse()`** is deliberately a MODE check, not `menuEnabled('clearing')`: `clearing` is allowed under mode 1 too (a Token Issuer that is a clearing MEMBER legitimately enables it), so keying the home page on the menu key would hand an issuer the CCP dashboard. The route checks it BEFORE `isServiceProvider()` — a clearing house is one.
  - **When the Clearing module is toggled off the page renders none of it** and shows a nudge naming User Management → Menu Settings. A dashboard that ignored the toggle would be a backdoor around the admin's own visibility control — and this is the exact confusion the trap causes (`clearing` ships `defaultEnabled: false` and `seedMenuConfig()` runs before `seedAppConfig()`, so a fresh mode-7 tenant always needs one manual toggle).
  - ⚠ The settlement shown against a pay-in is evidence on the PAIR, not "this cycle's settlement" — a position is a multilateral snapshot, a settlement discharges the bilateral running net, so the amounts are not expected to match and **no delta is rendered**. Same rule as the Clearing page's board.
- **A Credit Settlement column on the Clearing page's pay-in board** (state pill, amount, wire ref, receipt link behind `view-documents`), and `confirmPayIn` now warns when the credit ledger holds no record of the member sending anything. A **warning, not a gate** — a member may legitimately wire outside the platform, and refusing would strand the cycle.

- **Time in force on the Place Order modal** — a Good-till-cancelled / Expires-at radio pair plus a `datetime-local` input, defaulting to GTC so an operator who ignores the control gets exactly the behaviour every order had before. The deadline is entered in LOCAL time and converted to unix SECONDS for the API (**not** the milliseconds the order row reports back — the two units meet on this one feature). Inline validation shows the refusal before submit rather than as a chain revert, and the review step names the choice.
- **An Expire action on the DEX Orders list**, shown once an order is still live and its clock has run out. It carries the viewer gate but **no ownership check and no System Function**, because the chain entrypoint is permissionless and the escrow returns to the order's own subscription whoever calls — gating it would only strand capital when the owner is absent.
- `DexOrder.expiresAt` (MILLISECONDS on the mirror row — render with `utils.formatTime`, never `formatDate`; **0 = good-till-cancelled, not epoch 0**), `vaultDexExpireOrder`, the `Expired` order-status label, and en + ar i18n for all of it. Production build clean.

#### Fixed
- **`PROVIDER_TYPE_NAMES` on the service-provider dashboard stopped at 4**, so a clearing-house service was counted as "OTHER" in the Provider Types chips while the table row below it read "Clearing House" (that one comes from the server's `provider_type_name`). Added `5: 'Clearing House'`.

### 2026-08-10

#### Added
- **Venue fees moved to the DEX venue detail page's Assets tab — the surface the venue operator actually has.** The only fee control in the app lived on the SERVICE detail page's Assets tab, which is fed by a join on `asset_services` (the T20 **distributor** registration). A pure DEX venue registers as a distributor of nothing, so that tab is empty for it — meaning the button was unreachable for **exactly the operators who host foreign assets and charge for hosting them**. The venue detail page's Assets tab is fed by `dex_asset_venues`, the table that actually knows what a venue hosts, so the controls belong there. Nothing was removed from the service page; it keeps the distributor's own per-asset fees.
- **A per-row effective-fee column with a three-state Override / Inherited / None pill.** Two states would have been wrong: an explicit all-None override means "this asset is FREE on my venue" and is a decision, not an absence — collapsing it into the same rendering as an unset default would hide the difference between a deliberate waiver and a listing nobody has priced. Plus per-row **Edit fees** and **Reset to default**.
- **A "Default fees" header action** editing the service-level slot (`GET`/`PUT /services/:service/fee-config`). Deliberately in the header rather than in a row: the default is a property of the SERVICE, and offering it from any one asset's row would read as "make this asset's fee the default", which is not what it does. One write now covers every un-overridden listing — before the default slot existed, a venue hosting N assets needed N transactions and an unpriced listing traded free with no error.
- `mode: 'default' | 'asset'`, `inherited` and `isSet` on the shared fee-config modal. **When an asset currently inherits, the form pre-fills from the default but Save stays DISABLED until something actually changes** — otherwise opening an inherited row to look at it and clicking Save would silently PIN an override, turning the whole inherit feature into a footgun on the first click.
- en + ar i18n leaves for all of the above (a missing `ar` leaf renders the raw key path — there is no English fallback). Production build clean.

#### Fixed
- **The DEX Offerings page rendered the asset and the venue as raw hex addresses.** Every other DEX list resolves both to names, so the one page where an issuer decides whether to open a public issuance was the one page that made the reader diff two 42-character strings to know what the offering is FOR and WHERE it runs. `DexOffering` gained `assetName` / `assetSymbol` / `dexServiceName` / `dexServiceEntity` / `dexServiceEntityName` / `currencyName`; the Asset cell is now the platform's name-over-symbol two-line form and the Venue cell is name-over-operator, each falling back to a truncated address so an unresolvable party still shows something clickable-to-copy rather than an empty cell. The buy modal's asset line follows, and gained the venue it was silently missing — confirming a purchase against an offering whose venue is invisible is exactly the wrong place to withhold that.
- **The fee-config modal's Save button was permanently dimmed — the Value and Bearing inputs never rendered.** [modal-service-fee-config.component.ts:48-49](src/app/pages/secure/services/modals/modal-service-fee-config/modal-service-fee-config.component.ts#L48-L49) derived the two mode mirrors with `computed(() => Number(this.form.controls.buyFeeMode.value) || 0)` — a **`computed` over a reactive-form value, which is not a signal**. With no signal dependency there is nothing to invalidate the cache, so it evaluated once and froze at whatever the first open happened to show. The template gates the Value + Bearing inputs on `buyMode() !== 0`, so after any open that started at None those inputs never appeared again — for the per-asset override and the venue default alike, since both share the one component instance on the page. Picking "Bps" then left `buyFeeValue` empty with no way to fill it, `validateSide(1, '')` returned "Value must be greater than 0", and `isValid()` was false forever. Now plain `signal(0)`s, set from the existing mode-control subscriptions and re-seeded in the open effect.
- **`dirty` flipped true on open, defeating the inherited-row guard.** The open effect's `form.reset(...)` emitted `valueChanges`, which the constructor's subscription reads as an operator edit — so the "an inherited row needs an actual edit before it can be saved" rule from the same day's work never actually held. Both resets now pass `{ emitEvent: false }`; a pre-fill is not an edit.
- **The Default fees modal rendered a headless title** — `Service Fees — ` with an empty symbol, because `mode: 'default'` passes `assetSymbol: ''` into a title interpolating `{{symbol}}`. New `defaultTitle` leaf (en + ar), branched on `isDefaultMode()`.

#### Changed
- **The venue create modal lost its settlement-mode radio group** and `vaultDexVenueCreate` lost the argument, following the field's retirement on chain. There is nothing left for the operator to choose: whether the venue can run a native P2P book is DERIVED at `venueCreate` from whether the service has a registered payment processor, so the question the radio asked was already answered by the service's own configuration — and a mismatched answer was the only thing the input could add.
- **The venue detail pill became a DEX / Exchange pill driven by `allowP2P`** — the same distinction the retired enum was trying to express, read off the field that is derived rather than declared.

### 2026-08-09

#### Removed
- **The per-offering Fills expand on the DEX Offerings page.** A tap fill IS a transaction: `DEXOfferLib.tapFill` calls `subscribe` on the asset, which writes an Assets-registry Transactions row (type `subscribe`, `data = "offering"`, attributed to the venue service) alongside its credit withhold + settle legs. Those rows already render on the **Transactions** page for both the venue operator (own service) and the issuer (own asset), so the Fills sub-table restated the same events in a second place — one nobody would think to reconcile against, and the only one of the two that a user had to expand a row to find. Gone with it: the `dexOfferings.viewFills` / `hideFills` / `fills.*` i18n leaves (en + ar), the `DexOfferingFill` model, and the now-callerless `vaultDexOfferingInfo`. The Entity API's `GET /dex/offerings/:key` is untouched.
  - **Not carried over:** the fill's `gross` / `venueFee` / `netToIssuer` split and its per-offering `fillId`. A transactions row carries tokens / price / total; the venue's fee leg is a separate `credit_transactions` row. If the split is wanted back, it belongs as a column on a transactions surface joined via `dex_offering_fills.asset_trx_id`, not as a parallel table.

#### Fixed
- **Settlements: the debtor's Confirm Sent / Cancel buttons were invisible after a page reload**, and its own outgoing settlements were labelled *Incoming* against its OWN address. `AuthService.entityInfo` is an in-memory field written only by `login()` and `refreshEntityState()` (which runs from the two dashboard pages), so a reload kept the stored session but dropped our own address — `isDebtor()` / `counterpartyOf()` then answered "not us" for every row. New `AuthService.ensureEntityInfo()` (idempotent, coalesced, one fetch per reload) is awaited before `selfEntity` is read.

#### Added
- **A Receipt column on the Settlements tab, on BOTH sides of the wire.** Only the Regulator Dashboard had one, so neither the debtor that uploaded a receipt nor the creditor that has to accept it could tell from the settlements table whether a receipt was attached, let alone see it. The pill carries an eye glyph and **opens the file itself in a new tab on click** — deliberately not a link to a document detail page: a settlement records only the receipt's CID, so there is no `(owner, documentId)` pair to route to, and the API resolves it per side (own document for the debtor, inbound share for the creditor) and streams the bytes. Wrapped in `view-documents`; without the key it renders as the plain non-clickable "Attached" pill, matching the Regulator Dashboard.
  - Receipts pinned before 2026-08-09 are the legacy `tarmiiz-settlement-receipt-v1` JSON envelope, so they open as JSON rather than the PDF/image — a CID is immutable on chain, so this is unavoidable for the already-pinned ones.
- **Settlements shows counterparties by NAME.** A counterparty is by definition a foreign entity, so the local mirror has no name for it and all three tabs rendered bare 0x addresses — on the one page whose job is saying who owes whom. Resolved through the Directory (chain-backed, so it answers for any party) and cached per address; an unresolvable address still renders as the address, in mono.
- **The DEX venue detail -> Assets tab is no longer read-only.** It gains a **Hosting** column (the venue's own leg on each pairing, rendered with the shared state pill) and an **Actions** column: **Accept** (from Initiated), **Halt** / **Resume** (with a reason modal), and **Remove** — labelled *Reject* while the pairing is still awaiting consent, since it is the same call. Each button carries `role !== 3` plus its own System Function key (`dex-venue-asset-accept` / `-halt` / `-remove`). Before this a venue operator could see which foreign assets were listed on its venue and do nothing about any of them.
  - The halt reason needs a text input and `AlertService.show` only returns a boolean, so it uses an inline modal mirroring the page's existing add-member one.
- **The asset-listing detail -> Venues tab gains a read-only Hosting pill**, beside the existing Regulator Approval pill. Without it a pairing stalled on the venue looks identical to one stalled at the regulator, and the issuer has no way to tell who to chase.
- `hostState` / `hostHaltReason` on `DexAssetListingVenue`, three `vaultDexVenueAsset*` API methods, and en + ar i18n (a missing `ar` leaf renders the raw key path).


#### Added
- **Buy from an offering** — a **Buy** action per row on DEX → Offerings, opening the page's inline-modal pattern with a subscriber picker, an amount field, a live total-cost preview, and the offering's asset / price / remaining pinned above it. Posts to the new `POST /dex/offerings/:key/fill`. This is the counterpart to Create Offering: an issuer could open a tap and a regulator could approve it, but nothing in the Vault could BUY from one — the only filler on the platform was the Token Exchange, signing as the subscriber's own identity, which left a brokerage unable to buy for a client at all.
  - **Deliberately NOT gated to the brokerage entity mode.** Buying for a client is the brokerage's defining act, but the endpoint admits any entity whose subscription is admitted at the venue — a token issuer taking another issuer's new issue for its own subscribers is legitimate, and a mode gate would hide it with no on-chain rule behind it. Gated on `role !== 3` + `systemFunctionEnabled('dex-offering-fill')` only.
  - **The offering is chosen by the ROW, not a second asset picker.** An asset picker can offer an asset with no live offering — a state the user cannot act on. Picking the row makes "select the asset" and "select the offering" the same act.
  - `buyError()` mirrors the API's pre-checks (remaining / `minFill` — waived on the exact remainder, as on-chain / `maxPerSubscription`) so the limits are shown before a round trip; the server re-checks and the contract is the boundary. The subscriber list is filtered to active, unsuspended subscriptions, since the chain rejects the rest.
  - i18n in **both** `en.json` and `ar.json` (a missing `ar` leaf renders the raw key path).

#### Fixed
- **The offering key was unobtainable from the UI.** The DEX Offerings table rendered `shortKey(...)` with the full bytes32 only in a `[title]` tooltip — hover-only, not selectable — and there is no offering **detail** page, so the key appeared in full on no page in the app. It is the one value every offering API call needs, `POST /dex/offerings/:key/fill` above all, which made that endpoint undrivable from here. The cell is now a copy button ([offerings.page.html:35](src/app/pages/secure/dex/offerings/offerings.page.html#L35) + `copyToClipboard` on the page), matching the document CID / SHA-256 cells rather than inventing a new affordance.

### 2026-08-08

#### Added
- **Requests for quote** ([pages/secure/dex/rfqs/](src/app/pages/secure/dex/rfqs/), `/authorized/dex/rfqs/{list,details/:key}`, sidebar item under DEX). The competitive surface, where deals are bilateral: a requester fixes a size and asks a set of dealers for a price. List tabs **To Quote** (open requests we were invited to and have not answered) / **My Requests** (the ones we broadcast, where we award) / **All**.
  - **An RFQ is a FAN-OUT OVER DEALS, and the UI is built on that rather than around it.** A dealer's answer IS a deal ticket, so the detail page loads the quotes through `vaultDexDealsList({ request })` and links each one to its own deal page — no quote model, no quote endpoint, nothing duplicated. **Award is `accept` on the winning child**; `vaultDexRfqAward` exists to check that the named deal really is a quote on this request, not because awarding is its own on-chain verb.
  - ⚠️ **The dealer board is a SEALED AUCTION and the page says so.** The API mirrors every dealer row only for the venue operator and the requester; an invited dealer's tenant gets its OWN row alone. So the counts come from the request HEADER (`quoteCount` / `invitedCount`), never from `dealers().length`, and a non-requester sees an inline note explaining that one row means "all you may see", not "all there was".
  - **Won / Lost / Passed are documented as an off-chain inference.** Fan-out is lazy and a losing quote dies by predicate — every child transition re-reads "is my parent still Open?" — so no contract ever marks a sibling Lost. [rfq-labels.ts](src/app/pages/secure/dex/rfqs/rfq-labels.ts) records that, and also owns `isBetterQuote(side, …)`: "best" is direction-dependent (a buying requester wants the LOWEST offer), expressed once so the best-quote highlight cannot disagree with the board's ordering.
  - **[modal-rfq-create](src/app/pages/secure/dex/rfqs/modals/modal-rfq-create/) has no price field**, deliberately — fixing the size and asking only for price is exactly what makes the answers comparable and the award well-defined; a request that named a price would be a proposal. It refuses to submit with neither invitees nor `openToAll`, because such a request cannot be answered and would simply sit there and expire. **[modal-rfq-quote](src/app/pages/secure/dex/rfqs/modals/modal-rfq-quote/) offers ONE input**: size, expiry, scope and funding are the requester's terms and the contract overwrites anything else, so showing them as editable would imply a negotiation that only begins after the quote exists.
  - Funding is explained where it bites on each side: creating says a Firm request means fewer dealers can afford to answer but any quote you award is already funded; quoting says submitting a Firm quote escrows your capital **now**.
  - Awarding is confirmed with what it actually does — both sides lock regardless of funding, the resulting deal still needs the venue operator's approval, and every other quote stops being acceptable — and the Awarded banner repeats it so "Awarded" is never read as "settled".
  - Four System Function keys (`dex-rfq-create` / `-quote` / `-award` / `-cancel`) stacked on the existing `role !== 3` gate; the quote button additionally hides when we already have a live quote (a second one reverts on chain) or hold no invite on a targeted request. Both pages carry the manual Refresh control — `dex_rfq_*` is plugin-written, so `emitVaultUpdate` drops the scope and nothing pushes.
- **A Negotiated OTC card on the DEX analytics page** ([analytics/dex-secondary](src/app/pages/secure/analytics/dex-secondary/)), sharing the interval selector with the book card above it so the two are always read over the same window. Three panels and only ONE is a chart: the RFQ funnel and the outcome mix are counts and rates, which read better as figures than as pie slices nobody can compare.
  - The chart is settled notional **stacked on one axis**, RFQ-sourced vs bilateral. Stacked rather than dual-axis because both series are the same measure in the same currency, so the total is meaningful and the mix is readable at a glance — a second y-scale would invent a comparison that isn't there. The tooltip adds the deal COUNT per bucket, since two fills of equal height can be one large deal or twenty small ones.
  - **Series colors were validated, not eyeballed**: `#6366f1 / #d97706` clears the lightness band, chroma floor, CVD separation (ΔE 32.2 protan / 29.2 tritan against a target of ≥ 8) and 3:1 contrast against the card surface, in both light and dark. It keeps the app's indigo/amber identity; the amber is one step darker than the `#f59e0b` used elsewhere purely because that step **fails** contrast at 2.09:1. Do not lighten it back.
  - The outcome mix is rows-with-proportion-bars, not a pie — five slices of similar size are exactly what a pie cannot be read for. Only the venue's rejection carries a warning tone: a withdrawn or expired deal is an ordinary result, not a failure, and painting it red would say otherwise.
- **OTC queue cards on the dashboard** — deals awaiting our move, crosses awaiting our venue's approval, RFQs awaiting our quote; each links to its page. Deliberately a **separate row from the stat cards, and every card hides at zero** (the whole row with them): those cards are inventory, these are a queue running against a clock that expires it, and a permanent row of zeros trains the eye to skip exactly the thing that matters when it is non-zero.

#### Fixed
- **Two i18n blocks the deals surface referenced but never had**, found by sweeping every `| translate` key under `pages/secure/dex/` against both locale files:
  - `dex.common.tier1|2|3` — the terms modal's **Market Scope** dropdown has referenced it since it shipped, so its three options read `dex.common.tier1` instead of "Tier 1 — Venue".
  - `dex.deals.side.buy|sell` — the same modal's **Your side** dropdown, and its `ourSideLabel` computed, which is what tells a countering user which way round they are trading.
  Both are additions to `en.json` and `ar.json`; there is no English fallback for a missing `ar` leaf, so the sweep now checks both.

### 2026-08-07

#### Added
- **Negotiated OTC deals — the write path** (Phase 3, on the read surface below). Propose from the list page; counter / accept / decline / withdraw and the venue operator's approve / reject from a deal's own page.
  - **The action bar is driven entirely by `lastMover`** — it names whose quote is LIVE, so the side that owns it may only WITHDRAW, and the other side may counter, accept or decline. You can never act on your own quote (amending means withdraw + re-propose, which is what keeps `lastMover` meaning what it says). Once Accepted neither trader can act at all, so those buttons **disappear** rather than sitting greyed out: only the venue operator or the expiry clock resolves a deal from there, and that is the entire point of the approval step. Which side is ours comes from our own subscription + venue mirrors, not from the deal row — a deal reaches this tenant as trader on either side, as venue operator, or both.
  - **One modal for propose and counter** ([modal-deal-terms](src/app/pages/secure/dex/deals/modals/modal-deal-terms/)), because they set the SAME two fields: a counter moves price and amount and nothing else (side, funding and the expiry clock are all fixed at propose and immutable after). It seeds a counter with the live terms so a price-only move needs no retyping, and shows the % delta against the quote on the table. The propose mode explains `funding` in full — it is the single most consequential choice on the form and cannot be changed later: Firm escrows your side now and re-escrows on every counter you send; Indicative locks nothing and is **subject to funds at acceptance**. `marketScope` defaults to 2, not 1, because a third-party venue can only be paired at tier 2/3.
  - **[modal-deal-reason](src/app/pages/secure/dex/deals/modals/modal-deal-reason/)** covers decline / withdraw / venue-reject and says what happens to the money — every action reachable through it is terminal and RELEASES escrow. A reason is REQUIRED only for the venue's rejection: it ends a deal both counterparties already agreed, which carries a regulatory expectation of a stated reason (it is why the on-chain `DealStatusChanged` event has a `reason` field at all). Accept and venue-approve get no reason box — adding one would imply an approval needs justifying.
  - **Accepting is confirmed with different text per funding mode.** On an Indicative deal the quoter's money is pulled at that moment and the call can revert if they have spent it; that is the honest meaning of indicative and it is said before the click, not in the error toast after.
  - Every write sends the `round` the page rendered, so a counter that landed between render and click returns **409** and the page reloads to the current terms instead of settling on stale ones. All six actions carry a System Function key (`dex-deal-propose` / `-counter` / `-accept` / `-decline` / `-withdraw` / `-venue-decision`) stacked on the existing `role !== 3` gate, and the venue decision surfaces the maker/checker "submitted for approval" fork.
  - After any write the page **reloads rather than patching its signal** — `dex_deals` is plugin-written, so a locally-advanced status the plugin has not mirrored yet is exactly the stale view the Refresh control exists to avoid.

- **Negotiated OTC deals — the read surface** ([pages/secure/dex/deals/](src/app/pages/secure/dex/deals/), `/authorized/dex/deals/{list,details/:key}`, sidebar item under DEX). The order book is anonymous and price-driven; a deal is the opposite — proposed to ONE named counterparty, counter-able by either side, accepted by one, then approved by the **venue operator** before it crosses. The write path (propose / counter / accept / decline / venue-approve) is Phase 3.
  - **The list has three tabs because a deal reaches this tenant in three different roles**, and one merged table buries the only two that are actionable: **My Turn** (still Proposed with the live quote on the side we do NOT own — you may never counter your own quote, so "our turn" is exactly "we own the other side"), **Venue Approvals** (Accepted deals on a venue we operate, ordered by the approval deadline), and **All**.
  - **The detail page's Negotiation tab is the point of the feature.** Current terms say nothing about how they were reached, and in an OTC market the path — who moved, by how much, how often — is what an operator and an auditor both need. It renders oldest-first because it reads as a narrative, not a feed, and `price` / `amount` render `—` rather than `0` on the actions that set no terms.
  - **Escrow is only shown while the deal is in flight.** Every terminal status returns it, so a stale locked figure on a closed deal reads as trapped capital. The suspension banner says plainly that a regulator's intervention blocks acceptance and the venue's approval **only** — withdraw, decline and expiry still work — for the same reason.
  - `side` is the PROPOSER's and never changes, so `buyer` / `seller` come derived from the API and the labels name whose side it is ("Proposer buys"), never "this deal is a buy". Firm vs Indicative is labelled as *when* the money locks, with the "subject to funds at acceptance" caveat surfaced on an indicative deal.
  - **Explicit Refresh control (Standard 3.6) on both pages** — `emitVaultUpdate` drops plugin-owned scopes and `dex_deals` is plugin-written, so nothing pushes here and a live negotiation would otherwise read as dead.
  - `DexDeal` / `DexDealRound` / `DexDealCounterparty` models, six `vaultDexDeal*` API methods, a shared [deal-labels.ts](src/app/pages/secure/dex/deals/deal-labels.ts) (status + action pill maps kept in ONE place so the list and detail pages can never disagree on a verb), and full `dex.deals.*` i18n in **en and ar**.

#### Fixed
- **`expiresAt` was rendered with the seconds formatter.** `dex_deals.expires_at` is epoch **milliseconds** — the sync plugin converts once at the write boundary — so `utils.formatDate` (which multiplies by 1000) would have printed a date ~50,000 years out, the same failure `dex_asset_venues.added_at` produced on the venue Assets tab. Caught before the pages shipped; now `utils.formatTime` everywhere, and the countdown subtracts `Date.now()` directly.

#### Security
- **The Identity Data tab moved off `view-documents` onto its own `view-identity-data` key** ([subscriptions/details](src/app/pages/secure/subscriptions/details/)). It renders the decrypted eKYC payload — subscriber name, national ID, DOB, address and the raw ID front/back images — and sat inside the same `@if` as the Documents tab, so anyone who could use the documents module could read a subscriber's identity document. The new key is **default OFF and executive-only** (`roles: [2]` server-side, so an admin cannot hold it or grant it to another admin); an admin enables it per user from User Details → System Functions, or via a User Group.
  - `loadIdentityData()` also short-circuits on the key rather than firing a request the API will 403 — `setTab('identity')` is still reachable from a stale deep link.
  - Label + `en`/`ar` leaves added (`systemFunctionLabels.viewIdentityData`). A missing `ar` leaf renders the raw key path — there is no English fallback.
- **Change Role is hidden on your own user record** ([users/details](src/app/pages/secure/users/details/), new `isSelf()` computed over `AuthService.userInfo.userId`). The Entity API now 403s a self-targeted role change: `requireAdmin` only proves the caller is an admin, and `:id` is caller-supplied, so an admin excluded from an executive-only System Function (`view-identity-data`) could demote themselves to collect it — and the last admin could lock the tenant out of every admin surface. The button hide is UX; the server is the gate.
- **eKYC documents no longer appear on the Documents page at all** — the Entity API now excludes them from `/documents/shared-with-me` and requires the same new key for the per-document reads, so the raw IdentityTemplate address is gone from the Owner column and **View File** can no longer stream the PII. No frontend change was needed for the list (the exclusion is server-side, and `totalCount` is derived client-side from the rows received).

#### Added
- **Shared [`<app-refresh-button>`](src/app/shared/components/refresh-button/refresh-button.component.ts) — one look for every manual refresh** (platform frontend Standard 3.6). The Vault's four Refresh controls had shipped in three forms: a ghost button *with* the two-arrow icon on the asset Distributions tab, the same ghost button *without* it on service liquidity, a blue text link on liquidity history, and a primary filled indigo button on the DEX order book. All four now render the one secondary (ghost) form with the platform's two-arrow glyph + the localized `common.refresh` label.
  - Inputs: `[loading]` (spins the icon + disables — the label deliberately no longer swaps to "Loading…", which resized the button under the cursor), `[dark]` for brand-colored banners, `[iconOnly]` for tight rows. The input is `dark`, not `onDark`: Angular rejects `[on*]` property bindings as event handlers.
  - Touched: [assets/details](src/app/pages/secure/assets/details/), [services/details](src/app/pages/secure/services/details/) (×2), [dex/order-book/view](src/app/pages/secure/dex/order-book/view/). No behavior change — same handlers, same call sites.

#### Fixed
- **The entity's own service no longer reads as an unconsented distributor of the entity's own asset.** Distribution consent applies to THIRD-PARTY distributors; a service of the asset's issuer entity is exempt on-chain and the regulator activates it directly. Because that exemption is evaluated at activation and never stored, `distributionAccepted` stays `false` forever and both surfaces showed an amber "Awaiting consent" — the asset-detail **Services** tab's tooltip already claimed "own-entity services auto-consent", contradicting the pill next to it.
  - Both consent cells are now **three-branch** on the API's new derived `consentRequired`: not required ⇒ a neutral gray *Not required* pill, else the existing Accepted / Awaiting consent. [assets/details](src/app/pages/secure/assets/details/) + [distribution](src/app/pages/secure/distribution/); `consentRequired` added to `AssetService` + `DistributionAgreement` in [data.model.ts](src/app/shared/models/data.model.ts), mapped `!== false` at both call sites so an older API build keeps the previous rendering.
  - The **Accept** button now also requires `consentRequired`. **My Fees** is untouched and the own-entity row stays listed — it is still the entity's distribution channel and the fee config is still editable there.
  - `distribution.agreements.awaiting` relabelled "Awaiting acceptance" → **"Awaiting consent"**, matching the asset tab's pill, the column header and the DEX members wording (three spellings of one state).
- **The Distribution page's Primary Trades tab no longer lists purely-internal trades** — trades inside the tenant's own entity are not distribution and appear under Transactions. Server-side filter, so the tab needed only its description copy (renamed **Primary-Market Trades → Distribution Trades**); the component still calls `vaultPrimaryTrades` unchanged and receives fewer rows with a correct `count`.

### 2026-08-06

#### Added
- **Admin-configurable currency decimal places, applied to the screen AND both export formats.** The precision of every money figure was previously fixed in ~100 template bindings (`| number:'1.6-6'`, `'1.2-2'`, `'1.0-6'`) and a handful of local formatters, so a tenant reading `250.000000` for a 2-decimal currency had nothing to change. Now driven by the Entity API's `app_config` `CURRENCY_DECIMALS` (System Configuration → **Display** → *Currency decimal places*, 0–8), delivered on `features.currencyDecimals` and held in a `FeaturesService.currencyDecimals` signal.
  - New shared **[MoneyPipe](src/app/shared/pipes/money.pipe.ts)** (`| money`) replaced **125** money-classified `number` pipe bindings across 12 components. Deliberately `pure: false`: the precision comes from a service rather than the input, so a pure pipe would cache its first render and miss both the `/features` response (which lands after first paint) and a live admin edit. A 1-entry memo makes the repeat calls of each change-detection cycle a reference compare, so a long table costs one format per cell per actual change, not one per tick. Output is byte-identical to `number:'1.N-N'` at the same N (the app registers no locale, so Angular's LOCALE_ID is en-US).
  - `UtilsService.formatPrice` reads the signal, which carries the setting into every **PDF** export unchanged (all money cells already routed through it), and the six per-page DEX `fmtPrice` helpers now delegate to it instead of each hardcoding "2–6 decimals".
  - New `UtilsService.roundMoney` rounds the **33 money cells** across the Excel exports while keeping them real numbers, so a sheet still sums and sorts. Token counts, percentages and the shortfall-tolerance display are deliberately untouched — tokens are plain integers platform-wide, and rounding a `0.000001` tolerance to the display precision would hide it.
  - The System Configuration page already re-hydrated the feature map after a save, so a change applies without a reload; its number input now carries the served `min`/`max`.
- **Service Providers ("SPs") tab on the service detail page** ([pages/secure/services/details/](src/app/pages/secure/services/details/)) — the attached validators / payment processors / custodians moved out of the Information tab into a dedicated tab (token-issuer services only, matching the on-chain 1:N attachment model). Built to **Standard 1 (List Pages)** like the sibling Assets / Subscriptions / Transactions tabs: a filter-bar card (Type select + Clear, with the three **Add Validator / Add Payment Processor / Add Custodian** buttons in the `ml-auto` slot, each behind its existing `service-add-*` System Function) over a `#4a5568`-header table card with zebra rows and a "Showing N of Total N Providers" footer. **One table for all three roles** — # / Type (colour-coded pill) / Name / Address / Status / Actions — over the new `allServiceParties()` computed that flattens the three sets. Rows carry Active / Inactive pills (role-specific tooltip), the self-custody label, and Remove; the last custodian shows a "Required" note instead, since a service must keep ≥ 1. Deep-linkable via `?tab=providers`.
- New `services.details.providers.*` i18n block (en + ar) — Add-button labels, table headers, status/self-custody labels, footer count, and the Information-tab summary line. The Type column + type filter reuse the existing `services.details.info.partyLabel*` keys, so a row's label always matches the detach confirm dialog's.
- **Total balance + standard table formatting on the Holders at Block snapshot.** The result table was a bare `min-w-full` grid with a light header — it now follows Standard 1/2 like every sibling table on the page (card wrapper, `#4a5568` header, alternating rows, `Showing X of Y` footer bar) and balances render through `| number: '1.0-2'` instead of raw digits. A `tfoot` **Total balance** row sums the column, and both exports carry the same bottom line (a `TOTAL` row in the sheet, an autoTable `foot` in the PDF) so the artefact doesn't make the reader re-add the column. New `holdersAtRows()` / `holdersAtTotal()` computeds parse the wire strings **once**, so the table, the total and both exports can't disagree; `holdersAt` is typed `balance: string | null` to match what the API actually returns.
- **Export Excel / Export PDF on the Holders at Block snapshot** ([details.page.ts](src/app/pages/secure/assets/details/details.page.ts)) — `exportHoldersAtExcel()` / `exportHoldersAtPdf()`, rendered next to the result summary once a snapshot loads. Both stamp the **block and its on-chain time into the filename and the document** (`asset_holders_at_block_<N>`): a historical holder set that doesn't say which block it reconstructs is not usable as an evidence pack. Standard styling (green/gray + icon), `applyPdfFooter` + `auditService.logExport` like the sibling exports, and gated by the existing `export-excel` / `export-pdf` System Functions — so an admin's per-user or per-group export toggle covers them with no registry change.
- **Latest-block hint + guard on the asset detail page's Holders at Block tab** ([pages/secure/assets/details/](src/app/pages/secure/assets/details/)) — opening the tab fetches the chain head (`vaultGetSyncStatus().current_block` — an endpoint that already existed and no page read), shows it **on the label row, right-aligned above the Block Number input** (a line *below* the input adds height to that cell and, since the filter row is `items-end`, drops the Lookup-by toggle and the Load Snapshot button out of alignment), and sets the input's `max`. `loadHoldersAt()` re-fetches the head before submitting (it advances while the tab sits open, so a cached value would reject a block that has since been mined) and alerts on a block beyond it instead of firing a request that can only return an empty snapshot. New `assets.details.holdersAt.{latestBlock, blockAheadOfHead}` i18n (en + ar).

- **System Functions comprehensive sweep — 25 to 56 gated buttons.** Wrapped in `features.systemFunctionEnabled(...)`: assets list (Add Asset / Register Existing), asset detail (Edit Metadata, Mint, Burn, Add Price, Add Service, the Allowed/quote toggle, the per-service state pencil, Execute / Finalize distribution, List Asset on DEX), services list (Add Service), service detail (Edit Venue Fees, Inject / Withdraw Liquidity), subscriptions list (Add Subscription), subscription detail (Add Credit), transactions list (Add Transaction), settlements (Cancel), admin profile (Edit Entity Metadata), the Distribution page (Accept / Fees), and every DEX write (Create Venue, Request Venue Tier, Create Listing, listing Add Venue / Change Tier / Remove, order Cancel on list + detail, Match Selected). 31 label rows added to `SYSTEM_FUNCTION_LABELS` with matching `systemFunctionLabels.*` leaves in **both** `en.json` and `ar.json`.

#### Fixed
- **Every date in the Vault now renders `dd/MM/yyyy HH:mm:ss` — 14 `| date` bindings normalised from three competing formats.** The two TS call sites below were the reported symptom; the templates disagreed more widely: `date:'medium'` / `'short'` (5, locale-dependent exactly like `toLocaleString`), `dd/MM/yyyy HH:mm` with no seconds (6), `yyyy-MM-dd HH:mm(:ss)` (2 — Custody mandates, the service detail settlements tab), and the date-only My Profile "member since". Only the three `date:'HH:mm:ss'` "last updated" clocks stay time-only — they show what time the page last refreshed, not when a record happened.
- **Two date call sites rendered in the visitor's locale instead of the platform's `dd/MM/yyyy HH:mm:ss`.** `UtilsService.formatDate` / `formatTime` have been the standard for a long time, but these bypassed both and called `toLocaleString()` directly, so an en-US browser showed `8/6/2026, 10:52:07 PM` — a format that is genuinely ambiguous with `dd/MM` for the first twelve days of every month. [approvals/list](src/app/pages/secure/approvals/list/list.page.ts) now delegates to `utils.formatTime` (the approval timestamps are **millisecond** epochs — `formatDate` would multiply by 1000 again), and [settings/backup](src/app/pages/secure/settings/backup/backup.page.ts) in both places it shows the backup date — the restore-confirm dialog and the table cell, which was on the locale-dependent `| date:'medium'`. Found while fixing the same defect in the Permissioning Admin.
- **The Vault destroyed its own session during an API restart — which is what made server-side session persistence necessary but not sufficient.** `SessionService.refreshToken()` called `clear()` on *any* non-success, including the `catch` for a network error. So a refresh landing while the API was restarting got ECONNREFUSED, wiped the stored token, and logged the operator out no matter what the server remembered. It now clears **only on a definitive 401**; a 503 (session store briefly unreachable), a 5xx, a proxy error page or a network failure all mean "we could not ask", not "you are logged out". A new `tokenIfUnexpired()` returns the current token when it still has real time left — we refresh ~60s early, so the caller keeps working and `AuthGuard` does not bounce — and `null` only once it has genuinely expired. Because `connect_error` in [socket.service.ts](src/app/shared/services/socket.service.ts) calls `getActiveToken()`, this also stops a socket reconnect during a restart from wiping the session. `_handleAuthFailure()` already fired on 401 only, so the new 503 needed no change there.
- **Already-attached providers are filtered out of the three pickers.** Each modal service's `show()` gained a trailing `exclude: string[]` (stored lowercased in a new `excluded` signal); the service detail page passes the current `serviceParties()` addresses for that role, and each component's `load*()` drops them alongside the existing state / curated-provider / verification-level filters. The custodian picker also **hides its Self-custody option once the service is already its own custodian** — self-custody is stored as the service's own address, so the same exclude list covers it. Each picker now shows an amber "No … available — every eligible … is already attached" note when the filtered list comes back empty, instead of an unexplained empty dropdown.
- **The three provider picker modals said "Reassign …" while performing an ATTACH.** `modal-service-{validator,payment-processor,custodian}` are leftovers from the pre-1:N single-binding model; since the 1:N cutover their only caller is `_attachParty`, so the title, the `Update` submit label, and the validator/PP `None` first option all described an operation that no longer exists. Retitled to **Add Validator / Add Payment Processor / Add Custodian** with an `Add` submit; `None` is now a disabled "Select a …" placeholder and submit is disabled until something is picked (choosing `None` previously produced a silent no-op — `_attachParty` returns early on an empty address). No handler changes.

- **Asset Mint / Burn had no role gate at all** ([assets/details](src/app/pages/secure/assets/details/)) — `v.canManage && v.supplyMode === 1` was the entire condition, making them the only supply-changing writes in the app a viewer could see. Now `role !== 3` plus their own `asset-mint` / `asset-burn` keys.
- **"List Asset on DEX" had no role gate** on the asset detail page, while the equivalent Create Listing on the DEX listings page did. Now `role !== 3` + `dex-listing-create`.

#### Changed
- **A service is capped at ONE custodian in the Vault.** Add Custodian is disabled (with an explanatory tooltip) whenever a custodian is attached. The contract still models custodians 1:N — this is a **frontend-only** product rule, so the API/chain would accept a second one. Note the resulting shape: every type-1 service is born with a custodian and `ServiceTemplate.removeCustodian` reverts at count 1, so the custodian is now **fixed at service creation** with no Vault path to change it. Changing one requires a regulator (or lifting this cap). For the record, a swap is otherwise harmless — a Tarmiiz custodian holds no balances, only live-evaluated hold + read authority over the service's registered assets; the one casualty would be holds the outgoing custodian left open, which become releasable ONLY by the asset's regulator (`regulatorReleaseHold` is placer-scoped AND re-checks current attachment).
- The Information tab now carries a one-line providers summary (`N validators · N payment processors · N custodians`) with a **Manage Providers** button that switches to the new tab — the counts stay visible where the rest of the service's identity fields are, without the three attachment lists crowding them.
- No behaviour change to attach/detach: the same `attachValidator()` / `attachPaymentProcessor()` / `attachCustodian()` / `detachParty()` handlers, the same `service-add-validator` / `service-add-payment-processor` / `service-add-custodian` System-Function gates, and the same `role !== 3` + `entityActive` conditions.

#### Removed
- The now-unused `services.details.info.{validatorsCount, paymentProcessorsCount, custodiansCount, noValidatorsAttached, noneAttached, selfCustody, inactive, validatorInactiveTooltip, custodianInactiveTooltip}` i18n keys (en + ar) — replaced by their `providers.*` counterparts. The `info.partyLabel*` + error keys stay: they are read from TypeScript by the shared detach confirm / error paths.

#### Added
- `settings.appConfig.categories.monitoring` label (en + ar) for the new `monitoring` group on **System Configuration**, home of the Entity API's `SHORTFALL_SWEEP_INTERVAL_MS` (the liquidity-shortfall sweep period — see the Entity API changelog). The page is content-driven and would otherwise have rendered the raw category slug as its card heading. No other Vault change: the Liquidity Shortfall card already reads the same numbers.

### 2026-08-05

#### Added
- **DEX venue membership (the brokerage surface).** The venue detail page gained a settlement-mode pill + a **Members tab** (consent/approval pills, ms-aware Added column, Add Member inline modal + Remove — gated `role !== 3` + the new `dex-member-add` / `dex-member-remove` System Functions, maker/checker `requestId` toast). New **Memberships page** ([pages/secure/dex/memberships/](src/app/pages/secure/dex/memberships/), `/authorized/dex/memberships/list`, sidebar item in the DEX group) — the brokerage side: this tenant's services' memberships with Accept (`dex-member-accept`, the consent step) and Exit actions. The venue-create modal gained a Settlement Mode selector (Venue-settled default / Member-settled, immutable note). `vaultDexVenueCreate` sends `settlementMode`; six new `vaultDex*Member*` API methods; `DexVenue.settlementMode` + `DexVenueMember` model; labels in [system-function-labels.ts](src/app/shared/constants/system-function-labels.ts); full en+ar i18n.

#### Changed
- **The entity mode's allow-list now comes from the API instead of a hardcoded set.** `SERVICE_PROVIDER_MENU` in [features.service.ts](src/app/shared/services/features.service.ts) is deleted; `modeAllows(key)` reads the `modeMenu` array served on `/vault/features[/me]` (`null` = unrestricted). Its `(key: string) => boolean` **signature is unchanged**, so all three filter call sites — Menu Settings, User Details → Menu Access, the User Group editor — are untouched, as are the sidebar's 19 `menuEnabled()` gates and every `menuFeatureGuard` (all of which fold through it).
  - This fixes a real gap: **Custody was unreachable for custodians.** `custody` is documented server-side as the module "only service-provider tenants use", but it was absent from `SERVICE_PROVIDER_MENU`, so `modeAllows('custody')` returned false in exactly the mode it exists for. `settlements`, `distribution`, `service-providers` and `asset-t3643` were likewise hidden by omission — they were added to the registry after that set was written.
  - The mode is now a per-provider-type value (`Provider — Validator` / `— Payment Processor` / `— Custodian`, from the on-chain `Entity Mode` Global Variables category) rather than one `service-provider` bucket. Adding a future provider type needs no Vault change at all.
- **`isServiceProvider()` is now "not the Token Issuer mode"** (mode id ≠ 1). Its four non-menu call sites — the dashboard component swap in [app.routes.ts](src/app/app.routes.ts) and the services list/detail columns — all ask "is this an issuer service?", and Verification Level / Coverage / Shortfall are issuer-service concepts, so they stay hidden for every provider type.
- `vaultFeatures()` / `vaultMyFeatures()` in [api.service.ts](src/app/shared/services/api.service.ts) return the new exported `VaultFeatures` shape: `vaultMode` re-typed to `number`, plus `vaultModeName` and `modeMenu`.

#### Removed
- **`vaultMode` from `AppConfig` and both `assets/config.json` files** ([config.service.ts](src/app/shared/services/config.service.ts)). It was `FeaturesService`'s fallback for the window before the first features fetch; with the mode now a Global Variables id, a static string mirror would be a second, divergent identifier space that an admin's System Configuration edit could never update. The service defaults to Token Issuer for that window and keeps the last known value across refresh failures, so the fallback bought nothing. The Docker frontend image no longer writes the key either.

### 2026-08-03

#### Added
- **Settlements module** ([pages/secure/settlements/](src/app/pages/secure/settlements/), `/authorized/settlements`, menu key `settlements`, roles 2/3) — the fiat leg of the issuer/DEX model (D9-D11). Three tabs: **Positions** (per-counterparty/currency signed net from `credit_positions`, "You owe / Owed to you" pills, per-row Settle), **Obligations** (per-transaction rows with Payable/Receivable direction, kind Derived/Declared/Claimed, credit-trx link), **Settlements** (two-sided lifecycle with inline actions). Inline modals: **Create Settlement** (with a live chain pre-flight of net / in-flight / available via `GET /vault/settlements/positions/:cp/:code`), **Confirm Sent** (required wire reference + optional receipt file — pinned server-side as an encrypted settlement-receipt document; multipart via the new `_postMultipartFields` XHR helper), **Confirm Received** (with an explicit net-decrement warning), plus debtor-side Cancel. All actions maker/checker-aware (`requestId` toast) and gated by the new `settlement-create` / `settlement-confirm-sent` / `settlement-confirm-received` System Functions.
- **Distribution module** ([pages/secure/distribution/](src/app/pages/secure/distribution/), `/authorized/distribution`, menu key `distribution`, roles 2/3) — the distributor side of the issuer/distributor model. **Agreements** tab lists every (asset, my service) registration with state + consent pill, an **Accept** action (the on-chain `acceptDistribution` consent required before regulator activation — the confirm copy explains the fronted-redeem creditor exposure), and a **My Fees** button opening the shared service fee-config modal for the distributor's OWN per-asset D7b fee. **Primary Trades** tab renders the `primary_market_trades` feed (direction, tokens, price, gross, fee + bearing).
- **DEX Offerings page** ([pages/secure/dex/offerings/](src/app/pages/secure/dex/offerings/), `/authorized/dex/offerings/list`, under the existing `dex` menu key) — issuer-side IPO facility: offerings table (status ladder Pending Approval / Live / Completed / Cancelled / Rejected + orthogonal Suspended pill, sold/total progress bar), per-offering fills expand, Cancel, and a **Create Offering** modal whose venue picker offers only the selected asset's regulator-APPROVED venue pairings (state 2 rows of the listing's venue set). Gated by the `dex-offering-create` / `dex-offering-cancel` System Functions.
- `api.service.ts` — full method sets for the three surfaces (`vaultSettlement*`, `vaultDistribution*`, `vaultPrimaryTrades`, `vaultDexOffering*`); `data.model.ts` — `CreditPosition` / `CreditObligation` / `CreditSettlement` / `DistributionAgreement` / `PrimaryTrade` / `DexOffering` / `DexOfferingFill` interfaces. Sidebar items + `MENU_LABELS` / `SYSTEM_FUNCTION_LABELS` entries + full `settlements.*` / `distribution.*` / `dexOfferings.*` i18n blocks (en + ar).

#### Changed
- **Service fee modal carries the uniform D7b engine** ([modal-service-fee-config](src/app/pages/secure/services/modals/modal-service-fee-config/)): each side gained a **Fee Bearing** select (On top — payer pays gross + fee / Deducted — receiver gets gross − fee) and LOST its destination input — the contract now forces the destination to the configuring service's own account. `FeeConfig` model gained `buyFeeBearing` / `sellFeeBearing`.
- Asset detail Services tab: the per-service fee column was replaced by a **Distribution Consent** column (Accepted / Awaiting consent pill from the new `asset_services.distribution_accepted` mirror — regulator activation to Active requires the distributor's own acceptance).

#### Removed
- **The asset-side fee surface** (issuer/DEX model D2/D7 — the on-chain T20 per-service fee config lost its last consumer): `modal-asset-fee-config` component/service deleted, `openFeeConfigModal` + fee helpers removed from the asset details page, and the `vaultGetAssetFeeConfig` / `vaultSetAssetFeeConfig` / `vaultQuoteAssetFee` API methods dropped (their routes no longer exist). `AssetService.feeConfig` field replaced by `distributionAccepted`.

### 2026-08-02

#### Fixed
- **DEX Listings now shows the assets hosted on this entity's venue, not just the ones it
  issued.** A venue operator (EGX) saw "No data" while the same asset appeared on its venue
  detail page's Assets tab. The scope fix is in the Entity API; the Vault side renders the
  new second side of the listing:
  - A **Listed By** column on the list page — `Own` for a listing we issued, the issuing
    entity's name plus an `On my venue` pill for one we merely host. Both exports carry it.
  - The listing detail page's issuer-only writes (Request Approval per tier, Add Venue,
    Change Tier, Remove) are hidden for a hosted listing via a new `canManage()` —
    they are gated on-chain to the asset's issuer and would revert. A blue notice explains
    why the page is read-only.
  - `upstreamBlockReason()` returns empty for a hosted listing: the snapshot it reads is
    computed from the ISSUER's mirror, so it reported "asset suspended" on a healthy asset.
  - `DexAssetListing` gained `isOwnListing`; `dex.listings.table.listedBy`,
    `dex.listings.list.scope.{own,hosted}`, `dex.listings.list.export.listedBy` and
    `dex.listings.details.hostedNotice` added in **both en and ar**.

#### Added
- **Entity mode (Token Issuer / Service Provider) is switchable from System Configuration.**
  A new `Entity mode` row under Features on
  [app-config.page.html](src/app/pages/secure/settings/app-config/app-config.page.html)
  renders the first `enum`-typed config key as a dropdown (+ Save, same dirty-buffer pattern
  as the text/number rows; explicit `text-gray-800` on the select and options so they don't
  inherit a near-white colour). `AppConfigItem` gained `type: 'enum'` + an `options` array.
  Previously the mode was a `vaultMode` string in the static `assets/config.json` — a host
  file edit, not an admin action.

#### Changed
- **`FeaturesService.isServiceProvider()` reads the SERVER value.** A new `mode` signal is
  hydrated from `features.vaultMode` on `/vault/features[/me]`;
  [config.service.ts](src/app/shared/services/config.service.ts)'s `vaultMode` survives only
  as the fallback for the window before that first fetch resolves. A failed/empty fetch keeps
  the last known mode rather than snapping back to the config.json default, which would
  briefly re-show issuer modules on a network blip.
- **The dashboard route now awaits the features fetch before choosing its variant.** With the
  mode server-owned, the synchronous `loadComponent` in [app.routes.ts](src/app/app.routes.ts)
  would have picked the issuer/service-provider dashboard off the config.json fallback on a
  hard refresh; it now mirrors `menuFeatureGuard` (`inject()` before the first `await`, as an
  injection context requires).
- The System Configuration page calls `features.refresh()` after every save/reset, so a mode
  change repaints the sidebar immediately instead of waiting for the next login.
- **No modal dismisses on a backdrop click any more (53 files).** The `(click)` handler on every
  `fixed inset-0` overlay — and the `(click)="$event.stopPropagation()"` guard on the card that
  existed only to defend against it — was removed; a modal now closes only on an explicit
  ✕ / Cancel / Close press or a completed action. A stray click outside the card silently threw
  away half-filled wizards (Add Asset is 8 steps) with no undo. Swept mechanically across every
  modal, the shared [documents-tab](src/app/shared/components/documents-tab/) /
  [metadata-edit-modal](src/app/shared/components/metadata-edit-modal/) /
  [modal-image-add](src/app/shared/components/modal-image-add/) components, and the inline
  overlays on [custody.page.html](src/app/pages/secure/custody/custody.page.html) and the
  services detail page. The transparent click-away overlays behind dropdowns were deliberately
  left alone — dismiss-on-outside-click is correct there. Now a platform rule in
  `docs/frontend-standards.md` §Standard 3.

#### Fixed
- **The venue Assets tab named the VENUE as the issuer of every asset it hosts.** The ISSUER
  column on [dex/venues/details](src/app/pages/secure/dex/venues/details/details.page.html)
  bound `a.entityName`, which on an (asset, venue) row is the venue's own operator — so EGX's
  venue page credited EGX with issuing Granite's fund. It now binds the Entity API's new
  `issuerEntityName` (read from `AssetInfo.issuer`). The blank ASSET / SYMBOL cells on the
  same tab, and the blank VENUE / ENTITY cells on the listing details Venues tab, were the
  API-side half of the same problem (tenant-local joins on cross-tenant rows) and are fixed
  there — no further frontend change.

### 2026-08-01

#### Fixed
- **An unrelated service-metadata edit silently DELETED the `sp` discovery object.** The shared
  metadata-edit modal returns a FULL-REPLACEMENT object (description + contact + KV rows), and
  `sp` — the nested `{ sp: { kind, signer, baseUrl } }` consumed by the Token Exchange / DID App /
  DID API trust chain — was neither in the RESERVED set (so it round-tripped through the flat KV
  editor as a corrupting JSON-string-in-a-string) nor preserved on save (so once RESERVED, it
  would simply vanish). The service detail page now RESERVEs `sp` out of the KV editor AND
  re-attaches the parsed value verbatim onto the modal's result before `vaultUpdateServiceMetadata`
  (the Entity API's `_normalizeProfileFields` passes unknown keys through, verified).
  ([services/details/details.page.ts](src/app/pages/secure/services/details/details.page.ts))

<!-- newest first; each date-heading groups every change made that day across any number of sessions -->
### 2026-07-31

#### Added
- **Identity Data tab on subscription details (unified-eKYC Phase 5b — revised invariant I4)** ([subscriptions/details](src/app/pages/secure/subscriptions/details/)): lists the verifications THIS entity originated for the subscriber (new `GET /ekyc/verifications` index) and expands each into the decrypted canonical fields + provider/level/contacts-provenance pills + ID images (`GET /ekyc/transaction` + `/ekyc/images` — own-originated docs only; foreign-originated verifications never appear and the DID number is never shown). Tab shares the `view-documents` system-function gate with the Documents tab. New `ekycVerifications`/`ekycTransaction`/`ekycImages` methods in [api.service.ts](src/app/shared/services/api.service.ts); en + ar i18n.
- **Add Subscription modal reworked for canonical v3 (Phase 1 of the unified-eKYC redesign)** ([modal-add-subscription](src/app/pages/secure/subscriptions/modals/modal-add-subscription/)): an **ID Type picker** (National ID / Passport / Driver License, from the new GENERATED schema mirror [shared/constants/ekyc-canonical.ts](src/app/shared/constants/ekyc-canonical.ts) — regenerated via the eKYC Service repo's `gen-canonical-ts.js`, drift-checked by the Products-root `check-canonical-sync.ps1`); the base required fields are now all visible (Document Number, Full Name, **Date of Birth + ID Expiry Date un-collapsed** out of the "more identity" panel — they were server-required but hidden, the old drift), with Nationality required-and-surfaced for passports; an "Accept expired or missing ID expiry" override checkbox (recorded for the regulator); new optional canonical fields in the more-panel (Place of Birth, Issuing Country/Authority, City, Postal Code, Address Country); Level 1 removed from the verification-level picker (not a mint level). Submits `idType` + v3 canonical (`idNumber`; server aliases `nationalId`). en + ar i18n.

- **Request Approval buttons on the asset-listing tier cards** ([dex/asset-listings/details](src/app/pages/secure/dex/asset-listings/details/details.page.ts)) — the three cards were status badges only, with an action under Tier 1 alone, so there was no way to request Tier 2 or 3 from the page everyone looks at. Now a per-card button (`requestTier` + `tierStatus`, mirroring the venue details page; the three hand-written cards collapsed into an `@for` loop). It posts the EXISTING create-listing call with just that tier's flag, since `DEXProxy.listAsset` is additive rather than create-once. **Why it needed its own button:** the list page's Create Listing modal does still reach `listAsset` for an already-listed asset, but it defaults to `venue: true, country: false` — and re-submitting with those defaults once Tier 1 is approved is a SILENT no-op (the contract skips an already-approved flag, the tx succeeds, nothing changes).
- **Regulator Approval column on the listing's Venues tab** — Pending / Approved pill per (asset, venue) pairing (`DexAssetListingVenue.state`, en + ar). An Active venue at an approved tier still cannot trade the asset until its regulator approves the pairing, and nothing in the UI said so.

#### Fixed
- **A venue's Assets tab showed "Enabled 06/05/58548".** `dex_asset_venues.added_at` is stamped in MILLISECONDS by both writers (plugin `System.currentTimeMillis()`, API `Date.now()`), unlike the chain-derived `*_at` columns which are seconds — and the cell used `utils.formatDate`, which multiplies by 1000. Switched to `formatTime`, which is the documented helper for API/plugin-stamped ms ([dex/venues/details](src/app/pages/secure/dex/venues/details/details.page.html)).

#### Changed
- **Add Service wizard hides the Verification Level picker** ([modal-service-add](src/app/pages/secure/services/modals/modal-service-add/)) — the field (and its Review-step row) is hidden for now and token-issuer services are fixed at level 2 (eKYC) via a single `DEFAULT_VERIFICATION_LEVEL` constant, re-applied when the service type switches back to Token Issuer so the hidden required control can't silently block Next.
- **Declare-distribution modal takes whole units, not wei.** The amount field's placeholder is now per-type (`e.g. 100.50` for a Credit dividend, `e.g. 1000` for a StockSplit) instead of the fixed `e.g. 100000000000000000000`, `canConfirm` accepts a fractional Credit amount (the old `BigInt()` check rejected `100.50` outright) while still requiring a whole number for StockSplit, and the unit hint reads "whole units of the asset currency" in en + ar. Matches the API contract change the same day.
- **Money read from the API is already in currency units — the client-side `/1e18` is gone.** Part of the cross-stack off-chain money-unit unification (see the platform CLAUDE.md "Off-Chain Storage Encoding"). The six DEX pages' `fmtPrice(wei: string)` helpers (order book, orders list/details, trades list/details, venue details) became plain number formatters keeping each page's existing `toLocaleString` options, and the service-detail liquidity table's `formatCreditWei` was renamed `formatCreditAmount` and no longer divides. Left alone deliberately: `formatEther` on values that come from a LIVE chain read rather than a mirror row — the field name is the tell (`row.trx_amount` = DB, units; `raw.trxAmount` = chain, wei).

### 2026-07-30

#### Added

- **The Custody page is now a real custodian workstation** ([pages/secure/custody](src/app/pages/secure/custody/custody.page.ts)) — goes live with the Assets + Entities clean redeploy:
  - **"Services under my custody" is live** (the permanent placeholder is gone) — fed by the new `GET /vault/custody/mandates` reverse index (plugin-written from the `ServicePartyChanged` announce fan-out).
  - **"Assets under custody"** — new card listing custodied assets (`vaultCustodyAssets`) with a per-asset holds expand (`vaultCustodyAssetHolds`; `placedBy` pill distinguishes own holds from the regulator's).
  - **Hold / Release actions** — Place Hold (choose acting custodian service, holder account, plain token amount, reason) and per-row Release for own, non-released holds; both via the new `vaultCustodyHoldPlace`/`vaultCustodyHoldRelease` API methods, gated `role !== 3` + the new `custody-hold-place`/`custody-hold-release` System Functions, with the maker/checker "Submitted for approval" fork surfaced. Release is placer-scoped on-chain (the relay acts as the service that placed the hold).
  - New `custody.*` i18n (en + ar) + the two System Function labels.
- **Placed By on the subscription-details holds table** — the read-only regulator-holds history gained the acting-authority column (`RegulatorHold.placedBy`/`releasedBy` model fields).

#### Changed

- **Login admits the admin of a Pending entity** ([auth.service.ts](src/app/shared/services/auth.service.ts)) — the post-login entity-state check no longer rejects every `state !== 2`. A **Pending (1)** entity lets its **admin (role 1)** through so they can prepare the tenant while awaiting regulator approval; Active (2) admits everyone; Suspended (3) / Deactivated (4) still admit nobody. Mirrors the Entity API's new server-side gate on `POST /vault/entity/login` — the client check is UX, not the boundary. The header's existing "entity not active" banner already covers the Pending case via `stateName`.

#### Fixed

- **The entity-state rejection is finally readable** ([login.page.ts](src/app/pages/public/user/login/login.page.ts)) — the old message (`'Entity is suspended or deactivated…'`) matched none of the error branches and fell through to the generic **"Invalid credentials"** alert, so an operator locked out by entity state was told their password was wrong. `AuthService` now returns `ENTITY_PENDING` / `ENTITY_INACTIVE` / `ENTITY_UNKNOWN` sentinels (same shape as the existing `CLAIM_REQUIRED`) and the login page maps each to its own message. New `login.errors.entityPending` / `entityInactive` / `entityUnknown` keys in **en + ar**.
- `CLAIM_REQUIRED` no longer raises a spurious "Invalid credentials" alert on top of the claim wizard it just routed to — the very first login of a regulator-created entity's admin.
- **The Assets page listed every asset on the chain, and the detail page opened foreign ones by direct URL.** Reported from the EGX vault, which showed two Granite assets as its own — complete with working-looking Mint Supply / Burn Supply / Change State buttons. The list is fixed server-side (the Entity API now scopes `GET /vault/assets`, the dashboard AUM/`topAssets`/`currencies`, and the transaction/flow figures to the tenant), so this repo's change is the direct-URL half: [assets/details](src/app/pages/secure/assets/details/details.page.ts) now treats a null asset as "not in this vault" — alert + redirect to the assets list — instead of rendering an empty shell with live action buttons over a foreign address. New `assets.details.notFoundTitle` / `notFoundMessage` keys in **en + ar**.
  - The API 404s every foreign asset route (`requireOwnAsset`), so the page cannot be populated by pasting an address; this handler is what turns that 404 into an explanation rather than a blank page.
  - **Never a privilege escalation** — every write bottoms out in the token's own `_chkManager()` (`msg.sender == manager`) and the API relays as its EntityTemplate, so the chain always refused. Worth knowing the contract was the *only* layer enforcing it.
- **Mint Supply / Burn Supply / Change State no longer render when they are guaranteed to revert.** All three are `_chkManager`-gated on-chain against the address the API relays as, so an asset whose `manager` is not this entity's template could never accept them — the buttons were live and the failure only appeared as a relayed revert. They now gate on the new server-derived `canManage` (`Asset` model + both asset mappers), with an amber "Managed by another address" pill in their place so a blocked user gets a reason rather than a missing control. New `assets.details.notManager` key in **en + ar**. This is UI honesty over a capability hint — the contract remains the only enforcement.
  - **Extended to every manager-gated control on the page**, from the contract's own list rather than by eyeballing the UI: `Edit Metadata` (`setMetadata`), `Add Price` (`setPrice`), `Add Service` (`addService`), the per-service **quote toggle** (`setServiceCanQuote`), **Edit Fees** (`setFeeConfig`) and the per-service **state** pencil (`setServiceState` — regulator-or-manager, and the Vault acts as the entity). These disable with an explanatory tooltip rather than disappearing, since unlike supply/state they sit inside data tables where a vanishing control reads as a rendering fault.
  - **Deliberately NOT gated:** the media/images actions, DEX listing, and distributions. Those are **issuer**-gated (DocumentsProxy's controller rule, `IT20.getIssuer()`, and `declareDistribution`, which checks asset registration + active state, not the manager), so they remain correctly available to a non-manager owner. Verified against the contracts instead of assumed.
  - Gates read a scope-independent `canManage()` getter on the component rather than the template's `v` binding, because two of the six sit outside the `@if (asset(); as v)` scope.

### 2026-07-29

#### Fixed
- **Uploads can no longer spin forever with no error.** Every multipart XHR helper in [api.service.ts](src/app/shared/services/api.service.ts) — `_uploadMultipart` (all four document families), `_replaceFileMultipart`, `ipfsUploadFile`, `connectThreadCreateMultipart`, `connectMessageSendMultipart` — was created with no `timeout`, so a request the server never answers left the promise unsettled and the loading overlay permanently visible. That is exactly what an operator saw when attaching files in the Add Asset wizard: the asset was created and "Uploading attachments 1/1: …" never went away (root cause was an evicted relay transaction on the API side — fixed there; see the Entity API changelog). All six now set a 180 s `timeout` + an `ontimeout` that resolves with a readable error, so the failure surfaces in the summary alert instead of hanging. The ceiling sits above the API's own 120 s receipt bound so a slow-but-succeeding upload is never cut short.
- **Document signing no longer reports a false success.** The shared [documents-tab](src/app/shared/components/documents-tab/) (service / asset / subscription Documents tabs) checked only `signRes?.error`, but `ApiService.authPost` returns **null** on any non-2xx — so a 403 from the Entity API's `requireExecutive` gate (an admin or viewer pressing Sign) painted the "Document Signed" alert while nothing landed on-chain, and the Signed column stayed `No`. Null is now treated as failure (`documentsTab.errors.signingFailed*`), and the Sign action is gated on the executive role (`canSign(doc)` — role 2, entity active, active document) so the button is only offered to users the API will actually accept. Same null-check fix applied to the entity [documents/details](src/app/pages/secure/documents/details/details.page.ts) page (+ `documents.details.errors.signFailed` i18n, en + ar).
- **Signed column now updates immediately after signing.** `loadSignedCounts` was only ever called by `loadDocuments`, so a successful sign left the stale `No` pill until the tab was re-entered. Extracted a per-document `refreshSignedCount(doc)` and called it on sign success. `refreshSignedCount` swallows its own errors: it is a display refresh layered on work that already succeeded, so letting a failed read propagate would suppress the "Document Signed" alert after a sign that DID land on-chain, and would reject the whole `Promise.all` in `loadSignedCounts` — blanking every other row's count over one bad read.

#### Changed
- **Sign moved from the document modal footer into the row actions**, next to View / Edit on the Documents tab table — signing no longer requires opening the document first.

### 2026-07-28

#### Added
- **Versions tab on the document detail page** — the document's upload ledger: version, upload
  time, original filename, size, type, CID and SHA-256 (both copy-to-clipboard), and the operator
  who uploaded it. The shared-document details page gets the same table as a flat section beside
  Signatures (file metadata is null there by construction — only the owner's API ever saw the
  uploaded bytes).
- **Replace File** action on the Versions tab (hidden from viewers) — uploads a new file over the
  current one with an upload-progress label; the document keeps its type, state and recipients.
- `DocumentVersion` model + the versions API methods; `documents.details.versions.*` i18n in **both
  en and ar**.
- Version methods for the service / subscription / asset document families too.

### 2026-07-21

#### Fixed
- **Activity/audit log dates no longer render as year 58523.** The log pages formatted the DB `created_at` (ms) through `utils.formatDate`, which `×1000`s it (that helper is for raw on-chain seconds) → microseconds → year 58523. Every log/audit row now consumes the canonical `time` (ms) field the Entity API provides and formats it with the new `utils.formatTime` ([utils.service.ts](src/app/shared/services/utils.service.ts) — plain `new Date(ms)`, no `×1000`); `AuditLog` gained a `time` field and the activity/state raw-row interfaces a `time?`. Touches `logs/activity`, `logs/my`, `logs/system`, `logs/details`.
- **P/L dust — break-even holders no longer render as green micro-gains.** New numeric `round6` helper in [utils.service.ts](src/app/shared/services/utils.service.ts) (the existing `formatPrice` is string-typed, unusable for comparisons/cells) applied everywhere `pl = balance × bid − cost` is computed: the asset holders table ([assets/details](src/app/pages/secure/assets/details/details.page.html) `@let pl` + both export functions) and the subscription portfolio ([subscriptions/details](src/app/pages/secure/subscriptions/details/details.page.ts) — the `totalPortfolioValue`/`totalCostBasis`/`totalPL` and per-currency `holdingsByCurrency` computed signals, both holdings exports, and the holdings-table `@let pl` in the template). Floating-point dust like `2.27e-13` previously made the `pl > 0` color-class bindings show green on break-even rows and leaked raw `…0000000001` values into Excel export cells; `round6` zeroes anything below 0.0000005 while leaving real values (≥ 0.000001) untouched. (Server side, the Entity API's shortfall alerts + coverage rows got the same treatment — see its CHANGELOG.)

#### Added
- **Liquidity Change History on the service detail Liquidity tab.** The service detail page's Liquidity tab now shows a change-history table below the current balances — every liquidity inject (green pill) / withdraw (amber pill) with amount, currency, PP reference, and date, fed by the new `vaultGetServiceCreditTransactions(address, { origin: '3,4' })` ([api.service.ts](src/app/shared/services/api.service.ts) → `GET /vault/services/:address/credit-transactions`). Reloads with the balances and after each inject/withdraw. ([services/details](src/app/pages/secure/services/details/) — `liquidityHistory` signal + `getLiquidityHistory` + `creditOriginLabel`/`formatCreditWei` helpers.)
- **System Configuration admin page** (`/authorized/settings/app-config`, admin-only `RoleGuard [1]`) — a new Settings page that reads/writes the Entity API's DB-managed runtime config (`GET/PUT /vault/app-config`, `POST /vault/app-config/:key/reset`). Category-grouped cards (features / sessions / chain / audit / settings / email / ipfs / branding / shield) with one control per key typed from the server registry: toggle (bool, immediate save with confirm), number/text input + Save, and a write-only masked password input for secrets (shows "configured / not set", never the value). Each row shows a Default/Customized badge, a "Restart required" pill for boot-time keys, and a Reset action. New [app-config.page.ts](src/app/pages/secure/settings/app-config/app-config.page.ts) + `.html`, `AppConfigItem` model in [data.model.ts](src/app/shared/models/data.model.ts), `getAppConfig`/`setAppConfig`/`resetAppConfig` in [api.service.ts](src/app/shared/services/api.service.ts), a `role == 1` sidebar item in [authorized-layout](src/app/shared/layouts/authorized-layout/authorized-layout.component.html), and `sidebar.systemConfiguration` + `settings.appConfig.*` i18n (en + ar).
- **Approval Settings is its own admin page.** The maker/checker policy page (the existing [policy.page](src/app/pages/secure/approvals/policy/policy.page.ts)) is now a first-class core admin screen at `/authorized/settings/approval-policy` (`RoleGuard [1]`, under the never-menu-gated `settings` group — decoupled from the `approvals` module toggle), with its own admin-only sidebar item in the User Management group next to Menu Settings. New route in [app.routes.ts](src/app/app.routes.ts), `sidebar.approvalSettings` i18n (en + ar), and the page header retitled to it.
- **Public-profile `description` + nested `contact` across entity / service / asset (platform-wide profile work).** The **entity profile** modal ([modal-profile-metadata-edit](src/app/pages/secure/profile/modal-profile-metadata-edit/)) gains a Description textarea + an Address field and now reads/writes a nested `contact { email, phone, website, address }`; the profile Info tab renders both via a normalized `profileView()`. The **shared metadata editor** ([metadata-edit-modal](src/app/shared/components/metadata-edit-modal/), used by both service + asset detail) gained a Contact section + `contact` reserved-key guard. The **asset "View Asset" card** ([modal-asset-public-view](src/app/pages/secure/assets/modals/modal-asset-public-view/)) renders a Contact section. `Entity`/`Service` models ([data.model.ts](src/app/shared/models/data.model.ts)) carry a nested `contact` (+ a shared `ContactInfo` interface); the asset detail `parsedMetadata`, service `mapVaultService`, and the Add-Asset wizard reserved-key guard all handle `contact` with legacy-flat fallback. `metadataEditModal.contact` + `assets.details.publicView.contact` i18n (en + ar).

#### Changed
- **Approvals screen split into Approvals + Approval Settings.** The single Approvals item is now two: the request queue (unchanged [list.page](src/app/pages/secure/approvals/list/list.page.ts)) and the separate Approval Settings page above. **Approvals became a standalone top-level sidebar item** (styled like Messages, admin + exec, keeps its pending-count badge) — moved out of the User Management group, which is now **admin-only** ([authorized-layout.component.html](src/app/shared/layouts/authorized-layout/authorized-layout.component.html) + `userManagementGroupVisible` getter in [.ts](src/app/shared/layouts/authorized-layout/authorized-layout.component.ts)). The `approvals/policy` child route was removed (relocated to `settings/approval-policy`).

#### Removed
- **"Manage Approval Policy" button** on the Approvals list page (+ its `openPolicy()` handler and now-unused `Router` import) — policy is reached solely via the new Approval Settings sidebar item.
- **Dead service contact-edit surface.** The service **Edit** modal ([modal-service-edit](src/app/pages/secure/services/modals/modal-service-edit/)) dropped its email / mobile / website inputs (and the `EditServiceData` fields) — they wrote to `PUT /services/:address/data`, an endpoint that never existed (404, silently swallowed). Service contact is now edited via the "Edit Metadata" flow (nested `contact`); the modal edits name + validator + payment processor only. The unused `vaultUpdateServiceData` API method + the dead `dataChanged` call in the service detail `openEditModal` were removed.

### 2026-07-19

#### Added
- **Signatures on shared documents**: the read-only [shared-details page](src/app/pages/secure/documents/shared-details/shared-details.page.ts) gained a full Signatures section — signer / submitter / signed-at / review-state rows with a **Verify** button (re-hashes the decrypted shared file + `ethers.verifyMessage` recovery, same flow as own-doc details) — riding the new recipient-relaxed signature reads (`documentSharedSignatures` in [api.service.ts](src/app/shared/services/api.service.ts)). The sender-side review verdict was already visible on the own-doc details Signatures tab.
- **Internal visibility (type 3)** in both add-document surfaces: a third Public/Private/**Internal** radio in [modal-document-add](src/app/pages/secure/documents/modals/modal-document-add/modal-document-add.component.html) and the shared [documents-tab](src/app/shared/components/documents-tab/) inline form (recipient picker stays Private-only; an explanatory hint appears for Internal). Purple type pill + labels (`documents.type.internal` / `documentsTab.docType.internal`, en+ar) across the list, details, shared-details and documents-tab; Publish now applies to Private AND Internal docs.
- **Images on services + entity profile (avatar / banner / gallery).** An Images section on the [service detail page](src/app/pages/secure/services/details/) Info tab and a new **Images** tab on the [admin profile page](src/app/pages/secure/profile/), rendering avatar/banner/gallery over the owner metadata's server-owned `media` index (blob previews via `serviceDocumentFetchFile` / `documentFetchFile`, Set Avatar/Banner/Unset, Remove). New shared [modal-image-add](src/app/shared/components/modal-image-add/) component (clone of `modal-asset-image-add`), `vaultSetServiceMediaRole` / `vaultSetEntityMediaRole` API methods + `imageRole` on the service/entity `*DocumentAddMultipart`, and a generic `media.*` i18n block (en+ar).
- **Tenant avatar as the UI logo** on the login page and the authenticated app-shell sidebar ([login.page](src/app/pages/public/user/login/login.page.html), [authorized-layout](src/app/shared/layouts/authorized-layout/authorized-layout.component.html)) — both `<img>`s now bind `[src]="apiService.avatarUrl"` (the public `GET /vault/avatar` endpoint) with an `(error)` fallback to the static `assets/images/logo.png` when no avatar is set. New `avatarUrl` getter on [ApiService](src/app/shared/services/api.service.ts) + `onLogoError` handlers on both components. Works pre- and post-auth identically (the endpoint is public, tenant-scoped).

#### Changed
- **Documents page is ONE list.** The `My Documents | Shared With Me` tab bar is gone — the page merges own documents and entity-level inbound shares into a single newest-first table ([list.page](src/app/pages/secure/documents/list/list.page.ts)): shared rows carry an Owner column + an indigo "Shared with you" pill and route to the shared-details view; own rows keep the state pill + details route. Documents shared by the entity's own services / assets / subscriptions keep living on those detail pages' Documents tabs.
- **Role 4 display label renamed `Security` → `Auditor`** — `{ value: 4, name: 'Auditor' }` in [modal-user-role](src/app/pages/secure/users/modals/modal-user-role/modal-user-role.component.ts) and the `users.roles.security` i18n value in [en.json](src/assets/i18n/en.json) / [ar.json](src/assets/i18n/ar.json) (`مدقق`). i18n keys and the underlying role number (4) are unchanged.

### 2026-07-18

#### Added
- **User Groups admin pages — role-scoped Menu Access + System Functions presets.** New `/authorized/settings/user-groups` (list: name / role badge / member count / updated, Add via the new [modal-group-add](src/app/pages/secure/settings/user-groups/modals/modal-group-add/modal-group-add.component.ts) pair — role 2 Executive | 3 Viewer, immutable after create) and `/authorized/settings/user-groups/details/:groupId` (editable name/description, Menu Access + System Functions toggle tables filtered by the group's role, Members table with View User links, member-guarded Delete) under [pages/secure/settings/user-groups/](src/app/pages/secure/settings/user-groups/); admin-only routes in [app.routes.ts](src/app/app.routes.ts) + a sidebar item next to Menu Settings ([authorized-layout.component.html](src/app/shared/layouts/authorized-layout/authorized-layout.component.html)). Membership is live — group edits reach members on their next features refresh; per-user overrides win.
- **Group picker in the Add-User modal + assignment on User Details.** [modal-user-add](src/app/pages/secure/users/modals/modal-user-add/modal-user-add.component.ts) shows a role-filtered User Group select (roles 2/3); [users/list](src/app/pages/secure/users/list/list.page.ts) assigns it post-create (same follow-up pattern as approval role). [users/details](src/app/pages/secure/users/details/details.page.ts) gained a User Group card (Assign/Change via the new [modal-user-group](src/app/pages/secure/users/modals/modal-user-group/modal-user-group.component.ts) picker, Clear, amber "Group inactive — role mismatch" warning) and the Menu Access + System Functions tabs now show a **Source** column (Override / Group / Default pill) with a per-row **Reset** that clears the explicit override back to inherit.
- [api.service.ts](src/app/shared/services/api.service.ts): `vaultUserGroups*` family (list/get/create/update/delete, group menu/function config, members, per-user membership get/set/clear) + `vaultUserMenuConfigClear` / `vaultUserSystemFunctionConfigClear`; `groupEnabled` on both per-user config row shapes; `UserGroup` model in [data.model.ts](src/app/shared/models/data.model.ts); Settings Backup labels for the 4 new tables; `settings.userGroups.*` / `users.details.group.*` / `users.details.source.*` / `users.groupModal.*` i18n in en/ar.
- **"Declare Distribution" button on the asset detail page is now gated by the new `asset-add-distribution` System Function.** Wrapped the Declare button in `features.systemFunctionEnabled('asset-add-distribution')` alongside the existing viewer role gate ([details.page.html](src/app/pages/secure/assets/details/details.page.html)); added the key→label mapping to [system-function-labels.ts](src/app/shared/constants/system-function-labels.ts) and the `systemFunctionLabels.assetAddDistribution` ("Asset - Add Distribution") string in en/ar. The toggle surfaces on User Details → System Functions for executive users; the Entity API mirrors it with a 403.
- **Add Asset wizard grew from 6 to 8 steps — optional Documents + Images attachments at creation.** New steps 6 (Documents: multi-file picker, per-file title/description + Public/Private select) and 7 (Images: `image/*` picker with thumbnails, per-image Avatar/Banner/Gallery role select — avatar/banner single-holder and forced Public) before Review, which now shows an attachments summary. Files are collected in the modal ([modal-asset-add.component.ts](src/app/pages/secure/assets/modals/modal-asset-add/modal-asset-add.component.ts)/[.html](src/app/pages/secure/assets/modals/modal-asset-add/modal-asset-add.component.html), `WizardDocFile`/`WizardImageFile` on [modal-asset-add.service.ts](src/app/pages/secure/assets/modals/modal-asset-add/modal-asset-add.service.ts)) and uploaded sequentially AFTER `vaultCreateAsset` returns the address ([list.page.ts](src/app/pages/secure/assets/list/list.page.ts) `uploadAssetAttachments` — per-file progress messages, continues past failures with one summary alert). The Entity API auto-folds public files into the asset metadata's server-owned `media` index per upload.
- **Images section on the asset detail Metadata tab** ([details.page.ts](src/app/pages/secure/assets/details/details.page.ts)/[.html](src/app/pages/secure/assets/details/details.page.html)): renders the `media` index (Avatar/Banner badges + gallery grid; images streamed via the ACL-checked `assetDocumentFetchFile` into revoked-on-leave blob URLs) with Upload Image (new [modal-asset-image-add](src/app/pages/secure/assets/modals/modal-asset-image-add/modal-asset-image-add.component.ts) modal pair), Set Avatar / Set Banner / Unset (`vaultSetAssetMediaRole` → `PUT /assets/:address/documents/:id/media-role`), and Remove. Gated by `view-documents` + the viewer role gate + `entityActive`.
- [api.service.ts](src/app/shared/services/api.service.ts): optional `imageRole` on the multipart upload metadata + `vaultSetAssetMediaRole`. i18n: `assets.addModal.wizard.*` attachment keys, `assets.addModal.uploadingAttachment`/`attachmentFailures*`, `assets.details.media.*`, `shared.metadataEditModal.errors.mediaReserved` in en/ar.
- **"View Asset" public-profile modal** on the asset detail page (button on the Metadata tab's action row, left of Edit Metadata; visible to viewers — read-only public info): a showcase card of the asset's PUBLIC presentation — banner hero with symbol pill (gradient fallback), overlapping avatar, name + issuing entity + asset type line, description, metadata key/values, gallery grid, and the public documents list with per-doc View (blob open). All sourced from the asset row + the metadata `media` index + the page's media blob cache. New modal pair [modal-asset-public-view](src/app/pages/secure/assets/modals/modal-asset-public-view/modal-asset-public-view.component.ts) (+ service), `openViewAssetModal()` in [details.page.ts](src/app/pages/secure/assets/details/details.page.ts); i18n `assets.details.publicView.*` in en/ar.

#### Changed
- `media` is now a reserved metadata key everywhere: excluded from the asset detail Metadata tab's KV table ([details.page.ts](src/app/pages/secure/assets/details/details.page.ts) `parsedMetadata`), rejected as a custom key by the wizard's metadata step and the shared [metadata-edit-modal](src/app/shared/components/metadata-edit-modal/metadata-edit-modal.component.ts) (defence-in-depth — the Entity API strips + recomputes it server-side on every metadata PUT).

#### Fixed
- Add Asset button hung the UI: the wizard's open-effect called `resetAttachments()`, which READS the attachment signals (registering them as effect deps) and then writes a fresh `[]` reference — re-triggering the effect forever. Both the wizard reset and the new image-add modal's reset (where the same tracked read would have wiped a just-selected file) are now wrapped in `untracked(...)` ([modal-asset-add.component.ts](src/app/pages/secure/assets/modals/modal-asset-add/modal-asset-add.component.ts), [modal-asset-image-add.component.ts](src/app/pages/secure/assets/modals/modal-asset-image-add/modal-asset-image-add.component.ts)).

#### Added
- **New-thread modal now supports Connect v2 user handles + document attachments** (compose-flow parity). The recipient search is unified — one list surfaces both whole parties AND specific users (handle picks like `alice@entityX`, amber "User" badge), keyed by `party+userId`. Handle picks apply to the entity/regulator kinds (subscription stays party-only). A user pick contributes its party as a thread participant and, on create, targets the initial message to that user (explicit `to[]`, whole party ⇒ userId 0) making it a DM; otherwise reply-all. Added an attachment picker (≤10 files) riding on the initial message via the new `connectThreadCreateMultipart` in [api.service.ts](src/app/shared/services/api.service.ts). Files at [modal-new-thread.component.ts](src/app/pages/secure/messages/modals/modal-new-thread/modal-new-thread.component.ts) / [.html](src/app/pages/secure/messages/modals/modal-new-thread/modal-new-thread.component.html); i18n keys `messages.newThreadModal.userBadge`/`attachments`/`attachmentsAdd`/`attachmentsHint` in en/ar.

#### Changed
- **Security officer (role 4) can be granted a read-only, full-audit Messages view — PER USER, set by the admin at create time (default OFF).** The create-user modal ([modal-user-add](src/app/pages/secure/users/modals/modal-user-add/)) shows a role-4-only "Allow Messages access" checkbox (default off, mirrors the role-2 `approvalRole` conditional); on create the [users list page](src/app/pages/secure/users/list/list.page.ts) writes `vaultUserMenuConfigSet(id,'messages',true)` only when ticked (same find-by-username follow-up as approval-role/group). Access surfaces: `messages` route `allowedRoles: [1,2,3,4]` ([app.routes.ts](src/app/app.routes.ts)) + `menuFeatureGuard('messages')` (server fold now grants `messages` per-user, default off); the sidebar Messages item is features-driven (its `role != 4` exclusion removed); the unread badge poll now runs only when `features.menuEnabled('messages')` ([authorized-layout.component.*](src/app/shared/layouts/authorized-layout/)) so a denied officer never 403s. Read-only enforced in the pages: `isReadOnly = role===4` on [list](src/app/pages/secure/messages/list/list.page.ts) + [details](src/app/pages/secure/messages/details/details.page.ts) hides New thread / compose+Send / reply-privately / delete / close / add+remove participants / leave (AND-ing `!isReadOnly` into every write `@if` + defensive early-returns); auto mark-read skipped (passive audit); read-info spans stay for audit. i18n `users.addModal.messagesAccessLabel`/`messagesAccessHint` (en/ar).
- **User Details → a "Messages Access" control** (Auditor targets only) beside the Connect Handle on the Details tab ([users/details](src/app/pages/secure/users/details/details.page.ts) + `.html`): shows Granted / Not granted (from the `messages` per-user override via `vaultUserMenuConfigList`) with Grant / Revoke buttons (`vaultUserMenuConfigSet(id,'messages',true|false)` + confirm) so the grant is viewable and changeable after creation, not just at create time. i18n `users.details.messagesAccess.*` (en/ar).
- Messages details: moved the **Close thread** button from the breadcrumb row down onto the tabs row, right-aligned (`ml-auto self-center`), in [details.page.html](src/app/pages/secure/messages/details/details.page.html). Added a file-types/size hint under the compose **Attach** button ("Any file type · up to 25 MB each · max 10", `messages.details.compose.attachHint`), and enriched the New-thread modal attachment hint to match.
- Messages details **Add participants** search now also offers user-handle suggestions (`connectRecipientsSearch('user', …)`) alongside entities/regulators/subscriptions in [details.page.ts](src/app/pages/secure/messages/details/details.page.ts) — a handle pick resolves to its party (participants are parties), deduped by address so a name-matched party wins.

#### Fixed
- Messages details "To" handle-picker AND "Add participants" dropdowns: suggestion text was near-invisible (inherited light color) — added `text-gray-800` to the result buttons in [details.page.html](src/app/pages/secure/messages/details/details.page.html).
- Production build was broken by a pre-existing `noImplicitAny` (TS7006) on `active.find(r => …)` in [modal-asset-add.component.ts](src/app/pages/secure/assets/modals/modal-asset-add/modal-asset-add.component.ts) (regulator default-picker) — annotated `(r: any)` to match the surrounding style.
- **i18n QA round — raw dictionary keys showing in the admin pages (production build green).** Three label-map helpers returned the translation KEY instead of the translated text: `labelFor`/`fnLabelFor` on [users/details](src/app/pages/secure/users/details/details.page.ts) (Menu Access + System Functions tabs showed `systemFunctionLabels.*`/`menuLabels.*`) and `labelFor` on [settings/menu](src/app/pages/secure/settings/menu/menu.page.ts) — all three now wrap in `translate.instant(...)` (also fixes the tabs' filter/sort/confirm text, which used the same helpers).
- **45 missing keys** invisible to the literal scanner (referenced via label-map constants or template ternaries where the literal isn't directly before `| translate`) filled in [en.json](src/assets/i18n/en.json)/[ar.json](src/assets/i18n/ar.json): the 6 `settings.backup.settingLabels.*` (Settings Backup rows rendered raw), `settings.menu.disabledState`/`shownVerb`/`hiddenVerb`, the external-integrations enable/disable verbs + consequences, signer-keys confirm dialogs, place-order wizard step descriptions, transaction-add ternary options/submit labels, service-detail visibility/liquidity/party labels, fee-config placeholders, and the share-modal manual-address toggle. Verified by a new key-path sweep (quoted dictionary-path literals in TS + templates checked against both dictionaries) — remaining hits are Angular property bindings, not keys.

#### Fixed
- **Arabic/RTL sweep repaired and completed (production build green).** The 2026-07-16 multi-agent sweep left ~184 files converted to `| translate` bindings but the dictionaries incomplete; this pass filled the gap: **890 missing keys** written to [en.json](src/assets/i18n/en.json) + [ar.json](src/assets/i18n/ar.json) with context-derived English + MSA Arabic (now 2,589 keys each, full parity, zero orphan references verified by scan). The 16 modal components missing `TranslatePipe` in their standalone imports (the NG8004 build breaker) had already been fixed in a prior session — verified, none remain.
- Last hardcoded user-facing strings extracted: the 4 ZK-login spinner stage messages + logout confirm in [auth.service.ts](src/app/shared/services/auth.service.ts), and the loading messages on the Credit, Custody, DEX Trades (list + details), and Messages list pages — all via `translate.instant(...)` with 9 new keys.

#### Notes
- Deliberately English (per plan): PDF/Excel export headers, console/internal strings, breadcrumb aria landmarks, `dd/mm/yyyy` and `0x…` format placeholders. `rtl:` Tailwind icon-mirroring variants and date/number locale formatting remain out of scope.

### 2026-07-16

#### Added
- **Connect v2 messages UI (twin of the Regulator Dashboard change, same day; production build green).** Messages detail page ([details.page.ts](src/app/pages/secure/messages/details/details.page.ts) + [.html](src/app/pages/secure/messages/details/details.page.html)) rewritten: per-message To chips + purple Direct/lock styling on DMs + "read by X of N" receipts; compose with reply-all default (empty `to[]` = on-chain snapshot), per-message "Reply privately", cross-tenant **direct-To handle picker** (`type=user` search → `{party, userId}` chips), and an attachments picker (≤10, multipart) with per-message DM-gated downloads; Participants tab with Add (entity / regulator / **subscription** search — subscriptions join as the subscriber's identity via `{subscriptionAddr}` targets; newcomers automatically receive the decryptable history), Active/Removed status, creator-only Remove, non-creator Leave. The separate subscriber-broadcast box is gone — v2 reply-all covers it.
- **Connect Handle card** on User Details ([users/details](src/app/pages/secure/users/details/details.page.ts)) — set/rename/clear the user's direct-message handle (admin-only page), showing the composed `handle@entityName` full address.

#### Changed
- [api.service.ts](src/app/shared/services/api.service.ts): v2 connect block (multipart send to `/vault/connect/threads/:id/messages`, message-scoped content + attachment blob fetch — `_fetchFileBlob` needs the explicit `/vault` prefix — participants add/remove/leave, `vaultUserHandle*`, handles resolve, `type=user` search). [data.model.ts](src/app/shared/models/data.model.ts): `ConnectMessage` v2 (`recipients[]`, `attachmentCids[]`, `isDirect`), new `ConnectMessageRecipient`/`ConnectAttachmentMeta`, `ConnectParticipant.state`. New-thread modal: 99-recipient cap for all kinds; v2 `initialMessage {text, contentType}` goes to all participants.

### 2026-07-15

#### Changed
- **Add Subscription modal redesigned for the SP-canonical model** ([modal-add-subscription](src/app/pages/secure/subscriptions/modals/modal-add-subscription/)): Mode A (existing DID) lost its dead validator picker; Mode B is now a canonical-result entry form — provider picker (the attached validator that performed the verification), optional provider name, `providerTrxRefNo`/`providerTrxTime`, raw national ID, and a structured canonical identity section (required National ID + Full Name, expandable extra fields) posting to `/users/onboard/new`.
- **Credit modals renamed onto the unified envelope**: the deposit modal's PP picker submits `provider` + `providerTrxRefNo` + a new optional `providerTrxTime` backdate field (`note` → `raw:{note}`); the bank/route transfer modals send `providerTrxRefNo`/`providerTrxTime`/`raw` ([api.service.ts](src/app/shared/services/api.service.ts) credit methods retyped).
- External Integrations settings page reduced to the pure-config surface (no adapter/capabilities/Test/link-services UI); `ExternalIntegration` model trimmed; the Settings Backup page dropped the `integration_services` label.

#### Removed
- Dead `ekycVerifyNID` / `ekycTransactionInquiry` / `ekycFetchImages` API-service methods (never called) and the integrations test/links/candidates methods + models.

### 2026-07-14

#### Changed
- **Sliding session — no more fixed 1-hour logout.** [auth.guard.ts](src/app/shared/guards/auth.guard.ts) now gates on the real session via `SessionService.getActiveToken()` (then rehydrates the ethers wallet + contracts) instead of the fixed-1h `sessionExpiry` Preferences clock; [auth.service.ts](src/app/shared/services/auth.service.ts) no longer writes `sessionExpiry` at login. Paired with the Entity API's now-sliding refresh window, an active user is never force-logged-out at a fixed hour (session slides on activity — 30min idle, 8h absolute cap); using `getActiveToken()` in the guard makes route navigation count as activity. CLAUDE.md session section updated.
- **`SESSION_DURATION` now sent in SECONDS, sized to cover the sliding session.** [auth.service.ts](src/app/shared/services/auth.service.ts) `SESSION_DURATION` changed `60 * 60 * 1000` (ms) → `12 * 60 * 60` (12h in seconds); the claim wizard's placeholder + DID-bridge durations in [claim.page.ts](src/app/pages/public/user/claim/claim.page.ts) converted to their intended seconds (`30 * 60`, `5 * 60`). The Entity API now treats `sessionDuration` as seconds (default 3600). **12h, not 1h, is deliberate:** it must stay `>=` the API's 8h off-chain cap (`SESSION_MAX_TTL_SEC`) so the on-chain admin session (`_adminSigner` — every user-management / signer-key / document-signing / config write relays through it) stays valid for the entire sliding off-chain session. (Previously the value was ms fed to the on-chain `login()`, making the on-chain session ~41.6 days.)
- **Design-system conformance pass (audited against [Tarmiiz Design Components](../../../Tarmiiz%20Design%20Components/index.html)).** Concrete deviations from the standard recipes, fixed:
  - **Native `confirm()` → shared `AlertService`** (Standard 5). Replaced browser `confirm()` in [documents/details](src/app/pages/secure/documents/details/details.page.ts) (delete / unshare / publish — incl. the multi-line publish warning), [assets/details](src/app/pages/secure/assets/details/details.page.html) (execute / finalize distribution), and the standalone [services/documents/details](src/app/pages/secure/services/documents/details/details.page.ts) + [assets/documents/details](src/app/pages/secure/assets/documents/details/details.page.ts) (delete / unshare) with `await this.alertService.show(title, message, confirmLabel)`. All six sites already injected `AlertService`; the confirm now renders as the styled Cancel/Confirm modal.
  - **Hardcoded `bg-[#202a3b]` → `bg-[var(--brand-primary)]`** on the [external-integrations](src/app/pages/secure/settings/external-integrations/external-integrations.page.html) modal headers (2 spots).
  - **Button-recipe normalization to the sanctioned palette/recipe:** list-page Add buttons ([users/list](src/app/pages/secure/users/list/list.page.html), [services/list](src/app/pages/secure/services/list/list.page.html), [assets/list](src/app/pages/secure/assets/list/list.page.html)) went brand-var/`+`-glyph → `bg-blue-700` + inline plus-SVG (disabled classes preserved); [transactions/list](src/app/pages/secure/transactions/list/list.page.html) Add `indigo-600`→`blue-700`; the three [services/details](src/app/pages/secure/services/details/details.page.html) party "+ Add" buttons (Validators `indigo-600` / Payment Processors `emerald-600` / Custodians `purple-600` — three different off-palette hues) unified to `blue-700` + icon; [assets/details](src/app/pages/secure/assets/details/details.page.html) Declare (`indigo-600`→`blue-700`+icon) and Load Snapshot (`indigo-600 py-2`→`indigo-700 py-1.5`); [users/details](src/app/pages/secure/users/details/details.page.html) Change Approval Role `indigo-600`→`indigo-700`; [settings/backup](src/app/pages/secure/settings/backup/backup.page.html) Backup Now → base recipe `blue-700` + icon; and the [register-existing modal](src/app/pages/secure/assets/modals/modal-asset-register-existing/modal-asset-register-existing.component.html) Register button `emerald-600`→`blue-700`.
  - **Dashboard section-table thead** outlier `bg-gray-400` → the documented `bg-gray-100` on [dashboard](src/app/pages/secure/dashboard/dashboard.page.html) (Top Moving Assets); the `bg-gray-600` section header bars are the sanctioned dashboard exception.
  - Count footers: no change needed — every list page already carries a footer, an inline pager (`transactions/list`), or a `{{ count() }} total` header (`approvals/list`).
  - Production build passes (exit 0). NOT changed (deliberate, flagged as a separate follow-up): the cross-app `violet-600`/`amber-600`/`rose-600` semantic action-button palette (Change Credentials / Change Role / Change State) — a coherent intentional system; remapping it to sanctioned `indigo-700`/`orange-700`/`red-700` is a larger design decision.

#### Removed
- **Dead mobile-era CSS purged from [global.scss](src/global.scss)** (503 → 215 lines, same pass as the Regulator Dashboard's identical cleanup). Removed rules with zero references anywhere in `src/`: `.page-title`, the `.balance-container`/`.balance-card` family, the entire `.table-container` ion-grid family (`.grid-header`/`.grid-footer`/`.alternate-row`/`.no-data`), `.app-footer ion-tab-bar`, `ion-segment`/`ion-segment-view`, `.block-watcher-bar`, the `.info-card`/`.item-title`/`.item-data` family, both media queries, the never-matching nested `ion-header .header-md` descendant duplicate, and the unused `.form-container` children (`.form-input`, `.form-links`, `.form-steps`, `h3`). Kept everything with live references: `:root` brand vars, `ion-content`, the `ion-header ion-toolbar` header styling, the `form-*` card recipe (referenced by the not-yet-routed forgot-password page — kept for RD parity), `.badge-symbol`/`.badge-currency`/`.badges`, and all `html.lang-ar` RTL rules. Production build passes (exit 0); styles bundle now 103.58 kB.

### 2026-07-13

#### Added
- **Viewer (role 3) is read-only across the app.** Every action button on the viewer-reachable pages gained the platform's `@if (userInfo && userInfo.role !== 3)` gate (or an equivalent role condition in a `can*()` helper): Add Transaction ([transactions/list](src/app/pages/secure/transactions/list/list.page.html)), Add Subscription ([subscriptions/list](src/app/pages/secure/subscriptions/list/list.page.html)), subscription Add Credit, service Edit Venue Fees + Liquidity Inject/Withdraw ([services/details](src/app/pages/secure/services/details/details.page.html)), asset Distributions Declare/Execute/Finalize ([assets/details](src/app/pages/secure/assets/details/details.page.html)), all DEX writes (Create Venue, venue tier requests, Create Listing, listing-venue add/tier/remove, order Cancel on list + details), the standalone asset/service/entity document pages' Add, and the shared [documents-tab](src/app/shared/components/documents-tab/documents-tab.component.html) write surface (Add/Edit/Share/Publish/Remove/Unshare/Sign — new `isViewer()` helper; reads stay). **Messaging deliberately exempt** (product decision). The Entity API mirrors every one of these with a `requireNotViewer` 403, so the template gates are UX, not the security boundary.
- **Export Excel / Export PDF buttons are System-Functions-gated.** Every export button across the list/detail pages (18 pairs on 12 pages) + the shared [modal-transaction-info](src/app/shared/components/modal-transaction-info/) / [modal-credit-trx-info](src/app/shared/components/modal-credit-trx-info/) PDF buttons are wrapped in `features.systemFunctionEnabled('export-excel')` / `('export-pdf')`. EXCEPTION: the role-4-exclusive `logs/*` pages stay unwrapped (the `/features/me` role-4 fold zeroes every function and would hide them from the Security officer). Labels in [system-function-labels.ts](src/app/shared/constants/system-function-labels.ts).
- **Document viewing is System-Functions-gated (`view-documents`).** The shared [documents-tab](src/app/shared/components/documents-tab/) component wraps its entire template in the function check (single chokepoint for the asset/service/subscription Documents tabs, muted "Document viewing is disabled for your account" fallback); the three detail pages hide their Documents tab button; the entity documents page (incl. Shared-with-me) and the standalone asset/service docs lists gate their content. Pairs with the Entity API's 403 on every document READ route.
- **The three shared keys group under an "Action - " label prefix** — `Action - Export Excel` / `Action - Export PDF` / `Action - View Documents` in [system-function-labels.ts](src/app/shared/constants/system-function-labels.ts), so they cluster together in the label-sorted System Functions tab.
- **My Profile page now includes a Current Password step and admins reach it.** The self-service form ([users/my-profile](src/app/pages/secure/users/my-profile/my-profile.page.html)) is now **Change Password** (Current Password / New Password / Confirm) and calls the new `ApiService.vaultUserSelfCredentials` → `PUT /vault/users/:id/self-credentials` (`{ currentPassword, password }`; the API verifies the current password before rotating and surfaces `"Current password is incorrect"` inline), replacing the prior two-call `credentials` + `data` flow. Password-only — the username stays editable only on the admin Users page (self-service username change isn't supported by the contract). The `my-profile` route's `allowedRoles` widened `[2,3,4]` → `[1,2,3,4]`. Production build passes (exit 0).

#### Changed
- **User Details tabs are viewer-allow-list-aware** ([users/details](src/app/pages/secure/users/details/details.page.ts)): new `isViewerTarget()`; the Menu Access + System Functions tab hints explain that a viewer account starts with every module/function BLOCKED and the admin grants them (roles 1/2 keep the restrict-only copy). The toggles themselves were already bidirectional — the role-aware defaults come from the API.
- **Activity Logs filter recognises the new `admin` category** ([logs/activity/activity.page.ts](src/app/pages/secure/logs/activity/activity.page.ts)) — added `'admin'` to `activityCategories` so the admin config-change rows the Entity API now records (`category='admin'` — System Functions / Menu Settings / Menu Access / Maker-Checker gate toggles) are filterable on the Activity Logs page. Rows already render regardless of category; this only adds the dropdown option.
- **The header profile icon now routes ALL roles to `/authorized/users/my-profile`** ([header.component.ts](src/app/shared/components/header/header.component.ts) `profileRoute`) — previously admins were bounced to their own admin user-detail management page; the person-circle icon now opens the personal My Profile page for everyone.

#### Removed
- **The manual "Resync Blockchain Data" modal + the header resync button.** Deleted the `modal-resync` component + service, the header's Resync button and its `openResyncModal` logic + `syncing` signal, the `vaultSyncResync` / `vaultSyncStatus` [api.service.ts](src/app/shared/services/api.service.ts) methods, and the `modalResync` + `header.resync` i18n keys (en + ar). The button triggered the Entity API's now-removed `POST /vault/sync/{trigger,resync}` routes, which were no-ops under plugin-owned Tier-1 ingest (they early-return on a populated DB). Live updates already flow from the plugin's Socket.io `vault:updated` push channel, so the manual trigger was dead weight. [en.json](src/assets/i18n/en.json), [ar.json](src/assets/i18n/ar.json).

### 2026-07-12

#### Added
- **System Functions tab on User Details — per-user, per-user-type action-button gating.** A third tab alongside Details / Menu Access ([users/details/details.page.ts](src/app/pages/secure/users/details/details.page.ts) + [.html](src/app/pages/secure/users/details/details.page.html)) that lists the executive action buttons an admin can allow/block for one user (today: Bank Transfer, Route Credit). **Content-driven visibility** — the list is eager-loaded on enter and the tab renders only when at least one function applies to the target user's role (so it's hidden for admins/viewers). Backed by new `ApiService.vaultUserSystemFunctionConfigList` / `vaultUserSystemFunctionConfigSet` ([api.service.ts](src/app/shared/services/api.service.ts)) and a shared [system-function-labels.ts](src/app/shared/constants/system-function-labels.ts) label map. `FeaturesService` gained a `systemFunctions` signal + `systemFunctionEnabled(key)` (hydrated from the `systemFunctions` map now returned by `GET /vault/features/me`) ([features.service.ts](src/app/shared/services/features.service.ts)).

#### Changed
- **Credit page action buttons are gated by System Functions, not the retired menu toggle.** The Bank Transfer / Route Credit block ([credit/credit.page.html](src/app/pages/secure/credit/credit.page.html)) is now wrapped per-button in `features.systemFunctionEnabled('credit-bank-transfer')` / `('credit-route-credit')` (was the single `menuEnabled('credit-operator-actions')`), so an admin can allow one button without the other and a disabled user never sees them (the Entity API also 403s the endpoints). In the same pass the block was moved into the **Total Credit** card — currency totals on the left, the two buttons pinned right (heading + descriptive paragraph dropped). Removed the dead `credit-operator-actions` entry from [menu-labels.ts](src/app/shared/constants/menu-labels.ts) (it no longer comes back from `MENU_ITEMS`).
- **Settings Backup page lists Per-User System Functions** — added the `user_system_function_config → 'Per-User System Functions'` label ([settings/backup/backup.page.ts](src/app/pages/secure/settings/backup/backup.page.ts)); the row itself appears automatically now that the API added the table to `SETTINGS_BACKUP_TABLES`.

### 2026-07-11

#### Changed
- **Audit surfaces are now Security-officer-exclusive** (mirror of the Regulator Dashboard's same-day change). The Audit Trail + Activity Logs sidebar items went from roles 1|4 to role 4 ONLY ([authorized-layout.component.html](src/app/shared/layouts/authorized-layout/authorized-layout.component.html) — they were already top-level here); all logs routes (`logs/my`/`system`/`activity`/`details/:id`) tightened to `allowedRoles: [4]` with the empty-path redirect now landing on `system` ([app.routes.ts](src/app/app.routes.ts)); the [role.guard.ts](src/app/shared/guards/role.guard.ts) role-4 rejection redirect and the details-page breadcrumb + actor/contract filter links now target `logs/system` (the full tenant-wide trail — the Entity API's `/audit/system` already returns every user's actions unfiltered). Admin keeps API-level audit access but has no UI entry.

#### Added
- **Excel + PDF export on the Activity Logs page** ([activity.page.ts](src/app/pages/secure/logs/activity/activity.page.ts), [.html](src/app/pages/secure/logs/activity/activity.page.html)) — same pattern as the Audit Trail pages (XLSX + jsPDF/autoTable + `applyPdfFooter`, timestamped filenames), a button pair in the tab bar exporting the active tab's loaded page: Activity (Time/Category/Action/Target/Details/User/Client IP) and State Changes (Time/Type/Action/Address/New Value/Reason/User/Client IP/Tx Hash in Excel).

#### Fixed
- **Asset details → Add Service picker skipped the alphabetically-first service** ([modal-asset-add-service.component.ts:63](src/app/pages/secure/assets/modals/modal-asset-add-service/modal-asset-add-service.component.ts#L63)): the candidate fetch passed `start = 1` to `vaultGetServicesOwn`, but `/vault/services/own` treats `start` as a 0-based SQL `OFFSET` — so the first row of `services_view ORDER BY name ASC` was silently dropped (every other Vault caller passes 0). Now `start = 0`. The picker also now **omits services already associated with the asset** (case-insensitive filter against the modal's `currentServices()`), instead of listing them and only erroring on selection; the manual-address path keeps its explicit "already associated" error.
- **Close Thread button placement on the message-thread page** ([details.page.html](src/app/pages/secure/messages/details/details.page.html)): the breadcrumb bar here is a flex row (it hosts the live indicator), which shrank the inner breadcrumb+button row to content width and defeated its `justify-between` — the button rendered crammed over the thread title. The inner row now takes `flex-1 min-w-0` (+ a gap before the Live indicator) so the button sits at the right edge, matching the Regulator Dashboard's thread page.

### 2026-07-10

#### Added
- **Security officer role (4) — logs-only UI** (mirror of the Regulator Dashboard's same-day change). [role.guard.ts](src/app/shared/guards/role.guard.ts) is deny-by-default for role 4 (redirects to `authorized/logs/my`); logs routes opened in [app.routes.ts](src/app/app.routes.ts) (`logs/my` + `logs/details/:id` → `[1,2,3,4]`, `logs/system` → `[1,4]`, `users/my-profile` → `[2,3,4]` for password self-service). Sidebar ([authorized-layout.component.html](src/app/shared/layouts/authorized-layout/authorized-layout.component.html)): Audit Trail visible to roles 1|4; exec/viewer blocks tightened from `role != 1` to `role == 2 || role == 3`; Messages/Variables hidden for role 4. Role 4 added to the role maps, list filter, and the **hardcoded** role arrays in both user modals ([modal-user-add](src/app/pages/secure/users/modals/modal-user-add/modal-user-add.component.ts), [modal-user-role](src/app/pages/secure/users/modals/modal-user-role/modal-user-role.component.ts)); i18n `role.security` + `sidebar.activityLogs` in [en.json](src/assets/i18n/en.json) / [ar.json](src/assets/i18n/ar.json).
- **New Activity Logs page** (`/authorized/logs/activity`, roles 1|4) — first Vault surface over the off-chain operational trail: an **Activity** tab (`logs_activity` — page navigation / exports / approvals, with category filter) and a **State Changes** tab (`logs_state_changes`), both with user + client-IP columns and pagination, consuming the existing `vaultGetActivityLogs` / `vaultGetAllStateChangeLogs` API methods that previously had no page. New [pages/secure/logs/activity/](src/app/pages/secure/logs/activity/activity.page.ts) + sidebar item.
- **Audit trail readability + verifiability columns** (mirror of the Regulator Dashboard's): `AuditLog` model gained `action_label` / `prev_hash` / `row_hash` / `verified` ([data.model.ts](src/app/shared/models/data.model.ts)); my/system lists show the persisted Action label + User + Client IP columns (exports updated; full 28-value category filter); the details page always refetches by id and shows the Verified/Tampered chip + Row/Prev Hash fields ([logs/my](src/app/pages/secure/logs/my/my.page.ts), [logs/system](src/app/pages/secure/logs/system/system.page.html), [logs/details](src/app/pages/secure/logs/details/details.page.ts)).

#### Changed
- **Add-subscription modal: the eKYC path no longer picks a validator** (canonical two-path model, I2 — the Entity API derives it from the eKYC provider that ran the verification). The validator picker now renders only in Mode A (existing-DID reference relay); Mode B shows an info note and sends no `validator` ([modal-add-subscription](src/app/pages/secure/subscriptions/modals/modal-add-subscription/modal-add-subscription.component.ts)).
- **External Integrations: Enable is gated until a validator is linked** for `ekyc`-category rows (`linkedServices === 0` disables the button with a tooltip), mirroring the API-side guard ([external-integrations.page.html](src/app/pages/secure/settings/external-integrations/external-integrations.page.html)).

### 2026-07-05

#### Changed
- **Onboarding modal follows the Entity API's endpoint split**: `usersOnboard(body, mode)` now targets `POST /users/onboard/did` (Mode A — existing DID) or `POST /users/onboard/ref` (Mode B — eKYC reference); the auto-detecting `/users/onboard` is gone ([api.service.ts](src/app/shared/services/api.service.ts), [modal-add-subscription.component.ts](src/app/pages/secure/subscriptions/modals/modal-add-subscription/modal-add-subscription.component.ts)). Bodies and response handling unchanged. (The API's one-call multipart `/users/onboard/new` is for server-to-server integrations — the Vault modal keeps collecting the reference fields.)

### 2026-07-04

#### Added
- **External API Integrations admin page replaces eKYC Providers** (`/authorized/settings/external-integrations`, admin-only core page; the old `ekyc-providers` route redirects) — mirror of the Regulator Dashboard page. List with Category pill, params-set count, Linked Services count; Add Integration (name slug + category datalist + adapter select for 'ekyc'); edit modal with adapter schema fields (masked write-only, Remove/Restore) + free key/value rows with per-key secret checkbox; link modal (searchable type-2 service checkbox picker + derived "Consumed by" section); Delete. New [pages/secure/settings/external-integrations/](src/app/pages/secure/settings/external-integrations/external-integrations.page.ts); `vaultIntegrations/Create/Update/Delete/Test/Links/LinksSet/ServiceCandidates` in [api.service.ts](src/app/shared/services/api.service.ts); `ExternalIntegration`/`IntegrationParam`/`IntegrationServiceLink`/`IntegrationConsumer`/`IntegrationServiceCandidate` models in [data.model.ts](src/app/shared/models/data.model.ts) (the `EkycProvider`/`EkycCredentialField` models, `vaultEkyc*` methods, and the old page are gone); route + redirect in [app.routes.ts](src/app/app.routes.ts); sidebar item renamed in [authorized-layout.component.html](src/app/shared/layouts/authorized-layout/authorized-layout.component.html); Settings Backup labels for `external_integrations` + `integration_services` in [backup.page.ts](src/app/pages/secure/settings/backup/backup.page.ts).

#### Changed
- **Bank/route transfer modals require a Reference No** (`trxRefNo` — the SP's external transaction reference; the old optional refNo is gone) and gained an optional backdatable Transaction date (`datetime-local` → unix seconds). [modal-bank-transfer](src/app/pages/secure/credit/modals/modal-bank-transfer/modal-bank-transfer.component.ts), [modal-route-transfer](src/app/pages/secure/credit/modals/modal-route-transfer/modal-route-transfer.component.ts), [api.service.ts](src/app/shared/services/api.service.ts).
- **Credit transaction info modal** shows a "Reference No" row and — when the row carries a receipt `dataCid` — a "View SP receipt" action that resolves the service-owned encrypted receipt document by CID through the existing service-documents machinery and streams the decrypted file (PDF export gained the Reference No row too). `CreditTransaction` model + subscription-details mapper carry `parentTrxId`/`trxRefNo`/`dataCid`. [modal-credit-trx-info](src/app/shared/components/modal-credit-trx-info/modal-credit-trx-info.component.ts), [data.model.ts](src/app/shared/models/data.model.ts).

### 2026-07-03

#### Added
- **eKYC Providers admin settings page** (`/authorized/settings/ekyc-providers`, admin-only core page — never menu-gated). Provider table (status / default / credentials-set count / capabilities / actions) with per-row **Edit** (modal with the adapter's `credentialFields` — secret fields masked and write-only: empty keeps the stored value), **Test** (live connection check), **Set Default**, and **Enable/Disable** (AlertService confirms with the consequence spelled out, e.g. disabling the default provider). Credential values never reach the browser — only per-field `set` flags. New [pages/secure/settings/ekyc-providers/](src/app/pages/secure/settings/ekyc-providers/ekyc-providers.page.ts); `vaultEkycProviders` / `vaultEkycProviderUpdate` / `vaultEkycProviderTest` in [api.service.ts](src/app/shared/services/api.service.ts); `EkycProvider` + `EkycCredentialField` models in [data.model.ts](src/app/shared/models/data.model.ts); route in [app.routes.ts](src/app/app.routes.ts) + sidebar item in [authorized-layout.component.html](src/app/shared/layouts/authorized-layout/authorized-layout.component.html).

#### Changed
- **Settings Backup page** knows the new `ekyc_providers` table (label "eKYC Provider Credentials"; the backup-all confirm no longer says "four" tables) ([pages/secure/settings/backup/backup.page.ts](src/app/pages/secure/settings/backup/backup.page.ts)).

### 2026-06-21

#### Added
- **Multi-attach service providers (1:N).** The service-detail page lists all attached validators / payment processors / custodians per role, each with **+ Add** / **Remove** and an inactive pill ([src/app/pages/secure/services/details/details.page.ts](src/app/pages/secure/services/details/details.page.ts)). `api.service` gained `vaultGetServiceParties` / `vaultAttachServiceParty` / `vaultDetachServiceParty` ([src/app/shared/services/api.service.ts](src/app/shared/services/api.service.ts)); the legacy single-provider reassign modals are kept as replace-over-1:N compatibility wrappers.
- **Credit deposit** modal: payment-processor picker restricted to the service's attached PPs + a required **Transaction Ref No** ([src/app/pages/secure/subscriptions/modals/modal-credit-deposit/modal-credit-deposit.component.ts](src/app/pages/secure/subscriptions/modals/modal-credit-deposit/modal-credit-deposit.component.ts)).
- **Onboarding** modal: validator picker over the service's attached validators (required when the service has more than one) ([src/app/pages/secure/subscriptions/modals/modal-add-subscription/modal-add-subscription.component.ts](src/app/pages/secure/subscriptions/modals/modal-add-subscription/modal-add-subscription.component.ts)).

### 2026-06-14

#### Added
- **Per-user Menu Access tab on User Details.** Admins can now hide individual top-level modules for a single user, layered on top of the tenant-wide Menu Settings. New **Menu Access** tab on [users/details/details.page.html](src/app/pages/secure/users/details/details.page.html) / [.ts](src/app/pages/secure/users/details/details.page.ts) (rendered only for non-admin role 2/3 targets — admins bypass menu gating). **Restrict-only:** a per-user toggle can only further hide a module the vault enables, never re-enable one disabled tenant-wide (the fold happens server-side). The tab lists only tenant-enabled + `features.modeAllows(key)` modules and notes that changes take effect on the user's next login. New `vaultMyFeatures()` / `vaultUserMenuConfigList()` / `vaultUserMenuConfigSet()` on [api.service.ts](src/app/shared/services/api.service.ts).

#### Changed
- **`FeaturesService.refresh()` now picks its source by auth state** ([shared/services/features.service.ts](src/app/shared/services/features.service.ts)) — a live session reads the effective per-user map (`GET /vault/features/me`); pre-login reads the public tenant map (`GET /vault/features`). `menuEnabled()` / `dex()` are unchanged (the server applies the restrict-only fold). `AuthService.login()` calls `features.refresh()` after the session is set, and `logout()` calls it again to fall back to the public map ([shared/services/auth.service.ts](src/app/shared/services/auth.service.ts)).
- **Extracted the menu-key label map to a shared constant** ([shared/constants/menu-labels.ts](src/app/shared/constants/menu-labels.ts), `MENU_LABELS` + `menuLabelFor`), imported by both the Menu Settings page ([settings/menu/menu.page.ts](src/app/pages/secure/settings/menu/menu.page.ts)) and the new Menu Access tab instead of an inline copy.

### 2026-06-07

#### Changed
- **Asset-add modal — currency picker narrowed to the entity's regulator-approved currencies.** The asset's currency is chosen from the country list (the platform uses the country ISO numeric as the currency code); the picker now filters those countries to the codes the entity's regulator has approved, so an entity can't pick a currency that would revert on-chain at `registerAsset`. If the regulator hasn't approved any currency, the picker is empty (the entity can't create assets — matching the on-chain gate). Fetches the approved set via the new `vaultGetApprovedCurrencies('active')` ([api.service.ts](src/app/shared/services/api.service.ts), `GET /vault/approved-currencies` — read-only; the regulator owns the set). [modal-asset-add.component.ts](src/app/pages/secure/assets/modals/modal-asset-add/modal-asset-add.component.ts).
- **Asset-add modal — inverted the credit-settlement checkbox so credit settlement is the default.** The checkbox now reads **"Do not use Credit Settlement"** (checked = opt out); leaving it unchecked enables credit settlement, which is now the default. The underlying form control was renamed `creditSettlement` → `noCreditSettlement` (default `false`), the no-payment-processor auto-toggle now forces opt-out (`true`), and the submit handler derives `creditSettlement: noCreditSettlement !== true`. The emitted `AddAssetData.creditSettlement` boolean (and everything downstream through the Entity API) is unchanged — UI-only inversion. [modal-asset-add.component.ts](src/app/pages/secure/assets/modals/modal-asset-add/modal-asset-add.component.ts) / [.html](src/app/pages/secure/assets/modals/modal-asset-add/modal-asset-add.component.html).

### 2026-06-06

#### Added
- **Edit asset + service metadata.** New shared, reusable [metadata-edit-modal](src/app/shared/components/metadata-edit-modal/) (free-form Description + arbitrary key/value rows, with reserved-`description` + duplicate-key validation) wired onto both the **asset** detail Metadata tab and the **service** detail Information footer via an **Edit Metadata** action (gated `userInfo.role !== 3` + `[disabled]="!entityActive"`). New `vaultUpdateAssetMetadata` / `vaultUpdateServiceMetadata` on [api.service.ts](src/app/shared/services/api.service.ts) (`PUT /vault/{assets,services}/:address/metadata`). [assets/details/details.page.ts](src/app/pages/secure/assets/details/details.page.ts) + [.html](src/app/pages/secure/assets/details/details.page.html), [services/details/details.page.ts](src/app/pages/secure/services/details/details.page.ts) + [.html](src/app/pages/secure/services/details/details.page.html).

#### Changed
- **Assets list — dropped the Service column, fixed the Type column.** Removed the SERVICE column + the Service filter (and from Excel/PDF exports) per request; the TYPE column (and the "Type" filter) now show **Supply Mode** (Fixed/Dynamic) instead of the always-`0` `assetType`. [assets/list/list.page.html](src/app/pages/secure/assets/list/list.page.html) / [.ts](src/app/pages/secure/assets/list/list.page.ts).
- **Asset details Information — split the muddled "Token Type" row.** The single "Token Type" row was bound to `tokenTypeName` but rendered the stale Fixed/Dynamic global-vars label (so a T20 showed "Fixed Supply Token"). Replaced with a **Contract Type** row derived from the numeric `tokenType` (T20/T3643) plus a correctly-labelled **Supply Mode** row (`supplyModeName`). [assets/details/details.page.html](src/app/pages/secure/assets/details/details.page.html).

#### Fixed
- **Asset Type was never set for dynamic-supply assets.** The asset-add modal only collected/sent `assetType` when supply mode was Fixed — so every Dynamic asset (e.g. a money-market fund) was created on-chain with `assetType = 0` and rendered with a blank Asset Type. Asset Type (the real-world category) is independent of supply mode, so it's now a required field shown for **all** supply modes; only Initial Supply stays Fixed-only. The list create handler sends `assetType` for both modes (NaN-guarded). [modal-asset-add.component.ts](src/app/pages/secure/assets/modals/modal-asset-add/modal-asset-add.component.ts) / [.html](src/app/pages/secure/assets/modals/modal-asset-add/modal-asset-add.component.html), [modal-asset-add.service.ts](src/app/pages/secure/assets/modals/modal-asset-add/modal-asset-add.service.ts), [assets/list/list.page.ts](src/app/pages/secure/assets/list/list.page.ts). The asset detail page already showed Contract Type / Supply Mode / Asset Type as distinct rows — no display change needed.

### 2026-06-05

#### Added
- **Operator Actions on the Credit page — Bank Transfer + Route Credit.** New card on [credit.page](src/app/pages/secure/credit/credit.page.ts) with two form modals: [modal-bank-transfer](src/app/pages/secure/credit/modals/modal-bank-transfer/) (move an identity's credit between its bank-account hub and a spoke subscription — acting service picked from the entity's own type-2 services) and [modal-route-transfer](src/app/pages/secure/credit/modals/modal-route-transfer/) (route a subscriber's credit to that same identity's account at another service — source picked from the entity's own type-1 services, destination is a service address; the sibling subscription is resolved on-chain and never shown). Both branch on `res.requestId` to surface the "Submitted for approval" toast. New `bankTransfer()` / `routeTransfer()` on [api.service.ts](src/app/shared/services/api.service.ts); `_creditMutation` now also surfaces `requestId` / `approvalState`.

#### Changed
- **Credit-origin label fallback extended to 11–14** ([pages/secure/subscriptions/details/details.page.ts](src/app/pages/secure/subscriptions/details/details.page.ts)) — `Service Settle Fee`(11), `Cross Service Settle Fee`(12), `Bank Transfer`(13), `Identity Route`(14) added to the hardcoded `creditOriginNames` fallback (primary source remains the `Credit Transaction Origin` global-vars `originMap`).

### 2026-06-04

#### Added
- **Entity declares its service-provider sub-type at creation.** The service-add wizard ([modal-service-add](src/app/pages/secure/services/modals/modal-service-add/)) gains a required **Provider Type** dropdown (Validator / Payment Processor / Custodian / Data Provider, loaded from the `Regulator Party Type` global category) shown only for `serviceType == 2 (Service Provider)`. The Review step notes the choice is "pending regulator confirmation". The selection is sent as `providerType` in the create payload; `AddServiceData` + the `Service` model + the list/detail row mappers gained `providerType` / `providerTypeName`. [modal-service-add.component.ts](src/app/pages/secure/services/modals/modal-service-add/modal-service-add.component.ts), [modal-service-add.component.html](src/app/pages/secure/services/modals/modal-service-add/modal-service-add.component.html), [modal-service-add.service.ts](src/app/pages/secure/services/modals/modal-service-add/modal-service-add.service.ts), [services/list/list.page.ts](src/app/pages/secure/services/list/list.page.ts), [services/details/details.page.ts](src/app/pages/secure/services/details/details.page.ts), [data.model.ts](src/app/shared/models/data.model.ts).

### 2026-06-01

#### Added
- **Admin "Menu Settings" page** ([pages/secure/settings/menu/](src/app/pages/secure/settings/menu/), route `/authorized/settings/menu`, role 1). A single table listing every toggleable module with an on/off switch (ported from the Regulator Dashboard policy page — confirm-before-toggle via `AlertService`, Tailwind `peer` switch). Toggling calls `features.refresh()` so the sidebar updates live without a reload. Persisted per tenant via the Entity API's new `menu_config`. Two new [api.service.ts](src/app/shared/services/api.service.ts) methods: `vaultMenuConfigList()` + `vaultMenuConfigSet(key, enabled)`.
- **Custody page folded in from the retired Service Dashboard** ([pages/secure/custody/](src/app/pages/secure/custody/), route `/authorized/custody`, roles 2/3, gated by `menuFeatureGuard('custody')`). API-backed (decision: no second direct-on-chain path) — lists the entity's own type-2 (custodian-eligible) services via `vaultGetServicesOwn`, each row links into the existing service-detail custodian assign/reassign flow. The "services under my custody" reverse index remains a labelled placeholder (needs an Entity API reverse lookup that doesn't exist yet).
- **`sidebar.custody` + `sidebar.menuSettings`** i18n keys in [en.json](src/assets/i18n/en.json) / [ar.json](src/assets/i18n/ar.json).

#### Changed
- **`FeaturesService` generalized into the menu control plane** ([features.service.ts](src/app/shared/services/features.service.ts)). Added a `menu` signal (`Record<string,bool>`) + `menuEnabled(key)` (absent key ⇒ enabled, so core/unknown items never vanish), hydrated from the extended `GET /vault/features`. `dex()` is now `envDex && menuEnabled('dex')` — the env kill switch AND the admin toggle. `vaultFeatures()` in [api.service.ts](src/app/shared/services/api.service.ts) now surfaces both `dex` and the `menu` map.
- **Route guards + menu rendering honour the toggles** ([app.routes.ts](src/app/app.routes.ts), [authorized-layout.component.html](src/app/shared/layouts/authorized-layout/authorized-layout.component.html)). The old single-purpose `dexFeatureGuard` is generalized into a `menuFeatureGuard(key)` factory applied to every toggleable top-level route (so a disabled module is **hidden and** blocked by direct URL); each sidebar item gained an `@if(features.menuEnabled('…'))` check on top of its existing role gate. DEX keeps the combined env+toggle `dex()` check. The admin nav gained a "Menu Settings" link.
- **Login routes entirely through the Entity API — no direct RPC reads** ([ethers.service.ts](src/app/shared/services/ethers.service.ts), [api.service.ts](src/app/shared/services/api.service.ts), [auth.service.ts](src/app/shared/services/auth.service.ts), [claim.page.ts](src/app/pages/public/user/claim/claim.page.ts)). The Vault's browser environment has no network route to the RPC node, so the two remaining direct chain reads during auth were removed. `createLoginPayload` no longer calls `entityContract.getUserCredentialsData()` — it now requires `{ nonce, commitment }` fetched by `ApiService` from the new public `GET /vault/users/credentials-data`; added a pure `computeLoginHash(username)` helper. The bootstrap-admin DID-claim step likewise no longer reads `commitment()`/`nonce()` off the IdentityTemplate — `createIdentityLoginPayload` takes credentials from the new `GET /vault/identity/credentials-data`. ZK proof generation stays 100% client-side. Removed the dead, RPC-touching `getGlobalVariableByCategory()`.

#### Fixed
- **Custodian picker in the service-add / custodian-reassign flows always came back empty** ([api.service.ts](src/app/shared/services/api.service.ts)). `vaultGetEndorsedCustodians()` called `GET /vault/regulators/:reg/custodians/endorsed`, a route that doesn't exist on the Entity API (only `GET /vault/custodians` does) → 404 → empty dropdown. Repointed to `/vault/custodians` (the API derives the entity's regulator server-side and merges owned + endorsed, mirroring `/validators` and `/payment-processors`). Signature kept so the three call sites (service-add modal, custodian-reassign modal, service detail) are fixed together. The empty validator / payment-processor pickers in the same wizard were a separate Entity API decode bug — see that repo's CHANGELOG.
- **Add-Asset wizard failed for dynamic-supply tokens with `underflow (… value=NaN)`** ([list.page.ts](src/app/pages/secure/assets/list/list.page.ts)). The create payload only carried `assetType` for **fixed**-supply assets (`supplyMode === 1`), but the on-chain `InitParams` struct requires `assetType` for both supply modes — so a dynamic-supply create sent `undefined`, the Entity API ran `Number(undefined)` → `NaN`, and ethers rejected it while encoding the `uint8`. Now always sends `assetType` (defaulting to `0` = unspecified for dynamic funds, which have no UI picker), keeping `initialSupply` fixed-only.

### 2026-05-27

#### Added
- **T20 / T3643 standard picker in the Add Asset wizard** ([modal-asset-add.component.ts](src/app/pages/secure/assets/modals/modal-asset-add/modal-asset-add.component.ts) + `.html`). Step 1 now leads with a two-column standard-picker (radio cards: TarmiizT20 "Fund / Real-World Asset" vs TarmiizT3643 "Security Token (ERC-3643)"); `tokenType` form control defaults to '1' and is required to advance. Review step's Token Configuration card shows the chosen standard above supply mode. `tokenType` is read from the form on confirm (was hardcoded `1`); the Entity API routes to the matching factory.
- **Register-existing modal** ([modal-asset-register-existing/](src/app/pages/secure/assets/modals/modal-asset-register-existing/)) — Path B for issuer-deployed BYO contracts. Two-state form: address input + Preview button calls `assetPreviewRegister`, displays conformance pass/reject + standard / tokenType / name / symbol / currencyCode / issuer / manager / regulator (short addresses hover-titled to full); Confirm button (enabled only when `preview.ok === true`) calls `assetRegisterExisting`. Wired to the assets list page beside `+ Add Asset` as a secondary "Register Existing" button (entityActive-gated). On success, refreshes the list + toasts a confirmation.
- **Distributions tab on asset detail** ([details.page.ts](src/app/pages/secure/assets/details/details.page.ts) + `.html`). New `'distributions'` tab on the activeTab union. Header row carries `Refresh` + `+ Declare` (entityActive-gated). Read list table: `#`, type (`Credit Dividend` / `Stock Split`), amount, record block, state badge (color-coded gray/blue/green/amber for Declared/Executing/Completed/PartiallyCompleted), legs progress (sent/failed/total), declared timestamp + declarer (hover title). Per-row `Execute` + `Finalize` buttons on Declared / Executing states. The smart Execute handler walks all Pending legs chain-paginated when no `holders[]` is given. Empty-state copy explains Credit pre-funding requirement.
- **Declare distribution modal** ([modal-distribution-declare/](src/app/pages/secure/assets/modals/modal-distribution-declare/)) — radio picker (Credit Dividend / Stock Split cards with subtitles), amount input with big-int validation, record-block input (0 = current), sweepResidual checkbox (Credit only). `canConfirm` computed gate on amount > 0. Amber pre-fund warning on Credit type.
- **Holders at Block tab on asset detail** — block-number input + Load Snapshot button + paginated holder reconstruction list (`#`, account in monospace, balance in monospace). Empty-state prompt before first query; result headline shows total count vs page size.
- **10 new `api.service.ts` methods** covering the full BYO surface: `distributionsList / distributionGet / distributionLegsList / distributionDeclare / distributionExecute / distributionLegRetry / distributionFinalize / assetHoldersAt / assetBalanceAt / assetPreviewRegister / assetRegisterExisting`. Routed through `authGet/authPost` (mounted at `/api/v1/assets/...`, not under `/vault/...`).

### 2026-05-22

#### Added
- **Read-only regulator-hold surface on the subscription detail Holdings tab** ([pages/secure/subscriptions/details/details.page.html](src/app/pages/secure/subscriptions/details/details.page.html), [.ts](src/app/pages/secure/subscriptions/details/details.page.ts)). New `Held` column with amber pill `(activeHolds)` count + a conditional per-row `View` / `Hide` button that expands a read-only history table per (asset, subscription) pair showing each hold (id, original, released, remaining, state, reason, created). Entity never places or releases holds — those are regulator-only actions surfaced through the Regulator API. `available` now subtracts `regulatorHeld` so the displayed "spendable" number matches what the chain will actually let through.
- **`RegulatorHold` data model + 2 read-only API methods** in [data.model.ts](src/app/shared/models/data.model.ts) and [api.service.ts](src/app/shared/services/api.service.ts): `vaultGetSubscriptionRegulatorHolds(subscription, asset, start, offset)` (paginated holds + summary) and `vaultGetAssetRegulatorHold(asset, holdId)` (single-hold detail).

#### Changed
- **`SubscriptionHolding` model** in [data.model.ts](src/app/shared/models/data.model.ts) gains optional `regulatorHeld?: number` + `regulatorActiveHolds?: number`. `getHoldings` in `details.page.ts` enriches each row in parallel with the new endpoint and tightens `available` to `balance - withheld - regulatorHeld`.

### 2026-05-13

#### Added
- **Service visibility (Public / Private) UI.** `Service` in [data.model.ts](src/app/shared/models/data.model.ts) gained `visibility: number = 1`. [modal-service-add](src/app/pages/secure/services/modals/modal-service-add/) Step 1 (Configuration) gets a Public / Private select with descriptive labels, defaulting to Public; threaded through `AddServiceData`, the form reset, the submit payload, and on through to [services/list/list.page.ts](src/app/pages/secure/services/list/list.page.ts) `vaultCreateService` body. Service detail header ([services/details/details.page.html](src/app/pages/secure/services/details/details.page.html)) renders a visibility badge (Public = emerald, Private = amber) next to the state badge plus a **Change Visibility** action button — handler `onChangeVisibility()` in [details.page.ts](src/app/pages/secure/services/details/details.page.ts) flips 1↔2 via the new [api.service.ts](src/app/shared/services/api.service.ts) `vaultSetServiceVisibility(address, visibility)` method (PUT `/vault/services/:address/visibility`), refreshes the row, and surfaces a "Submitted for approval" alert if the API response carries `requestId`. The `mapVaultService` mapper picks up `visibility` from the API row (defaults to 1 for legacy rows). UX note: flipping visibility auto-suspends the service on-chain — the regulator must re-enable; the flow shows the badge change immediately and the suspended state appears on the next sync tick.
- **"Validator inactive" amber pill + "Reassign Validator" CTA** on services and subscriptions. List rows in [services/list/list.page.html](src/app/pages/secure/services/list/list.page.html) and [subscriptions/list/list.page.html](src/app/pages/secure/subscriptions/list/list.page.html) render the pill when `service.validatorActive === false` / `subscription.validatorActive === false`. Service detail page ([services/details/details.page.html](src/app/pages/secure/services/details/details.page.html)) additionally renders an amber **Reassign Validator** button beneath the Validator field when the flag is set — gated on `entityActive && userInfo.role !== 3 && isTokenIssuer()`, opens the pre-existing `modal-service-validator`. Subscription detail page renders the pill inline next to the bound validator name. `Service` + `Subscription` in [data.model.ts](src/app/shared/models/data.model.ts) gained `validatorActive: boolean = true` (defaults to active so legacy rows render correctly during rollout).
- **Asset Price Mode (Phase A) UI.** [data.model.ts](src/app/shared/models/data.model.ts) `Asset` gained `priceMode: number` (+ optional `priceModeName?: string`); `AssetService` gained `feeConfig: FeeConfig | null` and a new `FeeConfig` interface (`buyFeeMode/buyFeeValue/buyFeeDestination` + sell side; modes 0=None, 1=Bps, 2=Fixed). [modal-asset-add](src/app/pages/secure/assets/modals/modal-asset-add/) Step 1 gets a Price Mode select; `tokenType` valueChanges re-defaults the field (`tokenType=1`→BidAsk, `tokenType=2`→Single) so the picker tracks the prevailing convention; `priceMode` threads through to the submit payload + the review step. [modal-asset-price](src/app/pages/secure/assets/modals/modal-asset-price/) predicate switched from `tokenType===1` to `priceMode===2` — in Single mode a single "Price" input is shown and the modal submits `bid = ask` on save; in BidAsk mode both inputs are rendered with `ask >= bid` validation. The asset list page gets a "Price Mode" chip column; the detail page header shows the mode chip alongside the existing token-type/asset-type chips, and the price table conditionally renders a single Price column vs Bid+Ask columns.
- **Per-(asset, service) fee config (Phase B) UI.** Three new [ApiService](src/app/shared/services/api.service.ts) methods route to the new vault endpoints: `vaultGetAssetFeeConfig(asset, service)`, `vaultSetAssetFeeConfig(asset, service, cfg)`, `vaultQuoteAssetFee(asset, service, direction, gross)`. New standalone component [modal-asset-fee-config](src/app/pages/secure/assets/modals/modal-asset-fee-config/) — per-side (Buy + Sell) mode picker (None/Bps/Fixed) + value input + destination address with validation: None requires zero value + zero address, Bps requires integer 1-2000 (matches on-chain `FEES_MAX_BPS`), Fixed multiplies the user-entered decimal by 1e18 via `ethers.parseEther` before submit. Asset detail "Services" table gets a "Fee Config" column with an inline summary of each service's current buy/sell fee + a per-row "Edit Fees" button. The button is disabled when `canQuote=false` (on-chain `setFeeConfig` reverts in that state — surfaces a tooltip explaining the link).

#### Changed
- **[ApiService.vaultSetAssetPrice](src/app/shared/services/api.service.ts)** signature tightened from a `price`-flavoured call to `(asset, bid, ask, timestamp)`. Single-mode callers compute `bid = ask` themselves before invoking. Matches the API's unified `POST /vault/assets/.../price` shape.

### 2026-05-12

### Added
- **Maker/checker approvals UI (list page + admin-only policy page + per-user role selector + side-menu badge).** New `/authorized/approvals/list` page ([pages/secure/approvals/list/](src/app/pages/secure/approvals/list/)) — filter by approval state (default Pending), search, inline Approve / Reject / Withdraw buttons gated by the current user's cached `approval_role` + the row's SoD constraint. Rejections collect a required reason via `window.prompt`. New admin-only `/authorized/approvals/policy` page ([pages/secure/approvals/policy/](src/app/pages/secure/approvals/policy/)) — single-table toggle per category with `AlertService` confirmation; gated by `data: { allowedRoles: [1] }`. Entity-vault scope is narrower than the Regulator Dashboard's: 4 categories (`service_state`, `subscription_state`, `asset_state`, `asset_service_state`). **Routes** added to [app.routes.ts](src/app/app.routes.ts): `approvals/{list,policy}`. **Side menu** in [authorized-layout.component.html](src/app/shared/layouts/authorized-layout/authorized-layout.component.html) gained an "Approvals" link (admin + exec) with a live count badge fed by a new `pendingApprovalsCount` signal on [authorized-layout.component.ts](src/app/shared/layouts/authorized-layout/authorized-layout.component.ts); refreshes on `ionViewWillEnter` and on every `approvals:created` / `approvals:decided` socket event. **User-detail page** in [users/details/](src/app/pages/secure/users/details/) gained an "Approval role" dropdown (None / Maker / Checker) — disabled unless the target user is role=2; persists via `vaultUserApprovalRoleSet`.
- **9 new `ApiService` methods** in [api.service.ts](src/app/shared/services/api.service.ts), all routed through `authGet/Post/Put/Delete` (not `vaultGet*` — the new endpoints are at `/api/v1/approvals*` and `/api/v1/users/:id/approval-role`, NOT under `/vault/...`): `vaultApprovalsList`, `vaultApprovalGet`, `vaultApprovalApprove`, `vaultApprovalReject`, `vaultApprovalCancel`, `vaultApprovalsPolicyList`, `vaultApprovalsPolicySet`, `vaultUserApprovalRoleGet`, `vaultUserApprovalRoleSet`.
- **New data models** in [data.model.ts](src/app/shared/models/data.model.ts): `PendingApproval` (full constructor + `fromApi` factory), `ApprovalPolicyRow` interface + `approvalPolicyFromApi` mapper, `ApprovalRole` union, `APPROVAL_STATE_NAMES` lookup.
- **Socket service** in [socket.service.ts](src/app/shared/services/socket.service.ts) gained `approvalsCreated$` + `approvalsDecided$` streams + matching `socket.on(...)` wiring.
- **"Submitted for approval" toasts** on 4 vault state-change call sites: asset detail (`vaultUpdateAssetState`, `vaultSetAssetServiceState`), service detail (`vaultUpdateServiceState`), subscription detail (`vaultUpdateSubscriptionState`). When the API response carries `requestId`, an alert fires; today's direct-execute path is unchanged when policy is off.

### Added
- **Arabic (RTL) language support — foundation, shared shell, and per-page page titles across all 39 secure pages.** Wired `@ngx-translate/core@^16.0.4` + `@ngx-translate/http-loader@^16.0.1` with the HTTP loader pattern from the Alimony Judicial Regulator reference. New [language.service.ts](src/app/shared/services/language.service.ts) — signal-based, persists per-browser to `localStorage` under key `tarmiizVaultLang`, sets `<html lang dir>` + `.lang-ar`/`.lang-en` classes imperatively at boot via `provideAppInitializer`. Added Cairo Google Font (200–900 weights) in [index.html](src/index.html), with conditional `font-family: 'Cairo', 'Inter', ...` + Arabic font-size bump and `table.text-left` → right alignment flip in [global.scss](src/global.scss).
- **Comprehensive translation JSON** — [en.json + ar.json](src/assets/i18n/) seeded with all namespaces: `common`, `state`, `role`, `partyType`, `header`, `sidebar`, `login`, `claim`, `alerts`, `dashboard`, `services`, `assets`, `subscriptions`, `transactions`, `credit`, `analytics`, `documents`, `messages`, `signerKeys`, `users`, `variables`, `profile`, `logs`, `dex`, plus per-modal namespaces. Arabic copy reuses Alimony reference where keys overlap; best-effort Arabic for Tarmiiz token-issuer-specific terminology (credit, transactions, AUM analytics, DEX, etc.).
- **Language toggle UI** — pill button on the login page bottom and inside the authorized-layout sidebar footer ([login.page.html](src/app/pages/public/user/login/login.page.html), [authorized-layout.component.html](src/app/shared/layouts/authorized-layout/authorized-layout.component.html)). Calls `LanguageService.toggle()` and re-renders live.
- **Shared shell translation** — sidebar menu labels (Home, Services, Assets, Transactions, Subscriptions, Credit, Messages, Users, Analytics + sub-items, DEX + sub-items, Entity Profile, Documents, Signer Keys, Audit Logs, System Variables), header welcome with `{{name}}` interpolation, header icon tooltips (Resync / Messages / Profile / Logout), entity-restricted banner ([header.component.html](src/app/shared/components/header/header.component.html), [authorized-layout.component.html](src/app/shared/layouts/authorized-layout/authorized-layout.component.html)). Login page fully translated. RTL `rtl:` Tailwind variants added on sidebar/login icons (margin/padding flip + chevron rotation).
- **Per-page title translation across all 39 secure-page templates** (dashboard, assets list/details + asset documents, credit, services list/details + service documents, subscriptions list/details, transactions list, documents list/details, messages list/details, users list/details/my-profile, profile, signer-keys, logs/details, variables, the 6 analytics inline-template pages, and 9 DEX pages venues/listings/orders/trades/order-book). Every `<app-header title="…">` now binds to a translation key, and every component standalone-imports `TranslatePipe`. Bulk-applied via PowerShell across both `.html` templates and inline-template `.ts` files (analytics pages).

### Fixed
- Header default title was hardcoded to `'Tarmiiz Regulator Dashboard'`; now resolves to `'header.title' | translate` which is `'Tarmiiz Vault'` in en + `'خزينة ترميز'` in ar.

### Notes
- Deep per-page content (filter labels, table headers, modal bodies, alerts, Chart.js axis labels) is still in English on most pages; tracked as a follow-up in the platform [TODO.md](../../../TODO.md). The translation infrastructure, JSON namespaces, and component-level `TranslatePipe` imports are in place, so the remaining work is mechanical string-by-string `translate`-pipe application.
- Both `npm run build` and `ng build --configuration development` complete cleanly.
