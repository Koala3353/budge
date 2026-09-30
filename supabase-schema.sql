-- Weekly Budget — Supabase schema
-- Hash-based accounts (no email/password). One JSON blob per account.
-- The table has RLS enabled with NO anon policies, so the public key cannot
-- read or write it directly. Access is only via the two SECURITY DEFINER
-- functions below, which require the account hash — so a row is reachable only
-- if you know its (128-bit, non-enumerable) hash.

create table if not exists public.budgets (
  user_hash   text primary key,
  data        jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now()
);

alter table public.budgets enable row level security;
-- (intentionally no policies for anon: direct table access is denied)

-- Read a single account's blob by hash.
create or replace function public.get_budget(p_hash text)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select data from public.budgets where user_hash = p_hash;
$$;

-- Insert or update an account's blob.
create or replace function public.upsert_budget(p_hash text, p_data jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.budgets (user_hash, data, updated_at)
  values (p_hash, p_data, now())
  on conflict (user_hash)
  do update set data = excluded.data, updated_at = now();
end;
$$;

-- Expose only the functions to the public (anon) and signed-in (authenticated) roles.
grant execute on function public.get_budget(text) to anon, authenticated;
grant execute on function public.upsert_budget(text, jsonb) to anon, authenticated;

-- App-wide statistics for the hidden admin screen live in supabase-admin.sql.
