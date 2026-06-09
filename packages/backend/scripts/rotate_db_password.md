# Rotate the `etalo_api` Fly Postgres password

One-time, ~2 min, ~one machine restart of downtime. Use after a
credential exposure or on a routine rotation. The prod DB is the
**unmanaged Fly Postgres `etalo-db`** (host `etalo-db.flycast`), and the
backend connects as role `etalo_api` via the `DATABASE_URL` Fly secret.

A role can change its **own** password without superuser, so we do it
from inside the running app container (which already holds a valid
`DATABASE_URL`).

## ⚠️ Read this first — two footguns that already caused outages

1. **The `ALTER ROLE` runs *inside the container* (psql/python), NEVER
   in your PowerShell prompt.** Typing SQL at `PS>` gives
   `ALTER : not recognized` and changes nothing.
2. **Never hand-type or hand-edit the `DATABASE_URL`.** A malformed URL
   in the secret crash-loops the API (`Could not parse SQLAlchemy URL`)
   until the machine hits its max-restart count and Fly *stops* it
   (then `curl` returns `503`, not `000`). Step 2 below prints the
   **complete `fly secrets set …` command** — copy that whole line, do
   not retype the URL.

The generated password is **alphanumeric only**, so it is safe both as a
SQL literal and inside the URL (no escaping, no `@`/`:`/`/` to break the
parse).

## Steps

**1. SSH into the app container:**

```powershell
fly ssh console -a etalo-api
```

**2. Generate a new password, rotate the role, and print the
ready-to-run secret command** (paste the whole heredoc at the
`root@…/app#` prompt):

```bash
python3 << 'EOF'
import os, secrets, string, psycopg
pw = "".join(secrets.choice(string.ascii_letters + string.digits) for _ in range(32))
conn = psycopg.connect(os.environ["DATABASE_URL"])
conn.autocommit = True
conn.execute(f"ALTER ROLE etalo_api WITH PASSWORD '{pw}'")
url = f"postgres://etalo_api:{pw}@etalo-db.flycast:5432/etalo_api?sslmode=disable"
print("\n=== ALTER ROLE done. Copy the ENTIRE line below and run it on your host ===\n")
print(f'fly secrets set DATABASE_URL="{url}" -a etalo-api')
print("\n===========================================================================")
EOF
```

> If `ALTER ROLE` errors on privileges, the role can't self-rotate —
> use the superuser fallback in **Rollback / recovery** below (same
> command shape, just from the `etalo-db` superuser shell).

**3. Exit the container:**

```bash
exit
```

**4. Run the printed command on your host** (copy the whole
`fly secrets set DATABASE_URL="…" -a etalo-api` line from step 2 — do
**not** retype it). Setting the secret restarts the machine, which then
reconnects with the new password:

```powershell
fly secrets set DATABASE_URL="postgres://etalo_api:<generated>@etalo-db.flycast:5432/etalo_api?sslmode=disable" -a etalo-api
```

**5. Verify** the app came back up:

```powershell
fly logs -a etalo-api --no-tail
curl.exe -s -o NUL -w "%{http_code}`n" https://etalo-api.fly.dev/api/v1/health
```

Look for `Application startup complete` + `Indexer started` + steady
`Polled blocks …` (no `password authentication failed`). The curl → `200`.

## Rollback / recovery (validated 2026-06-09)

If after step 4 the API crash-loops with
`FATAL: password authentication failed for user "etalo_api"`, the role
password and the secret are out of sync (e.g. the `ALTER` ran but the
secret got a different/old password). Realign them via the **superuser**:

```powershell
fly machine start <machine-id> -a etalo-api    # if Fly already stopped it (curl 503)
fly postgres connect -a etalo-db
```

At the `postgres=#` prompt, set the role password to **exactly** the one
the current `DATABASE_URL` secret uses, then quit:

```sql
ALTER ROLE etalo_api WITH PASSWORD '<password-in-the-current-secret>';
\q
```

Then restart so the app reconnects:

```powershell
fly machine start <machine-id> -a etalo-api
fly logs -a etalo-api --no-tail
```

> `<machine-id>` comes from `fly status -a etalo-api`. After the max
> restart count is reached, Fly **stops** the machine; a `fly secrets set`
> alone won't relaunch it — `fly machine start` does.

## Notes

- Between step 2 (ALTER) and step 4 (secret set), the app's **existing**
  pooled connections keep working; only **new** connections need the new
  password. Do steps 2→4 promptly; the restart in step 4 makes every
  connection use the new password.
- Nothing to commit/redeploy — `DATABASE_URL` is a runtime secret.
- **Do NOT paste the new password into chat/logs** — it only needs to
  live in the Fly secret. (`.flycast` is internal-only, so exposure risk
  is low, but treat it as a credential anyway.)
