# ADR-0013: Email Verification, Password Reset and Rate Limiting

- **Status:** Accepted
- **Date:** 2026-10-02

## Context

ADR-0011 added accounts but left three gaps: nothing proved an email belongs to
its owner, a forgotten password was unrecoverable, and login could be guessed at
without limit.

## Decision

- **Emailed one-time codes**, not links, so the same flow works in the mobile app
  and the website without deep links. 6 digits, 15-minute life, at most 5 wrong
  tries, a new code replaces older ones, stored only as an HMAC-SHA256 keyed with
  the server secret (a leaked table cannot simply be brute-forced offline).
- **Verification** gates the data routes. `get_current_account` (token is valid
  and the account's `token_version` still matches) serves the verification
  endpoints; `get_current_user` additionally requires `email_verified_at`
  and answers 403 `email_not_verified`. `REQUIRE_EMAIL_VERIFICATION=false` exists
  for development only. The migration marks existing accounts verified so nobody
  is locked out.
- **Password reset** answers `forgot-password` identically whether or not the
  account exists, sends the mail in a background task (so timing leaks nothing),
  and `reset-password` returns the same error for an unknown email as for a wrong
  code (and still spends the hashing time). A successful reset bumps
  `token_version`, which signs out every existing session, and also verifies the
  address (receiving the code proves control of the inbox).
- **Every request now checks the account row** (short in-process cache, 30 s) so a
  reset or deleted account takes effect without waiting for token expiry.
- **Rate limiting** (`services/rate_limit.py`, `services/auth_limits.py`):
  5 wrong passwords per submitted email → 15-minute lockout; 20 per network;
  3 reset requests/hour per email, 10 per network; 10 sign-ups/hour per network;
  30 code attempts per 15 minutes per network; verification resend once a minute.
  Login limits are keyed on the *submitted* email, whether or not it exists, and
  are checked before the password, so a lockout reveals nothing about accounts and
  cannot be bypassed by the right password. 429s carry `Retry-After`.
  `X-Forwarded-For` is only trusted when `TRUST_PROXY_HEADERS=true`.
- **Email**: SMTP (`SMTP_HOST` …) or, when unset, a console backend that logs the
  message so development needs no mail account. Send failures are logged, never
  surfaced.

## Consequences

- Counters are in process memory: correct for one worker; use Redis or the
  database to share them across workers.
- No two-factor authentication and no change-password-while-signed-in yet.
- Email deliverability (SPF/DKIM) is the SMTP provider's responsibility.
