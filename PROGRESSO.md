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

### 12. RF04 — correção: produto duplicado na mesma compra
- **Problema encontrado:** era possível selecionar o mesmo produto em duas ou mais linhas da mesma compra (Tela 6). `confirm_purchase()` processa os itens em sequência e faz um `update` em `products` por linha — a quantidade somava corretamente, mas `current_unit_cost_brl`/`current_sale_price` acabavam ficando com o valor só da última linha processada para aquele produto, silenciosamente (sem erro, sem aviso).
- **Correção no frontend** (`src/components/purchase-form.tsx`): `handleProductChange()` intercepta a seleção antes de aplicá-la — se o `product_id` já estiver em uso em outra linha da mesma compra, a seleção é rejeitada com a mensagem "Este produto já foi adicionado nesta compra — ajuste a quantidade na linha existente em vez de duplicar", em vez de somar as linhas silenciosamente. Correção acompanhante: o `<Select>` do produto passou a receber `value={item.productId}` incondicionalmente (antes só passava `value` quando havia produto selecionado) — sem isso, o campo nascia "não controlado" no Radix e a rejeição não revertia visualmente o item exibido no dropdown, mesmo com o estado da aplicação correto por baixo.
- **Correção no backend** (migration `20260907100000_confirm_purchase_no_duplicates.sql`, substitui a função de `20260907090000_confirm_purchase.sql`): `confirm_purchase()` agora compara `count(*)` com `count(distinct product_id)` em `p_items` logo após validar que há ao menos um item, e faz `raise exception` se houver duplicidade — segunda barreira, mesmo padrão de defesa em profundidade já usado para `is_master()` nesta função (a RPC não confia cegamente na validação do cliente).
- Fórmula de custo, rateio de frete, cálculo de preço sugerido e RLS não foram alterados — só a validação de duplicidade foi adicionada.

### 13. RF07/RF06 — Registrar Venda (Tela 8)
- Implementado como RPC transacional `public.confirm_sale()` (migration `20260907110000_confirm_sale.sql`): uma venda grava a linha em `sales`, uma linha por item em `sale_items` e debita `stock_quantity` de cada produto — tudo em uma única transação, mesmo racional de atomicidade do `confirm_purchase()` (seção 11).
- **Diferença deliberada em relação a `confirm_purchase()`: aqui a função é `security definer`, não `security invoker`.** Quem chama normalmente é o vendedor, que (por desenho, RF10) não tem `UPDATE` em `products` nem `SELECT` na tabela base `sales` — a seção 9 já documenta que isso quebraria um `insert().select()` direto. Abrir uma policy de `UPDATE` em `products` para o vendedor exigiria também impedir que ele altere `current_unit_cost_brl`/`markup_percent` pela mesma via, o que RLS por linha não resolve sozinho. Em vez disso, `confirm_sale()` concentra num único lugar auditável a única coisa que o vendedor precisa além da sua RLS normal (debitar estoque), e a função nunca aceita do cliente nem `seller_id` (sempre `auth.uid()`) nem o preço de venda (sempre o `current_sale_price` vigente do produto, lido no servidor) — a mesma lógica de "a RPC não confia no cliente" já usada para o custo em `confirm_purchase()`, aqui aplicada ao preço de venda. Isso também elimina de raiz o problema do RETURNING da seção 9: a função nunca faz `insert ... returning` em `sales`/`sale_items`, só `return v_sale_id` (um escalar, não uma linha lida da tabela).
- Novo helper `public.default_commission_percent()` (mesmo estilo de `seller_edit_window_hours()`, já existente): centraliza a leitura de `settings.default_commission_percent` — normalmente invisível ao vendedor via API direta (RLS), mas lida internamente pela função (que roda como `security definer`) só para calcular `commission_amount`, nunca para expor o percentual em si.
- Fórmula: por item, `subtotal = current_sale_price × quantidade × (1 − desconto_%/100)`; `commission_amount = soma_dos_subtotais × percentual_de_comissão / 100` — conforme RF06/critério de aceite. O front (`src/components/sale-form.tsx`) nunca recebe nem exibe `commission_amount`.
- Checagem de estoque insuficiente **por produto agregado entre linhas**, não por linha isolada: como vender o mesmo produto em duas linhas não sobrescreve nada (diferente do bug de compra da seção 12 — aqui cada linha só soma ao `subtotal`/decrementa estoque, não hà campo que uma linha sobrescreva o valor da outra), não foi necessário bloquear produto duplicado; mas o front soma a quantidade pedida por `product_id` entre todas as linhas antes de comparar com o estoque disponível, senão duas linhas de 2 unidades cada pareceriam válidas isoladamente mesmo estourando um estoque de 3. O backend repete a checagem por linha, sequencialmente (`update products set stock_quantity = stock_quantity - qtd where stock_quantity >= qtd`), que já é correto para múltiplas linhas do mesmo produto porque cada iteração lê o estoque já decrementado pela linha anterior — segunda barreira, mesmo padrão de defesa em profundidade.
- Preço de venda e estoque disponível vêm de `products_catalog_v` (RF10) — o formulário do vendedor nunca lê a tabela base `products`; o preço não é editável na tela, só o desconto por item (RF06: desconto pontual por produto, recalcula o subtotal a partir do `current_sale_price` vigente).
- Forma de pagamento obrigatória (espécie/débito/crédito à vista/crédito parcelado); vendedor responsável não aparece como campo — já é o usuário logado, mostrado no cabeçalho do shell ("Olá, {nome}"), preenchido automaticamente como `auth.uid()` dentro da função.
- Estados da Tela 8: botão "Concluir Venda" desabilitado enquanto forma de pagamento, produto ou quantidade (agregada) inválida faltarem; após confirmar, tela de sucesso com o total e botão "Nova Venda" que reseta o formulário (a PRD pede confirmação + opção de nova venda, diferente da Tela 6 que navega para o catálogo).
- Reestruturado `src/routes/vendedor.tsx` (arquivo único) em pasta (`src/routes/vendedor/route.tsx` layout + `index.tsx` Tela 3), mesmo padrão já usado para `master` (seção 10), para acomodar a nova sub-rota `src/routes/vendedor/vendas/nova.tsx` (Tela 8). O botão "Registrar Venda" da Tela 3 deixou de ser um `toast("Em breve")` e agora navega para lá.
- **Fora de escopo desta entrega, deliberadamente**: o item "Vendas" do nav do master (`src/routes/master/route.tsx`) continua placeholder. A Tela 8 do PRD é explicitamente rotulada "(Vendedor)" — uma eventual listagem/histórico de vendas para o master é mais próxima do RF09 (Relatórios) e fica para quando essa RF for construída, junto com a pendência equivalente já registrada para compras (item 6 da lista de pendências).
- `src/integrations/supabase/types.ts` ganhou as assinaturas de `confirm_sale` e `default_commission_percent` em `Functions`.

