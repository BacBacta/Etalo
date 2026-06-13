"""One-off: send a test WhatsApp via Twilio to verify creds + sandbox.

Validates the Twilio account + WhatsApp sandbox WITHOUT needing a funded
order. Reads the same env vars the app uses; pass the destination number
(the one you joined the sandbox with) as the argument.

Local (PowerShell) — set the three vars then run via the venv python:
    $env:TWILIO_ACCOUNT_SID="ACxxxx"
    $env:TWILIO_AUTH_TOKEN="your_token"
    $env:TWILIO_WHATSAPP_FROM="+14155238886"   # the sandbox number
    .\venv\Scripts\python.exe scripts\send_test_whatsapp.py +2349011234567

Prints the Twilio HTTP status + response body so you can see exactly
what Twilio said (queued / error code + message).
"""
import asyncio
import os
import sys


async def main() -> None:
    if len(sys.argv) < 2:
        print("usage: send_test_whatsapp.py <+E164 number that joined the sandbox>")
        sys.exit(2)
    to_raw = sys.argv[1].strip()

    sid = os.environ.get("TWILIO_ACCOUNT_SID", "").strip()
    tok = os.environ.get("TWILIO_AUTH_TOKEN", "").strip()
    frm = os.environ.get("TWILIO_WHATSAPP_FROM", "").strip()
    if not (sid and tok and frm):
        print("Missing TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_WHATSAPP_FROM")
        sys.exit(2)

    frm = frm if frm.startswith("whatsapp:") else f"whatsapp:{frm}"
    to = to_raw if to_raw.startswith("whatsapp:") else f"whatsapp:{to_raw}"

    import aiohttp

    url = f"https://api.twilio.com/2010-04-01/Accounts/{sid}/Messages.json"
    data = {
        "From": frm,
        "To": to,
        "Body": "Etalo test ✅ — your WhatsApp order notifications are wired.",
    }
    async with aiohttp.ClientSession() as session:
        async with session.post(
            url, data=data, auth=aiohttp.BasicAuth(sid, tok)
        ) as resp:
            print("HTTP", resp.status)
            print((await resp.text())[:800])
            if resp.status < 300:
                print("\nOK — check your WhatsApp. (status 201 = queued)")
            else:
                print("\nFailed — read Twilio's error code/message above.")


if __name__ == "__main__":
    asyncio.run(main())
