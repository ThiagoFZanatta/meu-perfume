-- Meu Perfume — Schema inicial (V1 / MVP + tabela de despesas da Fase 2)
-- Referência: docs/PRD.md, seção 9 (Modelo de Dados de Alto Nível)

create extension if not exists pgcrypto;

-- ============================================================
-- ENUMS
-- ============================================================

create type public.profile_role as enum ('master', 'vendedor');
create type public.product_gender as enum ('masculino', 'feminino', 'unissex');
create type public.payment_method as enum ('especie', 'debito', 'credito_avista', 'credito_parcelado');
create type public.sale_status as enum ('concluida', 'parcialmente_devolvida', 'totalmente_devolvida');
create type public.order_status as enum ('aberto', 'atendido');
create type public.expense_category as enum ('aluguel', 'taxa_maquina', 'outras');

-- ============================================================
-- TABLES
-- ============================================================

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null,
  role public.profile_role not null default 'vendedor',
  created_at timestamptz not null default now()
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  brand text not null,
  gender public.product_gender not null,
  ml numeric(10, 2) not null check (ml > 0),
  description text,
  image_url text,
  stock_quantity integer not null default 0 check (stock_quantity >= 0),
  markup_percent numeric(10, 2) not null check (markup_percent >= 0),
  current_unit_cost_brl numeric(12, 2) not null default 0 check (current_unit_cost_brl >= 0),
  current_sale_price numeric(12, 2) not null default 0 check (current_sale_price >= 0),
  active boolean not null default true,
  last_purchase_date date,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);

create index products_active_idx on public.products (active);
create index products_brand_idx on public.products (brand);

create table public.purchases (
  id uuid primary key default gen_random_uuid(),
  purchase_date date not null default current_date,
  exchange_rate numeric(10, 4) not null check (exchange_rate > 0),
  freight_cost_brl numeric(12, 2) not null default 0 check (freight_cost_brl >= 0),
  total_cost_brl numeric(12, 2) not null default 0 check (total_cost_brl >= 0),
  created_by uuid not null references public.profiles (id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  updated_by uuid references public.profiles (id)
);

create table public.purchase_items (
  id uuid primary key default gen_random_uuid(),
  purchase_id uuid not null references public.purchases (id) on delete cascade,
  product_id uuid not null references public.products (id),
  quantity integer not null check (quantity > 0),
  unit_price_usd numeric(12, 2) not null check (unit_price_usd > 0),
  unit_cost_brl numeric(12, 2) not null default 0 check (unit_cost_brl >= 0),
  subtotal_brl numeric(12, 2) not null default 0 check (subtotal_brl >= 0)
);

create index purchase_items_purchase_idx on public.purchase_items (purchase_id);
create index purchase_items_product_idx on public.purchase_items (product_id);

create table public.sales (
  id uuid primary key default gen_random_uuid(),
  sale_date timestamptz not null default now(),
  seller_id uuid not null references public.profiles (id) default auth.uid(),
  payment_method public.payment_method not null,
  total_amount numeric(12, 2) not null default 0 check (total_amount >= 0),
  commission_amount numeric(12, 2) not null default 0 check (commission_amount >= 0),
  status public.sale_status not null default 'concluida',
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  updated_by uuid references public.profiles (id)
);

create index sales_seller_idx on public.sales (seller_id);
create index sales_sale_date_idx on public.sales (sale_date);

create table public.sale_items (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales (id) on delete cascade,
  product_id uuid not null references public.products (id),
  quantity integer not null check (quantity > 0),
  unit_sale_price numeric(12, 2) not null check (unit_sale_price >= 0),
  discount_percent numeric(5, 2) not null default 0 check (discount_percent >= 0 and discount_percent <= 100),
  subtotal numeric(12, 2) not null default 0 check (subtotal >= 0),
  returned_quantity integer not null default 0 check (returned_quantity >= 0),
  constraint sale_items_returned_le_quantity check (returned_quantity <= quantity)
);

create index sale_items_sale_idx on public.sale_items (sale_id);
create index sale_items_product_idx on public.sale_items (product_id);

create table public.sale_returns (
  id uuid primary key default gen_random_uuid(),
  sale_item_id uuid not null references public.sale_items (id),
  quantity_returned integer not null check (quantity_returned > 0),
  reason text,
  created_by uuid not null references public.profiles (id) default auth.uid(),
  created_at timestamptz not null default now()
);

create index sale_returns_sale_item_idx on public.sale_returns (sale_item_id);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  customer_name text not null,
  customer_contact text not null,
  desired_product_text text,
  desired_product_id uuid references public.products (id),
  observation text,
  status public.order_status not null default 'aberto',
  created_by uuid not null references public.profiles (id) default auth.uid(),
  created_at timestamptz not null default now(),
  constraint orders_desired_product_present check (
    desired_product_text is not null or desired_product_id is not null
  )
);