### 14. RF07 — correção pós-revisão da PR #4: desconto sem validação de faixa no backend
- **Problema encontrado (revisão contra o PRD):** `confirm_sale()` aceitava `discount_percent` do payload sem validar faixa — só o front travava 0-100. Como é uma RPC pública (`grant execute ... to authenticated`), um vendedor chamando o RPC diretamente (fora do front) podia mandar `discount_percent` negativo (infla o preço cobrado do cliente, já que `subtotal = preço × quantidade × (1 − desconto/100)`) ou maior que 100 (gera subtotal negativo, reduzindo o total e a própria comissão da venda). Quebra a mesma filosofia já aplicada ao preço e ao `seller_id` nesta função: "a RPC não confia no cliente".
- **Correção no backend** (migration `20260908090000_confirm_sale_validate_discount.sql`, substitui a função de `20260907110000_confirm_sale.sql`): dentro do loop de itens, `confirm_sale()` agora faz `raise exception` se `discount_percent < 0 or discount_percent > 100` — mesmo padrão de defesa em profundidade já usado para duplicidade em `confirm_purchase()` e para quantidade inválida nesta própria função. Não foi necessária mudança no front (`sale-form.tsx`), que já limitava o input a 0-100 (`min="0" max="100"`); esta é só a segunda barreira que faltava no servidor.
- **`sales.status`, também revisado nesta correção:** a coluna já tinha `default 'concluida'::sale_status` desde a migration inicial (`20260905120000_init_schema.sql`) — confirmado via `information_schema.columns` diretamente no banco, nenhum `alter table` foi necessário. Ainda assim, o `insert` em `confirm_sale()` passou a setar `status = 'concluida'` explicitamente, por clareza (RF14/devolução depende desse valor estar correto desde a criação da venda).
- Fórmula de custo/preço, rateio de frete, cálculo de comissão e RLS não foram alterados — só a validação de desconto foi adicionada e o `status` passou a ser explícito.

## Critérios de aceite do PRD atendidos nesta entrega

