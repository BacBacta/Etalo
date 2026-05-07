# Sprint J11.7 — Geographic Location + Delivery Address

**Status** : Planned, awaits Mike kickoff post-J11 BLOCKING closure
**Tracking ADRs** : ADR-044 (delivery address) + ADR-045 (geo filters)
**Estimated effort** : ~40-60h (5-7 working days)
**Depends on** : J11 BLOCKING items closed + ADR-043 buyer interface
mergé (V1.1 tag)
**Unblocks** : J12 mainnet deploy + listing submission with usable
V1 UX

---

## Sprint goals

1. Ship mandatory country on seller + buyer profiles, auto-detected
   from MiniPay where possible
2. Ship structured delivery address capture at checkout with
   address book pattern
3. Ship marketplace country filter + simple sort
4. Maintain V1 launch readiness with 0 contract changes (pure
   schema + API + frontend)

---

## Block 1 — Backend schema migrations (~4h)

**Owner** : Mike
**File location** : `packages/backend/alembic/versions/`

**Spec**

Single migration file adding both ADR concerns :

- `seller_profile.country : str` (nullable initially for
  migration safety, app-level validation enforces non-null
  going forward)
- `buyer_profile.country : str` (same nullable pattern)
- New table `delivery_addresses` :
  - `id : uuid PK`
  - `buyer_id : uuid FK`
  - `phone_number : str`
  - `country : str`
  - `city : str`
  - `region : str`
  - `address_line : str` (free-form)
  - `landmark : str | null`
  - `notes : str | null`
  - `is_default : bool` (default first added is default)
  - `created_at / updated_at`
  - Index on `(buyer_id, is_default)`
- `orders.delivery_address_snapshot : json` (immutable copy at
  fund time — preserves history even if buyer deletes from book)
- Existing `orders.delivery_address : str | null` deprecated but
  kept for backward compat (legacy free-text from V0/J5)

**Migration strategy** :
- Schema additive only, no destructive changes
- Existing sellers without country : prompted at next login
- Existing buyers without country : auto-populated from MiniPay
  phone country code if connectable

**Test cases** : alembic upgrade + downgrade clean

**Acceptance** : migration runs, existing data preserved

---

## Block 2 — Backend address book CRUD endpoints (~4h)

**Owner** : Mike
**File location** : `packages/backend/app/routers/addresses.py`
(new) or extend `users.py`

**Spec**

- `GET /api/v1/me/addresses` — list buyer's addresses
- `POST /api/v1/me/addresses` — add new (validate fields)
- `PATCH /api/v1/me/addresses/{id}` — edit
- `DELETE /api/v1/me/addresses/{id}` — soft delete
- `POST /api/v1/me/addresses/{id}/set-default` — toggle default

**Validation** :
- Country must be in {NIGERIA, GHANA, KENYA} (ADR-041 enum)
- Phone must match country code if MiniPay phone available
- All required fields non-empty after trim

**Permission** : caller must be the buyer (X-Wallet-Address header
per ADR-036, soft filter pattern from ADR-043)

**Test cases** : 8-10 unit/integration tests

**Acceptance** : pytest green, swagger doc updated

---

## Block 3 — Backend marketplace filter (~3h)

**Owner** : Mike
**File location** : extend `packages/backend/app/routers/products.py`
+ `sellers.py`

**Spec**

- `GET /api/v1/products?country=<NIGERIA|GHANA|KENYA>` — filter
- `GET /api/v1/sellers?country=...` — filter
- Default behavior : if no country param + authenticated buyer
  has country in profile → filter to buyer's country
- `?country=all` or omit param without auth → return all

**Sort param** :
- `?sort=newest` (default)
- `?sort=popular` — by completed_orders count (if data
  available, otherwise fallback to newest)

**Backend validation** :
- Order creation endpoint : block if buyer.country ≠
  seller.country with clear error message
- Tests for the cross-border block

**Test cases** : 5-7 tests covering filter combinations + cross-
border block

**Acceptance** : pytest green, manual API test confirms filter

---

## Block 4 — Frontend seller onboarding country (~3h)

**Owner** : Mike
**File location** :
`packages/web/src/app/seller/onboarding/...`

**Spec**

- Add country dropdown step in seller onboarding flow
- 3 options : Nigeria / Ghana / Kenya
- Required field, can't proceed without selection
- Existing sellers without country : redirect to onboarding
  step on next login (soft block on dashboard)

**Components** :
- `CountrySelector` (reusable across seller + buyer)
- Use existing onboarding flow pattern

**Test cases** : 4-5 vitest

