-- RF13 — revisão: nem delete_purchase() nem a edição de compra sabiam
-- "reconstruir" o custo/preço vigente de um produto a partir do histórico de
-- compras. Isso foi confirmado na prática: excluir uma compra manualmente
-- deixou products.current_unit_cost_brl/current_sale_price desatualizados —
-- delete_purchase() (seção 15/PROGRESSO.md) só revertia stock_quantity, nunca
-- custo/preço. update_purchase_pricing() (seção 16) tinha o problema oposto,
-- mas menos grave: ao corrigir a compra mais recente de um produto, o preço de
-- venda tinha que ser digitado de novo pelo master a cada correção (current_sale_price
-- fazia parte do payload), em vez de ser recomposto automaticamente.
--
-- Limitação aceita (decisão validada com o dono do negócio, ver PROGRESSO.md):
-- o schema guarda histórico de CUSTO por compra (purchase_items.unit_cost_brl),
-- mas nunca guardou snapshot do PREÇO DE VENDA confirmado em cada compra
-- (current_sale_price sempre foi sobrescrito, sem histórico). Por isso, ao
-- reverter/corrigir para uma compra anterior, o custo é exato (vem de
-- unit_cost_brl daquela compra), mas o preço de venda só pode ser RECOMPOSTO
-- como sugestão (custo × (1 + markup_percent/100)) — não há como recuperar um
-- ajuste manual de preço que o master tenha feito naquela compra antiga. Isso
-- é aceitável: é a mesma precisão que o próprio fluxo de compra já tem hoje (o
-- master sempre revisa o preço sugerido a cada compra nova).
--
-- current_unit_cost_brl/current_sale_price passam a aceitar null: um produto
-- pode ficar sem nenhuma compra remanescente (ex: excluiu a única compra que
-- ele tinha), e nesse caso não existe custo/preço para sustentar — não faz
-- sentido "inventar" um valor. check (col >= 0) continua válido (constraints
-- de check não rejeitam null).
alter table public.products
  alter column current_unit_cost_brl drop not null,
  alter column current_sale_price drop not null;

