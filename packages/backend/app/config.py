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

    # V2 contract addresses (Celo Sepolia, deployed Sprint J4 Block 11).
    # Source of truth: packages/contracts/deployments/celo-sepolia-v2.json.
    mock_usdt_address: str = "0x5ce5EBA46a72EA49655367c57334E038Ea1Aa1f3"
    etalo_reputation_address: str = "0x2a6639074d0897c6280f55b252B97dd1c39820b7"
    etalo_stake_address: str = "0xBB21BAA78f5b0C268eA66912cE8B3E76eB79c417"
    etalo_voting_address: str = "0x335Ac0998667F76FE265BC28e6989dc535A901E7"
    etalo_dispute_address: str = "0x863F0bBc8d5873fE49F6429A8455236fE51A9aBE"
    etalo_escrow_address: str = "0x6caEBc6aDc5082f6B63282e86CaF51AEbd630bfb"

    # Treasuries (three-wallet separation per ADR-024)
    commission_treasury_address: str = "0x9819c9E1b4F634784fd9A286240ecACd297823fa"
    credits_treasury_address: str = "0x4515D79C44fEaa848c3C33983F4c9C4BcA9060AA"
    community_fund_address: str = "0x0B15983B6fBF7A6F3f542447cdE7F553cA07A8d6"

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
    # Should be set to the deployment block for each V2 contract — using
    # a single low-bound here; the indexer takes max(this, deploy_block)
    # in practice. V2 contracts deployed around block 23761654.
    indexer_start_block: int = 23761654
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