create index orders_status_idx on public.orders (status);

create table public.settings (
  key text primary key,
  value jsonb not null
);

-- Fase 2 (Should Have) — incluída no schema agora para evitar retrabalho estrutural,
-- sem telas/funcionalidades associadas ainda.
create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  expense_date date not null default current_date,
  category public.expense_category not null,
  description text,
  amount numeric(12, 2) not null check (amount > 0),
  created_by uuid not null references public.profiles (id) default auth.uid(),
  created_at timestamptz not null default now()
);

insert into public.settings (key, value) values
  ('default_commission_percent', '5'),
  ('low_stock_threshold', '1'),
  ('stale_product_days', '30'),
  ('edit_window_hours_seller', '2');

-- ============================================================
-- HELPER FUNCTIONS (security definer — evitam recursão de RLS em profiles)
-- ============================================================

create or replace function public.is_master()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and role = 'master'
  );
$$;

create or replace function public.seller_edit_window_hours()
returns numeric
language sql
security definer
stable
set search_path = public
as $$
  select coalesce((select value from public.settings where key = 'edit_window_hours_seller')::text::numeric, 2);
$$;

-- Cria automaticamente a linha em profiles quando um usuário é criado no Supabase Auth.
-- O primeiro usuário do sistema vira master (bootstrap); demais nascem vendedor por
-- padrão, exceto quando raw_user_meta_data.role é informado (uso futuro: criação de
-- usuários pelo master via função administrativa, RF02/Tela 11).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)),
    case
      when not exists (select 1 from public.profiles) then 'master'::public.profile_role
      else coalesce((new.raw_user_meta_data ->> 'role')::public.profile_role, 'vendedor'::public.profile_role)
    end
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Preenche updated_at/updated_by automaticamente em correções (RF13).
create or replace function public.set_updated_meta()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;

create trigger purchases_set_updated_meta
  before update on public.purchases
  for each row execute function public.set_updated_meta();

create trigger sales_set_updated_meta
  before update on public.sales
  for each row execute function public.set_updated_meta();

-- ============================================================
-- VIEWS "seguras" (colunas sensíveis omitidas)
--
-- Postgres RLS é por linha, não por coluna. Para esconder custo/margem/comissão do
-- papel vendedor mesmo em chamadas diretas à API (RF10), a tabela base fica
-- restrita a `is_master()` e o vendedor consulta somente estas views. As views são
-- criadas pelo dono da migration (bypassa RLS da tabela base) e replicam manualmente
-- o filtro de linha necessário.
-- ============================================================

create view public.products_catalog_v
with (security_invoker = false)
as
select
  id, name, brand, gender, ml, description, image_url,
  stock_quantity, active, current_sale_price, last_purchase_date, created_at
from public.products;

grant select on public.products_catalog_v to authenticated;

create view public.sales_seller_v
with (security_invoker = false)
as
select
  id, sale_date, seller_id, payment_method, total_amount, status, created_at
from public.sales
where seller_id = auth.uid();

grant select on public.sales_seller_v to authenticated;

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

alter table public.profiles enable row level security;
alter table public.products enable row level security;
alter table public.purchases enable row level security;
alter table public.purchase_items enable row level security;
alter table public.sales enable row level security;
alter table public.sale_items enable row level security;
alter table public.sale_returns enable row level security;
alter table public.orders enable row level security;
alter table public.settings enable row level security;
alter table public.expenses enable row level security;

-- profiles
create policy "profiles_select_own_or_master" on public.profiles
  for select using (id = auth.uid() or public.is_master());

