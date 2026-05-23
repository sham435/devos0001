# BUGS.md

> Rule: If a bug took >15min to fix, it gets logged here. Future you will thank present you.

## Template — Copy for each bug

```markdown
### BUG-001: JWT refresh infinite loop on Safari
**Date Found**: 2026-05-22
**Severity**: P1 - Blocks login
**Status**: Fixed
**Commit**: `a1b2c3d`

#### Symptoms
User logs in → gets 200 → 1min later all API calls 401 → frontend calls /refresh → gets new token → still 401 loop

#### Root Cause
Safari ITP blocks 3rd-party cookies. We set refresh token in `HttpOnly` cookie with `SameSite=None`. Safari dropped it silently. Frontend retried refresh with empty cookie → new access token with no perms.

#### Fix
```diff
# settings.py
SIMPLE_JWT = {
   'AUTH_COOKIE_SAMESITE': 'Lax',  # Was 'None'
   'AUTH_COOKIE_SECURE': True,
}
# + Frontend: Store refresh in memory, not cookie, for Safari
```

#### How We Found It
curl worked, Safari failed → browser issue
Checked Application > Cookies in DevTools → refresh missing
Googled "safari itp samesite none" → ITP docs

#### Prevention
- Added to /memory/mistakes/safari-itp-cookies.md
- E2E test: Playwright on Safari in CI
- Added check to docs/setup/browser-compat.md
- **Time Wasted If Not Logged**: 3hrs
```

## Active Bugs

### BUG-002: Redis pubsub connections leak on WS disconnect
**Date Found**: 2026-05-22
**Severity**: P2 - Memory grows 50MB/day
**Status**: Investigating
**Owner**: You

#### Symptoms
`redis-cli info` shows `connected_clients` increasing. Server RAM up 2GB after 4 days.

#### Hypothesis
1. `disconnect()` in Channels consumer not calling `pubsub.unsubscribe()` — 80%
2. Nginx not sending close frame — 15%
3. Daphne worker leak — 5%

#### Next Debug Step
Run: `redis-cli client list | grep -c "sub"` vs `lsof -i :8001 | wc -l`. If mismatch, hypothesis 1.

#### Important Files
- `backend/ws/consumers.py:87` — disconnect handler
- `docker-compose.yml` — redis config

---

## Resolved Bugs

### BUG-001: JWT refresh infinite loop on Safari
**Resolved**: 2026-05-22 | **Time to fix**: 2.5hrs
