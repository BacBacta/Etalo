"""sync_abis.py — Vendor V2 contract ABIs into backend + miniapp.

Reads compiled artifacts from `packages/contracts/artifacts/contracts/`
and writes ABI-only JSON files to two destinations:

- `packages/backend/app/abis/`    — consumed by the FastAPI indexer
- `packages/miniapp/src/abis/v2/` — consumed by the React Mini App

The two consumers vendor the ABIs (rather than reaching into this
package) so each can deploy independently. Re-run this script after
every contract build or address change.

Usage:
    python packages/contracts/scripts/sync_abis.py
    # or, from the contracts dir:
    python scripts/sync_abis.py
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
CONTRACTS_DIR = SCRIPT_DIR.parent  # packages/contracts
PACKAGES_DIR = CONTRACTS_DIR.parent  # packages/

BACKEND_ABI_OUT = PACKAGES_DIR / "backend" / "app" / "abis"
MINIAPP_ABI_OUT = PACKAGES_DIR / "miniapp" / "src" / "abis" / "v2"

# (artifact_name, source_path_relative_to_contracts_dir)
CONTRACTS = [
    ("MockUSDT", "artifacts/contracts/test/MockUSDT.sol/MockUSDT.json"),
    ("EtaloReputation", "artifacts/contracts/EtaloReputation.sol/EtaloReputation.json"),
    ("EtaloStake", "artifacts/contracts/EtaloStake.sol/EtaloStake.json"),
    ("EtaloVoting", "artifacts/contracts/EtaloVoting.sol/EtaloVoting.json"),
    ("EtaloDispute", "artifacts/contracts/EtaloDispute.sol/EtaloDispute.json"),
    ("EtaloEscrow", "artifacts/contracts/EtaloEscrow.sol/EtaloEscrow.json"),
    ("EtaloCredits", "artifacts/contracts/EtaloCredits.sol/EtaloCredits.json"),
]

DESTINATIONS = [
    ("backend", BACKEND_ABI_OUT),
    ("miniapp", MINIAPP_ABI_OUT),
]


def main() -> int:
    if not CONTRACTS_DIR.exists():
        print(f"ERROR: contracts dir not found: {CONTRACTS_DIR}", file=sys.stderr)
        return 1

    for _label, dest in DESTINATIONS:
        dest.mkdir(parents=True, exist_ok=True)

    print(f"Source:       {CONTRACTS_DIR}")
    for label, dest in DESTINATIONS:
        print(f"Destination:  [{label}] {dest}")
    print()

    failures: list[str] = []
    written = 0
    for name, rel_path in CONTRACTS:
        src = CONTRACTS_DIR / rel_path
        if not src.exists():
            failures.append(f"  [MISSING] {name}: {src}")
            continue

        artifact = json.loads(src.read_text(encoding="utf-8"))
        abi = artifact.get("abi")
        if abi is None:
            failures.append(f"  [NO_ABI]  {name}: artifact has no `abi` field")
            continue

        payload = json.dumps(abi, indent=2, ensure_ascii=False) + "\n"
        for _label, dest in DESTINATIONS:
            (dest / f"{name}.json").write_text(payload, encoding="utf-8")
        written += 1
        print(f"  [OK]      {name}.json  ({len(abi)} entries)")

    if failures:
        print("\nFailures:", file=sys.stderr)
        for f in failures:
            print(f, file=sys.stderr)
        return 1

    print(f"\nSynced {written} ABIs to {len(DESTINATIONS)} destinations.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
