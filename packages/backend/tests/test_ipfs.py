"""IPFS service tests with mocked HTTP responses."""

import pytest
from unittest.mock import AsyncMock, patch, MagicMock

from app.services.ipfs import IPFSService


@pytest.fixture
def ipfs():
    return IPFSService()


def test_get_url(ipfs):
    url = ipfs.get_url("QmTestHash123")
    assert "QmTestHash123" in url
    assert url.startswith("https://")


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
