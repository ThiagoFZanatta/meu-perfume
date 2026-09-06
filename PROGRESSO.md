# PROGRESSO — Fundação do projeto + RF01 (Autenticação e Perfis)

## O que foi implementado

### 1. PRD versionado no repositório
- `docs/PRD.md` — cópia integral do PRD, conforme recomendado na seção 13.2 ("o PRD deve viajar com cada sessão").

### 2. Modelo de dados completo (seção 9 do PRD)
- Migration `supabase/migrations/20260905120000_init_schema.sql`, aplicada diretamente no banco Lovable Cloud (Supabase) do projeto.
- Todas as tabelas do V1 (MVP) + `expenses` (Fase 2, incluída agora para não exigir retrabalho estrutural depois): `profiles`, `products`, `purchases`, `purchase_items`, `sales`, `sale_items`, `sale_returns`, `orders`, `settings`, `expenses`.
- Enums para `role`, gênero, forma de pagamento, status de venda/encomenda, categoria de despesa.
- `settings` seedada com `default_commission_percent` (5), `low_stock_threshold` (1), `stale_product_days` (30), `edit_window_hours_seller` (2).
- Índices nas colunas mais consultadas (FKs, `active`, datas, `status`).

### 3. Row Level Security (RF02 / RF10)
- RLS habilitado em todas as tabelas.
- `products`, `purchases`/`purchase_items` e a coluna `commission_amount` de `sales`: acesso à tabela base restrito a `master` (via função `is_master()`, `security definer`, evita recursão de RLS).
- Como RLS do Postgres é por linha (não por coluna), o vendedor nunca lê custo/margem/comissão porque essas tabelas ficam bloqueadas para ele na base — em vez disso, ele consulta as views `products_catalog_v` e `sales_seller_v`, que expõem só as colunas seguras. Essas views são "owner-bypass" (criadas sem `security_invoker`, then o dono da migration ignora a RLS da tabela base) e replicam manualmente o filtro de linha necessário. Isso satisfaz o critério de aceite do RF10 mesmo contra chamadas diretas à API.
- `sales`/`sale_items`: vendedor grava e corrige as próprias vendas na tabela base dentro da janela de edição (RF13, via `seller_edit_window_hours()`); master sem limite.
- `orders`: leitura/edição compartilhada entre os dois papéis (Tela 9); exclusão restrita ao master (pedido do LGPD, seção 8).
- `settings`: a linha `default_commission_percent` é ocultada do vendedor por RLS; as demais (limite de estoque baixo, etc.) ficam visíveis.

### 4. Autenticação e redirecionamento por papel (RF01)
- `src/routes/login.tsx` — Tela 1: e-mail/senha, "Esqueci minha senha" (via `resetPasswordForEmail`), estados de vazio/erro/carregando conforme especificado.
- `src/components/require-role.tsx` — guarda de rota: sem sessão → `/login`; papel errado para a rota → redireciona para a home do papel correto (bloqueia acesso direto via URL, RF02).
- `src/routes/master/route.tsx` (layout do master, com `DashboardShell` + nav) e `src/routes/vendedor.tsx` (Tela 3) — shells dos dashboards, com dados reais (contagem de produtos, estoque baixo, encomendas em aberto para o master; catálogo com busca para o vendedor via `products_catalog_v`).
- `src/lib/auth.ts` — hooks `useSession`/`useProfile`/`useAuth` (React Query + `onAuthStateChange`).

### 5. Bootstrap do primeiro usuário — decisão técnica
O PRD diz que "não há autocadastro público — novos usuários só são criados por um master" (Tela 1), mas não define como nasce o **primeiro** master. Decisão adotada: um trigger em `auth.users` (`handle_new_user`) atribui `role = 'master'` automaticamente ao primeiro usuário já criado no sistema; os seguintes nascem `vendedor` por padrão (ou o papel vier em `raw_user_meta_data.role`, usado futuramente pela criação administrativa da Tela 11). Uma função pública `needs_bootstrap()` permite à tela de login oferecer "Criar conta master" somente enquanto não existir nenhum usuário — depois disso, a opção desaparece e a criação de vendedores/masters passa a ser exclusiva da Tela 11 (RF02, ainda não implementada).

