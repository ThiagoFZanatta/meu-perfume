-- RF13 — revisão pós-PR #5: delete_purchase() bloqueia corretamente a exclusão
-- de uma compra quando parte do estoque já foi vendido depois dela (deixaria o
-- estoque negativo) — mas aí não sobra nenhuma forma de corrigir essa compra.
-- Decisão validada com o dono do negócio: não construir uma tela de edição
-- genérica (excluir + relançar continua sendo o fluxo padrão de correção para
-- vendas e para compras sem esse conflito); a exceção é só para compras, e só
-- para os campos que NÃO mexem em quantidade/estoque — por isso este RPC nunca
-- esbarra na trava de estoque negativo.
--
-- update_purchase_pricing(): corrige taxa de câmbio, frete e/ou preço unitário
-- em USD/preço de venda de uma compra já registrada, recalculando custo/subtotal
-- com a mesma fórmula de confirm_purchase() (unit_price_usd × exchange_rate +
-- frete rateado por unidade). Não extraímos essa fórmula para uma função
-- auxiliar comum: é uma expressão de uma linha, e alterar confirm_purchase()
-- (já mesclada e testada) só para reusar esse helper adicionaria risco sem
-- benefício real — a duplicação já existe, aliás, entre as duas revisões de
-- confirm_purchase() nesta mesma pasta.
--
-- security invoker: purchases/purchase_items são 100% restritas a master na
-- RLS (purchases_all_master / purchase_items_all_master) — mesma razão de
-- confirm_purchase() e delete_purchase(), não há caso de vendedor aqui.
create or replace function public.update_purchase_pricing(
  p_purchase_id uuid,
  p_exchange_rate numeric,
  p_freight_cost_brl numeric,
  p_sale_prices jsonb -- [{product_id, unit_price_usd, current_sale_price}, ...]
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_purchase public.purchases;
  v_total_qty integer;
  v_freight_per_unit numeric(12, 2);
  v_total_cost numeric(12, 2) := 0;
  v_item jsonb;
  v_product_id uuid;
  v_unit_price_usd numeric;
  v_sale_price numeric;
  v_unit_cost numeric(12, 2);
  v_subtotal numeric(12, 2);
  v_item_count integer;
  v_distinct_count integer;
  v_existing_count integer;
  v_matched_count integer;
  v_is_latest_purchase_for_product boolean;
begin
  if not public.is_master() then
    raise exception 'apenas o master pode corrigir compras';
  end if;

  select * into v_purchase from public.purchases where id = p_purchase_id;
  if not found then
    raise exception 'compra não encontrada';
  end if;

  if p_sale_prices is null or jsonb_array_length(p_sale_prices) = 0 then
    raise exception 'informe ao menos um item para corrigir';
  end if;

  select count(*), count(distinct item ->> 'product_id')
    into v_item_count, v_distinct_count
  from jsonb_array_elements(p_sale_prices) as item;

  if v_item_count <> v_distinct_count then
    raise exception 'produto duplicado na correção: cada produto deve aparecer uma única vez';
  end if;

  select count(*) into v_existing_count
  from public.purchase_items where purchase_id = p_purchase_id;

  select count(*) into v_matched_count
  from jsonb_array_elements(p_sale_prices) as item
  where exists (
    select 1 from public.purchase_items pi
    where pi.purchase_id = p_purchase_id and pi.product_id = (item ->> 'product_id')::uuid
  );

  -- a correção é só de valores, não de itens: a lista enviada precisa bater
  -- exatamente (mesma quantidade de linhas e mesmos produtos) com o que já
  -- está lançado nesta compra — sem adicionar, remover ou trocar produtos.
  if v_item_count <> v_existing_count or v_matched_count <> v_existing_count then
    raise exception 'a correção deve incluir exatamente os mesmos produtos já lançados nesta compra, sem adicionar, remover ou trocar itens';
  end if;

  select sum(quantity) into v_total_qty
  from public.purchase_items where purchase_id = p_purchase_id;

  -- rateio de frete por quantidade (seção 7 / RF04), mesma fórmula de confirm_purchase()
  v_freight_per_unit := round(p_freight_cost_brl / v_total_qty, 2);

  for v_item in select * from jsonb_array_elements(p_sale_prices)
  loop
    v_product_id := (v_item ->> 'product_id')::uuid;
    v_unit_price_usd := (v_item ->> 'unit_price_usd')::numeric;
    v_sale_price := (v_item ->> 'current_sale_price')::numeric;

    if v_unit_price_usd is null or v_unit_price_usd <= 0 then
      raise exception 'preço unitário em USD inválido para o produto %', v_product_id;
    end if;

    if v_sale_price is null or v_sale_price < 0 then
      raise exception 'preço de venda inválido para o produto %', v_product_id;
    end if;

    v_unit_cost := round(v_unit_price_usd * p_exchange_rate + v_freight_per_unit, 2);

    update public.purchase_items
    set
      unit_price_usd = v_unit_price_usd,
      unit_cost_brl = v_unit_cost,
      subtotal_brl = v_unit_cost * quantity
    where purchase_id = p_purchase_id and product_id = v_product_id
    returning subtotal_brl into v_subtotal;

    v_total_cost := v_total_cost + v_subtotal;

    -- só reflete no preço/custo VIGENTE do produto se esta ainda for a compra
    -- mais recente daquele produto (products.last_purchase_date). Se uma
    -- compra mais nova já tiver sobrescrito current_unit_cost_brl/
    -- current_sale_price, a correção desta compra antiga vale só para o
    -- histórico em purchase_items — senão a correção "voltaria no tempo" um
    -- preço que já foi legitimamente atualizado por uma compra posterior.
    -- Limitação conhecida (aceitável, ver PROGRESSO.md): se duas compras têm
    -- exatamente a mesma purchase_date para o mesmo produto, esta checagem não
    -- distingue qual delas foi a última a gravar o preço vigente.
    select (last_purchase_date = v_purchase.purchase_date) into v_is_latest_purchase_for_product
    from public.products where id = v_product_id;

    if v_is_latest_purchase_for_product then
      update public.products
      set current_unit_cost_brl = v_unit_cost, current_sale_price = v_sale_price
      where id = v_product_id;
    end if;
  end loop;

  -- updated_at/updated_by de purchases são preenchidos automaticamente pelo
  -- trigger purchases_set_updated_meta (RF13, já criado na migration inicial).
  update public.purchases
  set exchange_rate = p_exchange_rate, freight_cost_brl = p_freight_cost_brl, total_cost_brl = v_total_cost
  where id = p_purchase_id;
end;
$$;

grant execute on function public.update_purchase_pricing(uuid, numeric, numeric, jsonb) to authenticated;
