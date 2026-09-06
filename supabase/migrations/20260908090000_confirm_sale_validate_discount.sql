-- RF07 — revisão da PR #4: confirm_sale() aceitava discount_percent do payload
-- sem validar faixa (só o front trava 0-100). Como é uma RPC pública (grant
-- execute ... to authenticated), isso quebra a mesma filosofia já aplicada ao
-- preço e ao seller_id ("a RPC não confia no cliente"): um vendedor chamando o
-- RPC diretamente poderia mandar discount_percent negativo (infla o preço
-- cobrado do cliente) ou > 100 (gera subtotal negativo, reduzindo o total e a
-- própria comissão da venda). Mesmo padrão de defesa em profundidade já usado
-- para duplicidade em confirm_purchase() e para quantidade <= 0 nesta função.
--
-- Aproveitado para setar status = 'concluida' explicitamente no insert de
-- sales, por clareza (RF14 depende desse valor) — a coluna já tinha
-- `default 'concluida'` desde a migration inicial, então isso não muda
-- comportamento, só documenta a intenção no próprio código da função.
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
