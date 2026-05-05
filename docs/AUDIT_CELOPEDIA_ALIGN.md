# Audit alignement Etalo ↔ celopedia-skills MiniPay (v2.0.0)

**Date** : 2026-05-05
**Auteur** : Phase 1 read-only audit, no modifs applied
**Sources** : `CLAUDE.md` (root + inner), `docs/DECISIONS.md` ADR index (41 ADRs), `docs/SPEC_SMART_CONTRACT_V2.md` (sections createOrder/fees/refund), `celo-org/celopedia-skills@main` (minipay-requirements.md, minipay-guide.md, builder-guide.md, security-patterns.md)

## A — Conformités confirmées

| MiniPay requirement | Etalo coverage | Référence |
|---|---|---|
| Zero-click connect, no `Connect Wallet` button when `window.ethereum.isMiniPay` | ✓ Auto-connect via `minipayConnector` ; aucun "Connect Wallet" string in code (grep 0 hits prod) | CLAUDE.md inner règle 7 + `lib/minipay-connector.ts` + `Providers.tsx` |
| No `personal_sign` / `eth_signTypedData` | ✓ ZERO occurrences in code (grep 0 hits) ; backend EIP-191 deprecated | CLAUDE.md inner règle 14 + ADR-034 (deprecated EIP-191) |
| Legacy txs only, ignore EIP-1559 fields | ✓ `lib/tx.ts asLegacyTx()` strips `maxFeePerGas` / `maxPriorityFeePerGas` ; all writeContract use `type: "legacy"` | CLAUDE.md inner règle 3 + ADR-003 + `lib/tx.ts:13-26` |
| Never display raw `0x...` addresses as primary identifier | ✓ Use shop handles + names ; NO `0x` rendering in UI components (grep 0 prod hits) | CLAUDE.md inner règle 5 |
| Token support : USDT/USDC/USDm only, no CELO in UI | ✓ Etalo uses USDT only ; ZERO `>CELO<` text in user-facing prod components (grep filter excludes RPC/chain config contexts) | CLAUDE.md inner règle 4 + V1 boutique model ADR-014 |
| User-facing copy : "network fee" not "gas", "deposit/withdraw" not "on-ramp/off-ramp", "stablecoin/digital dollar" not "crypto" | ✓ Verbatim alignment with MiniPay rules | CLAUDE.md inner règle 4 |
| Mobile-first 360×640 viewport | ✓ Hotfix #8 closed mobile responsive 360-414px ; touch targets ≥44×44 ; body 16px+ | CLAUDE.md inner Design standards section + Phase 4 hotfix #8 |
| Asset optimization : SVG/WebP, no PNG/JPG > few KB | ✓ `public/illustrations/v5/` 8 SVGs (2-9 KB each) ; ZERO PNG/JPG/JPEG/GIF in `public/` | Phase 5 Angle F audit + Phase 3 Block 5 illustrations |
| 2 MB bundle footprint maximum | ✓ `/seller/dashboard` 264 kB FLJ (peak route), shared chunks 87.8 kB — well under 2 MB | Phase 5 Angle F bundle metrics commit `2240b14` |
| Backend auth NOT via signed messages (MiniPay forbids) | ✓ ADR-034 deprecated EIP-191 ; X-Wallet-Address header per ADR-036 + on-chain events V2 indexer per V2 invariant 14 | ADR-034 + ADR-036 + CLAUDE.md V2 invariant 14 |
| Fee abstraction : MiniPay handles CELO automatically (CIP-64) | ⚠ Partial : ADR-003 defers active CIP-64 wiring V1.5 ; Etalo relies on MiniPay's own gas funding for V1 (legacy tx only) | ADR-003 (CIP-64 deferred V1.5) |

## B — Gaps à combler

