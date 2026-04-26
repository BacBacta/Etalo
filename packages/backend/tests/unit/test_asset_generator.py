import pytest
from uuid import uuid4

from app.services.asset_generator import generate_marketing_image


@pytest.mark.asyncio
async def test_generate_marketing_image_not_implemented_yet():
    """Block 1 placeholder: confirms the service skeleton is in place.
    Block 3 will replace this test with real generation specs."""
    with pytest.raises(NotImplementedError, match="Sprint J7 Block 3"):
        await generate_marketing_image(
            product_id=uuid4(),
            template="ig_square",
            caption_lang="en",
        )