### 6. Identidade visual (seção 14)
- `src/styles.css` — paleta bone/surface/ink/wine/amber/hairline + cores funcionais (success/warning/danger) convertidas para oklch e mapeadas nos tokens semânticos do shadcn (`background`, `primary`, `accent`, etc.), além de expostas como tokens de marca (`bg-wine`, `text-amber`, etc.).
- Tipografia Fraunces (display) + IBM Plex Sans (corpo), raio pequeno (6px) em botões/inputs, algarismos tabulares (`.tabular`) para colunas numéricas.
- Paleta de gráficos alinhada à seção 14.5 (`chart-1` = wine, `chart-2` = amber).
- **Padrão do item de menu ativo** (`src/components/dashboard-shell.tsx`): `bg-sidebar-accent/10 text-amber`, seguindo a seção 14.2 à risca ("amber... item de menu ativo, badges neutros" — não `wine`, reservado para ações principais/marca). Esse é o padrão a repetir quando Compras, Estoque, Vendas, Encomendas, Relatórios e Usuários (hoje placeholders "Em breve" em `DashboardShell`) ganharem suas telas e virarem links reais.

### 7. Tipos TypeScript
- `src/integrations/supabase/types.ts` reescrito manualmente a partir da migration (sem CLI do Supabase disponível neste ambiente). **Atenção:** ao alterar o schema, atualizar este arquivo junto — não há geração automática configurada.

### 8. Refino de RLS: `is_own_sale()` (migration `20260906090000_sale_items_is_own_sale.sql`)
As 4 políticas de `sale_items` (select/insert/update/delete) repetiam a mesma
subquery `exists (select 1 from sales s where s.id = sale_id and s.seller_id =
auth.uid() ...)`, variando só a checagem da janela de correção (RF13). Foi
extraído um único helper:

```sql
public.is_own_sale(p_sale_id uuid, p_within_edit_window boolean default false)
```

`select`/`insert` chamam `is_own_sale(sale_id)` (sem checar janela);
`update`/`delete` chamam `is_own_sale(sale_id, true)` (exige estar dentro de
`seller_edit_window_hours()`). Reduz duplicação e centraliza a regra "esta
venda é minha" em um único lugar, caso ela mude no futuro.

### 9. Padrão obrigatório: leitura pós-insert/update em `sales` (vendedor)
A tabela base `sales` só permite `SELECT` para `is_master()` (item 3, acima) —
é assim que `commission_amount` fica escondido do vendedor mesmo em chamada
direta à API (RF10). Isso tem uma consequência que **quem implementar RF07
(Registrar Venda) e RF13 (correção) precisa seguir**:

- O Postgres aplica a política de `SELECT` também ao `RETURNING` de um
  `INSERT`/`UPDATE`/`DELETE`. Como o `supabase-js` ativa `RETURNING` sempre
  que `.select()` é encadeado após `.insert()`/`.update()`/`.delete()`, um
  vendedor que faça `supabase.from("sales").insert(payload).select()` recebe
  `data: []` (silencioso, sem erro) mesmo com o insert tendo funcionado —
  porque a linha inserida não passa na política de `SELECT` da tabela base.
- **Padrão a seguir:**
  1. Gerar o `id` da venda no cliente com `crypto.randomUUID()` antes do
     insert, para não depender do valor de volta do banco.
  2. Ao inserir/atualizar/excluir em `sales` como vendedor, **não encadear
     `.select()`** — só checar `error`. Isso mantém o `Prefer: return=minimal`
     (comportamento padrão do `supabase-js` sem `.select()`), que não aciona a
     política de `SELECT`.
  3. `sale_items` não tem essa restrição (RLS permite ao vendedor ler os
     próprios itens), então `.select()` pode ser encadeado normalmente ali.
  4. Sempre que o vendedor precisar reler dados de `sales` depois (ex: listar
     vendas recentes para permitir a correção dentro das 2h — RF13), consultar
     a view `sales_seller_v` (já filtrada por `seller_id = auth.uid()` e sem
     `commission_amount`), nunca a tabela base `sales`.

