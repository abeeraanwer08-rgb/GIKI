-- HissabAI auth hardening: email verification, password reset, session revocation.

alter table public.users
    add column if not exists email_verified_at timestamptz,
    add column if not exists token_version integer not null default 0;

-- Accounts created before verification existed are treated as already verified so
-- nobody is locked out by this migration.
update public.users set email_verified_at = created_at where email_verified_at is null;

-- Short one-time codes emailed to users. Only a keyed hash of the code is stored.
create table if not exists public.auth_codes (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references public.users (id) on delete cascade,
    purpose text not null check (purpose in ('verify_email', 'reset_password')),
    code_hash text not null,
    attempts integer not null default 0,
    expires_at timestamptz not null,
    consumed_at timestamptz,
    created_at timestamptz not null default timezone('utc', now())
);

create index if not exists auth_codes_lookup_idx
    on public.auth_codes (user_id, purpose, created_at desc);

revoke all on public.auth_codes from anon, authenticated;
