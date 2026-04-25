"""sync_abis.py — Vendor V2 contract ABIs into the backend.

Reads compiled artifacts from `packages/contracts/artifacts/contracts/`
and writes ABI-only JSON files to `packages/backend/app/abis/`.

The backend imports ABIs from the vendored copy (not via filesystem
reach into the contracts package) so that the backend image / lambda
deploy is self-contained. Re-run this script after every contract
build or address change.

Usage:
    python packages/backend/scripts/sync_abis.py
    # or, from the backend dir:
    python scripts/sync_abis.py
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

# Resolve paths relative to this script (works regardless of cwd)
SCRIPT_DIR = Path(__file__).resolve().parent
BACKEND_DIR = SCRIPT_DIR.parent  # packages/backend
CONTRACTS_DIR = BACKEND_DIR.parent / "contracts"  # packages/contracts
ABI_OUT_DIR = BACKEND_DIR / "app" / "abis"

# (artifact_name, source_path_relative_to_contracts_dir)
CONTRACTS = [
    ("MockUSDT", "artifacts/contracts/test/MockUSDT.sol/MockUSDT.json"),
    ("EtaloReputation", "artifacts/contracts/EtaloReputation.sol/EtaloReputation.json"),
    ("EtaloStake", "artifacts/contracts/EtaloStake.sol/EtaloStake.json"),
    ("EtaloVoting", "artifacts/contracts/EtaloVoting.sol/EtaloVoting.json"),
    ("EtaloDispute", "artifacts/contracts/EtaloDispute.sol/EtaloDispute.json"),
    ("EtaloEscrow", "artifacts/contracts/EtaloEscrow.sol/EtaloEscrow.json"),
]


def main() -> int:
    if not CONTRACTS_DIR.exists():
        print(f"ERROR: contracts dir not found: {CONTRACTS_DIR}", file=sys.stderr)
        return 1

    ABI_OUT_DIR.mkdir(parents=True, exist_ok=True)

    print(f"Source:      {CONTRACTS_DIR}")
    print(f"Destination: {ABI_OUT_DIR}\n")

    failures: list[str] = []
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

        out = ABI_OUT_DIR / f"{name}.json"
        out.write_text(
            json.dumps(abi, indent=2, ensure_ascii=False) + "\n",
            encoding="utf-8",
        )
        print(f"  [OK]      {name}.json  ({len(abi)} entries)")

    if failures:
        print("\nFailures:", file=sys.stderr)
        for f in failures:
            print(f, file=sys.stderr)
        return 1

    print(f"\nSynced {len(CONTRACTS)} ABIs.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
