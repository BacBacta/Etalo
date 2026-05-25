# 3rd-party signer onboarding — Etalo mainnet multisig

**Purpose:** structured process to onboard the 3rd signer for the
2-of-3 Safe that owns the Etalo V2 mainnet contracts (per ADR-038 +
ADR-055).

**Status:** ⏳ in progress — candidate identified by Mike, contact
+ intake form not yet sent.

---

## 1. Why this matters

The 3rd-party signer is the **single most important external
relationship** in Etalo's mainnet security model. Their job :

- Hold one of the three keys that can authorise any admin tx on
  Etalo's V2 contracts (commission distribution, sanction
  application, `emergencyPause` activation, `forceRefund` after the
  ADR-023 three conditions, `adminForceCloseN3IfNoQuorum` on stuck
  N3 disputes).
- Provide an **independent voice** on every contentious admin
  decision. Mike + the 3rd party = 2-of-3 ; Mike alone (with both
  his passkeys) = 2-of-3 too, but the 3rd party's role is to
  **refuse to cosign anything that doesn't align with the protocol's
  declared invariants**, even if Mike says it's urgent.

The 3rd party is therefore not just a "backup signer" — they are a
**governance check** on Mike. The relationship needs to be one where
the person can comfortably say "no" if Mike proposes something they
disagree with.

---

## 2. Candidate profile (ADR-038 derived)

The ideal 3rd-party signer :

- **Knows Solidity well enough to read a Safe tx's decoded
  calldata** and recognise an `applySanction(seller, status)` vs a
  `transferOwnership(attacker)` — i.e. they can spot a malicious
  tx that Mike's compromised passkey might propose.
- **Geographically separate from Mike** (different city / country
  ideally) — protects against simultaneous physical compromise
  (theft, kidnapping, regional outage of Mike's communication
  channels).
- **Has their own secure storage** for their signer key (HW wallet,
  Safe Wallet mobile passkey, or at minimum a dedicated machine
  with OS-keychain-backed EOA). Not someone who will paste their
  private key into a random tutorial.
- **Reachable on at least one async + one sync channel** (e.g.
  Signal + email). For incident response (`emergencyPause`), Mike
  needs to be able to ping them and get a cosign within 4 hours.
- **Genuinely trustworthy** — Mike would lend them €1000 cash and
  expect it back. The 3rd party can collude with Mike to drain
  everything, so the relationship must be one of long-term mutual
  trust, not a one-off contract.

**Disqualifiers :**

