# Follow-ups Sprint J11 (et après)

Tickets dérivés de l'incident response H-1 (mai 2026) — bundle
`fix/h1-dispute-funded-guard`. Ces items sont hors scope du bundle
de fix mais doivent rester sur le radar pour le sprint J11+.

---

## FU-J11-001 — Consolider test infra autour du real escrow

**Origine** : Incident response H-1 (Path B alternative non retenue).
**Estim** : 3-4h.
**Prio** : Medium.
**Owner** : Mike.

### Contexte

Le bundle H-1 a retenu Path A (étendre `MockEtaloEscrow.sol` pour modeler
`fundedAt` + adapter le fixture `deployDispute`) plutôt que Path B
(retirer le mock et router tous les tests EtaloDispute via le real
escrow). Path A a été choisi parce que :
- ROI immédiat (≈15 min effort vs 3-4h)
- Integration.v2 (15 scenarios real-contract) couvre déjà la couche
  rigoureuse
- Le mock joue un rôle légitime : isolation pure du dispute contract
  pour unit tests

Mais Path A laisse un **drift risk structurel** : si une future ADR
change l'invariant attendu sur `Order` (nouveau champ requis, nouvelle
status transition, nouvelle interaction), le mock peut diverger
silencieusement du real escrow et masquer une régression.

L'incident H-1 a illustré exactement ce risque : le mock n'avait
historiquement jamais besoin de `fundedAt`, donc l'invariant
"`fundedAt > 0` requis pour disputer" n'était pas testé en isolation
dispute. Path A le corrige pour cette ADR mais ne ferme pas la classe
de risque.

### Scope

- Retirer `packages/contracts/contracts/test/MockEtaloEscrow.sol`
- Migrer `test/EtaloDispute.test.ts` (16 tests) vers le fixture
  `deployIntegration` (real EtaloEscrow + chain wired)
- Chaque test doit setup un order funded en début de `it()` (helper
  `createFundedOrder(buyer, seller, itemPrice)` si répétitif)
- Vérifier perf : tests vont passer de mock instantané à real escrow
  ~80-150ms/test, acceptable

### Critère d'acceptation

- `MockEtaloEscrow.sol` supprimé
- `deployDispute` fixture supprimé OU réorienté vers integration
- 16 tests EtaloDispute passent toujours, sémantique identique
- Aucune référence résiduelle à `MockEtaloEscrow` dans le repo
- Test suite total reste sous le budget temps actuel (~30s
  enveloppe pour la full suite)

### Risque résiduel après FU-J11-001

Quasi nul sur le dispute path. Le pattern reste à appliquer si
d'autres mocks "lite" de contrats core émergent (MockEtaloDispute
existe déjà pour tester Voting, on peut faire le même check à
l'occasion).

---

## FU-J11-002 — Sepolia redeploy V2 post-merge

**Origine** : Incident response H-1 (Decision 3).
**Estim** : 1-2h ops.
**Prio** : High (bloquant pour reprise tests E2E sur Sepolia).
**Owner** : Mike.

### Contexte

Le déploiement V2 actuel sur Celo Sepolia contient le bug H-1 :

| Contract | Address (Sepolia, vulnerable) |
|---|---|
| EtaloDispute | `0x863F0bBc8d5873fE49F6429A8455236fE51A9aBE` |
| EtaloEscrow | `0x6caEBc6aDc5082f6B63282e86CaF51AEbd630bfb` |

Custody actuelle EtaloEscrow = **0 USDT** (vérifié 2026-05-05 par
`balanceOf` direct via JSON-RPC). Aucun fonds réel à risque, mais
le code on-chain est exploitable. À redéployer avant reprise
E2E ou démos publiques.

### Pré-requis

- Bundle `fix/h1-dispute-funded-guard` mergé sur main
- ABI freeze post-merge (récupération des nouveaux addresses)
- Deployer PK accessible (env var `DEPLOYER_PRIVATE_KEY` du keystore
  habituel — pas dans le repo)

### Scope opérationnel

1. Recompile contracts depuis main (post-merge HEAD).
2. Run `pnpm exec hardhat run scripts/deploy-v2.ts --network celoSepolia`
   (ou équivalent — vérifier le script existant).
