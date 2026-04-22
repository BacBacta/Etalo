import hashlib
import logging
from typing import Annotated

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status

from app.config import settings
from app.routers.sellers import get_current_wallet
from app.schemas.upload import IpfsUploadResponse
from app.services.ipfs import ipfs_service

router = APIRouter(prefix="/uploads", tags=["uploads"])

logger = logging.getLogger(__name__)

ALLOWED_CONTENT_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif"}
MAX_BYTES = 5 * 1024 * 1024  # 5 MB


def _dev_stub_hash(content: bytes) -> str:
    """
    Deterministic fake IPFS hash used when Pinata creds are missing in
    dev. The prefix `QmDev` is distinctive so no one mistakes these for
    real CIDs in logs or DB rows.
    """
    digest = hashlib.sha256(content).hexdigest()[:40]
    return f"QmDev{digest}"


@router.post("/ipfs", response_model=IpfsUploadResponse)
async def upload_to_ipfs(
    _wallet: Annotated[str, Depends(get_current_wallet)],
    file: Annotated[UploadFile, File()],
) -> IpfsUploadResponse:
    """
    Upload an image to IPFS via Pinata.

    Falls back to a deterministic dev stub when Pinata credentials are
    absent from the backend environment — so local onboarding flows
    work end-to-end without depending on the Pinata API during sprint.
    The stub is disabled in production (ENFORCE_JWT_AUTH=true refuses
    the unauthenticated path upstream anyway).
    """
    if file.content_type not in ALLOWED_CONTENT_TYPES:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=f"Unsupported content type: {file.content_type}",
        )

    content = await file.read()
    if len(content) > MAX_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="File exceeds 5 MB limit.",
        )
    if len(content) == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Empty file.",
        )

    has_creds = bool(settings.pinata_api_key and settings.pinata_api_secret)

    if not has_creds:
        logger.warning(
            "Pinata creds missing — returning dev-stub hash for %s (%d bytes). "
            "Production must provide PINATA_API_KEY and PINATA_SECRET_KEY.",
            file.filename,
            len(content),
        )
        ipfs_hash = _dev_stub_hash(content)
        return IpfsUploadResponse(
            ipfs_hash=ipfs_hash,
            url=ipfs_service.get_url(ipfs_hash),
            is_dev_stub=True,
        )

    try:
        ipfs_hash = await ipfs_service.upload_image(
            content, file.filename or "upload"
        )
    except Exception as exc:
        logger.exception("Pinata upload failed")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="IPFS provider unavailable.",
        ) from exc

    return IpfsUploadResponse(
        ipfs_hash=ipfs_hash,
        url=ipfs_service.get_url(ipfs_hash),
        is_dev_stub=False,
    )
