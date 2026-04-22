from pydantic import BaseModel


class IpfsUploadResponse(BaseModel):
    ipfs_hash: str
    url: str
    is_dev_stub: bool = False
