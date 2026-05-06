"""IPFS service tests with mocked HTTP responses."""

import pytest
from unittest.mock import AsyncMock, patch, MagicMock

from app.services.ipfs import IPFSService, build_ipfs_url, build_ipfs_url_or_none


@pytest.fixture
def ipfs():
    return IPFSService()


def test_get_url(ipfs):
    url = ipfs.get_url("QmTestHash123")
    assert "QmTestHash123" in url
    assert url.startswith("https://")
    # Post-fix : URL must always include /ipfs/ regardless of gateway form.
    assert "/ipfs/QmTestHash123" in url


# === build_ipfs_url normalization (gateway URL form tolerance) ===


@pytest.mark.parametrize(
    "gateway, expected",
    [
        # Canonical form with /ipfs suffix (config.py default)
        (
            "https://gateway.pinata.cloud/ipfs",
            "https://gateway.pinata.cloud/ipfs/QmHash",
        ),
        # Trailing slash on canonical form
        (
            "https://gateway.pinata.cloud/ipfs/",
            "https://gateway.pinata.cloud/ipfs/QmHash",
        ),
        # Pinata custom gateway WITHOUT /ipfs suffix (Mike's .env shape)
        (
            "https://fuchsia-patient-urial-184.mypinata.cloud",
            "https://fuchsia-patient-urial-184.mypinata.cloud/ipfs/QmHash",
        ),
        # Custom gateway with trailing slash
        (
            "https://fuchsia-patient-urial-184.mypinata.cloud/",
            "https://fuchsia-patient-urial-184.mypinata.cloud/ipfs/QmHash",
        ),
        # Custom gateway WITH /ipfs suffix (defensive : env normalized either way)
        (
            "https://fuchsia-patient-urial-184.mypinata.cloud/ipfs",
            "https://fuchsia-patient-urial-184.mypinata.cloud/ipfs/QmHash",
        ),
    ],
)
def test_build_ipfs_url_normalizes_gateway_form(monkeypatch, gateway, expected):
    """Regression guard for the 400-Bad-Request bug observed when the
    gateway URL omitted the /ipfs/ path segment."""
    from app.config import settings

    monkeypatch.setattr(settings, "pinata_gateway_url", gateway)
    assert build_ipfs_url("QmHash") == expected


def test_build_ipfs_url_or_none_returns_none_for_falsy(monkeypatch):
    from app.config import settings

    monkeypatch.setattr(
        settings, "pinata_gateway_url", "https://gateway.pinata.cloud/ipfs"
    )
    assert build_ipfs_url_or_none(None) is None
    assert build_ipfs_url_or_none("") is None


def test_build_ipfs_url_or_none_delegates_to_build_ipfs_url(monkeypatch):
    from app.config import settings

    monkeypatch.setattr(
        settings, "pinata_gateway_url", "https://example.mypinata.cloud"
    )
    assert (
        build_ipfs_url_or_none("QmABC")
        == "https://example.mypinata.cloud/ipfs/QmABC"
    )


@pytest.mark.asyncio
async def test_upload_json(ipfs):
    mock_response = MagicMock()
    mock_response.json.return_value = {"IpfsHash": "QmFakeHash456"}
    mock_response.raise_for_status = MagicMock()

    with patch("httpx.AsyncClient") as MockClient:
        mock_client = AsyncMock()
        mock_client.post.return_value = mock_response
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        MockClient.return_value = mock_client

        result = await ipfs.upload_json({"name": "Test Product"})
        assert result == "QmFakeHash456"
        mock_client.post.assert_called_once()


@pytest.mark.asyncio
async def test_upload_image(ipfs):
    mock_response = MagicMock()
    mock_response.json.return_value = {"IpfsHash": "QmImageHash789"}
    mock_response.raise_for_status = MagicMock()

    with patch("httpx.AsyncClient") as MockClient:
        mock_client = AsyncMock()
        mock_client.post.return_value = mock_response
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        MockClient.return_value = mock_client

        result = await ipfs.upload_image(b"fake-image-bytes", "photo.jpg")
        assert result == "QmImageHash789"


@pytest.mark.asyncio
async def test_pin_by_hash(ipfs):
    mock_response = MagicMock()
    mock_response.status_code = 200

    with patch("httpx.AsyncClient") as MockClient:
        mock_client = AsyncMock()
        mock_client.post.return_value = mock_response
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        MockClient.return_value = mock_client

        result = await ipfs.pin_by_hash("QmExistingHash")
        assert result is True
