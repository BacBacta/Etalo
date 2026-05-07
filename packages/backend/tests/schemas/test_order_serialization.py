"""Regression test for ShipmentGroupResponse hash serialization."""
import uuid
from datetime import datetime

from app.schemas.order import ShipmentGroupResponse


def test_shipment_group_proof_hash_serializes_as_hex():
    """proof_hash bytes must serialize as 0x-prefixed hex, not raw UTF-8.

    Regression : Pydantic 2.13 default bytes serialization crashes on
    non-UTF-8 byte sequences (e.g. 0xf2 0xff 0xf8) common in keccak256
    hashes. Surfaced during J11.5 Block 8 buyer-side validation.
    """
    sg = ShipmentGroupResponse(
        id=uuid.uuid4(),
        onchain_group_id=1,
        status="Shipped",
        proof_hash=b'\xf2\xff\xa8\xbd' + b'\x00' * 28,
        arrival_proof_hash=None,
        release_stage=0,
        shipped_at=datetime.now(),
        arrived_at=None,
        majority_release_at=None,
        final_release_after=None,
    )

    serialized = sg.model_dump()

    assert serialized['proof_hash'] == '0xf2ffa8bd' + '00' * 28
    assert serialized['arrival_proof_hash'] is None


def test_shipment_group_arrival_proof_hash_serializes_as_hex():
    """arrival_proof_hash must use the same hex serialization."""
    sg = ShipmentGroupResponse(
        id=uuid.uuid4(),
        onchain_group_id=2,
        status="Arrived",
        proof_hash=None,
        arrival_proof_hash=b'\xff' * 32,
        release_stage=1,
        shipped_at=None,
        arrived_at=datetime.now(),
        majority_release_at=None,
        final_release_after=None,
    )

    serialized = sg.model_dump()

    assert serialized['proof_hash'] is None
    assert serialized['arrival_proof_hash'] == '0x' + 'ff' * 32
