import httpx

from app.config import settings


def build_ipfs_url(ipfs_hash: str) -> str:
    """Build a public gateway URL for an IPFS hash, tolerating both
    canonical (`https://gateway.pinata.cloud/ipfs`) and Pinata custom
    gateway (`https://<name>.mypinata.cloud`) forms in
    `settings.pinata_gateway_url`.

    Pinata custom gateways REQUIRE the `/ipfs/` path prefix or they
    return HTTP 400 Bad Request — silently breaking
    `next/image` optimization. This helper strips an optional trailing
    `/ipfs` segment then re-appends `/ipfs/<hash>` so the output is
    always `<gateway-without-ipfs>/ipfs/<hash>`.
    """
    base = settings.pinata_gateway_url.rstrip("/")
    if base.endswith("/ipfs"):
        base = base[: -len("/ipfs")]
    return f"{base}/ipfs/{ipfs_hash}"


def build_ipfs_url_or_none(ipfs_hash: str | None) -> str | None:
    """None-tolerant wrapper for use in router serializers."""
    if not ipfs_hash:
        return None
    return build_ipfs_url(ipfs_hash)


class IPFSService:
    """Pinata IPFS wrapper for product metadata and images."""

    BASE_URL = "https://api.pinata.cloud"
    UPLOAD_TIMEOUT = 30.0
    MAX_RETRIES = 3

    def __init__(self):
        self._headers = {
            "pinata_api_key": settings.pinata_api_key,
            "pinata_secret_api_key": settings.pinata_api_secret,
        }

    async def upload_json(self, data: dict) -> str:
        """Upload JSON metadata to IPFS. Returns IPFS hash."""
        async with httpx.AsyncClient(timeout=self.UPLOAD_TIMEOUT) as client:
            response = await client.post(
                f"{self.BASE_URL}/pinning/pinJSONToIPFS",
                json={"pinataContent": data},
                headers=self._headers,
            )
            response.raise_for_status()
            return response.json()["IpfsHash"]

    async def upload_image(self, file_bytes: bytes, filename: str) -> str:
        """Upload an image to IPFS. Returns IPFS hash."""
        async with httpx.AsyncClient(timeout=self.UPLOAD_TIMEOUT) as client:
            response = await client.post(
                f"{self.BASE_URL}/pinning/pinFileToIPFS",
                files={"file": (filename, file_bytes)},
                headers=self._headers,
            )
            response.raise_for_status()
            return response.json()["IpfsHash"]

    def get_url(self, ipfs_hash: str) -> str:
        """Get gateway URL for an IPFS hash. Delegates to the
        module-level `build_ipfs_url` so the gateway-form normalization
        is applied consistently across services + routers."""
        return build_ipfs_url(ipfs_hash)

    async def pin_by_hash(self, ipfs_hash: str) -> bool:
        """Pin an existing IPFS hash."""
        async with httpx.AsyncClient(timeout=self.UPLOAD_TIMEOUT) as client:
            response = await client.post(
                f"{self.BASE_URL}/pinning/pinByHash",
                json={"hashToPin": ipfs_hash},
                headers=self._headers,
            )
            return response.status_code == 200


ipfs_service = IPFSService()
