-- HissabAI accounts and per-user data
--
-- The backend uses the service-role key (which bypasses row-level security) and
-- scopes every query by user_id itself, so no RLS policies are needed here. The
-- users table holds password hashes: never expose it to the mobile app or grant
-- it to the anon/authenticated roles.

create table if not exists public.users (
    id uuid primary key default gen_random_uuid(),
    name text not null,
    email text not null,
    password_hash text not null,
    created_at timestamptz not null default timezone('utc', now()),

    constraint users_email_lowercase check (email = lower(email)),
    constraint users_name_not_blank check (length(trim(name)) > 0)
);

create unique index if not exists users_email_key on public.users (email);

revoke all on public.users from anon, authenticated;

-- Records: owned by a user. Rows saved before accounts existed have no owner and
-- are not returned to anyone; assign them to a user manually if you want to keep them.
alter table public.financial_records
    add column if not exists user_id uuid references public.users (id) on delete cascade;

create index if not exists financial_records_user_idx
    on public.financial_records (user_id, transaction_date desc);

-- Budgets: one limit per (user, category). Limits created before accounts existed
-- belong to nobody, so they are removed rather than guessed at.
alter table public.budgets
    add column if not exists user_id uuid references public.users (id) on delete cascade;

delete from public.budgets where user_id is null;

alter table public.budgets alter column user_id set not null;
alter table public.budgets drop constraint if exists budgets_pkey;
alter table public.budgets add primary key (user_id, category);
