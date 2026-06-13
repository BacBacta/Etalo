"""Register the Etalo WhatsApp sender via the Twilio Senders API (v2).

Use case: the Meta embedded signup created the WABA + attached the phone
number on the Meta side, but the Twilio-side sender object was never
created (Console shows "You don't have any Senders created yet"). This
script finishes the job via the API — no console flow needed.

Modes:
    create (default)
        POST /v2/Channels/Senders with the number + WABA id + display
        name "Etalo", verification by SMS. Prints the sender SID
        (XE…) + status.

    --verify <sender_sid> <code>
        Submit the OTP that arrived by SMS on the Twilio number
        (read it in Console → Monitor → Logs → Messaging, or Phone
        Numbers → your number → Messages).

    --status <sender_sid>
        Poll the sender status (CREATING → VERIFYING → ONLINE).

Also: --list shows every sender on the account (use it to recover the
sender SID if the create output scrolled away).

Env (same pattern as the other scripts — token never in chat/git)::

    $env:TWILIO_ACCOUNT_SID="ACxxxx"
    $env:TWILIO_AUTH_TOKEN="..."
    venv\\Scripts\\python.exe scripts\\create_whatsapp_sender.py
"""
import asyncio
import json
import os
import sys

# From Mike's WhatsApp Manager URL (asset_id=…) — the WABA this number
# is attached to. Override with --waba <id> if Meta shows a different
# WhatsApp Business Account ID in Settings.
DEFAULT_WABA_ID = "1715612819440836"
SENDER_NUMBER = "whatsapp:+19895752173"
DISPLAY_NAME = "Etalo"

BASE = "https://messaging.twilio.com/v2/Channels/Senders"


def _auth():
    sid = os.environ.get("TWILIO_ACCOUNT_SID", "").strip()
    tok = os.environ.get("TWILIO_AUTH_TOKEN", "").strip()
    if not (sid and tok):
        print("Missing TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN env vars")
        sys.exit(2)
    import aiohttp

    return aiohttp.BasicAuth(sid, tok)


def _dump(body: dict) -> None:
    print(json.dumps(body, indent=2)[:1200])
    status = body.get("status")
    sid = body.get("sid")
    if sid:
        print(f"\nsender SID: {sid}")
    if status:
        print(f"status: {status}")
        if status == "ONLINE":
            print(
                "\nSender ONLINE — set it in prod:\n"
                '  fly secrets set TWILIO_WHATSAPP_FROM="+19895752173" -a etalo-api'
            )


async def create(waba_id: str) -> None:
    import aiohttp

    payload = {
        "sender_id": SENDER_NUMBER,
        "configuration": {
            "waba_id": waba_id,
            "verification_method": "sms",
        },
        "profile": {"name": DISPLAY_NAME},
    }
    async with aiohttp.ClientSession() as s:
        async with s.post(
            BASE,
            json=payload,
            auth=_auth(),
            headers={"Content-Type": "application/json"},
        ) as resp:
            print("HTTP", resp.status)
            body = await resp.json()
            _dump(body)
            if resp.status < 300:
                print(
                    "\nIf an SMS code was sent to the Twilio number, read it in "
                    "Console → Monitor → Logs → Messaging, then run:\n"
                    f"  …create_whatsapp_sender.py --verify <sender_sid> <code>"
                )


async def verify(sender_sid: str, code: str) -> None:
    import aiohttp

    async with aiohttp.ClientSession() as s:
        async with s.post(
            f"{BASE}/{sender_sid}",
            json={"configuration": {"verification_code": code}},
            auth=_auth(),
            headers={"Content-Type": "application/json"},
        ) as resp:
            print("HTTP", resp.status)
            _dump(await resp.json())


async def status(sender_sid: str) -> None:
    import aiohttp

    async with aiohttp.ClientSession() as s:
        async with s.get(f"{BASE}/{sender_sid}", auth=_auth()) as resp:
            print("HTTP", resp.status)
            _dump(await resp.json())


async def list_senders() -> None:
    import aiohttp

    async with aiohttp.ClientSession() as s:
        async with s.get(
            BASE, params={"Channel": "whatsapp"}, auth=_auth()
        ) as resp:
            print("HTTP", resp.status)
            body = await resp.json()
            senders = body.get("senders") or body.get("data") or []
            if not senders:
                print(json.dumps(body, indent=2)[:800])
                return
            for snd in senders:
                print(
                    f"- {snd.get('sid')}  {snd.get('sender_id')}  "
                    f"status={snd.get('status')}"
                )


if __name__ == "__main__":
    args = sys.argv[1:]
    if args[:1] == ["--verify"] and len(args) >= 3:
        asyncio.run(verify(args[1], args[2]))
    elif args[:1] == ["--list"]:
        asyncio.run(list_senders())
    elif args[:1] == ["--status"] and len(args) >= 2:
        asyncio.run(status(args[1]))
    else:
        waba = DEFAULT_WABA_ID
        if args[:1] == ["--waba"] and len(args) >= 2:
            waba = args[1]
        asyncio.run(create(waba))