- RF01: login via Supabase Auth; redirecionamento por papel após login; sem autocadastro público (exceto bootstrap do primeiro usuário, decisão documentada acima).
- RF02 (parcial): tentativa de acesso direto a `/master` por um vendedor (ou vice-versa) é bloqueada e redirecionada; a Tela 11 (gestão de usuários) ainda não foi construída.
- RF10: testado diretamente — `products_catalog_v` não expõe `current_unit_cost_brl`/`markup_percent`; a tabela base `products` só é lida por `is_master()`.
- RNF de auditoria mínima: `created_by`/`created_at` com default automático; `updated_at`/`updated_by` preenchidos via trigger em correções de `purchases`/`sales` (RF13).
- RF03: produto não pode ser salvo sem nome, marca, gênero, ml e markup (validação client-side, com as mesmas colunas `not null`/`check` no banco como garantia); inativar não apaga histórico (RLS/consultas de `purchases`/`sales` continuam funcionando via `product_id`, mesmo com `products.active = false`).
- RF04: ao confirmar a compra, `confirm_purchase()` calcula e grava o custo unitário (com frete rateado por quantidade) e o total em BRL, soma a quantidade ao estoque do produto correspondente, e atualiza `current_sale_price` com o valor confirmado pelo master (sugerido ou ajustado) — tudo em uma única transação.
- RF06: `current_sale_price` é sempre único por produto (uma `update` por produto na mesma transação da compra, nunca dois preços simultâneos); markup configurável por produto usado para a sugestão.
- RF07: venda não pode ser concluída se a quantidade solicitada de algum item (agregada entre linhas do mesmo produto) for maior que o estoque disponível; ao confirmar, `confirm_sale()` debita o estoque de cada item imediatamente, na mesma transação em que grava `sales`/`sale_items`.
- RF06 (comissão): `commission_amount` é calculado automaticamente pelo percentual configurado em `settings` sobre a soma dos subtotais já líquidos de desconto, e nunca é exposto ao vendedor (nem no front, nem no retorno da RPC, que devolve só o id da venda).

## Pendências / próximos passos (ordem sugerida pelo roadmap, seção 6/12)

1. RF13/RF14 — Edição/estorno de lançamentos e devolução de venda (Tela 12) como RPCs que revertem estoque/comissão corretamente. **Seguir o padrão da seção 9 acima** ao atualizar/excluir em `sales` como vendedor.
2. RF08/RF09 — Encomendas e Relatórios de giro.
3. RF02 completo — Tela 11 (gestão de usuários), via função server-side com `supabaseAdmin` (service role) chamando `auth.admin.createUser`.
4. RF03 — pendência menor: ao trocar a imagem de um produto na edição, o arquivo antigo não é removido do Storage (fica órfão). Não é um problema funcional agora (bucket pequeno), mas vale limpar (`storage.remove`) quando o módulo de Estoque estiver pronto e houver tempo para revisar.
5. RF04 — pendência menor: não há tela de histórico/listagem de compras ainda (a Tela 6 do PRD é só o formulário de registro); considerar adicionar uma listagem simples quando os Relatórios (RF09) forem construídos, já que os dados (`purchases`/`purchase_items`) já existem e estão completos.
6. RF07 — pendência menor, mesmo padrão da anterior: também não há histórico/listagem de vendas ainda (Tela 8 é só o mini-PDV de registro); mesma recomendação de juntar a uma listagem quando RF09 for construído. Além disso, o nav "Vendas" do master continua placeholder — decisão registrada na seção 13 (fora de escopo do RF07, que é a tela do vendedor).

## Riscos e observações

