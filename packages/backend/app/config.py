from pydantic import Field
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # Database
    database_url: str = "postgresql://etalo:etalo@localhost:5432/etalo"

    # Redis
    redis_url: str = "redis://localhost:6379/0"

    # JWT
    jwt_secret: str = "change-me-in-production"
    jwt_algorithm: str = "HS256"
    jwt_expiration_minutes: int = 60

    # Cart token HMAC secret (Block 6 — POST /api/v1/cart/checkout-token).
    # Required, min 32 chars. Generate via `python -c "import secrets;
    # print(secrets.token_urlsafe(32))"`.
    cart_token_secret: str = Field(
        default="dev-cart-secret-do-not-use-in-prod-32chars",
        min_length=32,
    )

    # SECURITY: when false, the backend accepts the temporary
    # X-Wallet-Address header as proof of identity for routes that
    # would otherwise require a JWT. MUST be true before any deployment.
    # See docs/DECISIONS.md — "X-Wallet-Address header temporary".
    enforce_jwt_auth: bool = False

    # CORS
    cors_origins: str = "http://localhost:3000,http://localhost:5173"

    # Environment
    environment: str = "development"

    # Pinata IPFS
    pinata_api_key: str = ""
    pinata_api_secret: str = ""  # was pinata_secret_key — matches Pinata's own naming
    pinata_jwt: str = ""  # preferred auth; kept for future migration of IPFSService
    pinata_gateway_url: str = "https://gateway.pinata.cloud/ipfs"

    # Anthropic Claude API (Sprint J7 Block 4 — caption generation).
    # When unset, asset_generator falls back to a deterministic local
    # caption so the rest of the pipeline keeps working in dev.
    anthropic_api_key: str = ""

    # Twilio WhatsApp
    twilio_account_sid: str = ""
    twilio_auth_token: str = ""
    twilio_whatsapp_from: str = ""

    # Celo Sepolia RPC — env var CELO_SEPOLIA_RPC overrides; drpc fallback.
    # Aligned with packages/contracts/hardhat.config.ts and smoke scripts.
    celo_sepolia_rpc: str = "https://celo-sepolia.drpc.org"
    # Legacy field — kept for the V1 stub in app/services/celo.py until
    # Block 4 of Sprint J5 fully replaces it.
    celo_rpc_url: str = "https://celo-sepolia.drpc.org"

    # V2 contract addresses (Celo Sepolia, redeployed 2026-05-05 post-H-1 fix
    # per ADR-042). Previous addresses retained in
    # packages/contracts/deployments/celo-sepolia-v2.json previous_deployments[]
    # and docs/DEPLOYMENTS_HISTORY.md.
    # Source of truth: packages/contracts/deployments/celo-sepolia-v2.json.
    mock_usdt_address: str = "0xea07db5d3D7576864ac434133abFE0E815735300"
    etalo_reputation_address: str = "0x539e0d44c0773504075E1B00f25A99ED70258178"
    etalo_stake_address: str = "0x676C40be9517e61D9CB01E6d8C4E12c4e2Be0CeB"
    etalo_voting_address: str = "0x9C4831fAb1a1893BCABf3aB6843096058bab3d0A"
    etalo_dispute_address: str = "0xEe8339b29F54bd29d68E061c4212c8b202760F5b"
    etalo_escrow_address: str = "0xAeC58270973A973e3FF4913602Db1b5c98894640"
    # EtaloCredits (Sprint J7 Block 5b, redeployed post-H-1)
    etalo_credits_address: str = "0x778a6bda524F4D396F9566c0dF131F76b0E15CA3"

    # Treasuries (three-wallet separation per ADR-024)
    commission_treasury_address: str = "0x9819c9E1b4F634784fd9A286240ecACd297823fa"
    credits_treasury_address: str = "0x4515D79C44fEaa848c3C33983F4c9C4BcA9060AA"
    community_fund_address: str = "0x0B15983B6fBF7A6F3f542447cdE7F553cA07A8d6"

    # ============================================================
    # Analytics (J10-V5 Phase 5 Angle C sub-block C.2)
    # ============================================================
    # ADR-041 V1 single-timer locked at 3 days (intra-Africa intra-only V1).
    # V2 will likely vary by intra/cross-border (5 days) or Top Seller
    # tier (2 days). Lifting from a literal in routers/analytics.py to
    # this Settings field keeps the contract surface ready for V2 env-
    # override without forcing a code change per market segment.
    auto_release_days: int = 3

    # ============================================================
    # Indexer (Sprint J5 Block 5)
    # ============================================================
    # Polling interval between scan cycles (seconds).
    indexer_poll_interval_seconds: int = 30
    # Max blocks per eth_getLogs call (Alchemy limit ~50 for this RPC).
    indexer_block_chunk_size: int = 50
    # Re-read the last N blocks each cycle for reorg defense (idempotency
    # via UNIQUE(tx_hash, log_index) prevents double-write).
    indexer_reorg_depth: int = 3
    # Default starting block when indexer_state is empty (per-contract).
    # Bumped from 23761654 (pre-H-1 deploy block) to 24720376 (post-H-1
    # MockUSDT deploy block, lowest of the redeploy batch) on 2026-05-05.
    # Companion ops: the indexer_state rows that survive the redeploy
    # were UPDATEd to last_processed_block = 24720376 — see
    # packages/backend/scripts/h1-redeploy-indexer-reset.sql.
    indexer_start_block: int = 24720376
    # Set to false to disable the background indexer in tests / one-off
    # CLI invocations of the FastAPI app.
    indexer_enabled: bool = True

    # Legacy V1 fields (kept for the V1 stub in app/services/celo.py;
    # removed in Block 4).
    escrow_contract_address: str = ""
    dispute_contract_address: str = ""
    reputation_contract_address: str = ""
    usdt_contract_address: str = ""

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def is_production(self) -> bool:
        return self.environment == "production"

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


settings = Settings()
