# ADR-0015: SQLite as the Default Database, Supabase Optional

- **Status:** Accepted
- **Date:** 2026-10-02

## Context

Storage was Supabase only, so nothing worked (every data route answered 503)
until someone created a Supabase project, applied four SQL files and copied keys.
For a project that has to run for a demo, that was too much to ask.

## Decision

- `services/sqlite_store.py` implements the same method surface as
  `SupabaseClient` (users, auth codes, financial records with pagination, date and
  category filters and duplicate-ignoring batch inserts, budgets). The rest of the
  backend is unchanged: `get_supabase_client()` returns whichever store
  `storage_backend()` selects — Supabase when `SUPABASE_URL` is set, otherwise
  SQLite (`STORAGE_BACKEND` forces either).
- Tables mirror the Supabase schema (JSON columns as text, foreign keys with
  cascade, the same uniqueness and check constraints) and are created on first use.
  One short-lived connection per operation, WAL mode, a 15 s busy timeout — safe
  under FastAPI's threadpool and with several processes sharing the file.
  Constraint violations map to the same `SupabaseConflictError` the routes already
  handle.
- Zero-setup defaults: a `.env` loader (the real environment always wins; empty and
  `replace-with-...` values are ignored, so an untouched `.env.example` can never
  become a secret or select a bogus database); a random JWT secret generated into
  `backend/data/jwt_secret` when `AUTH_JWT_SECRET` is not set at all (an explicitly
  empty or short value is still an error); `seed_demo.py` for a demo account with
  sample spending.
- A parser that reports `status="error"` (no OpenAI key, model failure) is now an
  HTTP 503 / 502 with a clear message instead of an empty "successful" review.

## Consequences

- SQLite suits a demo, one server and a few thousand records. It is not a network
  database: use Supabase to scale beyond one machine. Data is not migrated between
  the two.
- A generated JWT secret on disk that is wiped on restart (some hosts) signs
  everyone out each time; set `AUTH_JWT_SECRET` when deploying.
- Both stores are covered by tests; the SQLite store also runs under a full-stack
  test with the real app and real auth.
