# Rotate the `etalo_api` Fly Postgres password

One-time, ~2 min, ~few seconds of downtime (one machine restart). Use
after a credential exposure or on a routine rotation. The prod DB is the
**unmanaged Fly Postgres `etalo-db`** (host `etalo-db.flycast`), and the
backend connects as role `etalo_api` via the `DATABASE_URL` Fly secret.

A role can change its **own** password without superuser, so we do it
from inside the running app container (which already holds a valid
`DATABASE_URL`) — no need for `fly postgres connect` / superuser access
(which currently errors on org scope).

## Steps

**1. SSH into the app container:**
```bash
fly ssh console --app etalo-api
```

**2. Generate a new password, rotate the role, and print the new URL**
(paste the whole heredoc at the `root@…/app#` prompt). The password is
alphanumeric only, so it's safe both as a SQL literal and inside the URL:
```bash
python3 << 'EOF'
import os, secrets, string, psycopg
pw = "".join(secrets.choice(string.ascii_letters + string.digits) for _ in range(32))
conn = psycopg.connect(os.environ["DATABASE_URL"])
conn.autocommit = True
conn.execute(f"ALTER ROLE etalo_api WITH PASSWORD '{pw}'")
print("\n=== NEW DATABASE_URL (copy this) ===")
print(f"postgres://etalo_api:{pw}@etalo-db.flycast:5432/etalo_api?sslmode=disable")
print("====================================")
EOF
```
> If `ALTER ROLE` errors on privileges, the role can't self-rotate —
> fall back to superuser: `fly postgres connect --app etalo-db` then
> `ALTER ROLE etalo_api WITH PASSWORD '...';`.

**3. Exit the container:**
```bash
exit
```

**4. Set the new secret (this restarts the machine → it reconnects with
the new password):**
```powershell
fly secrets set DATABASE_URL="<paste the NEW DATABASE_URL from step 2>" --app etalo-api
```

**5. Verify** the app came back up and the DB is reachable:
```powershell
fly logs --app etalo-api
```
Look for `Application startup complete` + `Indexer started` + normal
`Polled blocks …` lines (no auth/connection errors). Then:
```bash
curl -s -o /dev/null -w "%{http_code}\n" https://etalo-api.fly.dev/api/v1/marketplace/products?limit=3
```
→ `200`.

## Notes

- Between step 2 (ALTER) and step 4 (secret set), the app's **existing**
  pooled connections keep working; only **new** connections would need
  the new password. Do steps 2→4 promptly; the restart in step 4 makes
  every connection use the new password.
- Nothing to commit/redeploy — `DATABASE_URL` is a runtime secret.
- Do NOT paste the new password into chat/logs — it only needs to live in
  the Fly secret.
