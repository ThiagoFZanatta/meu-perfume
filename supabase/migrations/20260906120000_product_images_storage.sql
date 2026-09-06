-- RF03 (Tela 5): bucket de Storage para imagens de produto. Leitura pública
-- (a imagem em si não é dado sensível — aparece no catálogo do vendedor,
-- Tela 4/7), escrita restrita ao master.

insert into storage.buckets (id, name, public)
values ('products', 'products', true)
on conflict (id) do nothing;

create policy "products_images_select_public" on storage.objects
  for select using (bucket_id = 'products');

create policy "products_images_insert_master" on storage.objects
  for insert with check (bucket_id = 'products' and public.is_master());

create policy "products_images_update_master" on storage.objects
  for update using (bucket_id = 'products' and public.is_master())
  with check (bucket_id = 'products' and public.is_master());

create policy "products_images_delete_master" on storage.objects
  for delete using (bucket_id = 'products' and public.is_master());
