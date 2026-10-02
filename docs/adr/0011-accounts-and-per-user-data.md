# ADR-0011: Accounts and Per-User Data

- **Status:** Accepted
- **Date:** 2026-09-24

## Context

All records and budgets were global, so any client could read everyone's
spending. A finance app needs private accounts.

## Decision

- `users` table (email unique, scrypt password hash); `user_id` added to
  `financial_records` and `budgets` (budgets unique on `user_id, category`).
- Passwords: stdlib `scrypt` with per-user salt (`services/passwords.py`);
  malformed stored hashes verify as false instead of raising.
- Sessions: HS256 JWT, 30-day expiry, secret from `AUTH_JWT_SECRET` (>= 32
  chars; otherwise 503). `alg=none` and foreign-secret tokens are rejected.
- `get_current_user` dependency guards every data route; services receive the
  user id and queries filter on it. The backend uses the Supabase service-role
  key, so scoping is enforced in application code, not row-level security.
- Login returns one generic error for unknown email and wrong password and
  hashes a dummy value for unknown emails to equalise timing.
- Mobile stores the token in `expo-secure-store` and swaps the navigator on
  auth state.

## Consequences

- Rows saved before the migration have no owner and are invisible.
- Password reset, email verification and rate limiting were added in ADR-0013.
