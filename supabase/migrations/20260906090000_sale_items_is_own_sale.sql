-- Refatora as 4 políticas de RLS de sale_items para usar um único helper
-- is_own_sale(), em vez de repetir a mesma subquery "exists (select 1 from
-- sales ...)" com pequenas variações em cada política.

create or replace function public.is_own_sale(p_sale_id uuid, p_within_edit_window boolean default false)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.sales s
    where s.id = p_sale_id
      and s.seller_id = auth.uid()
      and (
        not p_within_edit_window
        or s.created_at > now() - (public.seller_edit_window_hours() || ' hours')::interval
      )
  );
$$;

alter policy "sale_items_select_own_sale_or_master" on public.sale_items
  using (public.is_master() or public.is_own_sale(sale_id));

alter policy "sale_items_insert_own_sale_or_master" on public.sale_items
  with check (public.is_master() or public.is_own_sale(sale_id));

alter policy "sale_items_update_own_sale_within_window_or_master" on public.sale_items
  using (public.is_master() or public.is_own_sale(sale_id, true));

alter policy "sale_items_delete_own_sale_within_window_or_master" on public.sale_items
  using (public.is_master() or public.is_own_sale(sale_id, true));
