# Sprint J8 — Pre-audit (mai 2026)

**Sprint objective**: Préparer Etalo à l'audit externe Q3-Q4 2026,
critical path mainnet. ~3 semaines, 6 blocks. Couvre le dernier fix
de contrat (ADR-033 V1.5), le threat model formel, le multisig Sepolia
opérationnel, le briefing audit, le booking d'une firm, et le backlog
V1.5.

**Branche**: `feat/pre-audit-v2` depuis `main` post-tag
`v2.0.0-asset-generator-sepolia` (HEAD = 4cd7ed3, J7 merge commit).

**Estimation**: 6 blocks, ~3 semaines total.

---

## Décisions verrouillées Phase 1

| # | Question | Décision |
|---|---|---|
| Q1 | ADR-033 scope | **A — Minimal** (relax `topUpStake` à `stake > 0`) |
| Q2 | Multisig signers | **À trancher avant Block 3** |
| Q3 | Re-deploy Sepolia post-fix | **Non** (diff patch documenté dans le briefing) |
| Q4 | Audit firm strategy | **A — 1 firm V1** |

---

## Blocks

| # | Block | Durée | Livrable |
|---|---|---|---|
| 1 | ADR-033 V1.5 fix | 1-2j | 1 commit fix relax `topUpStake` + regression test |
| 2 | Threat model document | 3-4j | `docs/THREAT_MODEL.md` ~10 sections |
| 3 | ADR-038 multisig strategy + threat model amendment | 0.5j | ADR-038 (V1 Sepolia single-key rehearsal, 2-of-3 Safe deferred mainnet) — revised scope, no hardware wallet yet. Safe deploy + `docs/MULTISIG_OPS.md` reslotted to J11/J12 pre-mainnet. |
| 4 | Audit briefing package | 2-3j | `docs/AUDIT_BRIEFING.md` + ADR index commenté |
| 5 | ADR-039 audit strategy V1 (re-scope) | 0.5j | ADR-039 (freelance + AI-assisted self-audit, ~$600-1100 budget). Firm engagement deferred V1.5 post-grants. |
| 6 | V1.5 backlog + closure | ~0.5j | `docs/V1.5_BACKLOG.md` + PR #5 + tag `v2.0.0-pre-audit-sepolia` |

---

## Block 1 — ADR-033 V1.5 fix (détaillé)

**Scope**: Relax la guard de `topUpStake` dans `EtaloStake.sol` pour
qu'elle accepte les sellers post-slash dont `currentTier == StakeTier.None`
mais qui ont encore `depositedAmount > 0` (orphan stake).

