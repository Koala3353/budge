-- budge· — admin statistics. Run once in the Supabase SQL editor.
--
-- Safe to re-run. Adds:
--   1. budgets.created_at, so sign-ups can be counted (existing rows are
--      back-filled from their earliest entry, or their last save if empty).
--   2. public.admins — the account keys allowed to see app-wide statistics.
--      RLS on, no policies: the public key can't read or write it.
--   3. public.admin_stats(p_hash, p_tz) — aggregate numbers only (counts,
--      totals, distributions). It never returns a key, a note, or any one
--      person's entries. Anyone else calling it gets "not authorized".
--
-- After running this, make yourself an admin — your key is in the app under
-- Settings → Your account key:
--
--   insert into public.admins (user_hash) values ('PASTE-YOUR-KEY-HERE');

alter table public.budgets add column if not exists created_at timestamptz;

update public.budgets b
set created_at = coalesce(
  (select to_timestamp(min((t->>'ts')::numeric) / 1000)
     from jsonb_array_elements(coalesce(b.data->'transactions', '[]'::jsonb)) t),
  b.updated_at)
where b.created_at is null;

alter table public.budgets alter column created_at set default now();

create table if not exists public.admins (
  user_hash text primary key
);
alter table public.admins enable row level security;

create or replace function public.admin_stats(p_hash text, p_tz text default 'Asia/Manila')
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today date := (now() at time zone p_tz)::date;
  v_result jsonb;
begin
  if not exists (select 1 from admins where user_hash = p_hash) then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  with
  b as (
    select user_hash, data, updated_at, created_at from budgets
  ),
  tx as (
    select b.user_hash,
           coalesce((t->>'amount')::numeric, 0)::bigint as amount,
           t->>'categoryId' as cat,
           (to_timestamp((t->>'ts')::numeric / 1000) at time zone p_tz) as lts
    from b, jsonb_array_elements(coalesce(b.data->'transactions', '[]'::jsonb)) t
    where t ? 'ts'
  ),
  cats as (
    select b.user_hash, c->>'id' as id, c->>'name' as name
    from b, jsonb_array_elements(coalesce(b.data->'categories', '[]'::jsonb)) c
  ),
  days as (
    select generate_series(v_today - 29, v_today, interval '1 day')::date as day
  ),
  per_user as (
    select b.user_hash,
           (select count(*) from tx where tx.user_hash = b.user_hash) as n
    from b
  )
  select jsonb_build_object(
    'generatedAt', (extract(epoch from now()) * 1000)::bigint,
    'timezone', p_tz,
    'totals', jsonb_build_object(
      'accounts', (select count(*) from b),
      'withEntries', (select count(*) from per_user where n > 0),
      'transactions', (select count(*) from tx),
      'volume', (select coalesce(sum(amount), 0) from tx),
      'avgWeeklyBudget', (select coalesce(round(avg((data->'settings'->>'weeklyAllowance')::numeric)), 0)
                            from b where data->'settings' ? 'weeklyAllowance'),
      'medianWeeklyBudget', (select coalesce(percentile_cont(0.5) within group
                               (order by (data->'settings'->>'weeklyAllowance')::numeric), 0)
                               from b where data->'settings' ? 'weeklyAllowance'),
      'storageBytes', (select coalesce(sum(pg_column_size(data)), 0) from b)
    ),
    'today', jsonb_build_object(
      'transactions', (select count(*) from tx where lts::date = v_today),
      'volume', (select coalesce(sum(amount), 0) from tx where lts::date = v_today),
      'users', (select count(distinct user_hash) from tx where lts::date = v_today),
      'synced', (select count(*) from b where (updated_at at time zone p_tz)::date = v_today),
      'signups', (select count(*) from b where (created_at at time zone p_tz)::date = v_today)
    ),
    'active', jsonb_build_object(
      'd1', (select count(distinct user_hash) from tx where lts::date = v_today),
      'd7', (select count(distinct user_hash) from tx where lts::date > v_today - 7),
      'd30', (select count(distinct user_hash) from tx where lts::date > v_today - 30)
    ),
    'daily', (
      select jsonb_agg(jsonb_build_object(
               'day', d.day,
               'transactions', coalesce(x.n, 0),
               'volume', coalesce(x.v, 0),
               'users', coalesce(x.u, 0),
               'signups', coalesce(s.n, 0)) order by d.day)
      from days d
      left join (select lts::date as day, count(*) n, sum(amount) v, count(distinct user_hash) u
                 from tx group by 1) x on x.day = d.day
      left join (select (created_at at time zone p_tz)::date as day, count(*) n
                 from b group by 1) s on s.day = d.day
    ),
    'hours', (
      select jsonb_agg(coalesce(x.n, 0) order by h.h)
      from generate_series(0, 23) h(h)
      left join (select extract(hour from lts)::int as h, count(*) n
                 from tx where lts::date > v_today - 30 group by 1) x on x.h = h.h
    ),
    'weekdays', (
      select jsonb_agg(coalesce(x.n, 0) order by w.w)
      from generate_series(0, 6) w(w)
      left join (select extract(dow from lts)::int as w, count(*) n
                 from tx where lts::date > v_today - 30 group by 1) x on x.w = w.w
    ),
    'categories', (
      select coalesce(jsonb_agg(jsonb_build_object('name', name, 'transactions', n, 'volume', v)
                                order by v desc), '[]'::jsonb)
      from (
        select coalesce(c.name, 'Other') as name, count(*) n, sum(tx.amount) v
        from tx left join cats c on c.user_hash = tx.user_hash and c.id = tx.cat
        where tx.lts::date > v_today - 30
        group by 1 order by 3 desc limit 8
      ) top
    ),
    'sizes', jsonb_build_array(
      (select count(*) from per_user where n = 0),
      (select count(*) from per_user where n between 1 and 9),
      (select count(*) from per_user where n between 10 and 49),
      (select count(*) from per_user where n between 50 and 199),
      (select count(*) from per_user where n >= 200)
    )
  ) into v_result;

  return v_result;
end;
$$;

grant execute on function public.admin_stats(text, text) to anon, authenticated;