create policy "profiles_update_master" on public.profiles
  for update using (public.is_master()) with check (public.is_master());

-- products (base table: master only; vendedor usa products_catalog_v)
create policy "products_select_master" on public.products
  for select using (public.is_master());

create policy "products_insert_master" on public.products
  for insert with check (public.is_master());

create policy "products_update_master" on public.products
  for update using (public.is_master()) with check (public.is_master());

-- purchases / purchase_items (Tela 6 é exclusiva do master)
create policy "purchases_all_master" on public.purchases
  for all using (public.is_master()) with check (public.is_master());

create policy "purchase_items_all_master" on public.purchase_items
  for all using (public.is_master()) with check (public.is_master());

-- sales (base table esconde commission_amount do vendedor; vendedor usa sales_seller_v
-- para consulta, mas grava/corrige direto na tabela base dentro da janela do RF13)
create policy "sales_select_master" on public.sales
  for select using (public.is_master());

create policy "sales_insert_own_or_master" on public.sales
  for insert with check (public.is_master() or seller_id = auth.uid());

create policy "sales_update_own_within_window_or_master" on public.sales
  for update using (
    public.is_master()
    or (seller_id = auth.uid() and created_at > now() - (public.seller_edit_window_hours() || ' hours')::interval)
  ) with check (
    public.is_master() or seller_id = auth.uid()
  );

create policy "sales_delete_own_within_window_or_master" on public.sales
  for delete using (
    public.is_master()
    or (seller_id = auth.uid() and created_at > now() - (public.seller_edit_window_hours() || ' hours')::interval)
  );

-- sale_items (sem colunas sensíveis; acesso segue a venda associada)
create policy "sale_items_select_own_sale_or_master" on public.sale_items
  for select using (
    public.is_master()
    or exists (select 1 from public.sales s where s.id = sale_id and s.seller_id = auth.uid())
  );

create policy "sale_items_insert_own_sale_or_master" on public.sale_items
  for insert with check (
    public.is_master()
    or exists (select 1 from public.sales s where s.id = sale_id and s.seller_id = auth.uid())
  );

create policy "sale_items_update_own_sale_within_window_or_master" on public.sale_items
  for update using (
    public.is_master()
    or exists (
      select 1 from public.sales s
      where s.id = sale_id and s.seller_id = auth.uid()
        and s.created_at > now() - (public.seller_edit_window_hours() || ' hours')::interval
    )
  );

create policy "sale_items_delete_own_sale_within_window_or_master" on public.sale_items
  for delete using (
    public.is_master()
    or exists (
      select 1 from public.sales s
      where s.id = sale_id and s.seller_id = auth.uid()
        and s.created_at > now() - (public.seller_edit_window_hours() || ' hours')::interval
    )
  );

-- sale_returns (Tela 12 é exclusiva do master — RF14)
create policy "sale_returns_all_master" on public.sale_returns
  for all using (public.is_master()) with check (public.is_master());

-- orders (Tela 9 é compartilhada entre master e vendedor)
create policy "orders_select_authenticated" on public.orders
  for select using (auth.uid() is not null);

create policy "orders_insert_authenticated" on public.orders
  for insert with check (created_by = auth.uid());

create policy "orders_update_authenticated" on public.orders
  for update using (auth.uid() is not null);

create policy "orders_delete_master" on public.orders
  for delete using (public.is_master());

-- settings (o percentual de comissão é sensível; demais parâmetros ficam visíveis
-- para o vendedor, ex: limite de estoque baixo usado no dashboard)
create policy "settings_select_visible" on public.settings
  for select using (public.is_master() or key <> 'default_commission_percent');

create policy "settings_write_master" on public.settings
  for all using (public.is_master()) with check (public.is_master());

-- expenses (Fase 2, master only)
create policy "expenses_all_master" on public.expenses
  for all using (public.is_master()) with check (public.is_master());

-- RF01: permite ao Login detectar, sem autenticação, se ainda não existe nenhum
-- usuário (para oferecer a criação do primeiro master — não há autocadastro
-- público depois disso, conforme PRD seção 6/Tela 1).
create or replace function public.needs_bootstrap()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select not exists (select 1 from public.profiles);
$$;

grant execute on function public.needs_bootstrap() to anon, authenticated;
