from typing import Literal
from uuid import UUID

from pydantic import BaseModel


class GenerateImageRequest(BaseModel):
    product_id: UUID
    template: Literal["ig_square", "ig_story", "wa_status", "tiktok", "fb_feed"]
    caption_lang: Literal["en", "sw"]


class GenerateImageResponse(BaseModel):
    ipfs_hash: str
    image_url: str
    caption: str
    template: str


class GenerateCaptionRequest(BaseModel):
    product_id: UUID
    lang: Literal["en", "sw"]


class GenerateCaptionResponse(BaseModel):
    caption: str
    lang: str
