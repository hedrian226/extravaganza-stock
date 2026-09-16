-- EXTRAVAGANZA BEAUTÉ — STOCK UNIT MIGRATION
-- Run this file ALONE in Supabase SQL Editor.
-- Existing items automatically become PCS.
-- Allowed units: PCS, PACK, CASE.
-- This does not delete or change existing stock quantities.

create extension if not exists pgcrypto with schema extensions;

alter table public.items
  add column if not exists unit text not null default 'PCS';

update public.items
set unit = 'PCS'
where unit is null
   or upper(trim(unit)) not in ('PCS', 'PACK', 'CASE');

alter table public.items
  drop constraint if exists items_unit_check;

alter table public.items
  add constraint items_unit_check
  check (unit in ('PCS', 'PACK', 'CASE'));

-- Update only the Viewer response so it also receives the unit.
-- The existing viewer access-code behavior is preserved.
create or replace function public.get_viewer_data(p_code text)
returns jsonb
language sql
security definer
set search_path = ''
stable
as $$
  with matched as (
    select user_id, low_stock_threshold
    from public.app_settings
    where viewer_code_hash = extensions.crypt(trim(p_code), viewer_code_hash)
    limit 1
  ),
  stock as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', i.id,
          'name', i.name,
          'quantity', i.quantity,
          'unit', i.unit,
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
    'items', stock.items,
    'lowStockThreshold', coalesce((select low_stock_threshold from matched), 5)
  )
  from stock;
$$;

revoke execute on function public.get_viewer_data(text) from public;
grant execute on function public.get_viewer_data(text) to anon, authenticated;

notify pgrst, 'reload schema';
