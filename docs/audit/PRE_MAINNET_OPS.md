# Pre-Mainnet — Operational Hardening Checklist

> Companion to `docs/PRE_MAINNET_QA.md` (perf) and the Pashov audit
> reports in `docs/audit/PASHOV_*.md`. This doc lists the **operational
> / key-management** items that must be done before the J12 mainnet
> deploy. They are not code changes — they are deployment-time and
> ops-time decisions that determine the blast radius of a key
> compromise once real funds move.
>
> Author : pre-mainnet audit pass, 2026-05-22.

## Critical : owner-only setters lack a timelock

Every Etalo V2 contract that holds funds or holds the dispute /
stake / reputation surface has an `onlyOwner` set of setters with
**immediate effect** (no delay, no multisig, no Timelock controller
in the inheritance). At the moment the deployer wallet is the owner.

### Affected setters

`EtaloEscrow.sol` (the most consequential — holds all USDT escrow) :

- `setCommissionTreasury(address)` — redirects future commission
  flow on every `_releaseItemFully` / `_accrueItemPartialRelease`
- `setCreditsTreasury(address)`
- `setCommunityFund(address)` — destination of forceRefund'd
  outstanding balance after the 90-day inactivity window
- `setDisputeContract(address)` — setting this to `address(0)` or a
  bricked address satisfies the "dispute contract inactive"
  precondition for `forceRefund` (ADR-023 condition #1) and unlocks
  the escape valve
- `setStakeContract(address)`
- `setReputationContract(address)`

`EtaloDispute.sol`, `EtaloStake.sol`, `EtaloVoting.sol`,
`EtaloReputation.sol`, `EtaloCredits.sol` each have analogous
`onlyOwner` setters — same risk surface, lower TVL exposure.

### Attack path

Single-key compromise of the deployer EOA →

1. Attacker calls `EtaloEscrow.setDisputeContract(address(0))`.
2. Attacker waits any 90-day inactive order (or seeds one in
   advance).
3. Attacker calls `forceRefund(orderId, attacker_address)` — ADR-023
   conditions evaluate true (dispute inactive, inactivity threshold
   met, legal hold satisfied if attacker controls that flag too).
4. All outstanding USDT in that order routes to attacker.
5. Repeat across the highest-balance orders. Cap is bounded by
   `MAX_TVL = 50,000 USDT` (ADR-026), but that's a $50k floor on
   theft and a complete reputational kill regardless.

### Required mitigation

Before transferring ownership to a multisig or Timelock controller :

- [ ] **Choose a multisig provider** — Safe (`safe.global`) is the
  obvious choice on Celo. Threshold should be **2/3 minimum** for
  V1 ; ideally 3/5 with at least one signer outside Mike's
  control (advisor, hardware-wallet cold-stored key).
- [ ] **Provision signer wallets** — hardware wallets only (Ledger /
  Trezor). No mobile / extension wallets for signers.
- [ ] **Deploy a Safe** with the chosen signers, then run :
  ```solidity
  // Per contract :
  contract.transferOwnership(safe_address);
  // Most OZ Ownable also supports a 2-step pull pattern :
  contract.acceptOwnership();  // from safe via tx proposed by 2/3 signers
  ```
- [ ] **(Optional but recommended) Add a Timelock controller in front
  of the Safe** for the highest-risk setters
  (`setCommissionTreasury`, `setDisputeContract`,
  `setCommunityFund`). Standard OpenZeppelin `TimelockController`
  with a 48h delay gives the community 2 days to observe any
  rogue tx before it executes.
- [ ] **Document the signer list + recovery plan** in a private doc
  (NOT in the repo). Include : signer device serial numbers,
  backup seed recovery procedure, what to do if one signer is
  compromised.

## High : monitoring + alerting absent

The current setup has no on-chain alerting. Mainnet should have :

- [ ] **Tx volume alert** — Slack / Telegram ping when daily volume
  exceeds N × 7-day moving average (anomaly = either a viral
  campaign or someone draining)
- [ ] **Failed-tx rate alert** — same channel, > 5% failure rate
  over 30-min window indicates a UX regression or contract bug
- [ ] **Owner-call alert** — page Mike immediately if any of the
  `set*` owner functions are called (even legitimately). Should be
  exceedingly rare ; any call without prior Slack heads-up = treat
  as compromise.
- [ ] **Balance-vs-state invariant** — `usdt.balanceOf(escrow) >=
  sum(all open orders.remainingInEscrow)` checked every block.
  Drift = either bug or attack.

Tools : Tenderly / OpenZeppelin Defender / Forta. Tenderly's free
tier covers the volumes here.

## Medium : 24h SLA infrastructure not yet stood up

MiniPay listing requires fixing critical issues within 24h or the
app gets temporarily delisted (ADR / requirement per
`minipay-requirements.md` §6).

- [ ] **Support inbox monitored 24h/day** — Telegram channel preferred
  per MiniPay recommendation. Auto-acknowledge inbound, page-out
  on `[CRITICAL]`/`[P0]` keywords.
- [ ] **(Recommended) AI triage agent on the Telegram channel** —
  intakes ticket, classifies (P0–P3 + type), drafts resolution from
  app logs + prior tickets + on-chain state, human approves &
  sends. Cuts manual time per ticket from ~15 min to ~2 min and
  makes the 24h SLA achievable solo.
- [ ] **Runbook** for the most likely incidents :
  - "Mass `forceRefund` tx observed" → check owner compromise path
  - "Tx failure rate spike" → check RPC health + fee abstraction
  - "MiniPay support page complaints about non-shipment" → check
    `delivery_address_snapshot` lock log + indexer health

## Low : public stats page not yet published

MiniPay readiness reviewers look at the operator's analytics
visibility. Required Stage 2, not Stage 1. Build a `/stats` page or
a Dune dashboard surfacing DAU, MAU, retention, tx volume per
stablecoin, network fees paid, failed-tx rate, contract-method tx
counts. Lightweight Plausible / PostHog on the web side + a Goldsky
or Blockscout-based indexer on the contract side covers it.

## Sign-off checklist (gate to J12 mainnet deploy)

- [ ] All HIGH and MEDIUM items above done
- [ ] Safe address recorded in `packages/contracts/deployments/celo-mainnet.json`
- [ ] `transferOwnership` tx hashes recorded for every Etalo contract
- [ ] Owner-call alert smoke-tested (intentional `setReputationContract`
  call to the same address, confirm Slack ping fires)
- [ ] Monitoring dashboards reachable from a phone (incident response
  is rarely at a desk)
- [ ] 1-page incident-response runbook printed + stored offline

When this checklist is green, the mainnet deploy is operationally
safe to ship.