### 10. RF03 — Catálogo de Produtos (Telas 4 e 5)
- `src/routes/master.tsx` virou um layout de pasta (`src/routes/master/route.tsx` + `index.tsx`), para acomodar as novas sub-rotas — o item de nav "Catálogo" agora é um link real; os demais continuam como placeholder ("Em breve") até suas telas existirem.
- `src/routes/master/catalogo/index.tsx` (Tela 4): grade de produtos com imagem, nome, marca, ml, estoque, custo e preço de venda; busca por nome/marca; filtro por gênero; ordenação padrão por estoque baixo primeiro; oculta inativos por padrão com um toggle "Mostrar inativos" (badge visual "inativo" quando exibidos); estados de vazio/erro/carregando.
- `src/routes/master/catalogo/novo.tsx` e `.../$productId.tsx` (Tela 5): cadastro e edição usando o mesmo `src/components/product-form.tsx` — nome, marca, gênero, ml e markup obrigatórios; descrição opcional; upload de imagem para o Storage; toggle "Produto ativo" visível só na edição (todo produto novo nasce ativo). Custo e preço de venda **não** são definidos aqui, conforme RF04/RF06 — ficam com o valor padrão (`0`) até a primeira compra.
- Bucket de Storage `products` criado via migration `20260906120000_product_images_storage.sql`: leitura pública (a imagem não é dado sensível — aparece também no catálogo do vendedor), escrita/atualização/exclusão restritas a `is_master()`.
- **Padrão de geração de `id` client-side**, já usado para `sales` (seção 9), reaproveitado aqui: o `id` do produto é gerado com `crypto.randomUUID()` antes do insert, para poder montar o caminho da imagem no Storage (`{id}/{timestamp}.{ext}`) antes de a linha existir na tabela.
- Dashboard do master (Tela 2) ganhou um link real "Cadastrar produto" no estado vazio, agora que o Catálogo existe.

### 11. RF04/RF06 — Registrar Compra (Tela 6)
- Implementado como RPC transacional `public.confirm_purchase()` (migration `20260907090000_confirm_purchase.sql`), não como inserts diretos do front: uma compra grava a linha em `purchases`, uma linha por item em `purchase_items` e atualiza `stock_quantity`/`current_unit_cost_brl`/`current_sale_price`/`last_purchase_date` de cada produto — tudo em uma única transação de banco, garantindo que não existe estado intermediário (ex.: estoque atualizado sem o registro da compra, ou vice-versa).
- `security invoker` (padrão, não `security definer`): a função roda com o papel de quem chama, então depende só das policies `purchases_all_master`/`purchase_items_all_master`/`products_update_master` já existentes — nenhuma policy nova foi necessária. `is_master()` é checado explicitamente no início da função como segunda barreira (defesa em profundidade), já que Compras é uma tela exclusiva do master (RF02).
- Rateio de frete **por quantidade**, conforme seção 7/RF04: `frete_por_unidade = frete_total ÷ quantidade_total_de_itens_da_compra` (soma de todos os produtos da nota), não por valor do item. Fórmula de custo: `custo_unitário_BRL = (preço_unitário_USD × taxa_câmbio) + frete_por_unidade`.
- Preço de venda sugerido (`custo_unitário_BRL × (1 + markup_%_do_produto)`) é calculado e exibido no front (`src/components/purchase-form.tsx`) para cada item, com campo editável ao lado — o master pode aceitar a sugestão ou digitar outro valor antes de confirmar. O valor final enviado ao RPC (sugerido ou ajustado) é o que grava em `current_sale_price`, único por produto (RF06), mesmo com lotes de compra diferentes em estoque.
- Tela em formato de tabela/planilha (`src/components/purchase-form.tsx`), com colunas numéricas alinhadas à direita, conforme a diretriz visual da Tela 6; suporta múltiplos produtos na mesma compra (adicionar/remover linhas).
- Nav "Compras" (`src/routes/master/route.tsx`) e o atalho "Registrar Compra" no Dashboard Master (`src/routes/master/index.tsx`, Tela 2, elemento 2) agora apontam para `/master/compras/nova`. O atalho "Registrar Venda" (elemento 3 da mesma tela) fica para quando o RF07 existir.
- `src/integrations/supabase/types.ts` ganhou a assinatura de `confirm_purchase` em `Functions`.

## Critérios de aceite do PRD atendidos nesta entrega

- RF01: login via Supabase Auth; redirecionamento por papel após login; sem autocadastro público (exceto bootstrap do primeiro usuário, decisão documentada acima).
- RF02 (parcial): tentativa de acesso direto a `/master` por um vendedor (ou vice-versa) é bloqueada e redirecionada; a Tela 11 (gestão de usuários) ainda não foi construída.
- RF10: testado diretamente — `products_catalog_v` não expõe `current_unit_cost_brl`/`markup_percent`; a tabela base `products` só é lida por `is_master()`.
- RNF de auditoria mínima: `created_by`/`created_at` com default automático; `updated_at`/`updated_by` preenchidos via trigger em correções de `purchases`/`sales` (RF13).
- RF03: produto não pode ser salvo sem nome, marca, gênero, ml e markup (validação client-side, com as mesmas colunas `not null`/`check` no banco como garantia); inativar não apaga histórico (RLS/consultas de `purchases`/`sales` continuam funcionando via `product_id`, mesmo com `products.active = false`).
- RF04: ao confirmar a compra, `confirm_purchase()` calcula e grava o custo unitário (com frete rateado por quantidade) e o total em BRL, soma a quantidade ao estoque do produto correspondente, e atualiza `current_sale_price` com o valor confirmado pelo master (sugerido ou ajustado) — tudo em uma única transação.
- RF06: `current_sale_price` é sempre único por produto (uma `update` por produto na mesma transação da compra, nunca dois preços simultâneos); markup configurável por produto usado para a sugestão.

