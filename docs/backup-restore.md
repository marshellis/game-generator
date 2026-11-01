# Backup and restore (Redis: accounts, households, profiles, progress, scores)

**Why:** the production database was once simply gone and every account and score with it.

**How it works:** `.github/workflows/backup.yml` (nightly) calls `GET /api/admin/backup` with `BACKUP_TOKEN`. The site
dumps its own Redis, encrypts the dump to `BACKUP_PUBLIC_KEY` (RSA-OAEP + AES-256-GCM) and returns ciphertext only. CI
stores it as a 30-day artifact. Ephemeral keys (lockouts, replay guards, health pings) are skipped. An empty database
is refused, so a lost DB shows up as a failed run instead of a "successful" empty backup.

**Keys:** the private key (`~/.bailey/backup-private.pem` on Bailey's runner, mode 600) is the only way to read a backup.
**Keep a second copy somewhere safe (password manager).** Lose it and the backups are unreadable; leak it and every
backup (children's names, birth years, progress) is readable by whoever also has an artifact.

## Restore drill
```
cd site
gh run download -R marshellis/game-generator -n games-backup           # newest artifact
export BACKUP_PRIVATE_KEY_FILE=~/.bailey/backup-private.pem
node scripts/restore.mjs games-backup-YYYY-MM-DD.enc                   # dry run: shows time + key counts
KV_REST_API_URL=... KV_REST_API_TOKEN=... node scripts/restore.mjs games-backup-YYYY-MM-DD.enc --apply
```
`--apply` keeps keys that already exist; add `--overwrite` to replace them. After restoring, `GET /api/health` must say ok.
Rotate the keypair by generating a new one, updating `BACKUP_PUBLIC_KEY` in Vercel, and keeping the old private key for old backups.
