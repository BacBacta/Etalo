# Multisig operations runbook

**Scope:** governs every administrative transaction on the Etalo
mainnet contracts after the 2-of-3 Safe takeover (per ADR-038 +
ADR-055).

**Mainnet Safe address:** _TBD — populate at Safe-creation time._
**Sepolia rehearsal Safe address:** `0x8be4a6f4E053D8CB758ff26053B47d9423734501` (2-of-3, v1.4.1, rehearsal completed 2026-05-25 — see `docs/audit/MULTISIG_REHEARSAL.md`).
**Threshold:** 2-of-3 (any 2 signers can authorise a tx).

---

## 1. Signer set (V1 lock-in, 2026-05-25 — per ADR-055)

| # | Role | Storage | Owner | Status |
|---|------|---------|-------|--------|
| 1 | Mobile passkey #1 | Secure Enclave (iOS) / TEE (Android) on Mike's primary phone, Safe Wallet app | Mike | Validated on Sepolia rehearsal ✓ |
| 2 | Mobile passkey #2 | Secure Enclave on a separate device (iPad / tablet / secondary phone), Safe Wallet app | Mike | Pending — Mike picks the device + creates the 2nd passkey before mainnet Safe creation |
| 3 | 3rd-party advisor | Mobile passkey (preferred) OR HW wallet | Trusted technical advisor (Mike identifies + onboards per `docs/audit/SIGNER_3_ONBOARDING.md`) | Pending |

**Why 2 passkeys instead of "passkey + desktop EOA" (original ADR-055 draft):** both passkeys live in hardware-isolated Secure Enclaves on physically separate devices. A laptop compromise (malware, lost laptop, etc.) cannot exfiltrate either passkey because neither key is ever loaded into a desktop process. The trade-off is needing a 2nd device with Secure Enclave / TEE — minor friction, much stronger security floor.

**Hardware-wallet upgrade plan**: still on the roadmap (Q3 2026 or sooner) as a future _addition_, not a launch blocker. When Mike receives a Ledger Nano S Plus, it's added as a 4th signer (`addOwner` Safe tx, threshold can stay 2 or bump to 3-of-4 for tighter governance) without touching contract ownership.

### Signer #1 + #2 (Mike's 2 passkeys) hygiene

- Each passkey generated **independently** on its respective device — never share a recovery seed between them.
- Both devices enroll their passkey recovery into iCloud Keychain / Google Password Manager (or both, depending on the device family) so individual device loss is recoverable from the other.
- **Never** load either passkey into a desktop browser EOA / extension — passkeys stay in Secure Enclave, always.
- Both devices kept on auto-update for OS security patches.

### Signer #3 onboarding

Process documented in `docs/audit/SIGNER_3_ONBOARDING.md` (outreach
message template + intake questionnaire + lock-in checklist).

Required disclosures at onboarding (recap — full template in the
SIGNER_3 doc) :

- Address (mainnet Celo, chainId 42220).
- Storage device class (passkey-mobile preferred ; HW or EOA also acceptable).
- Contact channel for sign-requests (Signal / encrypted email / Slack DM).
- SLA :
  - **Non-emergency** (planned ops, treasury rotation, parameter bump in V1.1): **24 h** acknowledgement.
  - **Incident-response** (`emergencyPause`, force-close-stuck-dispute, fund-recovery): **4 h** acknowledgement.
- Out-of-band recovery contact for the 3rd party (in case of phone / laptop loss).

**Current 3rd-party signer**: TBD — fill in once onboarded :

| Field | Value |
|-------|-------|
| Address | `0x…` |
| Storage | (passkey / HW / EOA) |
| Sign-request channel | (Signal / email / …) |
| Out-of-band recovery contact | … |
| SLA acknowledgement (date) | YYYY-MM-DD |

---

## 2. Day-to-day signing procedure

Every admin tx that needs to land on chain follows this flow :

1. **Initiator (any signer)** drafts the tx in the Safe Wallet
   mobile / web app :
   - Connect signer wallet (passkey app / desktop EOA / 3rd party
     wallet).
   - Select the mainnet Safe.
   - "New transaction" → "Contract interaction" → paste target
     contract address + ABI fragment + parameters.
   - Sign with signer #1.
