# Self-audit — EtaloBoutiqueBilling (ADR-059)

**Scope:** `packages/contracts/contracts/EtaloBoutiqueBilling.sol`
(one-time 1 USDT boutique creation fee).
**Method:** AI-assisted self-audit per ADR-039 (Africa-first phased
audit strategy). The contract is a minimal clone of the
already-audited `EtaloCredits` shape (`Ownable` + `Pausable` +
`ReentrancyGuard`, single `safeTransferFrom` push to treasury), so the
marginal audit surface vs. EtaloCredits is small.
**Date:** 2026-06-15. **Tests:** 18 Hardhat passing.

## Threat-model review

| Class | Finding | Disposition |
|-------|---------|-------------|
| **Reentrancy** | `payCreationFee` is `nonReentrant`; CEI strict — `creationPaid[msg.sender]=true` + event are written **before** the single external `safeTransferFrom`. | OK — defense-in-depth: even without the guard, the one-shot flag blocks a second charge on re-entry. |
| **Access control** | Only `pause`/`unpause` are privileged (`onlyOwner`). No privileged fund movement. `commissionTreasury` and `usdt` are `immutable` (no setter) → cannot be re-pointed by a compromised owner. | OK — strictly less owner power than EtaloEscrow. Treasury change ⇒ redeploy (accepted, documented in ADR-059). |
| **ERC20 quirks (USDT no bool return)** | Uses `SafeERC20.safeTransferFrom` (ADR-007). | OK. |
| **Approve-from-nonzero (Tether semantics)** | The billing contract is a fresh spender used **once** per wallet (one-shot). Allowance starts at 0 → first approve is `0 → 1e6`, never the problematic nonzero→nonzero path. | OK — safer than the credits flow (which can re-approve). |
| **Integer over/underflow** | Fee is a fixed `1_000_000` constant; no arithmetic on user input. Solidity 0.8 checked math. | OK. |
| **Pausability** | `payCreationFee` is `whenNotPaused`; emergency stop available (ADR-026 pattern). | OK. |
| **Griefing / spoofing** | All state keyed on `msg.sender`; no path to mark another wallet paid/unpaid, no caller-supplied address. | OK. |
| **DoS** | No loops, no unbounded storage, no external dependency beyond USDT. | OK. |
| **Stuck funds** | Contract holds no balance — every fee is pushed straight to the treasury in the same tx. USDT sent **directly** to the contract address (not via `payCreationFee`) would be unrecoverable, as there is no sweep. | Informational — identical to EtaloCredits; not a user-reachable path. Accepted for V1. |
| **Front-running / MEV** | Fixed fee paid from the caller's own wallet; no economic ordering advantage. | OK. |
| **Off-chain trust (free window)** | `FEES_ENFORCED_FROM` gating is off-chain; the contract has no date and is simply not called during the promo. The gate only blocks *creation*; no funds at risk. | OK — by design (ADR-059). |

## Conclusion

No critical, high, or medium findings. One informational item
(direct-transfer stuck funds) is consistent with the audited
EtaloCredits and accepted for V1. The contract is suitable for Sepolia
validation; the mainnet deploy remains a Safe operation and should ride
the project's standard pre-mainnet review gate (ADR-039) alongside any
other pending contract changes.
