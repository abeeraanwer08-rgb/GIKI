-- HissabAI budgets
-- One monthly spending limit per category. Spending against each limit is
-- computed by the backend from public.financial_records; nothing is stored
-- here except the limit itself.

create table if not exists public.budgets (
    category text primary key,
    monthly_limit numeric(14, 2) not null,
    currency text not null default 'PKR',
    updated_at timestamptz not null default timezone('utc', now()),

    constraint budgets_category_not_blank
        check (length(trim(category)) > 0),
    constraint budgets_monthly_limit_positive
        check (monthly_limit > 0)
);

comment on table public.budgets is
    'Monthly spending limit per HissabAI category.';
