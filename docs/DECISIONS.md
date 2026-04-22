# Etalo — Architecture Decision Log

This file tracks significant technical decisions and deviations from
CLAUDE.md. Each entry is short and dated (YYYY-MM-DD). When CLAUDE.md
and this file disagree, this file wins until CLAUDE.md is updated.

---

## 2026-04-22 — React 19 accepted (overrides CLAUDE.md v1)

**Context**: CLAUDE.md v1 specifies React 18. Vite 8's `react-ts` template
scaffolds with React 19 + TypeScript 6.

**Decision**: Accept React 19 and TypeScript 6 instead of downgrading.

**Rationale**:
- React 19 is stable since late 2024.
- Wagmi v2 and shadcn/ui officially support React 19.
- Downgrading would introduce technical debt on day one of frontend work.

**Impact**: CLAUDE.md must be updated in a separate commit to reflect the
new baseline (React 19, TypeScript 6).

---

## 2026-04-22 — Wagmi v2 retained (not v3, despite CLAUDE.md)

**Context**: CLAUDE.md v1 specifies Wagmi v3. Wagmi v3 has shipped, but
documentation and community examples are still sparse.

**Decision**: Use Wagmi v2 (latest stable) for J1-J2 and the MVP.

**Rationale**:
- Solo developer sprint — minimize surprises.
- Wagmi v2 pairs cleanly with Viem v2 and has mature docs.
- Migration to v3 is planned for product V2, once ecosystem matures.

**Impact**: CLAUDE.md line 15 currently reads "Wagmi v3" — to be corrected
in the same commit as the React 19 update.
