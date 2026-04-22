import httpx

from app.config import settings


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
        """Get gateway URL for an IPFS hash."""
        return f"{settings.pinata_gateway_url}/{ipfs_hash}"

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