2. **2nd signer** opens the pending tx, reviews :
   - Target contract address (cross-check `docs/SECURITY.md`).
   - Function selector + decoded arguments.
   - Nonce (must be `safe.nonce + 0` for the next-up tx).
   - Gas estimate sanity check.
   - Signs with their signer wallet.
3. **Any signer** clicks "Execute" once the threshold (2) is reached.
   The tx is broadcast from a single signer's address, but **all
   signatures are on chain** — anyone reading the block can verify
   the 2-of-3 quorum.

### Pre-sign checklist (every tx)

- [ ] Target contract address matches the deploy table in
      `docs/SECURITY.md`.
- [ ] Function selector matches the expected ABI fragment.
- [ ] Decoded arguments make sense in context (amounts, addresses,
      booleans).
- [ ] Tx originates from a known-good script in `scripts/multisig/`
      or a manually-justified one-off (one-off : document the
      rationale in the Safe tx description before signing).
- [ ] No CRITICAL function called without 24h notice in the team
      channel (`emergencyPause`, `forceRefund`, sanction).

---

## 3. Critical operations catalogue

These map 1:1 to scripts under `packages/contracts/scripts/multisig/`.
**Always dry-run first** (`--dry-run` flag prints the call data
without broadcasting).

| Operation | Script | Risk | Approval ceremony |
|-----------|--------|------|-------------------|
| Transfer ownership (deployer → Safe) | `transfer-ownership.ts` | One-shot mainnet ; irreversible if Safe address wrong | Both Mike signers + 3rd-party sign-off on Safe address in writing |
| Verify ownership state | `verify-ownership.ts` | Read-only | None — anyone can run |
| Treasury reassignment (rotate sink address) | inside `transfer-ownership.ts` | Affects revenue routing | Standard 2-of-3 |
| `applySanction` on a seller | manual tx via Safe UI | Reputation impact ; bounded by ADR-054 silent no-op (no fund lockup) | Standard 2-of-3 + dispute investigation doc reference |
| `forceRefund(orderId, reasonHash)` | manual tx via Safe UI | Refunds a single order ; gated by 3 ADR-023 conditions | Standard 2-of-3 + legal-hold registration tx in same Safe batch |
| `emergencyPause` | manual tx via Safe UI | Halts all mutating ops for 7 days, 30-day cooldown | Incident-response 2-of-3 (4h SLA) + immediate post-call to MiniPay & users |
| `adminForceCloseN3IfNoQuorum(disputeId)` | manual tx via Safe UI | Closes a stuck zero-quorum N3 vote in buyer favor ; safe by construction (requires 0-0 vote tally) | Standard 2-of-3 |
| Add/remove Safe signer | Safe Wallet UI (`changeOwner`, etc.) | Changes the multisig composition | All 3 current signers — including the one being added/removed — co-sign explicitly |

### Forbidden operations (V1)

- **Direct `setDisputeContract(0)`** without a corresponding pre-step
  to close every active dispute and resume frozen stakes (Pashov #6
  mitigation — see `docs/audit/PASHOV_FINDINGS_J12.md`).
- **Modifying treasury addresses** to anything other than the Safe
  address (so all revenue accumulates under 2-of-3 control).
- **Threshold lowered below 2** under any circumstance.

---

## 4. Incident response

If a real-USDT incident is suspected :

1. **Triage** (any signer, 0–15 min) : check
   - On-chain : `getTotalEscrowed()`, recent `OrderFunded` events,
     `hasActiveDispute(seller)` for the suspicious seller.
   - Indexer (J5 backend) : anomaly_detector flags.
   - User reports (Twilio inbound, MiniPay channel).
2. **Containment** (Mike + at least 1 other signer, ≤4 h) :
   - If active exfiltration in progress → `emergencyPause` (pauses
     all mutating ops for 7 days, gives time for post-incident
     analysis).
   - If isolated to a single seller / order → `applySanction(seller,
     Suspended)` blocks new orders from that seller without halting
     the whole protocol. Combined with the Pashov #1 fix (silent
     no-op on completion), this does NOT lock in-flight buyer funds.