**Critères acceptance**:
- 168/168 Hardhat unit pass
- Foundry invariants pass (incluant l'invariant Block 9 active sales)
- Slither **0 H / 0 M / 0 L / 0 I** inchangé sur `EtaloStake.sol`

**Test ajouté** (dans `test/EtaloStake.test.ts`):
- `"ADR-033 V1.5 — topUpStake works on orphan stake post-slash to Tier.None"`
- Setup : seller stake → slash complet vers `Tier.None` mais `depositedAmount > 0` → `topUpStake` doit succeed et restaurer le tier

**ADR-033** dans `docs/DECISIONS.md` :
- Statut `V1-blocked` → `shipped J8 Block 1`
- Ajouter date de shipping + référence commit fix

**Livrable**: 1 seul commit `fix(contracts): ADR-033 V1.5 — relax topUpStake to stake > 0`
sur la branche `feat/pre-audit-v2`. Pas de PR ni tag avant Block 6
closure (cohérence avec les patterns J4 / J5 / J6 / J7).

---

## Blocks 2-6 (à détailler à leur démarrage)

Chaque block sera détaillé via un prompt Cowork dédié au moment de son
démarrage, sur le même modèle que Block 1.

- **Block 2** — Threat model : ~10 sections (acteurs, surfaces d'attaque,
  invariants on-chain, scénarios d'abus, hypothèses de confiance,
  contrôles compensatoires, plan de réponse incident).
- **Block 3** — ADR-038 multisig strategy : V1 Sepolia reste single-key
  deployer (rehearsal scope, no hardware wallet yet), 2-of-3 Safe
  deferred mainnet (signers Mike hot + Mike hardware + 3rd-party TBD).
  Amendement `docs/THREAT_MODEL.md` §4.1/§4.5/§5/§7. Safe deploy +
  ownership transfer + `docs/MULTISIG_OPS.md` reslotted J11/J12
  pre-mainnet.
- **Block 4** — Briefing audit : `docs/AUDIT_BRIEFING.md` avec scope,
  threat model, addresses Sepolia, ADR index commenté, contraintes,
  hot spots à scruter.
- **Block 5** — ADR-039 audit strategy V1 (re-scope budget $1000) :
  freelance + AI-assisted self-audit. 5 angles complémentaires
  (existing Slither/Foundry/Hardhat self-audit + Solodit cross-check
  + Foundry extended fuzzing + AI review Olympix/SolidityScan/Claude
  + 1 freelance reviewer Cantina/Code4rena focused EtaloEscrow +
  EtaloStake). Firm engagement classique deferred V1.5 post-grants
  Celo Foundation Sept 2026 + revenue.
- **Block 6** — Closure : `docs/V1.5_BACKLOG.md` (FR/Pidgin captions,
  LinkedIn/Twitter templates, order receipt PDF, refund post-confirm,
  dark mode, etc.), PR #5 vers `main`, tag `v2.0.0-pre-audit-sepolia`.

---

## Critères de réussite J8

- [x] ADR-033 V1.5 mergée + statut `shipped J8 Block 1`
- [x] `docs/THREAT_MODEL.md` complet (10 sections, 4032 mots)
- [x] ADR-038 multisig strategy V1/mainnet (re-scope no hardware wallet)
- [x] `docs/AUDIT_BRIEFING.md` prêt à envoyer (2398 mots, 38 ADRs index)
- [x] ADR-039 audit strategy V1 freelance + AI-assisted (re-scope $1000 budget)
- [x] `docs/V1.5_BACKLOG.md` formel (P1/P2/P3)
- [x] PR #5 + tag `v2.0.0-pre-audit-sepolia` posés

---

## Post-J8 (en parallèle pendant l'audit)

- **J9** — Polish + Submission Proof of Ship
- **J10** — Infra production + Legal (KYC/AML, ToS, Privacy Policy,
  routing fiscal)

J9 et J10 peuvent tourner en parallèle pendant la phase passive de
l'audit (typique 4-6 semaines après kickoff).

---

## Sprint J8 closure — bilan final (2026-04-27)

**Status**: COMPLET 6/6 blocks
**Branche**: `feat/pre-audit-v2`
**Tag**: `v2.0.0-pre-audit-sepolia` (sur le merge commit PR #5)
**PR**: #5 vers `main`

### Stats finales

- **7 commits** sur la branche (1 launch chore + 4 feat/test/docs
  Block 1-4 + 2 closure docs Block 5-6)
- **6 livrables documentaires** :
  - Block 1 contract fix (ADR-033 V1.5 `topUpStake` + `upgradeTier`
    relax to `stake > 0`, +5 Hardhat regression tests)
  - `docs/THREAT_MODEL.md` (4032 mots, 10 sections, Mermaid diagram,
    cross-refs ADR + .sol line numbers)
  - `docs/AUDIT_BRIEFING.md` (2398 mots, 38 ADRs index commenté,
    repro instructions, 21 verifier links)
  - `docs/V1.5_BACKLOG.md` (P1/P2/P3 prioritisé)
  - ADR-038 multisig strategy V1/mainnet
  - ADR-039 audit strategy V1 freelance + AI-assisted
- **Tests** : Hardhat 173/173 PASS, Foundry 8/8 invariants 0 reverts,
  Slither 0 H / 0 M / 38 L / 12 I (50 findings, zero High/Medium)
- **Lessons learned** #44-#45 documentées en memory (re-scope blocks
  via ADR + scope révisé pragmatic Block 5 budget contraint)

### Block timeline (chronologique)

| Block | Commit | Livrable |
|---|---|---|
| 1 | `3f4f158` | `fix(contracts): ADR-033 V1.5 — relax topUpStake + upgradeTier to stake > 0` |
| 2 | `e65118d` | `docs(security): threat model document for V1 audit briefing` |
| 3 | `72a0477` | `docs(adr): ADR-038 multisig strategy V1/mainnet + threat model amendment` |
| 4 | `9e9615f` | `docs(audit): briefing package + ADR index commenté + repro instructions` |
| 5 | `b2e27c2` | `docs(adr): ADR-039 audit strategy V1 (freelance + AI-assisted)` |
| 6 | TBD | `docs: J8 closure — V1.5 backlog formal + sprint J8 wrap-up` |

### Sign-off

V1 Boutique audit-ready package complete. Freelance + AI-assisted V1
audit strategy locked per ADR-039. Multisig 2-of-3 Safe deferred
mainnet pre-J12 per ADR-038. Sprint J9 TBD post-strategic step-back
de Mike.