- **Ambiente de build**: o registro npm privado da Lovable (`europe-west1-npm.pkg.dev`) não é alcançável a partir deste sandbox do Claude Code; a instalação de dependências para validação local foi feita via registro público do npm (não commitado). `bun.lock` continua sendo a fonte da verdade para o pipeline real da Lovable.
- **Validação feita nesta sessão**: `tsc --noEmit` limpo, `eslint` limpo nos arquivos novos/alterados, `vite build` (build de produção completo, incluindo o worker Cloudflare) concluído com sucesso, e a tela de login testada visualmente via Playwright (desktop e mobile) — confirma paleta, tipografia e estados. A função `needs_bootstrap()` foi validada diretamente no banco (retorna `true` com o banco vazio).
- **Não testado**: o fluxo de login/bootstrap ponta a ponta em navegador contra o Supabase real, porque o proxy de rede deste sandbox impediu o Chromium headless de alcançar `*.supabase.co` de forma confiável. Recomenda-se testar esse fluxo no preview da própria Lovable (ou em produção) antes de considerar o RF01 encerrado. A mesma limitação vale para o RF03: o formulário de produto (Tela 5) foi validado visualmente via Playwright (renderização, campos, validação de layout), o redirecionamento de `/master/catalogo` para `/login` quando não autenticado foi confirmado, mas o fluxo completo de criar/editar/inativar um produto (incluindo upload de imagem) contra o banco real não foi exercido neste sandbox — recomenda-se testar no preview da Lovable antes de considerar o RF03 encerrado.
- **RF04 — validação feita nesta sessão**: a função `confirm_purchase()` foi criada e conferida diretamente no banco (`pg_proc.prosecdef = false`, confirmando `security invoker`); a tela (`src/components/purchase-form.tsx`) foi validada visualmente via Playwright, incluindo o cálculo reativo de custo unitário e total da compra a partir de taxa de câmbio/frete/quantidade preenchidos manualmente (ex.: USD 25 × câmbio 5,20 + frete rateado de R$ 3/un. = custo unitário R$ 133,00, conferido na tela). **Não testado nesta sessão**: a chamada real ao RPC contra o Supabase (criação efetiva de uma compra, atualização de estoque/preço de um produto real, e a lista de produtos no seletor, que depende de uma consulta autenticada) — mesma limitação de rede do Chromium headless já registrada acima. Recomenda-se testar uma compra completa (com produto real selecionado) no preview da Lovable antes de considerar o RF04 encerrado.
- **RF04 — correção de duplicidade (seção 12), validação feita nesta sessão**: a checagem `count(*) <> count(distinct product_id)` foi conferida diretamente no banco com um payload de teste (3 itens, 2 `product_id` distintos → detecta a duplicidade corretamente); `pg_get_functiondef()` confirmou que a nova versão da função contém a checagem. No front, o bloqueio foi validado via Playwright com dados de produto simulados (injetados no cache do React Query, contornando a mesma limitação de rede do Chromium headless): selecionar o mesmo produto em duas linhas é rejeitado com a mensagem de erro e o `<Select>` da segunda linha reverte corretamente para "Selecione..." (não fica preso no valor rejeitado); selecionar um produto diferente na segunda linha funciona normalmente e limpa o erro. **Não testado nesta sessão**: o `raise exception` do banco sendo de fato acionado por uma chamada real ao RPC (só a query da checagem foi validada isoladamente) — mesma limitação de rede já registrada acima.
- **RF07 — validação feita nesta sessão**: `confirm_sale()` e `default_commission_percent()` foram criadas e conferidas diretamente no banco (`pg_proc.prosecdef = true` para as duas, confirmando `security definer` como projetado). A tela (`src/components/sale-form.tsx`) foi validada visualmente via Playwright com dados de produto simulados (mesma técnica das seções 12/anteriores — cache do React Query populado diretamente, contornando a limitação de rede do Chromium headless): o cálculo reativo de subtotal por item com desconto e o total da venda foram conferidos (ex.: 2 un. a R$150 com 10% de desconto + 1 un. a R$150 sem desconto = R$420,00, valor exibido confere); a checagem de estoque agregado por produto foi exercida diretamente — duas linhas do mesmo produto somando 4 unidades contra um estoque de 3 mantém o botão "Concluir Venda" desabilitado, e corrigir para 3 unidades habilita o botão novamente.
- **RF07 — correção pós-revisão da PR #4 (seção 14), validação feita nesta sessão**: `pg_get_functiondef()` confirmou que a nova versão de `confirm_sale()` contém a checagem de `discount_percent` e o `status = 'concluida'` explícito no insert; `security definer` seguiu confirmado (`prosecdef = true`) após o `create or replace`. A lógica da condição (`< 0 or > 100`) foi conferida isoladamente com valores de teste (-5, 150, 10) — nenhum falso positivo/negativo. O default pré-existente de `sales.status` foi confirmado via `information_schema.columns` (`column_default = 'concluida'::sale_status`) antes de decidir que nenhum `alter table` era necessário. **Não testado nesta sessão** (e continua como pendência aberta, não é algo a resolver em código): o `raise exception` de desconto inválido — assim como o de estoque insuficiente, já registrado no risco de RF07 acima — sendo de fato acionado por uma chamada real ao RPC autenticada; `auth.uid()` não está disponível para uma chamada direta via SQL fora de uma sessão de usuário autenticado, então a checagem só pôde ser validada isoladamente (mesma limitação de rede do Chromium headless já registrada). Recomenda-se testar uma venda completa no preview da Lovable — incluindo desconto fora da faixa e estoque insuficiente disparando os `raise exception` do banco — antes de considerar o RF07 encerrado.