| Exigence MiniPay | Source | Etalo gap | Proposition | Criticité |
|---|---|---|---|---|
| In-app **support link** reachable | minipay-requirements.md §4 | ZERO grep hits ("support@" / "/support" / "/help") in prod components ; only HelperTextV4 form UI text | New ticket : add Footer (or Profile tab section) with `mailto:support@etalo.app` OR `/support` page ; reachable from every Mini App route | **BLOCKING** (listing prereq) |
| In-app **Terms of Service** + **Privacy Policy** links | minipay-requirements.md §4 | ZERO grep hits ; no `/tos` / `/privacy` route | New ticket : create `/legal/terms` + `/legal/privacy` routes (markdown content) + Footer links visible from MiniPay surface | **BLOCKING** |
| **Add Cash deeplink** `https://minipay.opera.com/add_cash` on insufficient balance | minipay-requirements.md §4 + CLAUDE.md inner règle 15 | Rule stated mais **non implémenté** : `OpenInMiniPayModal:31` uses generic `minipay.opera.com/?app=etalo` (NOT `/add_cash`) ; pas de pre-checkout balance gate frontend | New ticket : pre-checkout balance check via `useReadContract balanceOf(buyer)` ; if `usdt_balance < cart_total` → render Add Cash CTA pointing `https://minipay.opera.com/add_cash` ; preserves Rule 15 spirit | **BLOCKING** (Mike's testing today proved buyer with 0 USDT triggers MiniPay BigInteger preflight) |
| **PageSpeed Insights ≥ 90 mobile** sur production URL | minipay-requirements.md §2 | Never measured | Add to grants pre-submission Block (J11 ou J12 mainnet) : run Lighthouse Mobile 4G profile sur 6 surfaces, capture scores, report. Phase 5 Angle F deferred to this Block. | **RECOMMENDED** |
| Full **network manifest** (URLs, subdomains, RPC, origins) | minipay-requirements.md §2 | Pas de `docs/NETWORK_MANIFEST.md` | New file `docs/NETWORK_MANIFEST.md` listant : ngrok dev URL, etalo.app prod, FastAPI `/api/v1/*`, Pinata gateway, Celo Sepolia/mainnet RPC, EtaloEscrow + 6 V2 contracts addresses, Twilio webhook | **RECOMMENDED** for listing |
| **Celoscan verification** of all V2 contracts | minipay-requirements.md §3 | `deployments/celo-sepolia-v2.json` log txHash but no explicit `verified: true` flag per contract — needs empirical check Celoscan/Blockscout | Verify each of 7 V2 contracts (MockUSDT, EtaloReputation, EtaloStake, EtaloVoting, EtaloDispute, EtaloEscrow, EtaloCredits) is **source-verified** sur `celo-sepolia.blockscout.com` ; if not, run `npx hardhat verify --network celoSepolia <addr>` per contract + sync flag `verified` in manifest | **BLOCKING** (listing prereq §3) |
| **Sample transaction link** per user-facing method on Celoscan | minipay-requirements.md §3 | docs partial — README mentions e2e checkout txs but no exhaustive list per method | New section in `docs/CELOSCAN_SAMPLES.md` : link 1 success tx per method (createOrderWithItems, fundOrder, shipItemsGrouped, confirmItemDelivery, registerLegalHold, mint MockUSDT, etc.) | **RECOMMENDED** |
| **24-hour SLA on critical issues** | minipay-requirements.md §4 | Process gap, not code | New file `docs/SUPPORT_SLA.md` : commitment text + on-call contact + escalation path + post-mortem template | **RECOMMENDED** |
| **Phone Number → Address resolution** via FederatedAttestations | minipay-guide.md §(3) | Absent ; CLAUDE.md règle 5 "use shop handles or names" already preferred (better than 0x truncation, but no phone-first lookup wired) | DEFER V1.5+ : ODIS quota account + FederatedAttestations issuer `0x7888...FBc` integration. V1 uses shop handles (already MiniPay-acceptable substitute). | NICE-TO-HAVE |
| Buyer wallet **fee currency balance check** before approve | minipay-guide.md §(4) + security-patterns.md §2 | Mike's testing today proved : MiniPay preflight `BigInteger divide by zero` when buyer USDT balance = 0. Pre-checkout guard absent | New ticket : `useCheckoutPreflightGuard` hook — assert `usdt_balance >= cart_total` AND `gas_currency_balance > 0` (CELO native or cUSD) ; surface Add Cash CTA if not. Combines with Add Cash gap above. | **BLOCKING** (mainnet UX) |

## C — Conflits réels

### C.1 — CIP-64 fee currency : Etalo deferred V1.5 vs MiniPay mainnet expectation

**Conflit** : MiniPay's mainnet table (builder-guide.md) lists USDT adapter `0x0e2a3e05bc9a16f5292a6170456a710cb89c6f72` as the canonical `feeCurrency` parameter for CIP-64 txs. CLAUDE.md mainnet section captures this address mais ADR-003 explicitly defers wiring CIP-64 V1.5 with rationale "viem v2 does not support CIP-64 out of the box, requires custom signTransaction path".

**Verdict** : **CLAUDE.md / ADR-003 wins** (architecture / engineering cost decision). MiniPay accepts legacy transactions per minipay-guide.md §5 hard rule #2 ; CIP-64 is preferred for fee abstraction but not required. V1 launch can ship with legacy txs + reliance on MiniPay's user-side gas funding.

**Résolution** : keep ADR-003 as-is. Document explicitly in CLAUDE.md inner Critical rule #3 that "legacy is V1 only ; CIP-64 USDT fee currency wiring is V1.5 deferred per ADR-003 — replacement plan = update `asLegacyTx()` to optionally emit type 0x7b with feeCurrency=USDT_ADAPTER".

### C.2 — Mobile viewport : 360×720 (Etalo) vs 360×640 (MiniPay required)

**Conflit** : CLAUDE.md inner Design standards section says "minimum viewport 360x720 pixels". MiniPay requirement says "responsive and fully functional at 360w × 640h" — the 80px shorter viewport.

**Verdict** : **MiniPay wins** (UI/UX règle de listing per Mike's contraint). 360×720 already passes 360×640 (Etalo's overshoot is more lenient, but the explicit number in CLAUDE.md should match MiniPay's spec to avoid future drift).

**Résolution** : update CLAUDE.md inner Design standards "Mobile-first: minimum viewport **360×640 pixels** (per MiniPay requirements §2)" — single line edit. No code change (current responsive layout already covers ≤360×640).

### C.3 — 3-tx checkout flow vs MiniPay UX preference for minimum friction

**Conflit potentiel** : ADR-002 accepts 3-tx checkout flow (approve + createOrderWithItems + fundOrder per seller group). MiniPay UX guidelines push for minimum tx count.

**Verdict** : **CLAUDE.md / ADR-002 wins** (architecture/économie). MiniPay does NOT block listing on tx count ; it asks for friction minimization but accepts multi-tx flows. ADR-002 already mitigates via "approve skipped when allowance covers" + V1.5 replacement plan = `EtaloEscrowWrapper.createAndFund()` (2 txs combined).

**Résolution** : keep ADR-002. Cross-link in CLAUDE.md inner sprint section that V1.5 wrapper will reduce to 2 txs per seller (1 if pre-approved). Document acceptable for V1 launch.

### C.4 — User-facing copy alignment is exact, no conflict

CLAUDE.md inner Critical rule #4 is **verbatim copy** of MiniPay's user-facing copy rules : "network fee" / "deposit" / "withdraw" / "stablecoin" / "digital dollar". No conflict — Mike pre-emptively aligned in CLAUDE.md v1.

## D — Risques sécurité Celo-specific

### D.1 — CELO token duality (native msg.value vs ERC-20)

**Applicable Etalo ?** : Low. EtaloEscrow holds USDT only via `transferFrom` (no payable functions, no native CELO entry points). `usdt.transferFrom(msg.sender, address(this), order.totalAmount)` per `EtaloEscrow.sol:307`.

**SPEC V2 traite ?** : Implicitly — no payable functions declared, so accidental `msg.value` would revert at the function selector level. Defensive `require(msg.value == 0)` not needed.

**Mitigation à ajouter avant audit** : SUFFICIENT. No action needed.

### D.2 — CIP-64 fee-currency accounting on USDT

**Applicable Etalo ?** : **HIGH** future-V1.5 risk. When ADR-003 replacement plan lands (CIP-64 USDT fee currency), the CIP-64 path can debit user's USDT balance for gas at the same time as their `transferFrom` to escrow. If user signs `approve(escrow, 100 USDT)` + immediately `fundOrder()`, the actual transferFrom amount is `100 - gas_in_USDT`. EtaloEscrow.fundOrder writes `order.totalAmount` to its books but the wallet's actual USDT debited is bigger.

**SPEC V2 traite ?** : NO. SPEC V2 §4 (createOrder flows) doesn't anticipate fee-currency accounting drift. EtaloEscrow.fundOrder line 307 `require(usdt.transferFrom(...) == true, "USDT transfer failed")` checks the boolean but not balance delta.

**Mitigation à ajouter avant V1.5 mainnet** :

- Before V1.5 CIP-64 wiring (ADR-003 replacement plan) : add a test `test_fundOrder_with_cip64_fee_in_USDT_credits_only_actual_transferFrom_amount.sol` that snapshots `balanceOf(buyer)` before + after, asserts `escrow's totalEscrowed += (balBefore - balAfter)` matches actual transferFrom.
- Add invariant `totalEscrowedAmount == sum(USDT.balanceOf(EtaloEscrow))` on V1.5 — guards against fee-currency drift.
- Document in ADR-003 replacement plan : "When wiring CIP-64, update fundOrder accounting to use balance-delta pattern, not order.totalAmount as source of truth for transfer amount."

### D.3 — Epoch boundary effects post-L2 migration

**Applicable Etalo ?** : Low V1 (stake retired per ADR-041) ; Moderate V2 (when stake reactivated for cross-border).

**SPEC V2 traite ?** : Stake contract reads validator state ? Looking at `EtaloStake` per ADR-020 / ADR-021 / ADR-028 — stake is **frozen with USDT, not CELO**, no validator/epoch dependency. Slashing logic uses freezeCount + tier downgrade per ADR-028, no validator slashing.

**Risk** : EtaloVoting (V2 deferred ADR-041) might use voting power tied to staking ; if it ever reads validator state for vote weighting, epoch boundary risk applies.

**Mitigation à ajouter avant V2 mainnet** : When EtaloVoting V2 reactivates, audit voting power computation for validator state reads ; if any, add comment "uses last-finalized epoch state, not current — safe across epoch boundaries".

### D.4 — Mento circuit-breaker / oracle drift / bridge risks

**Applicable Etalo ?** : NONE. Etalo uses USDT directly (no Mento stablecoins, no Aave V3 yield, no bridged tokens for V1).

**Mitigation** : Continue avoiding these dependencies. If V1.5 adds yield-bearing or multi-chain features, revisit.

---

## Top 5 actions à faire avant fin Sprint J4

> NB : Sprint J4 closed (V2 contracts shipped + audit prep). Top 5 actions revised pour **avant Sprint J11 audit pratique** OR **avant Sprint J12 mainnet launch** :

1. **[BLOCKING]** Implement Add Cash deeplink + pre-checkout balance gate — closes Mike's testing-blocker today (BigInteger preflight) AND MiniPay listing requirement §4. Effort ~1-2h. **Highest impact**.
2. **[BLOCKING]** Add Terms of Service + Privacy Policy routes + Footer links visible from every Mini App route. Effort ~30 min skeleton + legal copy review. **Listing prereq**.
3. **[BLOCKING]** Add in-app Support link (mailto or `/support` page). Effort ~15 min. **Listing prereq**.
4. **[BLOCKING]** Verify all 7 V2 contracts source-verified on Celoscan/Blockscout (audit each address, run `hardhat verify` if missing). Effort ~30 min if all already verified ; ~1-2h if some missing. **Listing prereq §3**.
5. **[RECOMMENDED → BLOCKING for mainnet V1.5]** Document V1.5 CIP-64 wiring with balance-delta accounting pattern in ADR-003 replacement plan + add solidity test pattern (security-patterns.md §2). Pre-mainnet audit prerequisite. Effort ~1h docs + ~2h test scaffold.

---

## Files à créer / modifier (proposals only — no modif applied Phase 1)

- ✏️ **CLAUDE.md inner Design standards** : "minimum viewport 360x720" → "**360x640**" (resolution conflit C.2)
- ✏️ **CLAUDE.md inner Critical rule #3** : add explicit V1.5 CIP-64 deferral note (resolution conflit C.1)
- 📝 **`docs/NETWORK_MANIFEST.md`** : new file (gap §B network manifest)
- 📝 **`docs/SUPPORT_SLA.md`** : new file (gap §B 24h SLA)
- 📝 **`docs/CELOSCAN_SAMPLES.md`** : new file (gap §B sample tx links)
- 📝 **`docs/AUDIT_CELOPEDIA_ALIGN.md`** : THIS file (commit ce rapport)
- 🎫 Tickets V1.5+ : Phone resolution FederatedAttestations + CIP-64 wiring + V1.5 wrapper createAndFund
- 🎫 Tickets V1 BLOCKING : Add Cash deeplink + pre-checkout guard + ToS/Privacy/Support links + Celoscan verification sweep

## Sources cross-referenced

- `CLAUDE.md` (inner) — Critical rules 1-15, V2 invariants, Design standards
- `docs/DECISIONS.md` — ADR-001 → ADR-041 (41 ADRs, esp. ADR-002, ADR-003, ADR-009, ADR-022, ADR-026, ADR-034, ADR-035, ADR-036, ADR-041)
- `docs/SPEC_SMART_CONTRACT_V2.md` — §0 V1 scope ADR-041, §4 createOrder flows, §7 forceRefund 3 conditions
- `celo-org/celopedia-skills@main/skills/celopedia-skill/references/minipay-requirements.md`
- `celo-org/celopedia-skills@main/skills/celopedia-skill/references/minipay-guide.md`
- `celo-org/celopedia-skills@main/skills/celopedia-skill/references/builder-guide.md` (Allowed Fee Currencies Mainnet table)
- `celo-org/celopedia-skills@main/skills/celopedia-skill/references/security-patterns.md`
