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
    # Regex pattern matching additional allowed origins (Vercel preview /
    # deployment-specific URLs like `etalo-<hash>-bactas-projects.vercel.app`).
    # Empty string disables regex matching ; main.py treats "" as None.
    cors_origin_regex: str = r"^https://etalo(-[a-z0-9-]+)?\.vercel\.app$"

    # Environment
    environment: str = "development"

    # Pinata IPFS
    pinata_api_key: str = ""
    pinata_api_secret: str = ""  # was pinata_secret_key — matches Pinata's own naming
    pinata_jwt: str = ""  # preferred auth; kept for future migration of IPFSService
    # Phase A perf switch — gateway.pinata.cloud was taking 4-5s in
    # production, ipfs.io serves the same content in ~0.5s. Fly prod
    # already overrides this via fly.toml ; aligning the default keeps
    # local dev consistent. Mainnet V1.5+ : move to a Pinata Dedicated
    # Gateway for SLA + bandwidth guarantees.
    pinata_gateway_url: str = "https://ipfs.io/ipfs"

    # Anthropic Claude API (Sprint J7 Block 4 — caption generation).
    # When unset, asset_generator falls back to a deterministic local
    # caption so the rest of the pipeline keeps working in dev.
    anthropic_api_key: str = ""

    # fal.ai API key (ADR-047 — Flux Kontext marketing image
    # generation). When unset, asset_generator falls back to the
    # legacy Playwright template render so dev environments without a
    # fal.ai account keep working. Production sets this on Fly so
    # sellers get the AI-retouched output instead of the template
    # composite that triggered the J7 quality complaint.
    fal_key: str = ""

    # Twilio WhatsApp
    twilio_account_sid: str = ""
    twilio_auth_token: str = ""
    twilio_whatsapp_from: str = ""

    # Frontend base URL — used to compose deeplinks in
    # notifications (J11.5 Block 7, ADR-043). Default points at
    # production ; override via .env in dev (typically an ngrok
    # reserved domain since WhatsApp messages can't reach
    # localhost). Trailing slash is stripped at compose time.
    # V1 canonical production domain is etalo.xyz (per Vercel project alias
    # 2026-05-25). etalo.app planned future domain — not yet wired.
    # Default points to etalo.xyz for production builds.
    frontend_base_url: str = "https://etalo.xyz"

    # Celo Sepolia RPC — env var CELO_SEPOLIA_RPC overrides; drpc fallback.
    # Aligned with packages/contracts/hardhat.config.ts and smoke scripts.
    celo_sepolia_rpc: str = "https://celo-sepolia.drpc.org"
    # Legacy field — kept for the V1 stub in app/services/celo.py until
    # Block 4 of Sprint J5 fully replaces it.
    celo_rpc_url: str = "https://celo-sepolia.drpc.org"

    # ----------------------------------------------------------
    # Contract addresses — DEFAULTS = Celo Sepolia (testnet) for
    # local dev safety. Production MUST override every value below
    # via env vars (Fly.io secrets) — see docs/MAINNET_CUTOVER.md
    # for the full cutover checklist + the mainnet values to set.
    # ----------------------------------------------------------
    # V2 contract addresses (Celo Sepolia, redeployed 2026-05-25
    # post-Pashov-audit-fixes per ADR-054, tag v1.3-audit-fixes).
    # Previous addresses retained in
    # packages/contracts/deployments/celo-sepolia-v2.json previous_deployments[]
    # and docs/DEPLOYMENTS_HISTORY.md.
    # Source of truth: packages/contracts/deployments/celo-sepolia-v2.json.
    mock_usdt_address: str = "0xd34428140Fc8D6Be523d9A14C4E215F5709f9427"
    etalo_reputation_address: str = "0x5762502acAA57744F0bC10b3f0fD2Cd59a16EFbE"
    etalo_stake_address: str = "0xE599a167f0422D6700EC812c6b0f3c485379Ed05"
    etalo_voting_address: str = "0x44E4Aafb22ac1Af3ea005EBa7384Fa310b6fA671"
    etalo_dispute_address: str = "0x1f830A47af07E2BE9Db2017C873Bd2eF7F98f4a1"
    etalo_escrow_address: str = "0xc8174b1218fEbD7d49B982cB3f1De83e411FbEA1"
    # EtaloCredits (Sprint J7 Block 5b, redeployed post-H-1)
    etalo_credits_address: str = "0x778a6bda524F4D396F9566c0dF131F76b0E15CA3"

    # Treasuries (three-wallet separation per ADR-024).
    # On mainnet, all 3 point to the multisig Safe at
    # 0x10d6Ff4eb8372aE20638db1f87a60f31fdF13E0F — ADR-024 logical
    # separation preserved off-chain (admin Safe tx routes revenue
    # to dedicated sub-accounts in V1.1+ when accumulation justifies).
    commission_treasury_address: str = "0x9819c9E1b4F634784fd9A286240ecACd297823fa"
    credits_treasury_address: str = "0x4515D79C44fEaa848c3C33983F4c9C4BcA9060AA"
    community_fund_address: str = "0x0B15983B6fBF7A6F3f542447cdE7F553cA07A8d6"

    # ----------------------------------------------------------
    # MAINNET reference (Celo mainnet chainId 42220, V1.4 launch
    # 2026-05-25, tag v1.4-mainnet). NOT loaded by default — set the
    # env vars below in production (Fly.io secrets).
    # Source: packages/contracts/deployments/celo-mainnet-v2.json.
    # ----------------------------------------------------------
    # MOCK_USDT_ADDRESS=0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e (real Celo Tether)
    # ETALO_REPUTATION_ADDRESS=0xaF890609a3B2AF6E1E2Ebf91267347133b5065AD
    # ETALO_STAKE_ADDRESS=0x3D588192BC76e38a3f6453E45A9B9aD0Dc85bc9A
    # ETALO_VOTING_ADDRESS=0xa1C48f2f962484D63D4D1b04C9c2574Da2C0EcBA
    # ETALO_DISPUTE_ADDRESS=0x6d5Aa5e0EAE407688E99492213849D9a608D63d2
    # ETALO_ESCROW_ADDRESS=0x0890D9bCE4E71148b135A99Cf501DE52Aa05Ee92
    # ETALO_CREDITS_ADDRESS=0xDDbE5BEC28B4eC0a309fca87047750EF4b42F7d6
    # COMMISSION_TREASURY_ADDRESS=0x10d6Ff4eb8372aE20638db1f87a60f31fdF13E0F  (Safe)
    # CREDITS_TREASURY_ADDRESS=0x10d6Ff4eb8372aE20638db1f87a60f31fdF13E0F  (Safe)
    # COMMUNITY_FUND_ADDRESS=0x10d6Ff4eb8372aE20638db1f87a60f31fdF13E0F  (Safe)
    # CELO_RPC_URL=https://forno.celo.org
    # CELO_SEPOLIA_RPC=https://forno.celo.org  (legacy alias, same value as CELO_RPC_URL until Sprint J5 Block 4 removes it)

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
    # Max blocks per eth_getLogs call. Forno (Celo mainnet public RPC)
    # caps each call at ~10k blocks but rate-limits bursts to ~25 reqs
    # before returning 403. The previous 50-block default caused a
    # silent indexer stall on first mainnet startup: 14k-block backfill
    # / 50 = 280 chunks × 5 contracts = 1400 calls in a single cycle,
    # all bursting in < 5 s → forno banned the IP mid-cycle, the
    # AsyncWeb3 exception was swallowed by `_poll_cycle`'s blanket
    # except, and the cursor never advanced past the deploy block.
    # 2000 keeps backfill under ~10 calls and stays well below forno's
    # 10k per-call cap with margin if forno tightens. Paired with the
    # 100 ms inter-chunk sleep in `Indexer._poll_chunk`.
    indexer_block_chunk_size: int = 2000
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

    # ADR-019 auto-refund keeper (Block 2). Hex private key (with or
    # without 0x prefix) of a wallet funded with CELO ; used to call
    # `EtaloEscrow.triggerAutoRefundIfInactive(orderId)` for orders that
    # crossed the seller-inactivity deadline. When empty the keeper
    # logs a warning at startup and stays disabled — the contract
    # function is permissionless so buyers can still self-claim via the
    # /orders/[id] UI button.
    relayer_private_key: str = ""
    # Polling interval in hours. Default 6h is enough — the deadline is
    # 7 days, so even with one missed cycle the worst-case extra delay
    # is 12h. Set 0.05 (~3 min) in dev for fast iteration.
    auto_refund_keeper_interval_hours: float = 6.0
    # Master switch — keeper task is created only when both this is
    # true AND `relayer_private_key` is non-empty.
    auto_refund_keeper_enabled: bool = True

    # Legacy V1 fields (kept for the V1 stub in app/services/celo.py;
    # removed in Block 4).
    escrow_contract_address: str = ""
    dispute_contract_address: str = ""
    reputation_contract_address: str = ""
    usdt_contract_address: str = ""

    # Bearer-style token required on the /admin/* routes (ADR-056 — the
    # admin triage page reads dispute PII so we keep it gated). Empty in
    # dev → all admin endpoints reject. Set via ADMIN_API_TOKEN env var
    # in production / on Fly.
    admin_api_token: str = ""

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def is_production(self) -> bool:
        return self.environment == "production"

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


settings = Settings()