- Anonymous Twitter / Discord handles with no real-world tie.
- People who would feel awkward saying "no" to Mike.
- Anyone who has shared key-management horror stories without
  visible improvement since (e.g. "I lost 2 ETH on a phishing site
  in 2023" without "and now I use a HW wallet" follow-up).

---

## 3. Outreach message (template)

Adapt tone to your relationship with the candidate. The template
below is the **minimum information density** the candidate needs to
decide whether to accept.

---

> Hi [name],
>
> I'm finishing up the V1 mainnet launch for Etalo (the Celo Mini
> App for African sellers I've been building — `etalo.app`). Before
> we go live with real USDT, I'm setting up the on-chain admin
> multisig — a 2-of-3 Safe on Celo mainnet that owns the 6 V2
> contracts (escrow, dispute, voting, stake, reputation, credits).
>
> I'd like to ask you to hold one of the three signing keys. Mike
> [you] holds the other two (mobile passkey on my phone + mobile
> passkey on an iPad — both Secure Enclave-backed). With threshold
> 2-of-3, any admin transaction needs your signature OR both my
> passkeys.
>
> What being a signer involves :
>
> - **Time commitment** : ~15 min per planned admin tx (review +
>   sign in the Safe Wallet mobile app). I expect 1-3 of these per
>   month in V1 ; could spike during an incident.
> - **SLA** : 24 h response for planned ops, 4 h for incident
>   response (`emergencyPause`, force-close-stuck-dispute, etc.).
> - **No fund custody on your side** — you just sign hashes from
>   your wallet. Your wallet never receives or sends Etalo funds.
> - **You'll need :** a Celo mainnet wallet (Safe Wallet mobile app
>   with passkey is preferred — Secure Enclave-backed ; HW wallet
>   or even MetaMask-style EOA also fine).
>
> What you commit to :
>
> - Read the decoded calldata of every Safe tx I propose, in the
>   Safe Wallet UI, **before** clicking sign.
> - **Refuse to cosign anything that doesn't fit the protocol's
>   declared rules** (I'll share the runbook + ADRs so you know
>   what's normal). Saying "no, explain this first" is exactly what
>   the multisig is for.
> - Tell me out-of-band if you ever lose access to your phone /
>   laptop so we can rotate your key before it's a problem.
>
> What you don't commit to :
>
> - Any liability for protocol outcomes — you're a check on me, not
>   a guarantor.
> - Any time commitment beyond cosigning Safe txs (no code review,
>   no governance meetings, no responsibility for protocol design).
> - Any long-term lock-in — you can step down anytime with 2 weeks
>   notice and I rotate your key out.
>
> If you're game, I'll send you a short intake form (your wallet
> address, preferred contact channel, etc.) and we'll proceed. Let
> me know either way — no offence if it's a no.
>
> — Mike

---

## 4. Intake form (candidate fills in after accepting)

Send this to the candidate once they've said yes. Their answers go
into `docs/MULTISIG_OPS.md` §1 "Current 3rd-party signer" table.

```text
=== Etalo mainnet 3rd-party signer intake ===

1. Your name / handle (for the MULTISIG_OPS.md record) :

2. Mainnet wallet address (Celo, chainId 42220) :
   0x_____________________________________________

3. Storage device class for this signer key :
   [ ] Passkey on mobile (Safe Wallet app, iOS or Android)
   [ ] Hardware wallet (Ledger / Trezor / GridPlus / other)
   [ ] EOA on dedicated machine (OS keychain-backed)
   [ ] Other : ______________________

4. Sign-request contact channel (pick ONE, primary) :
   [ ] Signal (username : ____________________)
   [ ] Encrypted email (pgp fingerprint or address) :
   [ ] Slack DM (workspace + handle) :
   [ ] Telegram (username) :
   [ ] Other : ______________________

5. Out-of-band recovery contact (someone who can reach you if
   your primary channel is unavailable — phone of trusted person,
   alternate email, etc.) :

6. Geographic location (city or general region — to confirm
   geographic separation from Mike in Belgium) :

7. SLA acknowledgement (initial here) :
   - Non-emergency txs : 24 h acknowledgement ____
   - Incident txs : 4 h acknowledgement ____

8. Refusal commitment (initial here) :
   "I commit to reading decoded calldata before signing and to
    refusing any Safe tx that doesn't fit the documented Etalo
    governance model in MULTISIG_OPS.md / DECISIONS.md." ____

9. Date :
```

---

## 5. Lock-in checklist (Mike completes after intake form returned)

- [ ] Candidate accepted (initial outreach response received).
- [ ] Intake form returned, complete.
- [ ] Wallet address on Celo mainnet verified — has bytecode if
      it's a smart wallet ; sent 0.01 CELO test tx + waited for
      receipt if it's a fresh EOA.
- [ ] Sign-request channel verified (sent a test message, received
      reply within stated SLA).
- [ ] Out-of-band recovery contact recorded in
      `docs/MULTISIG_OPS.md`.
- [ ] Mike + candidate co-reviewed `docs/MULTISIG_OPS.md` §2-§4
      (signing procedure, critical operations, incident response).
- [ ] Candidate has installed their signing wallet + completed
      `etalo.app/docs/multisig-onboarding-test.html` (5-min synthetic
      Sepolia tx flow — TBD doc).
- [ ] **Update `docs/MULTISIG_OPS.md` §1 "Current 3rd-party signer"
      table** with the intake form values.
- [ ] **Update this file's status header** : `Status: ✅ Onboarded
      YYYY-MM-DD`.

After lock-in : the 3rd signer is ready to be added as Owner #3 of
the mainnet Safe at creation time.

---

## 6. Rotation / step-down

If the 3rd signer wants to step down OR Mike decides to rotate them
out, follow `docs/MULTISIG_OPS.md` §7 "Add / remove signer flow" :

1. Identify replacement (run this entire doc again for the
   replacement candidate before removing the current one).
2. Add the replacement as a 4th signer (`addOwner` Safe tx,
   threshold stays 2).
3. Verify the new signer is active (low-value test sign).
4. Remove the old signer (`removeOwner` Safe tx, threshold returns
   to 2-of-3).
5. Update `MULTISIG_OPS.md` §1 with the new signer.

Minimum 2-week notice from the stepping-down signer (per the
outreach template's commitments) — allows time to identify + onboard
the replacement without rushing.
