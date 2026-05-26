"""Check USDT balance flows for a completed order — verify commission
went to commissionTreasury and net went to seller."""
import asyncio
from app.config import settings
from app.services.celo import CeloService
from web3 import AsyncWeb3


# Real USDT on Celo mainnet — 6 decimals
USDT_ABI = [
    {
        "name": "balanceOf",
        "type": "function",
        "inputs": [{"name": "owner", "type": "address"}],
        "outputs": [{"name": "", "type": "uint256"}],
        "stateMutability": "view",
    }
]


async def main():
    celo = CeloService.from_settings()
    w3 = celo._w3
    usdt = w3.eth.contract(
        address=AsyncWeb3.to_checksum_address(settings.mock_usdt_address),
        abi=USDT_ABI,
    )

    seller3 = AsyncWeb3.to_checksum_address("0x365c14d81ff130ac50b07374e95df51140e2505a")
    seller_other = AsyncWeb3.to_checksum_address("0x3154835deaf9df60a7acaf45955236e73ad84502")
    commission_safe = AsyncWeb3.to_checksum_address(settings.commission_treasury_address)
    buyer = AsyncWeb3.to_checksum_address("0xfcfe723245e1e926ae676025138ca2c38ecba8d8")
    escrow = celo._escrow.address

    print(f"USDT contract: {usdt.address}")
    print(f"Commission Safe: {commission_safe}")
    print(f"Escrow contract: {escrow}")
    print()

    for label, addr in [
        ("Buyer (Mike EOA)", buyer),
        ("Seller #1 (0x3154)", seller_other),
        ("Seller #3 (0x365c)", seller3),
        ("Commission Treasury (Safe)", commission_safe),
        ("Escrow contract (TVL)", escrow),
    ]:
        bal = await usdt.functions.balanceOf(addr).call()
        bal_human = bal / 1_000_000
        print(f"  {label:35s} = {bal_human:>12.6f} USDT  ({bal} raw)")

    print()
    print("Expected for order #3 settlement (0.06 USDT total) :")
    print("  Commission : 0.06 × 1.8% = 0.00108 USDT")
    print("  Seller net : 0.06 - 0.00108 = 0.05892 USDT")


asyncio.run(main())
