"""Create + submit the Etalo new-order WhatsApp template via the Twilio
Content API — no console clicking needed.

Does two things:
1. POST /v1/Content            → creates the template, prints its HX… SID
2. POST …/ApprovalRequests/whatsapp → submits it to Meta for approval
   (category UTILITY — fastest approval class)

Then poll the approval status anytime with:
    python scripts/create_whatsapp_template.py --status HXxxxxxxxx

Env (same pattern as send_test_whatsapp.py — never paste the token in
chat/git)::

    $env:TWILIO_ACCOUNT_SID="ACxxxx"
    $env:TWILIO_AUTH_TOKEN="..."
    venv\\Scripts\\python.exe scripts\\create_whatsapp_template.py
"""
import asyncio
import json
import os
import sys

TEMPLATE_LANG = "en"

# Full order-lifecycle catalog. All UTILITY (transactional — fastest
# approval class). Copy follows CLAUDE.md rule #4 terminology
# ("stablecoin" money language, never "crypto"/"gas") and rule #5
# (no raw 0x… addresses). Variables: {{1}} = order id, {{2}} = amount.
#
# order_funded_en was submitted first (HX198c88f6ca53389677ddd791c3a3f482)
# — kept here for reference but skipped by default to avoid a duplicate
# submission. Buyer-facing order_shipped_en is submitted now (approval
# is the slow part) and wired to the backend later.
TEMPLATES: dict[str, str] = {
    "order_funded_en": (
        "New order on Etalo — #{{1}} for {{2}} USDT is paid and held in "
        "escrow. Open your shop to ship it and release your funds."
    ),
    "dispute_opened_en": (
        "A buyer opened a dispute on your Etalo order #{{1}}. Please "
        "respond with your shipping proof within 72 hours from your "
        "seller dashboard to resolve it."
    ),
    "funds_released_en": (
        "Good news — {{2}} USDT from Etalo order #{{1}} has been "
        "released to your wallet. Thanks for shipping on time!"
    ),
    "order_refunded_en": (
        "Etalo order #{{1}} ({{2}} USDT) was refunded to the buyer "
        "because it was not shipped within the 7-day window. Mark "
        "products out of stock if you can't fulfil them."
    ),
    "order_shipped_en": (
        "Your Etalo order #{{1}} has been shipped! The seller is on "
        "it — you can confirm delivery from your orders page once it "
        "arrives."
    ),
    # The escrow-closing nudge — confirming delivery is what releases
    # the funds to the seller (3-day auto-release intra per ADR-041 if
    # the buyer doesn't act).
    "order_delivered_en": (
        "Your Etalo order #{{1}} was marked as delivered. Please "
        "confirm delivery from your orders page to release the funds "
        "to your seller — otherwise they release automatically after "
        "the 3-day window."
    ),
}
SAMPLE_VARIABLES = {"1": "123", "2": "5.00"}

BASE = "https://content.twilio.com/v1"


def _auth():
    sid = os.environ.get("TWILIO_ACCOUNT_SID", "").strip()
    tok = os.environ.get("TWILIO_AUTH_TOKEN", "").strip()
    if not (sid and tok):
        print("Missing TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN env vars")
        sys.exit(2)
    import aiohttp

    return aiohttp.BasicAuth(sid, tok)


async def list_all() -> None:
    """List our catalog templates present on the account with their SID
    and WhatsApp approval status — the mapping we need to wire handlers."""
    import aiohttp

    async with aiohttp.ClientSession() as s:
        async with s.get(f"{BASE}/Content?PageSize=100", auth=_auth()) as resp:
            if resp.status >= 300:
                print("HTTP", resp.status, (await resp.text())[:400])
                return
            contents = (await resp.json()).get("contents", [])
        by_name = {
            c.get("friendly_name"): c.get("sid")
            for c in contents
            if c.get("friendly_name") in TEMPLATES
        }
        print(f"{'template':22} {'SID':36} status")
        for name in TEMPLATES:
            sid = by_name.get(name)
            if not sid:
                print(f"{name:22} {'(not created)':36} -")
                continue
            async with s.get(
                f"{BASE}/Content/{sid}/ApprovalRequests", auth=_auth()
            ) as r:
                wa = ((await r.json()).get("whatsapp") or {}) if r.status < 300 else {}
            print(f"{name:22} {sid:36} {wa.get('status', '?')}")


async def check_status(content_sid: str) -> None:
    import aiohttp

    async with aiohttp.ClientSession() as s:
        async with s.get(
            f"{BASE}/Content/{content_sid}/ApprovalRequests", auth=_auth()
        ) as resp:
            body = await resp.json()
            print("HTTP", resp.status)
            wa = (body.get("whatsapp") or {}) if isinstance(body, dict) else {}
            print(json.dumps(wa, indent=2)[:1200])
            status = wa.get("status")
            if status:
                print(f"\n=> approval status: {status}")
                if status == "approved":
                    print(
                        "Template approved! Set it in prod:\n"
                        f'  fly secrets set TWILIO_ORDER_TEMPLATE_SID="{content_sid}" -a etalo-api'
                    )


async def _existing_template_names(s, auth) -> set[str]:
    """friendly_names already present on the account — makes the batch
    re-runnable without creating duplicates."""
    names: set[str] = set()
    url = f"{BASE}/Content?PageSize=100"
    async with s.get(url, auth=auth) as resp:
        if resp.status >= 300:
            return names
        body = await resp.json()
        for item in body.get("contents", []):
            fn = item.get("friendly_name")
            if fn:
                names.add(fn)
    return names


async def create_and_submit() -> None:
    import aiohttp

    auth = _auth()
    results: dict[str, str] = {}
    async with aiohttp.ClientSession() as s:
        existing = await _existing_template_names(s, auth)
        for name, body_text in TEMPLATES.items():
            if name in existing:
                print(f"skip {name} (already exists on the account)")
                continue
            payload = {
                "friendly_name": name,
                "language": TEMPLATE_LANG,
                "variables": SAMPLE_VARIABLES,
                "types": {"twilio/text": {"body": body_text}},
            }
            async with s.post(
                f"{BASE}/Content",
                json=payload,
                auth=auth,
                headers={"Content-Type": "application/json"},
            ) as resp:
                body = await resp.json()
                if resp.status >= 300:
                    print(f"create {name} HTTP {resp.status}")
                    print(json.dumps(body, indent=2)[:500])
                    continue
                content_sid = body["sid"]
                print(f"created {name}: {content_sid}")

            async with s.post(
                f"{BASE}/Content/{content_sid}/ApprovalRequests/whatsapp",
                json={"name": name, "category": "UTILITY"},
                auth=auth,
                headers={"Content-Type": "application/json"},
            ) as resp:
                body = await resp.json()
                ok = resp.status < 300
                print(
                    f"submit {name} HTTP {resp.status} "
                    f"status={body.get('status', '?')}"
                )
                if ok:
                    results[name] = content_sid

    if results:
        print("\n=== Submitted to Meta (UTILITY). Keep these SIDs ===")
        for name, sid in results.items():
            print(f"  {name}: {sid}")
        print(
            "\nPoll any of them with:"
            "\n  venv\\Scripts\\python.exe scripts\\create_whatsapp_template.py --status <HX...>"
        )


if __name__ == "__main__":
    if len(sys.argv) >= 3 and sys.argv[1] == "--status":
        asyncio.run(check_status(sys.argv[2]))
    elif sys.argv[1:2] == ["--list"]:
        asyncio.run(list_all())
    else:
        asyncio.run(create_and_submit())