3. Update `packages/contracts/deployments/celo-sepolia-v2.json` avec
   les nouveaux addresses.
4. Update `packages/web/src/lib/v2-addresses.ts` (ou équivalent
   frontend) pour pointer sur la nouvelle suite.
5. Update `packages/backend/.env.sepolia` (indexer config) pour les
   nouveaux contract addresses + start block.
6. Restart backend indexer en `from_block_v2 = <new_deploy_block>`.
7. Mint MockUSDT au deployer + au wallet MiniPay de Mike (10 000 +
   1 000 USDT, replicate la dernière config).
8. Re-stake Tier 1 pour les sellers de test.
9. Smoke test : un order intra créé/funded/disputé/résolu via N1
   amicable côté Sepolia, observer indexer mirror correctement
   peuplé.
10. Documenter le swap d'addresses dans CLAUDE.md (section "Key
    addresses Celo Sepolia testnet — V2 deploys").

### Anciens addresses

Garder en référence dans `docs/DEPLOYMENTS_HISTORY.md` (créer si
absent) avec la mention "vulnerable to H-1 — replaced by redeploy
post-bundle fix/h1-dispute-funded-guard".

### Critère d'acceptation

- Nouveaux addresses on-chain vérifiables via Celoscan Sepolia
- Smoke test E2E vert (create → fund → dispute → resolveN1 →
  refund visible dans wallet buyer)
- Indexer mirror tables peuplées avec les bons orders
- CLAUDE.md à jour
- Frontend pointe sur la nouvelle suite
- Anciens addresses laissés vivants on-chain (custody = 0,
  pas de drain défensif requis) mais documentés comme deprecated

---

## FU-J11-003 — Performance optimization for sub-90 surfaces

**Origine** : Lighthouse Mobile baseline 2026-05-06 (branche `ops/pagespeed-baseline-j11`).
**Estim** : 1-2 sprint days targeted work.
**Prio** : Medium (non-blocking si MiniPay listing reviewers tolèrent 78-88 perf range ; blocking si strict ≥90).
**Owner** : Mike.

### Contexte

Lighthouse prod build mobile baseline montre :

| Surface | Perf | Gap to ≥90 |
|---|---|---|
| home | 85 | -5 |
| boutique | 86 | -4 |
| product | 88 | -2 |
| marketplace | 78 | -12 |
| checkout | 77 | -13 |
| seller dashboard | 79 | -11 |

Accessibility / Best Practices / SEO all 94-100 (no listing-blocking issues there). Performance gap to MiniPay listing target ≥90 mobile is concentrated in 3 surfaces (marketplace, checkout, dashboard), with 3 close-but-under (home, boutique, product).

Common Lighthouse audit findings across the sub-80 surfaces : `mainthread-work-breakdown`, `render-blocking-insight`, `unused-javascript`, `forced-reflow`, `legacy-javascript-insight`. See `docs/audit/lighthouse/README.md` for per-surface details + raw HTML/JSON reports.

### Scope

1. **Code-split heavy tab content in dashboard** — convert `/seller/dashboard` tabs (Overview / Marketing / Products / Orders / etc.) to `next/dynamic` with `ssr: false` so each tab only loads when activated. Expected +5-10 perf points.
2. **Defer chart hydration on dashboard** — recharts is heavy (~80 kB gzip). Use IntersectionObserver to lazy-mount charts only when scrolled into view. Expected +3-5 perf points.
3. **Audit unused JavaScript on checkout** — run `ANALYZE=true pnpm build` (per `next.config.mjs` bundle analyzer wrap) to identify dead-code paths. Likely candidates : unused dispute hooks, multi-seller cart code, viem chains other than Celo Sepolia.
4. **Lazy-load below-the-fold marketplace product cards** — convert product card images to `loading="lazy"` (likely already done via next/image — verify) + virtualize if list grows beyond viewport.
5. **Audit legacy JavaScript polyfills** — Lighthouse flags 50% on marketplace + checkout for ES5-targeted polyfills. Modern browser users (MiniPay = Chromium-based) don't need these. Audit Babel/swc presets for browserslist tightening.

