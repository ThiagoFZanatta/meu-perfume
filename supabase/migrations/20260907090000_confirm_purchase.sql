-- RF04/RF06 — Registrar Compra (Tela 6).
-- Transação única: cria a compra, os itens, e atualiza estoque/custo/preço vigente
-- dos produtos. security invoker (padrão): roda com o papel de quem chama, então
-- depende das policies "*_all_master"/"products_update_master" já existentes —
-- só master consegue confirmar uma compra.
create or replace function public.confirm_purchase(
  p_purchase_date date,
  p_exchange_rate numeric,
  p_freight_cost_brl numeric,
  p_items jsonb -- [{product_id, quantity, unit_price_usd, sale_price}, ...]
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_purchase_id uuid := gen_random_uuid();
  v_total_qty integer;
  v_freight_per_unit numeric(12, 2);
  v_total_cost numeric(12, 2) := 0;
  v_item jsonb;
  v_unit_cost numeric(12, 2);
  v_subtotal numeric(12, 2);
begin
  if not public.is_master() then
    raise exception 'apenas o master pode registrar compras';
  end if;

  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'a compra precisa ter ao menos um item';
  end if;

  select sum((item ->> 'quantity')::integer) into v_total_qty
  from jsonb_array_elements(p_items) as item;

  if v_total_qty is null or v_total_qty <= 0 then
    raise exception 'quantidade total da compra deve ser maior que zero';
  end if;

  -- rateio de frete por quantidade (seção 7 / RF04), não por valor do item
  v_freight_per_unit := round(p_freight_cost_brl / v_total_qty, 2);

  insert into public.purchases (id, purchase_date, exchange_rate, freight_cost_brl, total_cost_brl, created_by)
  values (v_purchase_id, p_purchase_date, p_exchange_rate, p_freight_cost_brl, 0, auth.uid());

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_unit_cost := round((v_item ->> 'unit_price_usd')::numeric * p_exchange_rate + v_freight_per_unit, 2);
    v_subtotal := v_unit_cost * (v_item ->> 'quantity')::integer;
    v_total_cost := v_total_cost + v_subtotal;

    insert into public.purchase_items (purchase_id, product_id, quantity, unit_price_usd, unit_cost_brl, subtotal_brl)
    values (
      v_purchase_id,
      (v_item ->> 'product_id')::uuid,
      (v_item ->> 'quantity')::integer,
      (v_item ->> 'unit_price_usd')::numeric,
      v_unit_cost,
      v_subtotal
    );

    -- current_sale_price é sempre único por produto (RF06): o valor confirmado
    -- nesta compra (sugerido ou ajustado pelo master) passa a valer para todas
    -- as vendas seguintes, mesmo sobre unidades de lotes anteriores.
    update public.products
    set
      stock_quantity = stock_quantity + (v_item ->> 'quantity')::integer,
      current_unit_cost_brl = v_unit_cost,
      current_sale_price = (v_item ->> 'sale_price')::numeric,
      last_purchase_date = p_purchase_date
    where id = (v_item ->> 'product_id')::uuid;

    if not found then
      raise exception 'produto % não encontrado', (v_item ->> 'product_id');
    end if;
  end loop;

  update public.purchases set total_cost_brl = v_total_cost where id = v_purchase_id;

  return v_purchase_id;
end;
$$;

grant execute on function public.confirm_purchase(date, numeric, numeric, jsonb) to authenticated;