**Acceptance** : tests green, manual test confirms flow

---

## Block 5 — Frontend buyer country detection (~2h)

**Owner** : Mike
**File location** :
`packages/web/src/lib/buyer-country.ts` (new) +
`packages/web/src/app/profile/...`

**Spec**

- On first wallet connect via MiniPay : try to detect country
  from phone number (MiniPay exposes phone via SocialConnect ?
  Verify what's actually accessible)
- If accessible : auto-populate buyer_profile.country
- If not : prompt buyer at first marketplace visit with
  country dropdown
- Allow editing in `/profile` settings page

**Components** :
- `useBuyerCountry()` hook
- Profile country edit UI

**Test cases** : 4-5 vitest, mock MiniPay phone

**Acceptance** : tests green, manual test confirms detection
+ fallback flow

---

## Block 6 — Frontend address book UI (~6h)

**Owner** : Mike
**File location** :
`packages/web/src/app/profile/addresses/...`

**Components to create** :

- `AddressBookPage` (under `/profile/addresses`)
- `AddressCard` (one per saved address)
- `AddressFormModal` (add / edit)
- `AddressSelectorList` (used in checkout — Block 7)
- `useAddresses` hook (TanStack Query)
- `lib/addresses/api.ts` (fetcher)

**Behavior** :
- List buyer's addresses
- Add new : modal with 4-5 fields (country / city / region /
  address line / phone — phone optional if MiniPay available)
- Edit existing
- Delete (soft, with confirmation)
- Set default toggle
- Empty state : "Aucune adresse enregistrée. Ajoutez-en une
  pour faciliter vos achats."

**Test cases** : 8-10 vitest

**Acceptance** : tests green, accessible via header/profile menu

---

## Block 7 — Frontend checkout address picker (~5h)

**Owner** : Mike
**File location** :
`packages/web/src/app/checkout/...` + `components/checkout/...`

**Spec**

- Replace current "fill any string" UX with structured form
- Two paths :
  - Pick from address book (if any saved) — list with default
    pre-selected
  - Add new : form modal, save automatically to book on submit
- Required step before "Fund order" can be tapped
- Validation : all required fields non-empty + country must
  match seller's country (or block with cross-border error
  per ADR-045)

**Components** :
- `CheckoutDeliveryAddressStep` (new)
- Reuse `AddressSelectorList` + `AddressFormModal` from Block 6

**Validation flow** :
- Country mismatch → show error "Ce vendeur livre uniquement
  au {seller.country}. Sélectionnez ou ajoutez une adresse
  dans ce pays." with disabled fund button until resolved
- Empty fields → standard form validation

**Test cases** : 6-8 vitest covering normal + mismatch flows

**Acceptance** : tests green, smoke E2E continues to work
post-block

---

## Block 8 — Frontend seller dashboard delivery address display (~3h)

**Owner** : Mike
**File location** : `packages/web/src/app/seller/dashboard/...`
+ `components/seller/...`

**Spec**

- On order detail (seller side), surface full delivery address :
  - Phone, country, city, region
  - Address line (free-form)
  - Landmark + notes if present
- "Coordinate via WhatsApp" deeplink button :
  `https://wa.me/{phone_no_plus}?text={pre_filled}`
  pre-filled with order ID + greeting
- Address visible only post-fund (matches escrow lifecycle)

**Components** :
- `OrderDeliveryAddressCard` (displays the snapshot from
  `orders.delivery_address_snapshot`)
- `WhatsAppCoordinateButton`

**Privacy** : address only fetched when seller is the seller
of the order (existing privacy guard from ADR-043)

**Test cases** : 4-5 vitest

**Acceptance** : tests green, address renders correctly per
order state

---

## Block 9 — Frontend marketplace country filter (~4h)

**Owner** : Mike
**File location** :
`packages/web/src/app/marketplace/...` +
`components/marketplace/...`

**Spec**

- Country filter chips (Nigeria / Ghana / Kenya / All)
- Default : buyer's country (from profile)
- Visual : pill-style buttons or chips with active state
- "All countries" pill to override
- Touch targets ≥ 44×44 (CLAUDE.md design standards)
- Sort dropdown : Newest / Popular (if data exists)

**State** : URL query param `?country=NIGERIA&sort=newest` for
shareability + back/forward nav

**Components** :
- `CountryFilterChips`
- `MarketplaceSortDropdown`

**Test cases** : 5-6 vitest including filter persistence on URL

**Acceptance** : tests green, filter survives navigation

---

## Block 10 — Tests + lint + tsc + build delta + a11y audit (~3h)

**Owner** : Mike

