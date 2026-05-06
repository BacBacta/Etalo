"""Shared E2E test constants. Imported via plain Python (not via pytest fixtures)."""
from __future__ import annotations

from eth_account import Account


# J4 wallets
CHIOMA = "0xad7bbe9b75599d4703e3ca37350998f6c8d89596"
AISSA = "0xcdba5ccf538b4088682d2f6408d2305edf4f096b"
MAMADOU = "0xb8d774e5d45477be3dfff24be5b4700551271315"

# E2E test wallet (deterministic, NOT real funds)
TEST_PRIVATE_KEY = "0x" + "11" * 32
TEST_ADDRESS = Account.from_key(TEST_PRIVATE_KEY).address.lower()

# Synthetic onchain ids for seeded data
SEED_ORDER_ONCHAIN_ID = 9001
SEED_ITEM_ONCHAIN_ID = 9101
SEED_GROUP_ONCHAIN_ID = 9201
SEED_DISPUTE_ONCHAIN_ID = 9301

# Off-chain seller profile for CHIOMA (J11.5 Block 1 — exposes
# seller_handle on /orders without leaking raw 0x in UI per CLAUDE.md
# rule 5). Mirrors what onboarding would produce for the seed seller.
SEED_SELLER_HANDLE = "chioma_test_shop"
SEED_SELLER_SHOP_NAME = "Chioma Test Shop"

# Reserved for auth tests (mutating test that creates its own order)
AUTH_TEST_ORDER_ONCHAIN_ID = 9501