-- Helper compartilhado por delete_purchase() e update_purchase_pricing(): dado
-- um produto, olha para TODAS as compras que ainda referenciam esse produto em
-- purchase_items (chamar depois de qualquer delete/update já ter sido
-- aplicado) e recompõe products.current_unit_cost_brl/current_sale_price/
-- last_purchase_date a partir da compra mais recente remanescente (por
-- purchase_date, com empate por purchases.created_at). Se não sobrar nenhuma
-- compra, zera os três campos para null — ver limitação aceita acima sobre por
-- que o preço de venda é recomposto (custo × markup) e não recuperado
-- literalmente.
create or replace function public.recompute_product_pricing(p_product_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_latest record;
begin
  select pi.unit_cost_brl, p.purchase_date
  into v_latest
  from public.purchase_items pi
  join public.purchases p on p.id = pi.purchase_id
  where pi.product_id = p_product_id
  order by p.purchase_date desc, p.created_at desc
  limit 1;

  if found then
    update public.products
    set
      current_unit_cost_brl = v_latest.unit_cost_brl,
      current_sale_price = round(v_latest.unit_cost_brl * (1 + markup_percent / 100), 2),
      last_purchase_date = v_latest.purchase_date
    where id = p_product_id;
  else
    update public.products
    set current_unit_cost_brl = null, current_sale_price = null, last_purchase_date = null
    where id = p_product_id;
  end if;
end;
$$;

grant execute on function public.recompute_product_pricing(uuid) to authenticated;

-- delete_purchase(): agora, além de reverter o estoque, recompõe o custo/preço
-- vigente de cada produto afetado a partir do que sobrar (ou zera para null,
-- se a compra excluída era a única que o produto tinha).
create or replace function public.delete_purchase(p_purchase_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_item record;
  v_new_stock integer;
  v_product_ids uuid[];
  v_product_id uuid;
begin
  if not public.is_master() then
    raise exception 'apenas o master pode excluir compras';
  end if;

  if not exists (select 1 from public.purchases where id = p_purchase_id) then
    raise exception 'compra não encontrada';
  end if;

  select array_agg(distinct product_id) into v_product_ids
  from public.purchase_items where purchase_id = p_purchase_id;

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

  -- on delete cascade em purchase_items.purchase_id: os itens desta compra
  -- somem junto, então recompute_product_pricing() (chamado logo abaixo) já
  -- olha só para o que sobrou nas outras compras do produto.
  delete from public.purchases where id = p_purchase_id;

  foreach v_product_id in array coalesce(v_product_ids, array[]::uuid[])
  loop
    perform public.recompute_product_pricing(v_product_id);
  end loop;
end;
$$;

grant execute on function public.delete_purchase(uuid) to authenticated;

-- update_purchase_pricing(): corrige taxa de câmbio, frete e/ou preço unitário
-- em USD de uma compra já registrada. Diferente da versão anterior, não
-- recebe mais current_sale_price no payload — o preço de venda do produto
-- (quando esta é a compra mais recente dele) passa a ser sempre RECOMPOSTO
-- automaticamente (custo revertido × markup_percent do produto), pelo mesmo
-- helper usado por delete_purchase(), em vez de exigir que o master redigite
-- o preço a cada correção. Ver limitação aceita no topo desta migration sobre
-- por que isso é aceitável (mesma precisão do fluxo de compra normal).
--
-- security invoker: purchases/purchase_items são 100% restritas a master na
-- RLS (purchases_all_master / purchase_items_all_master), mesma razão de
-- confirm_purchase() e delete_purchase() — não há caso de vendedor aqui.
create or replace function public.update_purchase_pricing(
  p_purchase_id uuid,
  p_exchange_rate numeric,
  p_freight_cost_brl numeric,
  p_items jsonb -- [{product_id, unit_price_usd}, ...]
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
  v_unit_cost numeric(12, 2);
  v_subtotal numeric(12, 2);
  v_item_count integer;
  v_distinct_count integer;
  v_existing_count integer;
  v_matched_count integer;
begin
  if not public.is_master() then
    raise exception 'apenas o master pode corrigir compras';
  end if;

  select * into v_purchase from public.purchases where id = p_purchase_id;
  if not found then
    raise exception 'compra não encontrada';
  end if;

  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'informe ao menos um item para corrigir';
  end if;

  select count(*), count(distinct item ->> 'product_id')
    into v_item_count, v_distinct_count
  from jsonb_array_elements(p_items) as item;

  if v_item_count <> v_distinct_count then
    raise exception 'produto duplicado na correção: cada produto deve aparecer uma única vez';
  end if;

  select count(*) into v_existing_count
  from public.purchase_items where purchase_id = p_purchase_id;

  select count(*) into v_matched_count
  from jsonb_array_elements(p_items) as item
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

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_product_id := (v_item ->> 'product_id')::uuid;
    v_unit_price_usd := (v_item ->> 'unit_price_usd')::numeric;

    if v_unit_price_usd is null or v_unit_price_usd <= 0 then
      raise exception 'preço unitário em USD inválido para o produto %', v_product_id;
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
  end loop;

  -- updated_at/updated_by de purchases são preenchidos automaticamente pelo
  -- trigger purchases_set_updated_meta (RF13, já criado na migration inicial).
  update public.purchases
  set exchange_rate = p_exchange_rate, freight_cost_brl = p_freight_cost_brl, total_cost_brl = v_total_cost
  where id = p_purchase_id;

  -- só depois de purchase_items/purchases já estarem com os valores novos:
  -- recompute_product_pricing() olha para a compra mais recente de cada
  -- produto (por purchase_date/created_at) considerando os valores já
  -- atualizados desta compra. Se uma compra mais nova existir, o preço/custo
  -- vigente do produto continua sendo o dela — esta correção fica só no
  -- histórico (purchase_items) — sem depender mais da comparação por
  -- igualdade de data (products.last_purchase_date) da versão anterior, que
  -- tinha uma limitação conhecida em caso de empate de data entre compras.
  for v_item in select * from jsonb_array_elements(p_items)
  loop
    perform public.recompute_product_pricing((v_item ->> 'product_id')::uuid);
  end loop;
end;
$$;

grant execute on function public.update_purchase_pricing(uuid, numeric, numeric, jsonb) to authenticated;

-- confirm_sale(): defesa em profundidade — um produto sem current_sale_price
-- definido (nenhuma compra remanescente, ver recompute_product_pricing acima)
-- não pode ser vendido, mesmo por chamada direta ao RPC.
create or replace function public.confirm_sale(
  p_payment_method public.payment_method,
  p_items jsonb -- [{product_id, quantity, discount_percent}, ...]
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sale_id uuid := gen_random_uuid();
  v_seller_id uuid := auth.uid();
  v_commission_percent numeric := public.default_commission_percent();
  v_total_amount numeric(12, 2) := 0;
  v_commission_amount numeric(12, 2);
  v_item jsonb;
  v_product_id uuid;
  v_quantity integer;
  v_discount_percent numeric;
  v_unit_sale_price numeric(12, 2);
  v_subtotal numeric(12, 2);
  v_new_stock integer;
begin
  if v_seller_id is null then
    raise exception 'usuário não autenticado';
  end if;

  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'a venda precisa ter ao menos um item';
  end if;

  insert into public.sales (id, seller_id, payment_method, total_amount, commission_amount, status)
  values (v_sale_id, v_seller_id, p_payment_method, 0, 0, 'concluida');

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_product_id := (v_item ->> 'product_id')::uuid;
    v_quantity := (v_item ->> 'quantity')::integer;
    v_discount_percent := coalesce((v_item ->> 'discount_percent')::numeric, 0);

    if v_quantity is null or v_quantity <= 0 then
      raise exception 'quantidade inválida para o produto %', v_product_id;
    end if;

    if v_discount_percent < 0 or v_discount_percent > 100 then
      raise exception 'desconto inválido para o produto %', v_product_id;
    end if;

    select current_sale_price into v_unit_sale_price
    from public.products
    where id = v_product_id and active;

    if not found then
      raise exception 'produto % não encontrado ou inativo', v_product_id;
    end if;

    if v_unit_sale_price is null then
      raise exception 'produto % está sem preço de venda definido (sem compra registrada em estoque) e não pode ser vendido', v_product_id;
    end if;

    update public.products
    set stock_quantity = stock_quantity - v_quantity
    where id = v_product_id and stock_quantity >= v_quantity
    returning stock_quantity into v_new_stock;

    if not found then
      raise exception 'estoque insuficiente para o produto %', v_product_id;
    end if;

    v_subtotal := round(v_unit_sale_price * v_quantity * (1 - v_discount_percent / 100), 2);
    v_total_amount := v_total_amount + v_subtotal;

    insert into public.sale_items (sale_id, product_id, quantity, unit_sale_price, discount_percent, subtotal)
    values (v_sale_id, v_product_id, v_quantity, v_unit_sale_price, v_discount_percent, v_subtotal);
  end loop;

  -- comissão (RF06): percentual fixo configurado pelo master sobre a soma dos
  -- subtotais (cada um já líquido do desconto do item) — nunca exibida ao vendedor,
  -- que só recebe de volta o id da venda (return uuid), nunca uma linha de sales.
  v_commission_amount := round(v_total_amount * v_commission_percent / 100, 2);

  update public.sales
  set total_amount = v_total_amount, commission_amount = v_commission_amount
  where id = v_sale_id;

  return v_sale_id;
end;
$$;

grant execute on function public.confirm_sale(public.payment_method, jsonb) to authenticated;