- All vitest pass (~+45-60 new tests vs baseline 419+)
- All pytest pass (~+20-25 new backend tests)
- `pnpm lint` clean
- `pnpm tsc --noEmit` clean
- `pnpm build` successful, capture bundle delta vs J11.5
  baseline
- Lighthouse mobile re-run on `/profile/addresses`,
  `/checkout` (post update), `/marketplace` (post filter)
- WCAG AA compliance verified on new components
- Smoke E2E re-run via orchestrator (Block 8 from J11.5),
  but with structured address — verify the fundOrder flow
  still works end-to-end with the new schema

**Acceptance criteria for sprint closure** :

- [ ] Buyer can save / edit / delete addresses in `/profile/addresses`
- [ ] Buyer must select address at checkout, can't fund without
- [ ] Cross-border purchase blocked at backend with clear error
- [ ] Seller dashboard shows full delivery address post-fund
- [ ] WhatsApp deeplink works on real device test
- [ ] Marketplace shows buyer's country by default
- [ ] "All countries" toggle works
- [ ] Sort by newest / popular works
- [ ] Existing sellers without country prompted to complete
- [ ] All tests pass + 0 régression
- [ ] No contract changes (pure schema + API + frontend)
- [ ] ADR-044 + ADR-045 referenced in commit messages

---

## Block 11 — PR open + review + merge (~2h)

**Owner** : Mike
**Branch** : `feat/geo-and-delivery-address`

- Open single PR against `main` covering both ADRs
- Review focus :
  - Schema migration safety (alembic up/down)
  - Privacy : delivery_address_snapshot only readable by
    buyer or seller of the order
  - Country validation : ADR-041 intra-only enforced at
    backend
  - Address book UX flows
  - Cross-border block error message clarity
- Merge with merge commit (preserve narrative across 11 blocks)
- Tag `v1.2-geo-and-delivery` if you want a marker for J12 prep

---

## Cross-sprint impact

**Updates needed elsewhere when J11.7 ships :**

- `CLAUDE.md` :
  - Update inner section to mention `/profile/addresses` route
  - Add country to V1 scope reminder if applicable
- `docs/NETWORK_MANIFEST.md` :
  - Add `/profile/addresses`, `/checkout` (updated), `/marketplace`
    (with filter) to hot-path surfaces if running new HAR sweep
  - Audit checklist : confirm new routes don't introduce
    unexpected origins
- `docs/SPEC_SMART_CONTRACT_V2.md` :
  - No contract changes, no spec change
- `docs/AUDIT_PRE_J11_SUMMARY.md` :
  - Add post-script note "Geographic + delivery address shipped
    J11.7 (ADR-044, ADR-045), no security implications, no
    contract changes"
- `docs/FOLLOWUPS_J11.md` :
  - No follow-ups expected unless edge case surfaces

---

## Risk register

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| MiniPay phone country code not accessible programmatically | Medium | Block 5 fallback : prompt buyer with dropdown if detection fails |
| Existing sellers without country block onboarding flow | Medium | Soft-block (allow browsing, block dashboard write actions) ; nudge in UI to complete |
| Address validation too strict and blocks valid African informal addresses | Medium | Free-form address line, only require non-empty (no postal code, no map pin) |
| Migration breaks existing tests using nullable country | Low | Tests use the migration's nullable behavior (column added nullable initially), validation enforced app-layer |
| Bundle size on /profile/addresses or /checkout exceeds target | Low | Lazy-load AddressFormModal if needed |
| Cross-border error message frustrates buyers | Medium | Clear copy + suggest "Browse {buyer.country} sellers" CTA in error state |

---

## Acceptance criteria for sprint closure

(Same as Block 10 acceptance — listed there)

---

## Sequencing within sprint

Suggested order :
- Days 1-2 : Block 1 (migration) + Block 2 (address book API) + Block 3 (filter API) — backend foundation
- Day 3 : Block 4 (seller onboarding) + Block 5 (buyer detection) — country-related UX
- Days 4-5 : Block 6 (address book UI) + Block 7 (checkout picker) — delivery address UX
- Day 6 : Block 8 (seller dashboard display) + Block 9 (marketplace filter)
- Day 7 : Block 10 (tests + audit) + Block 11 (PR + merge)

Some parallelism possible : Blocks 4 + 5 can run in parallel
of Blocks 6 + 7 if Mike has bandwidth to context-switch.

---

## Post-merge actions

1. Tag `v1.2-geo-and-delivery`
2. Update FOLLOWUPS_J11.md with closure note
3. Plan J12 mainnet deploy with this V1.2 baseline