## Pendências / próximos passos (ordem sugerida pelo roadmap, seção 6/12)

1. RF07 — Registrar Venda (Tela 8), incluindo cálculo de comissão. **Seguir o padrão da seção 9 acima** ao inserir em `sales` como vendedor. Considerar seguir o mesmo padrão de RPC transacional de `confirm_purchase()` (seção 11) para debitar estoque + gravar venda + itens atomicamente.
2. RF13/RF14 — Edição/estorno de lançamentos e devolução de venda (Tela 12) como RPCs que revertem estoque/comissão corretamente. **Seguir o padrão da seção 9 acima** ao atualizar/excluir em `sales` como vendedor.
3. RF08/RF09 — Encomendas e Relatórios de giro.
4. RF02 completo — Tela 11 (gestão de usuários), via função server-side com `supabaseAdmin` (service role) chamando `auth.admin.createUser`.
5. RF03 — pendência menor: ao trocar a imagem de um produto na edição, o arquivo antigo não é removido do Storage (fica órfão). Não é um problema funcional agora (bucket pequeno), mas vale limpar (`storage.remove`) quando o módulo de Estoque estiver pronto e houver tempo para revisar.
6. RF04 — pendência menor: não há tela de histórico/listagem de compras ainda (a Tela 6 do PRD é só o formulário de registro); considerar adicionar uma listagem simples quando os Relatórios (RF09) forem construídos, já que os dados (`purchases`/`purchase_items`) já existem e estão completos.

## Riscos e observações

- **Ambiente de build**: o registro npm privado da Lovable (`europe-west1-npm.pkg.dev`) não é alcançável a partir deste sandbox do Claude Code; a instalação de dependências para validação local foi feita via registro público do npm (não commitado). `bun.lock` continua sendo a fonte da verdade para o pipeline real da Lovable.
- **Validação feita nesta sessão**: `tsc --noEmit` limpo, `eslint` limpo nos arquivos novos/alterados, `vite build` (build de produção completo, incluindo o worker Cloudflare) concluído com sucesso, e a tela de login testada visualmente via Playwright (desktop e mobile) — confirma paleta, tipografia e estados. A função `needs_bootstrap()` foi validada diretamente no banco (retorna `true` com o banco vazio).
- **Não testado**: o fluxo de login/bootstrap ponta a ponta em navegador contra o Supabase real, porque o proxy de rede deste sandbox impediu o Chromium headless de alcançar `*.supabase.co` de forma confiável. Recomenda-se testar esse fluxo no preview da própria Lovable (ou em produção) antes de considerar o RF01 encerrado. A mesma limitação vale para o RF03: o formulário de produto (Tela 5) foi validado visualmente via Playwright (renderização, campos, validação de layout), o redirecionamento de `/master/catalogo` para `/login` quando não autenticado foi confirmado, mas o fluxo completo de criar/editar/inativar um produto (incluindo upload de imagem) contra o banco real não foi exercido neste sandbox — recomenda-se testar no preview da Lovable antes de considerar o RF03 encerrado.
- **RF04 — validação feita nesta sessão**: a função `confirm_purchase()` foi criada e conferida diretamente no banco (`pg_proc.prosecdef = false`, confirmando `security invoker`); a tela (`src/components/purchase-form.tsx`) foi validada visualmente via Playwright, incluindo o cálculo reativo de custo unitário e total da compra a partir de taxa de câmbio/frete/quantidade preenchidos manualmente (ex.: USD 25 × câmbio 5,20 + frete rateado de R$ 3/un. = custo unitário R$ 133,00, conferido na tela). **Não testado nesta sessão**: a chamada real ao RPC contra o Supabase (criação efetiva de uma compra, atualização de estoque/preço de um produto real, e a lista de produtos no seletor, que depende de uma consulta autenticada) — mesma limitação de rede do Chromium headless já registrada acima. Recomenda-se testar uma compra completa (com produto real selecionado) no preview da Lovable antes de considerar o RF04 encerrado.