3. **Resolution** (full 2-of-3, ≤24 h after triage) :
   - Document incident in `docs/audit/INCIDENT_<YYYY-MM-DD>.md`
     (template TBD on first incident).
   - Choose remediation : refund affected users via `forceRefund`
     (if ADR-023 conditions met), or wait out the pause window for
     organic resolution.
   - Communicate transparently to users (MiniPay channel + WhatsApp
     status broadcast).
4. **Post-mortem** (within 7 days) :
   - Root-cause analysis.
   - Patch + redeploy if necessary (follows the v1.3-style sprint :
     Pashov audit re-run, smoke E2E, mainnet redeploy).
   - Update this runbook with any new incident-response pattern.

---

## 5. Recovery procedures

### Lost mobile (signer #1)

1. Mike installs Safe Wallet on a replacement device.
2. Restore account from email + Safe Wallet recovery (which uses the
   cloud-synced passkey from iCloud Keychain / Google Password
   Manager).
3. The recovered passkey signer **must** sign a test tx with low
   value to confirm functionality before any production tx.
4. If recovery fails (passkey not in cloud sync), the lost signer is
   permanently inaccessible — initiate signer rotation (§7) using
   signers #2 + #3.

### Lost desktop EOA (signer #2)

1. Mike generates a fresh EOA in the same OS keychain backend.
2. Submits a Safe tx (signed by mobile passkey + 3rd-party) to swap
   owner #2 from old EOA → new EOA.
3. New EOA is operational immediately on tx confirmation.

### Lost 3rd-party signer

1. Document the loss in this runbook (date, circumstances).
2. Initiate 3rd-party signer onboarding for replacement
   (see §1 "Signer #3 onboarding").
3. Submit a Safe tx (signed by Mike's 2 signers) to remove old
   address + add new one.

### Lost ALL Mike signers (catastrophic)

1. 3rd-party signer + 1 additional signer they control could cosign,
   but they don't have a 2nd — the Safe is locked at 1-of-3.
2. Mitigation : **must not happen.** Mike's mobile passkey + desktop
   EOA are designed to fail independently (different devices,
   different secure stores). If both fail simultaneously, treat as
   a security incident : escalate to the audit firm for forensic
   evaluation before any signer reset.
3. Last resort : protocol freeze. The contracts continue to operate
   for users (release / refund flows are permissionless), only
   admin functions are unreachable until a recovered or replacement
   signer can join.

---

## 6. Rotation policy

| Trigger | Action |
|---------|--------|
| Hardware wallet acquired (Q3 2026 target) | Add HW as 4th signer, then remove desktop EOA → back to 2-of-3 with passkey + HW + 3rd-party |
| Annual security review | All 3 signers verify their stored credentials are accessible (each performs a low-value test sign) |
| 3rd-party signer relationship change | Replace via `addOwner` + `removeOwner` Safe sequence |
| Suspected key compromise (any signer) | Immediate rotation : remove compromised signer, add fresh signer, audit recent Safe txs for anomalies |
| Major release (V1.5, V2) | Re-evaluate signer set ; consider expanding to 3-of-5 if user base + TVL has grown materially |

---

## 7. Add / remove signer flow

1. Identify which signer is being added or removed.
2. Draft the Safe governance tx (`addOwnerWithThreshold` or
   `removeOwner` via Safe Wallet UI).
3. Threshold remains 2-of-N after the change unless explicitly
   bumped — document any threshold change in this runbook with
   rationale.
4. Co-sign by 2 of the existing signers.
5. Verify on chain : Safe contract `getOwners()` returns the
   expected set ; `getThreshold()` returns the expected value.
6. Notify the new/removed signer out-of-band so they're aware of
   the state change.
7. Update §1 of this runbook with the new signer set.

---

## 8. References

- ADR-038 — Multisig strategy V1 / mainnet
- ADR-055 — Mobile passkey + 2 EOAs accepted as multisig signer set
- ADR-054 — Pre-mainnet audit fixes (Pashov findings)
- `docs/audit/PASHOV_FINDINGS_J12.md` — V1.1 backlog (incl.
  ops mitigations for findings #6, #7)
- `docs/SECURITY.md` — public addresses + threat model
- `packages/contracts/scripts/multisig/` — `transfer-ownership.ts`,
  `verify-ownership.ts`
- `docs/audit/MULTISIG_REHEARSAL.md` — Sepolia rehearsal run log
  (created post-rehearsal)
