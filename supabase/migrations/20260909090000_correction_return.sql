-- RF13 — Correção e estorno de lançamentos (exclusão) e RF14 — Devolução de
-- venda (Tela 12).
--
-- Escopo de RF13 nesta migration (ver PROGRESSO.md para detalhes da decisão):
-- ao contrário da Tela 5 (produto), o PRD não descreve uma tela dedicada de
-- "edição" de compra/venda — os critérios de aceite de RF13 testam apenas
-- reversão de estoque em EXCLUSÕES. Por isso implementamos delete_sale() e
-- delete_purchase() como RPCs atômicas; "editar" continua possível na prática
-- como excluir + relançar pelas telas já existentes (Tela 6/Tela 8), respeitando
-- a mesma janela de permissão.

-- delete_sale: reverte o impacto de uma venda concluída no estoque.
-- security definer pelo mesmo motivo de confirm_sale() — o vendedor não tem
-- UPDATE em products (products_update_master), então a função precisa elevar
-- privilégio para repor o estoque. A checagem de permissão abaixo replica
-- exatamente a RLS já existente em sales_delete_own_within_window_or_master
-- (via is_own_sale), então nunca concede mais acesso do que a RLS já concederia
-- para o DELETE em si.
create or replace function public.delete_sale(p_sale_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sale public.sales;
  v_has_return boolean;
begin
  select * into v_sale from public.sales where id = p_sale_id;

  if not found then
    raise exception 'venda não encontrada';
  end if;

  if not (public.is_master() or public.is_own_sale(p_sale_id, true)) then
    raise exception 'sem permissão para excluir esta venda (fora da janela de correção ou não é o vendedor responsável)';
  end if;

  select exists (
    select 1 from public.sale_items where sale_id = p_sale_id and returned_quantity > 0
  ) into v_has_return;

  if v_has_return then
    raise exception 'esta venda já teve item(ns) devolvido(s) e não pode mais ser excluída — o histórico de devolução seria perdido';
  end if;

  -- soma por produto antes de aplicar: um UPDATE ... FROM direto com múltiplas
  -- linhas de sale_items para o mesmo product_id só aplicaria a última linha
  -- casada (mesmo bug evitado em confirm_purchase() para produto duplicado).
  update public.products p
  set stock_quantity = p.stock_quantity + agg.total_quantity
  from (
    select product_id, sum(quantity) as total_quantity
    from public.sale_items
    where sale_id = p_sale_id
    group by product_id
  ) agg
  where p.id = agg.product_id;

  delete from public.sales where id = p_sale_id;
end;
$$;

grant execute on function public.delete_sale(uuid) to authenticated;

-- delete_purchase: reverte o impacto de uma compra no estoque. purchases é
-- restrita a master em toda a RLS (purchases_all_master) — não existe caso de
-- vendedor aqui — então security invoker basta, na mesma linha de
-- confirm_purchase().
create or replace function public.delete_purchase(p_purchase_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_item record;
  v_new_stock integer;
begin
  if not public.is_master() then
    raise exception 'apenas o master pode excluir compras';
  end if;

  if not exists (select 1 from public.purchases where id = p_purchase_id) then
    raise exception 'compra não encontrada';
  end if;

  for v_item in select product_id, quantity from public.purchase_items where purchase_id = p_purchase_id
  loop
    update public.products
    set stock_quantity = stock_quantity - v_item.quantity
    where id = v_item.product_id and stock_quantity >= v_item.quantity
    returning stock_quantity into v_new_stock;

    if not found then
      raise exception 'excluir esta compra deixaria o estoque do produto % negativo (unidades já vendidas desde então)', v_item.product_id;
    end if;
  end loop;

  delete from public.purchases where id = p_purchase_id;
end;
$$;

grant execute on function public.delete_purchase(uuid) to authenticated;

-- return_sale_items (RF14, Tela 12 — exclusiva do master). security invoker:
-- master já tem RLS completa em sales/sale_items/products/sale_returns, então
-- não precisa elevar privilégio (mesma razão de confirm_purchase()). Centralizado
-- numa função por causa da atomicidade entre as 4 tabelas e do cálculo
-- proporcional de estorno de comissão.
create or replace function public.return_sale_items(
  p_sale_id uuid,
  p_items jsonb -- [{sale_item_id, quantity_returned, reason}, ...]
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_sale public.sales;
  v_item jsonb;
  v_sale_item public.sale_items;
  v_quantity_returned integer;
  v_reason text;
  v_refund_subtotal numeric(12, 2);
  v_total_refund numeric(12, 2) := 0;
  v_commission_ratio numeric;
  v_all_returned boolean;
  v_any_returned boolean;
begin
  if not public.is_master() then
    raise exception 'apenas o master pode registrar devolução de venda';
  end if;

  select * into v_sale from public.sales where id = p_sale_id;
  if not found then
    raise exception 'venda não encontrada';
  end if;

  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'a devolução precisa ter ao menos um item';
  end if;

  -- taxa efetiva de comissão desta venda (não a config atual em settings, que
  -- pode ter mudado desde a venda original) — RF14: estorno proporcional à
  -- própria venda.
  v_commission_ratio := case when v_sale.total_amount = 0 then 0 else v_sale.commission_amount / v_sale.total_amount end;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    select * into v_sale_item
    from public.sale_items
    where id = (v_item ->> 'sale_item_id')::uuid and sale_id = p_sale_id;

    if not found then
      raise exception 'item de venda % não pertence a esta venda', (v_item ->> 'sale_item_id');
    end if;

    v_quantity_returned := (v_item ->> 'quantity_returned')::integer;
    v_reason := nullif(v_item ->> 'reason', '');

    if v_quantity_returned is null or v_quantity_returned <= 0 then
      raise exception 'quantidade devolvida inválida para o item %', v_sale_item.id;
    end if;

    if v_sale_item.returned_quantity + v_quantity_returned > v_sale_item.quantity then
      raise exception 'quantidade devolvida (%) excede o saldo disponível para devolução (%) no item %',
        v_quantity_returned, v_sale_item.quantity - v_sale_item.returned_quantity, v_sale_item.id;
    end if;

    v_refund_subtotal := round(
      v_sale_item.unit_sale_price * v_quantity_returned * (1 - v_sale_item.discount_percent / 100),
      2
    );
    v_total_refund := v_total_refund + v_refund_subtotal;

    update public.sale_items
    set returned_quantity = returned_quantity + v_quantity_returned
    where id = v_sale_item.id;

    update public.products
    set stock_quantity = stock_quantity + v_quantity_returned
    where id = v_sale_item.product_id;

    insert into public.sale_returns (sale_item_id, quantity_returned, reason, created_by)
    values (v_sale_item.id, v_quantity_returned, v_reason, auth.uid());
  end loop;

  select
    bool_and(returned_quantity >= quantity),
    bool_or(returned_quantity > 0)
  into v_all_returned, v_any_returned
  from public.sale_items
  where sale_id = p_sale_id;

  update public.sales
  set
    total_amount = total_amount - v_total_refund,
    commission_amount = commission_amount - round(v_total_refund * v_commission_ratio, 2),
    status = case
      when v_all_returned then 'totalmente_devolvida'::public.sale_status
      when v_any_returned then 'parcialmente_devolvida'::public.sale_status
      else status
    end
  where id = p_sale_id;
end;
$$;

grant execute on function public.return_sale_items(uuid, jsonb) to authenticated;
