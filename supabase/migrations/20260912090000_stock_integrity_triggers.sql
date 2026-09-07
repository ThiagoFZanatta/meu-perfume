-- RF13 — rede de segurança de integridade de estoque.
--
-- Incidente confirmado em produção: um DELETE FROM purchases feito "por fora"
-- de delete_purchase() (ex.: SQL editor do Supabase, durante testes/depuração)
-- não reverte stock_quantity — só a RPC sabia fazer isso. Isso deixou o
-- estoque de 8 produtos duplicado (órfão), corrigido manualmente nesta
-- revisão. delete_sale() tinha o mesmo risco estrutural do lado de vendas.
--
-- Decisão de design: em vez de colocar o trigger BEFORE DELETE em `purchases`
-- e `sales` (as tabelas-pai, como um primeiro instinto sugeriria), o trigger
-- fica em `purchase_items`/`sale_items` (as tabelas-filho). Motivo: purchases
-- e sales cascateiam a exclusão dos seus itens via "on delete cascade"
-- (init_schema), e um DELETE em cascata dispara normalmente os triggers da
-- tabela filha. Um trigger por item cobre os dois cenários de risco com uma
-- única fonte de verdade, sem duplicar reversão:
--   1) DELETE FROM purchases/sales diretamente (o incidente real) — cascateia
--      para purchase_items/sale_items, que revertem o estoque item a item.
--   2) DELETE de uma linha de purchase_items/sale_items isolada, sem apagar o
--      registro pai (outro caminho "por fora" possível no SQL editor).
-- Colocar o trigger nas DUAS pontas (pai e filho) causaria dupla reversão
-- exatamente no cenário mais comum (excluir a compra/venda inteira aciona os
-- dois). Por isso as RPCs abaixo são simplificadas para não reverter estoque
-- manualmente — a reversão agora é sempre feita pelo trigger, único lugar que
-- faz essa conta, não importa por onde a exclusão aconteça.
--
-- Escopo aceito: não foram adicionados triggers de BEFORE UPDATE em
-- quantity/returned_quantity (cotado como "se fizer sentido" no pedido).
-- Nenhuma RPC hoje corrige quantity após o lançamento original (update_purchase_pricing
-- só corrige valores; return_sale_items só mexe em returned_quantity, com sua própria
-- reversão manual de estoque). Adicionar esse trigger exigiria refatorar
-- return_sale_items() para não reverter estoque duas vezes (mesma armadilha de dupla
-- reversão), um passo maior que o incidente confirmado não exige agora. Fica como
-- risco residual conhecido, documentado no PROGRESSO.md.

-- purchase_items: reverte a quantidade do item do estoque do produto sempre
-- que a linha for apagada — seja porque a compra inteira foi excluída (cascade)
-- ou porque o item foi apagado isoladamente. security definer: precisa
-- funcionar mesmo quando quem disparou o DELETE (ex.: um vendedor, indireto
-- via alguma falha de escopo) não tem UPDATE em products (products_update_master
-- é restrita a master). O check (stock_quantity >= 0) da tabela products
-- continua valendo dentro do trigger: se a reversão deixaria o estoque
-- negativo (produto já vendido depois da compra), o UPDATE do trigger falha e
-- a exclusão inteira é abortada — mesma proteção que delete_purchase() já
-- fazia, agora garantida também para quem pular a RPC.
create or replace function public.reverse_stock_on_purchase_item_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.products
  set stock_quantity = stock_quantity - old.quantity
  where id = old.product_id;

  return old;
end;
$$;

create trigger purchase_items_reverse_stock_before_delete
  before delete on public.purchase_items
  for each row
  execute function public.reverse_stock_on_purchase_item_delete();

-- sale_items: repõe ao estoque a quantidade que ainda estava "em aberto"
-- (quantity - returned_quantity) sempre que a linha for apagada — seja pela
-- venda inteira sendo excluída (cascade) ou pelo item isolado. Usar
-- (quantity - returned_quantity), e não quantity cheio, evita contar em
-- dobro uma devolução já registrada por return_sale_items() antes da
-- exclusão (delete_sale() já bloqueia excluir venda com item devolvido, mas
-- uma exclusão "por fora" da RPC não teria essa checagem, então o trigger
-- calcula o valor correto de qualquer forma, sem depender dela).
create or replace function public.reverse_stock_on_sale_item_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.products
  set stock_quantity = stock_quantity + (old.quantity - old.returned_quantity)
  where id = old.product_id;

  return old;
end;
$$;

create trigger sale_items_reverse_stock_before_delete
  before delete on public.sale_items
  for each row
  execute function public.reverse_stock_on_sale_item_delete();

-- delete_purchase(): não reverte mais o estoque manualmente — a exclusão da
-- compra cascateia para purchase_items, e o trigger acima faz a reversão. A
-- validação prévia (mensagem amigável, aponta o produto específico) continua
-- aqui, só de leitura, para falhar antes de tentar o DELETE; o check
-- constraint de products é quem garante a regra de fato, mesmo se esta RPC
-- for pulada.
create or replace function public.delete_purchase(p_purchase_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_item record;
  v_product_ids uuid[];
  v_product_id uuid;
begin
  if not public.is_master() then
    raise exception 'apenas o master pode excluir compras';
  end if;

  if not exists (select 1 from public.purchases where id = p_purchase_id) then
    raise exception 'compra não encontrada';
  end if;

  for v_item in
    select pi.product_id, pi.quantity, p.stock_quantity
    from public.purchase_items pi
    join public.products p on p.id = pi.product_id
    where pi.purchase_id = p_purchase_id
  loop
    if v_item.stock_quantity < v_item.quantity then
      raise exception 'excluir esta compra deixaria o estoque do produto % negativo (unidades já vendidas desde então)', v_item.product_id;
    end if;
  end loop;

  select array_agg(distinct product_id) into v_product_ids
  from public.purchase_items where purchase_id = p_purchase_id;

  -- on delete cascade em purchase_items.purchase_id: cada item é apagado e
  -- purchase_items_reverse_stock_before_delete reverte o estoque item a
  -- item; recompute_product_pricing() abaixo já olha só para o que sobrou
  -- nas outras compras do produto.
  delete from public.purchases where id = p_purchase_id;

  foreach v_product_id in array coalesce(v_product_ids, array[]::uuid[])
  loop
    perform public.recompute_product_pricing(v_product_id);
  end loop;
end;
$$;

grant execute on function public.delete_purchase(uuid) to authenticated;

-- delete_sale(): não reverte mais o estoque manualmente — a exclusão da
-- venda cascateia para sale_items, e o trigger acima faz a reversão
-- (já descontando eventuais devoluções). As checagens de permissão e do
-- bloqueio "já tem devolução" continuam iguais.
create or replace function public.delete_sale(p_sale_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_has_return boolean;
begin
  if not exists (select 1 from public.sales where id = p_sale_id) then
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

  -- on delete cascade em sale_items.sale_id: cada item é apagado e
  -- sale_items_reverse_stock_before_delete repõe o estoque item a item.
  delete from public.sales where id = p_sale_id;
end;
$$;

grant execute on function public.delete_sale(uuid) to authenticated;
