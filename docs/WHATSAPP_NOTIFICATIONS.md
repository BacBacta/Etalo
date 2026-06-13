# WhatsApp new-order notifications (Twilio)

When a buyer funds an order, the indexer's `OrderFunded` handler:

1. records a durable in-app `Notification` row for the seller
   (`channel="whatsapp"`, `notification_type="order_funded"`), and
2. fires a **best-effort WhatsApp ping** to the seller's number so they
   hear about it with the phone in their pocket — not only if they're
   staring at the dashboard (the in-app toast/badge covers that case).

The send is **fire-and-forget** (never blocks indexing) and **self-
disabling**: with no Twilio creds it's a clean no-op, so the backend
runs identically until the secrets below are set.

## What the seller needs

Their WhatsApp number in **international format** (`+234…`) in
Profile → Social links → WhatsApp. Numbers without a leading `+` are
skipped (we can't infer the country). The Profile field placeholder
already shows `+234 901 123 4567`.

## Secrets to set (Fly — production)

```powershell
fly secrets set `
  TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx `
  TWILIO_AUTH_TOKEN=your_auth_token `
  TWILIO_WHATSAPP_FROM=+14155238886 `
  TWILIO_ORDER_TEMPLATE_SID=HXxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx `
  -a etalo-api
```

- `TWILIO_WHATSAPP_FROM` — your approved WhatsApp sender (the code adds
  the `whatsapp:` prefix; give it with or without).
- `TWILIO_ORDER_TEMPLATE_SID` — **optional but required for production.**
  See "Template" below. Leave empty to use the sandbox (plain body,
  delivers only from the Twilio WhatsApp sandbox or inside a 24h window).

After setting, `fly logs -a etalo-api` shows
`WhatsApp notifier enabled (Twilio configured)` at startup.

## Template (business-initiated requires approval)

WhatsApp only delivers business-initiated messages (the seller hasn't
messaged us first) through a **pre-approved template**. Create a Content
Template in Twilio (Messaging → Content Template Builder), get it
approved, and set its `HX…` SID as `TWILIO_ORDER_TEMPLATE_SID`.

The code sends two variables:

- `{{1}}` = order id (e.g. `123`)
- `{{2}}` = amount in USDT (e.g. `5.00`)

Suggested template body (respecting Etalo terminology — "stablecoin",
no "crypto"):

> 🛍️ New order on Etalo! Order #{{1}} for {{2}} USDT is paid and waiting
> in escrow. Open your shop to ship it and release your funds.

> Terminology note: keep store/notification copy aligned with CLAUDE.md
> rule #4 — "network fee" (not gas), "stablecoin"/"digital dollar".

## Testing without an approved template (Twilio sandbox)

1. Leave `TWILIO_ORDER_TEMPLATE_SID` empty.
2. In Twilio, join the WhatsApp sandbox (send the join code to the
   sandbox number from your WhatsApp).
3. Set `TWILIO_WHATSAPP_FROM` to the sandbox number.
4. Put your own `+…` number in a test seller's Profile, fund an order
   → you get the plain-body message. (Sandbox only delivers to numbers
   that joined it.)

## Idempotency / safety

- The indexer dedupes on `(tx_hash, log_index)`, so `handle_order_funded`
  runs **once** per funding — no double pings on reorg re-reads.
- The whole notify path is wrapped so a Twilio/lookup failure logs and
  is swallowed — it can never roll back the order mirror.

## Template catalog (submitted 2026-06-13)

All UTILITY, language `en`, variables `{{1}}` = order id, `{{2}}` =
amount. Created + submitted via `scripts/create_whatsapp_template.py`
(re-runnable; `--list` shows live approval status, `--status <HX>` polls
one). **All six are now wired to indexer handlers** — each fires when
its on-chain event is mirrored, gated on its template-SID secret being
set (empty SID → that event is skipped, no error).

| Event | Audience | friendly_name | Content SID | Secret | Handler |
|-------|----------|---------------|-------------|--------|---------|
| Order funded | seller | `order_funded_en` | `HX198c88f6ca53389677ddd791c3a3f482` | `TWILIO_ORDER_TEMPLATE_SID` | `handle_order_funded` |
| Dispute opened | seller | `dispute_opened_en` | `HXac93f449a76e00219da15cbf1862a1c2` | `TWILIO_DISPUTE_TEMPLATE_SID` | `handle_dispute_opened` |
| Funds released | seller | `funds_released_en` | `HXb998075babaad6ecaa13e3436b4837e0` | `TWILIO_RELEASED_TEMPLATE_SID` | `handle_item_released` |
| Order refunded | seller | `order_refunded_en` | `HXf2fd32f8d2e7414a573ae6f982d2163e` | `TWILIO_REFUNDED_TEMPLATE_SID` | `handle_auto_refund_inactive` |
| Order shipped | buyer | `order_shipped_en` | `HX1421f4d610b5d4f522b846f1c5c77406` | `TWILIO_SHIPPED_TEMPLATE_SID` | `handle_shipment_group_created` |
| Order delivered → confirm | buyer | `order_delivered_en` | `HX7783731292dce07809e636cf830453cf` | `TWILIO_DELIVERED_TEMPLATE_SID` | `handle_group_arrived` |

Seller pings go to the profile `socials.whatsapp`; buyer pings (shipped
/ delivered) go to `phone_number` from the order's delivery snapshot.
Set all six SID secrets once the templates are `approved`:

```powershell
fly secrets set `
  TWILIO_DISPUTE_TEMPLATE_SID="HXac93f449a76e00219da15cbf1862a1c2" `
  TWILIO_RELEASED_TEMPLATE_SID="HXb998075babaad6ecaa13e3436b4837e0" `
  TWILIO_REFUNDED_TEMPLATE_SID="HXf2fd32f8d2e7414a573ae6f982d2163e" `
  TWILIO_SHIPPED_TEMPLATE_SID="HX1421f4d610b5d4f522b846f1c5c77406" `
  TWILIO_DELIVERED_TEMPLATE_SID="HX7783731292dce07809e636cf830453cf" `
  -a etalo-api
```

## Not in this piece (future)

- An in-app **notification bell** consuming `GET /api/v1/notifications`
  is live for sellers (PR #157). A buyer-side feed could reuse it.
