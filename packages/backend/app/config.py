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
    pinata_secret_key: str = ""
    pinata_gateway_url: str = "https://gateway.pinata.cloud/ipfs"

    # Twilio WhatsApp
    twilio_account_sid: str = ""
    twilio_auth_token: str = ""
    twilio_whatsapp_from: str = ""

    # Celo
    celo_rpc_url: str = "https://celo-sepolia.drpc.org"
    escrow_contract_address: str = ""
    dispute_contract_address: str = ""
    reputation_contract_address: str = ""

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def is_production(self) -> bool:
        return self.environment == "production"

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


settings = Settings()