### Critère d'acceptation

- All 6 hot-path surfaces ≥ 90 Performance mobile (re-run Lighthouse prod build baseline)
- A11y / BP / SEO unchanged (still ≥ 94)
- Bundle size summary regression check : First Load JS shared chunks should not increase

### Risque résiduel après FU-J11-003

If MiniPay listing requires strict ≥90 cutoff, this is gating for J12 mainnet listing submission. If reviewers tolerate close-to-90 (especially the 3 surfaces in 85-88 range), can defer to V1.5 cleanup PR.

---

## FU-J11-004 — Smoke test E2E + SAMPLE_TXS.md fill

> **Status update 2026-05-06 (ADR-043)** : combined into Sprint J11.5
> Block 8 (`docs/SPRINT_J11_5.md`). Will be marked done at sprint
> closure after Block 8 deliverables land. The §A-F flow structure
> below remains the canonical reference ; the J11.5 sprint dogfoods
> the new buyer interface (`/orders`, `/orders/[id]`) along the same
> flow to fill `SAMPLE_TXS.md` naturally.

**Origine** : Sprint J11 listing prereq §3 (sample tx per user-facing method) requires actual on-chain executions. Structure shipped in `docs/audit/SAMPLE_TXS.md` (PR `ops/sample-tx-j11`) with TBD entries — this ticket fills them via a smoke E2E session.
**Owner** : Mike.
**Estim** : 1-2 sessions ops (~3-4h cumulé).
**Prio** : High (blocking pre-J12 mainnet listing submission ; non-blocking for J11 internal review).
**Pré-requis** : Sepolia stable (✓ post-PR #8), test wallets setup (1 buyer + 1 seller, pre-funded with USDT via MockUSDT.mint).
**Acceptance** : 0 TBD entries dans `docs/audit/SAMPLE_TXS.md` §1 (V1 user-facing) and §3 (V1 admin + permissionless raisonnablement exerçables). Time-bound triggers and forceRefund 3-condition combo carry explicit "operational procedure" notes per the caveats below.

### Smoke flow (orchestré Hardhat ou UI MiniPay)

#### A. Happy path intra (~6 méthodes)
- A.1 Buyer `createOrderWithItems` (1 item, 5 USDT, seller test, intra-Africa)
- A.2 Buyer USDT `approve` + Buyer `fundOrder`
- A.3 Seller `shipItemsGrouped` (intra, no 20% release)
- A.4 Buyer `confirmItemDelivery` → captures `Reputation.recordCompletedOrder` event + commission/seller distribution

#### B. Cancellation (~1 méthode)
- B.1 Buyer `cancelOrder` pre-fund (status == Created)

#### C. Dispute resolution (~3 méthodes user-facing + 2 internal events)
- C.1 Setup : buyer fund order, seller ship, buyer ready to dispute
- C.2 Buyer `openDispute` → captures `markItemDisputed` (internal `onlyDispute` call)
- C.3 Buyer + seller `resolveN1Amicable` (matched bilateral) → captures `resolveItemDispute` (internal)
- C.4 Buyer `escalateToMediation` (separate scenario, set up dispute that doesn't match N1)
- C.5 Mediator `resolveN2Mediation` (separate scenario, requires assigned mediator)

#### D. Permissionless triggers (~2 méthodes, time-dependent)
- D.1 `triggerAutoReleaseForItem` (3-day intra-Africa)
- D.2 `triggerAutoRefundIfInactive` (7-day intra-Africa)

> **Caveat D** : Time-bound triggers (3d / 7d). Hardhat Sepolia avec block-time advance possible mais coûteux à orchestrer dans une session courte (Sepolia block time ~5s, 3 days = ~52000 blocks). Si pas exerçable proprement, marquer "time-bound — exemplification post-mainnet natural surfacing" dans le tableau §3 du SAMPLE_TXS.md. Pas un trou : `Integration.v2.test.ts` couvre déjà ces flows en local Hardhat avec time advance, le sample tx Sepolia est bonus pour reviewer.

#### E. Admin (~3 méthodes, à exercer une fois par sécurité)
- E.1 `emergencyPause` + tester revert "Contract paused" sur un createOrder + 7-day auto-expiry
- E.2 `registerLegalHold` sur un order
- E.3 `forceRefund` (3 conditions ADR-023 : dispute inactif + 90+ days + legal hold)

> **Caveat E.3** : Le combo `forceRefund` 3-conditions (dispute contract `address(0)` + 90+ days inactivity + legal hold registered) est impossible à set up en smoke session sans manipulation extensive de l'environnement (notamment unset disputeContract puis le re-set, plus block-time advance 90+ jours). Marquer "operational procedure documented in `docs/DEPLOYMENTS_HISTORY.md`, sample reserved for first-incident response" dans le tableau §3 du SAMPLE_TXS.md. Pas un trou : ADR-023 conditions sont testées dans Integration.v2 scenario 11 (`forceRefund after 90 days with legal hold`) sur Hardhat fork.

#### F. Credits (~1 méthode)
- F.1 Buyer `purchaseCredits` (e.g. 10 credits = 1.5 USDT to creditsTreasury)

### Deliverables

- Tx hashes captured + collés dans `docs/audit/SAMPLE_TXS.md` §1 + §3
- Notes d'exécution (timings, edge cases, gas costs observed) en bas du doc
- NETWORK_MANIFEST.md audit checklist : passer "25/40 V1-active entries populated" → "40/40 V1-active entries populated"
- Mark FU-J11-004 done dans `FOLLOWUPS_J11.md`
- (Optional) capture analytical insights : commission split observed, auto-release timing, etc., to feed AUDIT_BRIEFING.md or seller-facing docs

---

## FU-J11-005 — Buyer endpoint privacy graduation (post-V1)

**Origine** : ADR-043 Threat model section (2026-05-06). Sprint J11.5
ships the buyer interface MVP (`/orders`, `/orders/[id]`) with a
casual privacy filter via `?caller=<addr>` query param. This ticket
investigates options to graduate that posture, in the MiniPay context
which forbids `personal_sign` and `eth_signTypedData` per
`minipay-guide.md` Important Constraints #4 — making **SIWE
non-viable**.
**Owner** : Mike (or whoever owns auth surface at the time).
**Estim** : 8-12h investigation + decision ADR + implementation.
**Prio** : Low for V1 launch ; Medium for V1.5+ (pre-mainnet hardening
sweep). Not blocking J12.
**Pré-requis** : V1 mainnet stable, real-world buyer volume justifies
the investment, ADR-034 EIP-191 deprecation cleanup landed.

### Scope

Investigate stronger privacy for the buyer detail endpoint beyond the
V1 `?caller=<addr>` soft-filter, in the MiniPay context which forbids
`personal_sign` and `eth_signTypedData` per `minipay-guide.md`
Important Constraints #4 — making SIWE non-viable.

### Options to evaluate

- **A. Backend session cookies after weak attestation** — e.g. CSRF
  token bound to MiniPay address derived from `window.ethereum`
  auto-connect, validated against on-chain order ownership before
  issuing session.
- **B. On-chain attestation via FederatedAttestations / ODIS issuer**
  — buyer address proven via MiniPay's trusted issuer
  (`0x7888...7FBc`), but this is identity proof not auth proof.
- **C. Server-side rate limiting + behavior detection** — no auth,
  but brute-force enumeration becomes economically unfeasible.
- **D. Accept the casual-privacy limit indefinitely** — document the
  trade-off explicitly, rely on on-chain transparency as the buyer
  protection rather than API privacy.

### Out of scope

- **SIWE (EIP-4361)** : explicitly excluded. Incompatible with MiniPay
  signing constraints (`personal_sign` / `eth_signTypedData` forbidden).
  Future devs investigating "let's just add SIWE" should stop and read
  this ticket first.

### Acceptance

- Decision ADR (or extension of ADR-043) selecting between Option A /
  B / C / D, with rationale and threat model updated
- If A/B/C : implementation landed, `?caller=<addr>` query param
  removed or augmented
- If D : ADR-043 Threat model section explicitly marked as the final
  V1+ posture, no further work expected
- 100% test coverage on whichever auth/attestation/rate-limit machine
  ships
- ADR-043 Threat model section updated with "Graduation resolved by
  FU-J11-005 → Option X"

### Risque résiduel après FU-J11-005

Each option carries different residual risk :
- A. Cookie hijacking surface ; MiniPay env limits XSS but not zero
- B. Identity proof ≠ auth proof ; doesn't fully replace session auth
- C. Determined adversary still wins ; mitigation only against casual
- D. Status quo ; honest documentation is the only mitigation

Decision gate : real-world buyer behavior data post-V1 mainnet should
drive the cost-benefit before any of A/B/C lands.

---

## FU-J11-006 — i18n FR/EN graduation (V1.5+)

**Origine** : Sprint J11.5 Block 6 scope retire (2026-05-06). Block 6
originally bundled i18n + visual polish ; i18n was lifted out because
the rest of the V1 app is English-only and adding next-intl
piecemeal to `/orders` would create inconsistency worse than the
absence. Tracked here so the graduation is not lost.
**Owner** : Mike (or whoever owns the FE surface at the time).
**Estim** : 12-20h (full-app extraction + library setup + translation
pass FR + smoke test all routes).
**Prio** : Low for V1 launch. Medium when a francophone market is
targeted (Sénégal / Cameroun / Côte d'Ivoire).
**Pré-requis** : V1 mainnet stable. A go/no-go decision on which
francophone market to target ; the answer drives whether to add EN +
FR only or include WO/SW depending on local language preferences.

### Scope

- Pick i18n library (likely `next-intl` — Next 14 App Router
  compatible, supported by the existing component patterns)
- Extract all hard-coded strings from `packages/web/src/` into
  message dictionaries (English source of truth, French translation)
- Wire ICU MessageFormat for plurals + dates (countdowns like
  "Auto-release in 47h" need locale-aware formatting)
- Set up build-time check for missing translations
- Translate the V1 surfaces in priority order : marketplace,
  /[handle], cart, checkout, /orders, /seller/dashboard
- Update `docs/CLAUDE.md` if relevant (target markets section may
  shift if a francophone market is added)
- Verify locale switcher behavior in MiniPay (autoconnect should not
  reset locale)

### Acceptance

- All hard-coded English strings in `packages/web/src/` extracted
  to message dictionaries
- French translation complete + reviewed by a francophone speaker
  (ideally a buyer in the target market, not just a code reviewer)
- All routes pass i18n smoke test (locale switch end-to-end)
- Bundle delta documented per route ; if any route blows past its
  budget (`docs/PERFORMANCE_BUDGET.md`), trim or defer locale
- ADR-039 (auditor checklist) updated if relevant

### Risque résiduel après FU-J11-006

Translation drift over time — each new feature adds English strings
that must be back-translated. Mitigation : build-time missing-key
check + a checklist item in PR template.

---

## FU-J11-007 — WhatsApp notifications end-to-end wire-up (V1.5+)

**Origine** : J11.5 Block 7 minimal-scope decision (2026-05-06).
Block 7 shipped deeplink composition only because the existing
WhatsApp service is a stub (28 LoC, no Twilio SDK call, no call
sites). The full wire-up surfaces security + compliance concerns
that deserve their own design pass — not a fold-in to the buyer
interface MVP sprint.
**Owner** : Mike (or whoever owns notification surface).
**Estim** : 6-8h base implementation + ~3-4h ADR + ~2-3h
observability + opt-out compliance pass = 12-15h total.
**Prio** : Medium for V1 launch (notifications are nice-to-have for
J12 mainnet ; the buyer interface MVP already lets buyers reach
their orders without push). High once V1 has buyer volume worth
notifying.
**Pré-requis** : V1 mainnet stable, Twilio account provisioned,
WhatsApp Business sender approved (regulatory in NG / GH / KE / ZA),
opt-out compliance reviewed for the 4 launch markets.

### Scope

1. **Twilio SDK wire-up** : implement `send_message` with the
   actual Twilio Python SDK. Replace the
   `{"status": "stub"}` return with the real message SID + status.
2. **Call sites mapping** : wire the indexer V2 mirror writer
   (`packages/backend/app/indexer/`) to trigger notifications on
   the relevant on-chain events :
   - `OrderFunded` → `send_order_notification(status="Funded")`
   - `ItemShipped` → status="Shipped"
   - `ItemDelivered` → status="Delivered"
   - `OrderAutoReleaseTriggered` → reminder template (new)
   - `DisputeOpened` → `send_dispute_notification(level="N1")`
   - `DisputeEscalated` → level="N2" / "N3"
   - `OrderRefunded` → status="Refunded"
3. **6-method refactor** if call sites benefit from specialization
   (funded / shipped / delivered / auto_release / dispute / refund) ;
   evaluate during implementation, don't pre-commit.
4. **Opt-out compliance** : per WhatsApp Business + local market
   regulations (Nigeria NDPR, Kenya DPA, etc.), buyers must be able
   to opt out. Database flag on User + opt-out keyword detection
   ("STOP", "UNSUBSCRIBE") on inbound webhook.
5. **Webhook signature verification** : Twilio inbound webhook
   (delivery receipts + opt-out) must be signature-verified per
   Twilio's Validator pattern.
6. **Rate limiting** : avoid spamming a buyer if multiple events
   fire close together (e.g. shipment retry → ItemShipped twice).
   Idempotency key based on (event_type, order_id, item_id) with
   TTL.
7. **Retry / dead-letter queue** : if Twilio API returns 5xx, retry
   with backoff ; if >N retries, move to dead-letter table for
   manual replay. Likely needs Redis or similar (already in
   settings.redis_url).
8. **Observability** : Sentry breadcrumbs + a per-template counter
   so we can see delivery rate trends, opt-out rate, and which
   templates are most engaging.

### Acceptance

- New ADR documents the notification policy (rate limits, opt-out,
  retry strategy, observability).
- Twilio SDK actually sends — verified end-to-end on a test number.
- All 6 event-driven call sites land notifications correctly.
- Opt-out flow tested (buyer texts STOP → no further messages,
  flag persisted in DB).
- Webhook signature verification rejects unsigned / mis-signed
  inbound webhooks.
- 100% test coverage on the call site mapping + opt-out logic.
- Dead-letter table populated by an injected 503 ; manual replay
  works.
- ADR-043 buyer interface MVP gets a follow-up note that
  notifications are now live.

### Risque résiduel après FU-J11-007

Twilio outage → notifications drop. Mitigation : retry queue +
Sentry alert on >N% delivery failure rate. Catastrophic case (Twilio
account suspended / WhatsApp Business sender revoked) needs an ops
runbook — separate doc.

---

## FU-J11-008 — MiniPay rejects shipItemsGrouped intra with "BigInteger divide by zero"

**Origine** : J11.5 Block 8 closure session, 2026-05-07. Mike clicked
"Mark as shipped" on `/seller/dashboard` for an existing Funded
intra order (orderId 1, seller 0x3154835d, 2 items × 50 USDT).
MiniPay surfaced :
> The contract function "shipItemsGrouped" reverted with the
> following reason: BigInteger divide by zero

**Owner** : Mike (or whoever owns wallet integration).
**Estim** : 1-2h investigation + escalation pass.
**Prio** : Medium for V1 launch (pre-J12 mainnet) — blocks the
seller-side ship action via MiniPay UI on Sepolia ; live workaround
exists (run via local script using a non-MiniPay wallet client). Not
a buyer-interface MVP issue — surfaces independent of J11.5 sprint.
**Severity** : functional impact only (no funds at risk, no contract
divergence — `shipItemsGrouped` is still callable from any non-
MiniPay client).

### Diagnostic gathered

Contract simulation eth_call for the exact failing tx succeeds end-
to-end :
- `pub.simulateContract({ args: [1n, [1n, 2n], keccak256("etalo-v1-shipped")], account: 0x3154835d })`
  → `groupId = 5n` (would succeed)
- `pub.estimateContractGas(...)` → 444 118 gas units (clean estimate)
- Order 1 state confirmed valid : Funded, intra, items both Pending,
  no shipment groups yet.
- Seller wallet has 0.3 CELO (ample for gas).
- `EtaloEscrow.shipItemsGrouped` intra path has zero division
  operations (verified — only divisions are in cross-border 20%
  release branch + dispute resolve, neither triggered here).

The error message format `"reverted with the following reason: <X>"`
is viem's `ContractFunctionRevertedError`, but no actual contract
revert occurs in our reproductions. Therefore the divide-by-zero
must originate inside MiniPay's wallet pre-flight pipeline — likely
a fee-conversion or gas-cost-in-USDT calculation that hits a 0
denominator (oracle rate, price ratio, or similar).

Test 2 (close + re-open mini-app from MiniPay launcher) reproduced
the same error → not a stale-state bug.

### Hypotheses to investigate

1. **MiniPay CIP-64 conversion** — even though FE specifies
   `type: "legacy"` via `asLegacyTx()`, MiniPay may run an internal
   USDT-fee preview that divides by an oracle CELO/USDT rate. If
   the oracle returns 0 for some pair on Sepolia, the calc panics.
2. **MiniPay ABI cache mismatch** — MiniPay may cache the contract
   ABI from a previous deploy and decode the function call with
   stale param types, producing a div-by-zero in its decoder.
3. **Sepolia-specific edge** — MiniPay may only expect mainnet
   contracts and have an untested Sepolia path.
4. **gas estimate × 0 ratio** — some internal MiniPay code computes
   `priorityFee * total / referenceFee` and `referenceFee` is 0 on
   Sepolia.

### Repro steps

1. Open MiniPay → Etalo mini-app → /seller/dashboard
2. Sign in with seller wallet that has at least 1 Funded intra order
3. Click "Mark as shipped"
4. Fill in a tracking number (or leave blank) → Confirm
5. MiniPay surfaces "BigInteger divide by zero" before any tx is
   actually sent

### Workaround (pre-fix)

Sellers can still ship via the smoke orchestrator pattern :
```
pnpm hardhat run scripts/smoke-e2e-j11-5.ts --network celoSepolia
```
or any non-MiniPay viem walletClient. Functionally unblocks ops if
needed for testing before fix.

### Acceptance

- Repro confirmed on a second wallet / second order
- MiniPay team contacted via Discord/Telegram with the diagnostic
  above (eth_call succeeds + 444 118 gas estimate + clean order
  state) — request internal pre-flight error log
- Either : (a) MiniPay rolls a fix, we verify on Sepolia ; or
  (b) workaround documented as "ship via desktop wallet" until
  MiniPay V1.5+ resolves
- Buyer interface MVP `/orders/[id]` ConfirmDelivery + OpenDispute
  buttons tested for the same pattern — if they also fail, scope
  expands

### Risque résiduel après FU-J11-008

If MiniPay is the only seller-facing surface in production V1, and
the bug isn't fixed, sellers can't ship through MiniPay UI without
a workaround. Severity bumps to High for V1 mainnet launch readiness
if reproduced on mainnet. Mitigation : verify on mainnet ASAP post-
J12 deploy ; if reproduces, escalate before public listing.

---

### FU-J11-009 — Sprint J11.7 geographic + delivery address

**Status** : Planned post-J11 BLOCKING closure
**Tracking** : ADR-044 + ADR-045 + `docs/SPRINT_J11_7.md`
**Estim** : ~5-7 working days
**Pre-req** : J11 BLOCKING #3 NETWORK_MANIFEST closed + ADR-043
buyer interface MVP merged (V1.1 tag)
**Unblocks** : J12 mainnet deploy with usable V1 commerce UX

Scope : 11 blocks dans `docs/SPRINT_J11_7.md`. Combines ADR-044
delivery address structured capture + ADR-045 geographic filter
+ country mandatory on profiles. No contract changes.

---

## Notes générales

- Reprise Track B (audit Reputation scan-only + synthesis
  `docs/AUDIT_PRE_J11_SUMMARY.md`) reste séquencée APRÈS le merge
  du bundle H-1 et le redeploy Sepolia. Voir directive Mike Step I
  du bundle.
- Aucune communication externe sur H-1 jusqu'à validation Mike
  explicite (pas de tag public, pas de Discord, pas de Twitter,
  pas de forum). Les commits docs internes (ADR-042, audit demote,
  follow-ups) sont confidentiels jusqu'au merge.
