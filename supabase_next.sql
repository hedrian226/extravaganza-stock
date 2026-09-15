-- 1) Finish the items security setup
alter table public.items
  alter column user_id set not null;

revoke all on table public.items from anon, authenticated;
grant select, insert, update, delete on table public.items to authenticated;

-- 2) Secure storage for the viewer access-code hash
create extension if not exists pgcrypto;

create table if not exists public.app_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  viewer_code_hash text not null,
  updated_at timestamptz not null default now()
);

alter table public.app_settings enable row level security;
revoke all on table public.app_settings from anon, authenticated;

-- 3) Manager-only function for setting/changing the viewer code
create or replace function public.set_viewer_code(p_code text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'Not authenticated';
  end if;

  if length(trim(p_code)) < 6 then
    raise exception 'Viewer access code must be at least 6 characters';
  end if;

  insert into public.app_settings (user_id, viewer_code_hash)
  values (
    (select auth.uid()),
    public.crypt(trim(p_code), public.gen_salt('bf'))
  )
  on conflict (user_id)
  do update set
    viewer_code_hash = excluded.viewer_code_hash,
    updated_at = now();
end;
$$;

revoke execute on function public.set_viewer_code(text) from public, anon;
grant execute on function public.set_viewer_code(text) to authenticated;

-- 4) Viewer function: checks the access code and returns only that manager's stock
create or replace function public.get_viewer_data(p_code text)
returns jsonb
language sql
security definer
set search_path = ''
stable
as $$
  with matched as (
    select user_id
    from public.app_settings
    where viewer_code_hash = public.crypt(trim(p_code), viewer_code_hash)
    limit 1
  ),
  stock as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', i.id,
          'name', i.name,
          'quantity', i.quantity,
          'updatedAt', i.updated_at
        ) order by i.name
      ),
      '[]'::jsonb
    ) as items
    from public.items i
    join matched m on m.user_id = i.user_id
  )
  select jsonb_build_object(
    'ok', exists(select 1 from matched),
    'items', stock.items
  )
  from stock;
$$;

revoke execute on function public.get_viewer_data(text) from public, authenticated;
grant execute on function public.get_viewer_data(text) to anon;
