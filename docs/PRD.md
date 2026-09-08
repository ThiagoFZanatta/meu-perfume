# PRD — Sistema de Controle de Compra e Venda de Perfumes

**Versão:** 1.1
**Data:** Setembro/2026
**Changelog v1.1:** adicionado a RF03/Tela 5 o recálculo do preço de venda sugerido quando o markup de um produto já comprado é editado (com confirmação do master antes de salvar), fechando um gap identificado em uso real — antes, editar o markup só valia para a próxima compra.
**Stack alvo:** Lovable (frontend/lógica) → Supabase (dados/auth) → IA (funcionalidades inteligentes, futuro) → Claude Code/GitHub (customizações)

---

## 1. Visão Geral e Problema

Hoje o controle de compra e venda de perfumes é feito em **planilha manual**, sem automação de cálculo de custo (compra em dólar, câmbio do dia, frete), sem visibilidade clara de giro de estoque, e sem separação de acesso entre o dono do negócio e os vendedores.

Isso gera três dores centrais:

1. **Falta de controle de custo real** — o custo em reais de cada perfume depende de uma taxa de câmbio manual que varia a cada compra, e hoje isso não é calculado de forma confiável e automática.
2. **Falta de visibilidade de giro de estoque** — não há forma fácil de saber quais produtos estão parados, quais vendem mais, e quando é o momento certo de comprar de novo.
3. **Falta de controle financeiro consolidado** — vendas, custos, comissões e despesas não são cruzados para gerar uma visão de resultado (DRE) e de caixa.

O sistema proposto substitui a planilha por uma ferramenta web (responsiva, uso em celular e computador) com dois perfis de acesso, que automatiza os cálculos de custo/preço, controla estoque em tempo real, registra vendas e encomendas, e (em uma segunda fase) gera relatórios financeiros (DRE e fluxo de caixa).

---

## 2. Público-Alvo / Personas

### Persona 1 — Dono/Master (usuário primário)
- Administra o negócio integralmente: compras, precificação, custos, relatórios financeiros.
- Acessa tanto pelo celular quanto pelo computador.
- Precisa decidir **quando comprar**, **quanto vender** e **quais descontos dar**, com base em dados, não em intuição.
- Pode criar outros usuários master (ex: um sócio) com poderes idênticos.

### Persona 2 — Vendedor
- Acesso restrito: vê apenas quantidade em estoque e preço final de venda (sem custo, sem margem).
- Registra vendas no momento em que acontecem (mini-PDV).
- Cadastra encomendas quando um cliente pede um produto que não está disponível.
- Acessa principalmente durante o expediente na loja física.

### Persona 3 — Cliente final (não acessa o sistema)
- Compra na loja física, em espécie, débito, ou crédito (à vista ou parcelado).
- Pode fazer encomendas de produtos fora de estoque.

---

## 3. Proposta de Valor e Diferenciais

- **Custo real automatizado**: cálculo automático de custo unitário e total em reais a partir do preço em dólar, câmbio do dia e frete — elimina erro manual de planilha.
- **Controle de acesso por papel**: vendedor nunca vê custo/margem, apenas o necessário para vender.
- **Visão de giro de estoque**: relatórios que respondem diretamente à pergunta "o que comprar de novo e quando".
- **Fluxo de encomenda**: transforma demanda não atendida em informação de decisão de compra.
- **Evolução para controle financeiro completo**: DRE e fluxo de caixa alimentados pelos mesmos dados operacionais, sem retrabalho.

---

## 4. Objetivos e Métricas de Sucesso (KPIs)

| Objetivo | Métrica |
|---|---|
| Eliminar a planilha manual | 100% das compras e vendas registradas no sistema após 30 dias de uso |
| Melhorar decisão de compra | Redução do tempo gasto analisando o que comprar (indicador qualitativo, via feedback do dono) |
| Reduzir estoque parado | Nº de produtos "sem giro há mais de X dias" identificados e tratados mensalmente |
| Precisão de custo | 0 divergências entre custo calculado pelo sistema e conferência manual do dono |
| Controle de comissão | 100% das vendas com comissão calculada automaticamente, sem cálculo manual |

---

## 5. Escopo (MVP vs. Futuro) — MoSCoW

### 🟢 Must Have — V1 (MVP)
- Autenticação com 2 perfis (master e vendedor); master pode criar outro master
- Cadastro de produtos: nome, marca, gênero, ml, imagem, markup, descrição (cada ml = produto/SKU separado); possibilidade de inativar um produto sem apagar histórico
- Módulo de Compras: data, quantidade, preço unitário em USD, taxa de câmbio (manual), frete/logística (rateado por quantidade) → cálculo automático de custo unitário e total em BRL, com sugestão de preço de venda por markup
- Estoque: atualização automática (compra soma, venda subtrai), alerta quando restar 1 unidade, visão restrita para vendedor (qtd + preço final) vs. visão completa para master (custo, margem)
- Precificação: campo de % desconto informado por produto na venda + comissão fixa configurável → cálculo do preço final
- Módulo de Vendas: vendedor registra venda (produto(s), forma de pagamento, desconto por item, vendedor responsável) → baixa estoque
- Correção e estorno de lançamentos: edição/exclusão de compra ou venda (vendedor até 2h após o lançamento; master sem limite de tempo)
- Devolução de venda: repõe estoque e ajusta comissão proporcionalmente
- Módulo de Encomendas: cadastro (cliente, contato, produto desejado, observação), lista de pedidos em aberto, marcar como atendido
- Relatórios de giro: produtos parados (30 dias sem venda, ou 30 dias desde a compra se nunca vendido), mais vendidos, alta/baixa rotatividade
- Gestão de usuários (criar vendedor, criar outro master)

### 🟡 Should Have — Fase 2
- Módulo Financeiro: lançamento de despesas gerais (aluguel, taxa de máquina, outras)
- DRE mensal + período customizado
- Fluxo de caixa (razão de caixa)

### 🔵 Could Have — Futuro
- Cadastro de nome/contato do cliente na venda
- Limite mínimo de estoque configurável por produto (hoje fixo em 1 para todos)
- Integrações de IA (ver seção 10)

### ⚪ Won't Have (por enquanto)
- Automação de câmbio via API (câmbio é manual, por decisão do dono)
- Rastreio de número de parcelas no cartão de crédito
- Cálculo de impostos na DRE

---

## 6. Fluxos de Usuário (compatível com geração de UI no Lovable)

> Ordem lógica de construção: **Autenticação → Core Flow (Produto/Compra/Estoque/Venda) → Correção/Devolução → Encomendas → Relatórios → Gestão de Usuários → Estados de erro/vazio**

---

### Tela 1 — Login

**Contexto do produto:** Sistema interno de controle de compra e venda de perfumes, usado por 1-2 usuários master e 2 vendedores, em loja física, via celular e computador.

**Objetivo da tela:** Autenticar o usuário e direcioná-lo para a home correspondente ao seu papel (master ou vendedor).

**Elementos e hierarquia:**
1. Campo de e-mail (principal)
2. Campo de senha (principal)
3. Botão "Entrar" (ação principal)
4. Link "Esqueci minha senha" (ação secundária)

**Comportamento esperado:**
- Login via Supabase Auth (e-mail/senha).
- Após login, o sistema verifica o papel (`role`) do usuário no banco (`profiles`) e redireciona: master → Dashboard Master; vendedor → Dashboard Vendedor.
- Não há autocadastro público — novos usuários só são criados por um master (ver Tela 11).

**Estados:**
- Vazio: campos em branco, botão "Entrar" desabilitado até preenchimento.
- Erro: credenciais inválidas → mensagem clara "E-mail ou senha incorretos".
- Carregando: spinner no botão durante autenticação.
- Sucesso: redirecionamento automático para a home do papel correspondente.

**Identidade visual:** Definida na seção 14 — Identidade Visual. É a tela onde a marca aparece com mais força: uso pleno da tipografia display e dos accents `wine`/`amber`.

---

### Tela 2 — Dashboard Master (Home)

**Contexto do produto:** Visão geral do negócio para o dono, primeira tela após login.

**Objetivo da tela:** Dar ao master uma visão rápida de estoque, giro e alertas, orientando a decisão do dia (vender, comprar, repor).

**Elementos e hierarquia:**
1. Cards de resumo (topo, alta prioridade): total de produtos em estoque, produtos com alerta de estoque baixo (≤1 unidade), vendas do dia/mês
2. Atalho para "Registrar Compra" (ação principal)
3. Atalho para "Registrar Venda" (ação secundária, ainda que normalmente feito pelo vendedor)
4. Lista resumida de produtos parados (sem venda há mais tempo)
5. Lista resumida de encomendas em aberto
6. Menu de navegação lateral/inferior: Catálogo, Compras, Estoque, Vendas, Encomendas, Relatórios, Usuários

**Comportamento esperado:**
- Todos os dados exibidos vêm de queries em tempo real no Supabase (sem custo/margem escondidos — master vê tudo).
- Cliques nos cards levam às telas de detalhe correspondentes.

**Estados:**
- Vazio (novo negócio, sem dados): mensagem "Nenhuma compra registrada ainda" com call-to-action para cadastrar o primeiro produto/compra.
- Carregando: skeleton nos cards.
- Erro: mensagem de falha ao carregar dados, com botão de tentar novamente.

**Identidade visual:** Definida na seção 14 — Identidade Visual (mesma linha da Tela 1).

---

### Tela 3 — Dashboard Vendedor (Home)

**Contexto do produto:** Home simplificada, uso rápido durante o atendimento ao cliente na loja.

**Objetivo da tela:** Permitir ao vendedor consultar estoque disponível e preço de venda, e acessar rapidamente "Registrar Venda" e "Cadastrar Encomenda".

**Elementos e hierarquia:**
1. Botão grande "Registrar Venda" (ação principal, destaque visual)
2. Botão "Cadastrar Encomenda" (ação secundária)
3. Lista/busca de produtos com quantidade em estoque e preço final (sem custo, sem margem)
4. Indicador visual (badge) de produtos com estoque baixo

**Comportamento esperado:**
- Busca por nome/marca do produto, com filtro instantâneo.
- Vendedor não tem acesso a menus de Compras, Relatórios financeiros ou Usuários.

**Estados:**
- Vazio: "Nenhum produto cadastrado ainda" (não deve ocorrer em produção, mas previsto).
- Carregando: skeleton na lista.
- Erro: mensagem de falha ao carregar estoque.

**Identidade visual:** Definida na seção 14 — Identidade Visual; interface deve ser ainda mais simples e rápida de usar que a do master, priorizando toque em celular.

---

### Tela 4 — Catálogo de Produtos (Master)

**Contexto do produto:** Lista completa de produtos cadastrados, visão administrativa.

**Objetivo da tela:** Permitir ao master visualizar, buscar, editar e cadastrar produtos.

**Elementos e hierarquia:**
1. Botão "Novo Produto" (ação principal, topo)
2. Busca/filtro por nome, marca, gênero, e status (ativo/inativo) (alta prioridade)
3. Lista/grade de produtos: imagem, nome, marca, ml, quantidade em estoque, custo unitário, preço de venda final (nesta ordem de importância)
4. Ação de editar por produto (ícone/botão secundário)

**Comportamento esperado:**
- Clique em um produto abre a tela de edição (Tela 5) pré-preenchida.
- Ordenação padrão sugerida: produtos com estoque baixo primeiro.
- Por padrão, exibe apenas produtos ativos; um filtro permite ver também os inativados (com indicação visual clara de que estão fora de venda).

**Estados:**
- Vazio: "Nenhum produto cadastrado" + call-to-action para criar o primeiro.
- Carregando: skeleton na grade/lista.
- Erro: mensagem de falha ao carregar catálogo.

**Identidade visual:** Definida na seção 14 — Identidade Visual; grade com imagens em destaque, já que o catálogo visual é um requisito explícito do dono do negócio.

---

### Tela 5 — Cadastro/Edição de Produto (Master)

**Contexto do produto:** Formulário de cadastro do "catálogo" de perfumes.

**Objetivo da tela:** Cadastrar ou editar um produto com todas as informações necessárias para estoque, precificação e identificação visual.

**Elementos e hierarquia:**
1. Upload de imagem do produto (alta prioridade visual)
2. Nome do produto (obrigatório)
3. Marca (obrigatório)
4. Gênero: masculino / feminino / unissex (obrigatório)
5. ML (obrigatório — cada ml é um produto/SKU distinto)
6. Markup (%) sobre o custo (obrigatório, configurável por produto — usado para sugerir o preço de venda a cada compra)
7. **Novo preço de venda sugerido** (somente na edição, e somente se o produto já possuir `current_unit_cost_brl` definido — ou seja, já teve ao menos uma compra): campo somente-leitura recalculado em tempo real conforme o markup digitado (`current_unit_cost_brl × (1 + markup_%)`), com campo editável ao lado para o master aceitar a sugestão ou ajustar manualmente antes de salvar — mesmo padrão da Tela 6
8. Descrição (opcional)
9. Toggle "Produto ativo" (visível apenas na edição, não no cadastro — todo produto novo nasce ativo)
10. Botão "Salvar" (ação principal)

**Comportamento esperado:**
- Custo e preço de venda final **não** são definidos aqui a partir do zero — o custo vem do módulo de Compras (Tela 6), que também usa o markup cadastrado aqui para sugerir um preço de venda a cada nova compra (ver Tela 6). O desconto pontual continua sendo decidido na hora da venda.
- **Recálculo do preço sugerido ao editar o markup:** se o produto já tem `current_unit_cost_brl` definido, alterar o markup recalcula e exibe o novo preço de venda sugerido antes de salvar (elemento 7 acima). O master pode aceitar a sugestão ou digitar outro valor. Ao confirmar o salvamento, o valor final (sugerido ou ajustado) é gravado em `current_sale_price`, refletindo imediatamente no Catálogo (Tela 4) e no Estoque (Tela 7) — sem exigir uma nova compra. Se o produto nunca teve compra (`current_unit_cost_brl is null`), a edição do markup não recalcula nada, pois não há custo para basear uma sugestão.
- Ao inativar um produto, ele deixa de aparecer nas telas de Venda e no Estoque do vendedor, mas seu histórico de compras/vendas continua acessível ao master (Catálogo, Relatórios).
- Imagem enviada para Supabase Storage; produto salvo na tabela `products`.
- Validação: nome, marca, gênero, ml e markup são obrigatórios antes de salvar.

**Estados:**
- Vazio (novo produto): formulário em branco.
- Erro: campos obrigatórios não preenchidos → destaque em vermelho com mensagem.
- Carregando: botão "Salvar" com spinner durante upload da imagem.
- Sucesso: confirmação visual + retorno ao Catálogo (Tela 4); se o preço sugerido foi recalculado, a confirmação deixa claro que o preço de venda do produto foi atualizado.

**Identidade visual:** Definida na seção 14 — Identidade Visual.

---

### Tela 6 — Registrar Compra (Master)

**Contexto do produto:** Ponto de entrada de estoque e de custo — tela mais crítica para a precisão financeira do sistema.

**Objetivo da tela:** Registrar uma compra de um ou mais produtos, calculando automaticamente custo unitário e total em reais.

**Elementos e hierarquia:**
1. Data da compra (obrigatório)
2. Seleção de produto(s) e quantidade comprada de cada (obrigatório)
3. Preço unitário em USD por produto (obrigatório)
4. Taxa de câmbio do dia (informada manualmente pelo master, obrigatório)
5. Gastos com frete/logística (valor total da compra, opcional mas recomendado)
6. Cálculo automático (somente leitura): custo unitário em BRL por produto, custo total da compra em BRL
7. **Preço de venda sugerido por produto** (somente leitura, calculado como custo unitário × markup cadastrado no produto), com campo editável ao lado para o master confirmar ou ajustar manualmente antes de salvar
8. Botão "Confirmar Compra" (ação principal)

**Comportamento esperado:**
- Fórmula de custo: `custo_unitário_BRL = (preço_unitário_USD × taxa_câmbio) + frete_por_unidade`.
- **Rateio de frete: por quantidade.** O frete total informado na compra é dividido igualmente pelo total de unidades da compra (somando todos os produtos daquela nota), não proporcionalmente ao valor de cada item: `frete_por_unidade = frete_total ÷ quantidade_total_de_itens_da_compra`.
- **Preço sugerido:** para cada produto da compra, o sistema calcula `preço_sugerido = custo_unitário_BRL × (1 + markup_%_do_produto)` e exibe como sugestão. O master pode aceitar ou digitar um valor diferente (ex: baseado em pesquisa de preço na internet) antes de confirmar — o valor final escolhido é o que passa a valer como `current_sale_price` do produto para todas as vendas seguintes, inclusive sobre unidades que ainda restarem de um lote anterior.
- Ao confirmar, o sistema soma a quantidade comprada ao estoque do produto, atualiza o custo unitário vigente (`current_unit_cost_brl`) e o preço de venda vigente (`current_sale_price`) conforme definido no passo anterior.
- Permite adicionar múltiplos produtos na mesma compra (ex: comprou 3 perfumes diferentes do mesmo fornecedor no mesmo pedido).

**Estados:**
- Vazio: formulário em branco, nenhum produto adicionado ainda.
- Erro: taxa de câmbio ou preço não numérico → validação inline.
- Carregando: spinner ao confirmar.
- Sucesso: confirmação + resumo da compra + atualização do estoque e dos preços visível imediatamente.

**Identidade visual:** Definida na seção 14 — Identidade Visual; tela mais "operacional", layout tipo tabela/planilha para múltiplos itens, com colunas numéricas alinhadas à direita.

---

### Tela 7 — Estoque (visão Vendedor / visão Master)

**Contexto do produto:** Consulta de estoque disponível, com visão diferente por papel.

**Objetivo da tela:** Vendedor consulta quantidade e preço de venda; master consulta tudo (inclui custo e margem).

**Elementos e hierarquia:**
- **Vendedor:** nome do produto, imagem, ml, quantidade disponível, preço de venda final (nesta ordem).
- **Master:** os mesmos campos + custo unitário, margem, data da última compra.

**Comportamento esperado:**
- Mesma base de dados (`products` + estoque calculado), mas colunas exibidas variam por `role` (Row Level Security / lógica de exibição no frontend).
- Busca/filtro por nome ou marca.
- Badge visual para estoque baixo (≤1 unidade).

**Estados:**
- Vazio: "Nenhum produto em estoque".
- Carregando: skeleton na lista.
- Erro: falha ao carregar dados.

**Identidade visual:** Definida na seção 14 — Identidade Visual.

---

### Tela 8 — Registrar Venda (Vendedor)

**Contexto do produto:** Mini-PDV usado no momento exato da venda, na loja física.

**Objetivo da tela:** Registrar uma venda de forma rápida, vinculando produto, vendedor, forma de pagamento e desconto (se houver).

**Elementos e hierarquia:**
1. Seleção do(s) produto(s) vendido(s) e quantidade (ação principal)
2. Para cada produto adicionado: preço de venda (pré-preenchido com o `current_sale_price` do produto) + campo de desconto (%) pontual, aplicado individualmente àquele item
3. Forma de pagamento: espécie / débito / crédito à vista / crédito parcelado (obrigatório, sem detalhar nº de parcelas)
4. Vendedor responsável (preenchido automaticamente pelo usuário logado)
5. Botão "Concluir Venda" (ação principal)

**Comportamento esperado:**
- O desconto é aplicado **por produto/item**, não sobre o total da venda — cada produto no carrinho pode ter um percentual de desconto diferente (ex: 10% num perfume parado, 0% em outro).
- Ao aplicar desconto num item, o sistema recalcula o subtotal daquele item e o total da venda em tempo real.
- Comissão do vendedor é calculada automaticamente sobre o valor final da venda, já somando todos os itens após seus respectivos descontos (percentual fixo configurado pelo master), mas **não é exibida** ao vendedor nesta tela (informação sensível de custo/negócio).
- Ao confirmar, o sistema subtrai a quantidade vendida do estoque de cada produto.
- Suporta venda de múltiplos produtos na mesma transação.
- **Correção:** o vendedor pode editar ou excluir a venda em até 2 horas após concluí-la; passado esse prazo, apenas o master pode corrigi-la (ver RF13).

**Estados:**
- Vazio: nenhum produto selecionado ainda, botão "Concluir Venda" desabilitado.
- Erro: quantidade solicitada maior que o estoque disponível → bloqueio com mensagem clara.
- Carregando: spinner ao confirmar.
- Sucesso: confirmação visual + opção de "Nova Venda".

**Identidade visual:** Definida na seção 14 — Identidade Visual; interface deve ser extremamente rápida e simples (poucos toques), pensada para uso no balcão.

---

### Tela 9 — Encomendas (Lista + Cadastro)

**Contexto do produto:** Registro de demanda não atendida, usado pelo vendedor quando o cliente pede algo fora de estoque.

**Objetivo da tela:** Cadastrar um pedido de encomenda e permitir consulta/gestão dos pedidos em aberto.

**Elementos e hierarquia (Cadastro):**
1. Nome do cliente (obrigatório)
2. Contato/telefone (obrigatório)
3. Produto desejado (texto livre ou seleção do catálogo, caso já exista produto similar cadastrado)
4. Observação (opcional)
5. Botão "Salvar Encomenda"

**Elementos e hierarquia (Lista, acessível a master e vendedor):**
1. Lista de pedidos em aberto (nome, contato, produto, data do pedido)
2. Ação "Marcar como atendido" por item

**Comportamento esperado:**
- Pedidos "atendidos" saem da lista principal, mas ficam no histórico (não são excluídos).
- Master consulta essa lista antes de decidir uma nova compra (informação de demanda real).

**Estados:**
- Vazio: "Nenhuma encomenda em aberto".
- Erro: campos obrigatórios não preenchidos.
- Carregando: spinner ao salvar.
- Sucesso: confirmação + retorno à lista.

**Identidade visual:** Definida na seção 14 — Identidade Visual.

---

### Tela 10 — Relatórios de Giro de Estoque (Master)

**Contexto do produto:** Ferramenta de decisão — responde "o que comprar e quando".

**Objetivo da tela:** Mostrar produtos parados, mais vendidos e rotatividade, para orientar a próxima compra.

**Elementos e hierarquia:**
1. Filtro de período (padrão: últimos 30 dias, customizável)
2. Lista "Produtos parados" (sem venda há mais tempo, ordenado do mais parado ao menos parado)
3. Lista "Mais vendidos" (ordenado por quantidade vendida no período)
4. Indicador de giro por produto (ex: unidades vendidas ÷ tempo em estoque)

**Comportamento esperado:**
- Dados calculados a partir do histórico de `sales` e `purchases`.
- Sem dados históricos anteriores ao sistema (relatório começa a fazer sentido após algumas semanas de uso — ver seção de Riscos).

**Estados:**
- Vazio: "Ainda não há dados suficientes para gerar este relatório" (comum nos primeiros dias de uso).
- Carregando: skeleton nas listas.
- Erro: falha ao processar relatório.

**Identidade visual:** Definida na seção 14 — Identidade Visual; gráficos de barra (ver 14.5) para "mais vendidos", lista simples para "parados".

---

### Tela 11 — Gestão de Usuários (Master)

**Contexto do produto:** Administração de acesso ao sistema.

**Objetivo da tela:** Permitir ao master criar vendedores e outros usuários master.

**Elementos e hierarquia:**
1. Botão "Novo Usuário" (ação principal)
2. Formulário: nome, e-mail, papel (master ou vendedor)
3. Lista de usuários existentes com papel indicado

**Comportamento esperado:**
- Apenas usuários com papel `master` acessam esta tela.
- Novo usuário master criado aqui recebe poderes idênticos ao criador (sem hierarquia adicional).
- Envio de convite/senha inicial via Supabase Auth (e-mail de confirmação).

**Estados:**
- Vazio: apenas o usuário master atual listado.
- Erro: e-mail já cadastrado, ou campos obrigatórios ausentes.
- Carregando: spinner ao criar usuário.
- Sucesso: novo usuário aparece na lista.

**Identidade visual:** Definida na seção 14 — Identidade Visual.

---

### Tela 12 — Devolução de Venda (Master)

**Contexto do produto:** Cliente devolve um produto comprado (arrependimento, produto com defeito, etc.).

**Objetivo da tela:** Registrar a devolução de um ou mais itens de uma venda já concluída, repondo o estoque e ajustando a comissão do vendedor proporcionalmente.

**Elementos e hierarquia:**
1. Busca da venda original (por vendedor, data ou produto)
2. Seleção do(s) item(ns) da venda a devolver e quantidade devolvida (ação principal)
3. Motivo da devolução (opcional, texto livre)
4. Resumo do impacto: valor a estornar, ajuste de comissão
5. Botão "Confirmar Devolução" (ação principal)

**Comportamento esperado:**
- Ao confirmar, o sistema repõe a quantidade devolvida ao estoque do produto correspondente.
- O valor da venda e a comissão do vendedor são recalculados proporcionalmente à quantidade devolvida (ex: devolveu metade dos itens, estorna metade da comissão daquela venda).
- A devolução fica registrada com histórico (o que foi devolvido, quando, por quem) — a venda original não é apagada, apenas ajustada/marcada como parcialmente ou totalmente devolvida.
- Master pode registrar devolução de qualquer venda, de qualquer vendedor. Vendedores não têm acesso a esta tela.

**Estados:**
- Vazio: nenhuma venda selecionada ainda.
- Erro: quantidade a devolver maior que a quantidade originalmente vendida naquele item.
- Carregando: spinner ao confirmar.
- Sucesso: confirmação visual + estoque e comissão atualizados imediatamente.

**Identidade visual:** Definida na seção 14 — Identidade Visual.

---

### Telas — Fase 2 (Should Have, não detalhadas em profundidade nesta versão)

- **Lançamento de Despesas** (aluguel, taxa de máquina, outras) — formulário simples com categoria, valor, data, descrição.
- **DRE** — tela de relatório com filtro de período (mensal/customizado), mostrando: receita de vendas, custo da mercadoria vendida, comissões, despesas gerais, resultado líquido.
- **Fluxo de Caixa** — extrato cronológico de entradas (vendas) e saídas (compras, despesas), com saldo acumulado.

---

## 7. Requisitos Funcionais (por feature, com critérios de aceite)

### RF01 — Autenticação e Perfis
- O sistema deve autenticar usuários via e-mail/senha (Supabase Auth).
- **Critério de aceite:** usuário não autenticado não acessa nenhuma tela além do login; após login, é redirecionado conforme seu papel (`master` ou `vendedor`).

### RF02 — Gestão de Usuários
- Master pode criar novos usuários com papel `vendedor` ou `master`.
- **Critério de aceite:** um usuário `vendedor` não consegue acessar a tela de Gestão de Usuários, Compras ou Relatórios; tentativa de acesso direto via URL deve ser bloqueada (RLS no Supabase).

### RF03 — Cadastro de Produtos
- Master pode criar, editar e visualizar produtos com nome, marca, gênero, ml, imagem, markup (%) e descrição.
- Master pode inativar um produto (ex: descontinuado pelo fornecedor); produto inativo some das telas de venda e do catálogo do vendedor, mas seu histórico de compras/vendas permanece intacto e consultável pelo master.
- **Recálculo do preço sugerido ao editar markup:** se o produto editado já possui `current_unit_cost_brl` definido (já teve ao menos uma compra), o sistema calcula e exibe o novo preço de venda sugerido (`current_unit_cost_brl × (1 + novo markup)`) antes de salvar, em campo editável — o master aceita a sugestão ou ajusta manualmente. Se não houver `current_unit_cost_brl` (produto nunca comprado), nenhum recálculo é disparado.
- **Critério de aceite:** produto não pode ser salvo sem nome, marca, gênero, ml e markup preenchidos; um produto inativado não aparece para seleção em novas vendas, mas continua aparecendo em relatórios e históricos; ao editar o markup de um produto com custo vigente definido, o `current_sale_price` gravado ao salvar reflete o valor confirmado (sugerido ou ajustado) pelo master, visível imediatamente no Catálogo.

### RF04 — Registro de Compras
- Master registra compras informando data, produto(s), quantidade, preço unitário USD, taxa de câmbio e frete.
- O frete é rateado **por quantidade**: dividido igualmente entre o total de unidades da compra (`frete_por_unidade = frete_total ÷ quantidade_total_de_itens_da_compra`), independente do valor de cada produto.
- Para cada produto, o sistema calcula um preço de venda sugerido (`custo_unitário_BRL × markup do produto`), que o master pode aceitar ou ajustar manualmente antes de confirmar.
- **Critério de aceite:** ao confirmar a compra, o sistema calcula e armazena o custo unitário (com frete rateado por quantidade) e total em BRL, soma a quantidade ao estoque do produto correspondente, e atualiza o `current_sale_price` do produto com o valor confirmado pelo master (sugerido ou ajustado).

### RF05 — Controle de Estoque
- O sistema mantém a quantidade em estoque atualizada automaticamente a partir de compras (soma) e vendas (subtrai).
- **Critério de aceite:** quando o estoque de um produto chegar a 1 unidade, um alerta visual deve aparecer no Dashboard Master.

### RF06 — Precificação e Comissão
- Cada produto tem um markup (%) configurável individualmente, usado para sugerir o preço de venda a cada compra (ver RF04).
- Master configura o percentual de comissão fixo do vendedor (único para todos os vendedores e produtos).
- Na venda, é possível informar um percentual de desconto pontual **por produto/item** (não sobre o total da venda), que recalcula o subtotal daquele item a partir do `current_sale_price` vigente do produto.
- **Critério de aceite:** o valor de comissão é calculado automaticamente com base no percentual configurado e na soma dos subtotais de todos os itens da venda (cada um já com seu próprio desconto aplicado); o preço de venda vigente de um produto é sempre único (não há dois preços simultâneos para o mesmo produto, mesmo com estoque de lotes de compra diferentes).

### RF07 — Registro de Vendas
- Vendedor registra venda com produto(s), quantidade, forma de pagamento e desconto por item (se houver).
- **Critério de aceite:** venda não pode ser concluída se a quantidade solicitada de algum item for maior que o estoque disponível daquele produto; ao concluir, o estoque de cada item é atualizado imediatamente.

### RF08 — Encomendas
- Vendedor cadastra encomendas com nome do cliente, contato, produto desejado e observação.
- Master e vendedor podem marcar uma encomenda como "atendida".
- **Critério de aceite:** encomendas atendidas saem da lista de "em aberto" mas permanecem no histórico.

### RF09 — Relatórios de Giro de Estoque
- Sistema exibe produtos parados e mais vendidos em um período selecionável.
- Um produto é considerado **"parado"** quando não tem venda registrada há 30 dias ou mais; se o produto nunca teve nenhuma venda, a contagem dos 30 dias começa a partir da data da sua última compra (entrada em estoque).
- **Critério de aceite:** relatório reflete corretamente vendas e compras dentro do período filtrado; a lista de "produtos parados" aplica exatamente a regra de 30 dias acima, com a data de referência correta (última venda, ou última compra na ausência de vendas).

### RF10 — Controle de Acesso por Papel (visão de dados)
- Vendedor nunca visualiza custo unitário, margem ou percentual de comissão.
- **Critério de aceite:** testes de acesso direto a dados via API (Supabase) confirmam que RLS bloqueia consultas de campos restritos para o papel `vendedor`.

### RF11 (Fase 2) — Despesas Gerais
- Master lança despesas (aluguel, taxa de máquina, outras) com valor, categoria e data.

### RF12 (Fase 2) — DRE e Fluxo de Caixa
- Sistema consolida vendas, CMV (custo da mercadoria vendida), comissões e despesas em um relatório de DRE mensal ou por período customizado.
- Sistema exibe fluxo de caixa cronológico (entradas e saídas).
- **Método de custeio do CMV:** para reduzir a distorção causada por variação cambial entre compras, o CMV é calculado por **custo médio ponderado acumulado até o fim do período selecionado** (não pelo custo do lote mais recente, usado apenas para precificação no RF04/RF06, e não restrito apenas às compras feitas dentro do período filtrado): `custo_médio_do_produto = Σ(quantidade_do_lote × custo_unitário_do_lote) ÷ quantidade_total_comprada`, considerando **todas as compras daquele produto desde o início até a data final do período filtrado** (compras posteriores ao período nunca entram no cálculo). Essa média é então aplicada à quantidade líquida vendida do produto **dentro do período** (`quantidade vendida − devolvida`). Se um produto for vendido antes de qualquer compra registrada dele, o CMV daquele item fica indefinido (mesmo tratamento do alerta "produtos sem preço de referência" já usado no RF04/RF09).
- **Critério de garantia de estabilidade:** o CMV de um período já fechado não deve mudar ao gerar o relatório novamente no futuro — compras registradas depois do fim do período nunca entram na média usada para aquele período.
- **Critério de aceite:** o CMV apurado no período reflete o custo médio ponderado acumulado de todas as compras do produto até o fim do período filtrado (não apenas as compras feitas dentro do período, e não incluindo compras futuras), aplicado à quantidade líquida vendida no período; regerar o relatório de um período já fechado produz o mesmo resultado, independentemente de compras registradas depois.

### RF13 — Correção e Estorno de Lançamentos
- Um usuário `vendedor` pode editar ou excluir uma compra ou venda **que ele mesmo registrou**, dentro de até **2 horas** após o lançamento original.
- Um usuário `master` pode editar ou excluir **qualquer** compra ou venda, de qualquer usuário, **sem limite de tempo**.
- Passadas as 2 horas, uma tentativa de edição/exclusão por parte do vendedor deve ser bloqueada, com mensagem indicando que a correção agora só pode ser feita por um master.
- Qualquer edição ou exclusão deve reverter corretamente o impacto no estoque e nos valores calculados (custo, total, comissão) — não pode deixar resíduo da versão anterior do lançamento.
- **Critério de aceite:** uma exclusão de venda repõe a quantidade ao estoque; uma exclusão de compra remove a quantidade do estoque (bloqueando a operação se isso deixar o estoque negativo); testes de acesso confirmam que um vendedor não consegue editar/excluir lançamentos após a janela de 2 horas, nem lançamentos de outro usuário.

### RF14 — Devolução de Venda
- Master pode registrar a devolução de um ou mais itens de uma venda já concluída (Tela 12); vendedores não têm acesso a essa funcionalidade.
- A devolução repõe a quantidade devolvida ao estoque do produto correspondente.
- A comissão do vendedor referente àquela venda é recalculada proporcionalmente à quantidade devolvida.
- A venda original não é apagada — fica marcada como parcial ou totalmente devolvida, preservando o histórico.
- **Critério de aceite:** após uma devolução, o estoque do produto reflete a quantidade devolvida; o valor total da venda e a comissão do vendedor são reduzidos na mesma proporção da devolução; a devolução não pode exceder a quantidade originalmente vendida naquele item.

---

## 8. Requisitos Não-Funcionais

- **Responsividade:** interface deve funcionar bem tanto em celular quanto em desktop (uso híbrido confirmado pelo dono do negócio).
- **Segurança e controle de acesso:** uso de Row Level Security (RLS) no Supabase para garantir que vendedores não acessem dados restritos, mesmo via chamadas diretas à API.
- **LGPD:** dados de clientes coletados no módulo de Encomendas (nome e contato) são dados pessoais. Recomenda-se: (a) coletar apenas o mínimo necessário (já é o caso), (b) ter uma política de privacidade simples informando o uso desses dados, (c) permitir exclusão de um registro de encomenda a pedido do cliente.
- **Performance:** volume atual é pequeno (≈20 produtos, até 50 vendas/mês), portanto não há requisitos especiais de escala no MVP — mas o modelo de dados deve ser capaz de crescer sem retrabalho estrutural.
- **Disponibilidade:** sistema de uso diário na loja; indisponibilidade deve ser rara (SLA informal, dependente da infraestrutura Supabase/Lovable).
- **Backup:** backup automático do banco (recurso nativo do Supabase) deve estar habilitado.
- **Auditoria mínima:** toda compra e venda deve registrar automaticamente o usuário responsável e o timestamp (`created_by`, `created_at`).

---

## 9. Modelo de Dados de Alto Nível (Supabase / PostgreSQL)

> Modelo simplificado, pensado para o porte atual do negócio (≈20 SKUs, 1 fornecedor, 2 vendedores). Sem tabela de variantes — cada ml é um produto (SKU) independente, conforme decisão validada.

**`profiles`**
- `id` (referência a `auth.users`)
- `name`
- `role` (`master` | `vendedor`)
- `created_at`

**`products`**
- `id`
- `name`
- `brand`
- `gender` (`masculino` | `feminino` | `unissex`)
- `ml`
- `description`
- `image_url`
- `stock_quantity` (atualizado via triggers/lógica de compra e venda)
- `markup_percent` (configurável por produto, usado para sugerir preço a cada compra)
- `current_unit_cost_brl` (atualizado a cada compra, já com frete rateado)
- `current_sale_price` (sugerido por custo × markup a cada compra, confirmado/ajustado pelo master)
- `active` (booleano, default `true` — produto inativado some das telas de venda, mas mantém histórico)
- `last_purchase_date` (usado para calcular "parado" quando o produto nunca foi vendido)
- `created_at`

**`purchases`**
- `id`
- `purchase_date`
- `exchange_rate`
- `freight_cost_brl`
- `total_cost_brl`
- `created_by` (referência a `profiles`)
- `created_at`
- `updated_at`, `updated_by` (preenchidos em caso de correção — ver RF13)

**`purchase_items`**
- `id`
- `purchase_id` (FK)
- `product_id` (FK)
- `quantity`
- `unit_price_usd`
- `unit_cost_brl` (calculado)
- `subtotal_brl` (calculado)

**`sales`**
- `id`
- `sale_date`
- `seller_id` (FK `profiles`)
- `payment_method` (`especie` | `debito` | `credito_avista` | `credito_parcelado`)
- `total_amount` (soma dos subtotais de `sale_items`, já com desconto por item aplicado)
- `commission_amount` (calculado sobre `total_amount`)
- `status` (`concluida` | `parcialmente_devolvida` | `totalmente_devolvida`)
- `created_at`
- `updated_at`, `updated_by` (preenchidos em caso de correção — ver RF13)

**`sale_items`**
- `id`
- `sale_id` (FK)
- `product_id` (FK)
- `quantity`
- `unit_sale_price`
- `discount_percent` (aplicado individualmente a este item, não à venda inteira)
- `subtotal` (calculado após desconto do item)
- `returned_quantity` (default 0, incrementado a cada devolução — ver `sale_returns`)

**`sale_returns`** (devoluções)
- `id`
- `sale_item_id` (FK)
- `quantity_returned`
- `reason` (texto livre, opcional)
- `created_by` (FK `profiles`)
- `created_at`

**`orders`** (encomendas)
- `id`
- `customer_name`
- `customer_contact`
- `desired_product` (texto livre ou FK opcional para `products`)
- `observation`
- `status` (`aberto` | `atendido`)
- `created_by` (FK `profiles`)
- `created_at`

**`settings`**
- `key` (ex: `default_commission_percent`, `low_stock_threshold`, `stale_product_days` [default 30], `edit_window_hours_seller` [default 2])
- `value`

**`expenses`** (Fase 2)
- `id`
- `expense_date`
- `category` (`aluguel` | `taxa_maquina` | `outras`)
- `description`
- `amount`
- `created_at`

---

## 10. Integrações de IA — Onde e Como (Futuro / Could Have)

Não há requisito explícito de IA para o MVP, mas o modelo de dados permite evoluções naturais em fases futuras:

- **Sugestão de reposição de estoque:** análise do histórico de vendas para sugerir quando e quanto comprar de cada produto (ex: via função de IA rodando sobre os dados de `sales` e `purchase_items`).
- **Resumo em linguagem natural da DRE:** ao final do mês, gerar um resumo textual automático ("Vendas cresceram X% em relação ao mês anterior, o produto mais vendido foi Y...").
- **Sugestão de desconto:** com base no tempo em estoque de um produto, sugerir um percentual de desconto razoável (o dono continua decidindo manualmente, a IA apenas sugere).

Implementação técnica sugerida: função Edge no Supabase chamando a API da Anthropic, disparada sob demanda (não em tempo real), para manter custo e complexidade baixos nesta fase.

---

## 11. Riscos, Premissas e Dependências

**Riscos:**
- Taxa de câmbio informada manualmente está sujeita a erro humano — recomenda-se validação simples (ex: alerta se a taxa estiver muito fora do range usual).
- Relatórios de giro de estoque só se tornam realmente úteis após algumas semanas de uso (não há dados históricos anteriores ao sistema).
- Dependência de um único fornecedor — fora do escopo do sistema, mas é um risco de negócio a ser monitorado.
- Vendedores com acesso ao mini-PDV podem gerar vendas sem supervisão direta; o controle de acesso (RLS) é a principal mitigação técnica, mas não substitui processos de gestão.
- **Precisão do CMV na Fase 2 (DRE):** o preço de venda praticado (RF04/RF06) usa o custo do lote de compra mais recente — simples e alinhado à forma como o dono decide preço. Já o CMV da DRE (RF12) usa custo médio ponderado **acumulado até o fim do período filtrado** das compras daquele produto — não todo o histórico até a data de geração do relatório — para que o resultado de um período já fechado não mude retroativamente quando novas compras forem registradas depois. É uma decisão isolada do cálculo contábil, não afeta o preço de venda praticado no dia a dia (RF04/RF06). São dois cálculos com propósitos diferentes, ambos alimentados pelos mesmos dados de `purchase_items` — não exigem mudança de estrutura, só duas fórmulas distintas sobre a mesma base.

**Premissas:**
- Volume de dados pequeno no curto/médio prazo (≈20 SKUs, até 50 vendas/mês), permitindo modelo de dados simples sem otimizações de escala.
- Câmbio será sempre informado manualmente, não há necessidade de integração com API de cotação no MVP.
- Vendas no cartão são tratadas como "à vista" para fins de fluxo de caixa, já que o saldo cai no dia seguinte.
- Não há necessidade de cálculo de impostos no MVP.
- Cada produto tem sempre um único preço de venda vigente; não há dois preços simultâneos para o mesmo produto por conta de lotes de compra diferentes (decisão validada com o dono do negócio).
- O custo usado para **definir o preço de venda** (RF04/RF06) e o custo usado para **apurar o CMV na DRE** (RF12) são calculados de formas diferentes por design: lote mais recente no primeiro caso, média ponderada no segundo. Isso não é uma inconsistência — são dois cálculos com finalidades distintas sobre a mesma base de dados (`purchase_items`).

**Dependências:**
- Conta Supabase configurada com Auth, Database e Storage (para imagens de produtos).
- Ambiente Lovable conectado ao Supabase para geração do frontend.

---

## 12. Roadmap Sugerido / Priorização

| Fase | Escopo | Observação |
|---|---|---|
| **V1 (MVP)** | Autenticação, Catálogo (com inativação), Compras, Estoque, Precificação, Vendas, Correção/estorno de lançamentos, Devolução de venda, Encomendas, Relatórios de giro, Gestão de usuários | Substitui a planilha e resolve as 3 dores centrais |
| **V1.1 (Fase 2)** | Despesas gerais, DRE, Fluxo de caixa | Depende de V1 estar em uso real por pelo menos algumas semanas, para gerar dados confiáveis |
| **V2 (Futuro)** | Cadastro de cliente na venda, limite de estoque configurável por produto, integrações de IA | Avaliar conforme necessidade real após uso do MVP |

---

## 13. Fluxo de Trabalho de Desenvolvimento e Validação

### 13.1 Stack de execução confirmado
- Lovable (projeto em branco) conectado ao **Lovable Cloud** (banco de dados nativo, baseado em Postgres/estilo Supabase) — cobre Auth, Database e Storage.
- Repositório no GitHub, versionando o código gerado.
- Construção incremental via **Claude Code**, com commit e push a cada trecho de trabalho.
- Este PRD como fonte única de verdade, trazido a cada nova sessão do Claude Code como ponto de partida.

### 13.2 Por que o PRD deve viajar com cada sessão
Sessões de código não retêm memória entre si; sem o PRD como contexto de entrada, cada sessão do Claude Code corre o risco de reinterpretar regras já validadas (ex: cálculo de custo, regras de comissão, visibilidade por papel). Recomendações práticas:
- Manter o PRD dentro do próprio repositório (ex: `/docs/PRD.md`), versionado junto do código, em vez de depender apenas de colar manualmente a cada sessão.
- Sempre que uma decisão de produto mudar durante a implementação (ex: uma regra de negócio que só ficou clara ao codificar), atualizar o PRD e commitar a alteração — o PRD passa a ser "documentação viva", não só planejamento inicial.

### 13.3 Validação do progresso: PROGRESSO.md + revisão de PR
As duas abordagens respondem perguntas diferentes — a recomendação é **usar as duas, não escolher uma**:

| | `PROGRESSO.md` (resumo gerado pelo Claude Code) | Revisão direta da PR (diff no GitHub) |
|---|---|---|
| O que mostra | O que foi feito e por quê, na visão do próprio Code | O código real, exatamente como foi implementado |
| Ponto forte | Rápido de ler; captura decisões e trade-offs tomados durante a implementação | Detecta divergências que um resumo pode esconder (ex: RLS mal configurado, campo calculado errado, regra simplificada sem aviso) |
| Risco | É uma autoavaliação — descreve a intenção, não garante o resultado real | Sem o "porquê", pode ser difícil avaliar decisões técnicas menores |
| Suficiente sozinho? | Não, no MVP — dados críticos de negócio (custo, comissão, RLS) exigem checagem no código | Aceitável isoladamente só em mudanças pequenas, isoladas e de baixo risco (ex: ajuste visual) |

**Fluxo recomendado por entrega/PR:**
1. Claude Code implementa a funcionalidade, referenciando o RF correspondente do PRD (ex: RF04 — Registro de Compras).
2. Claude Code gera `PROGRESSO.md` descrevendo: o que foi implementado, quais critérios de aceite do PRD (seção 7) foram atendidos, divergências/decisões técnicas tomadas, e pendências ou riscos conhecidos.
3. Commit e push para uma branch nomeada com o ID do requisito (ex: `feat/RF04-registrar-compra`), abrindo uma PR.
4. No chat com Claude (Claude.ai), o dono traz o `PROGRESSO.md` **e** o link da PR (ou o diff colado, se o repositório for privado e não houver conector de GitHub conectado).
5. Claude compara as duas fontes com os critérios de aceite do PRD e sinaliza divergências antes do merge.
6. O merge é sempre decisão do dono do negócio.

**Observação técnica sobre acesso ao GitHub:** a revisão direta de uma PR só é possível se o repositório for público (via link) ou se houver um conector de GitHub autenticado na conversa; em repositórios privados sem conector, o diff precisa ser colado manualmente no chat.

### 13.4 Rastreabilidade
Branches e PRs devem ser nomeados com o ID do requisito funcional do PRD (RF01 a RF14) sempre que possível, para manter rastreabilidade clara entre o que foi planejado e o que foi entregue.

---

## 14. Identidade Visual / Design System

### 14.1 Direção conceitual
O sistema é uma ferramenta de uso interno e diário (não uma vitrine para o cliente final), mas opera dentro de um negócio de perfumaria — por isso a direção busca equilíbrio entre **sobriedade funcional** (tabelas, formulários, uso rápido no balcão) e uma **identidade elegante**, sem virar um site de vendas.

Referências evitadas deliberadamente por serem "padrão genérico de interface gerada por IA": fundo creme com serifada de alto contraste e destaque terracota; cards idênticos com sombra suave em tudo; rótulos em CAIXA ALTA; setas "→" em botões. Nada disso comunica algo específico sobre uma perfumaria.

### 14.2 Paleta de cores

| Token | Uso | Hex |
|---|---|---|
| `bone` (Osso) | Fundo principal das telas | `#EDE7DC` |
| `surface` (Superfície) | Fundo de cards, inputs, tabelas | `#FBFAF6` |
| `ink` (Tinta) | Texto principal | `#2B2420` |
| `ink-muted` (Tinta suave) | Texto secundário, legendas | `#6B6155` |
| `wine` (Vinho) — accent primário | Botões de ação principal (Confirmar Compra, Concluir Venda), links ativos | `#6B1E2B` |
| `amber` (Âmbar) — accent secundário | Destaques discretos, item de menu ativo, badges neutros | `#A9822F` |
| `hairline` (Linha) | Divisórias, bordas de tabela | `#DDD5C7` |

**Cores funcionais** (separadas da paleta decorativa, para nunca serem confundidas com identidade de marca):

| Token | Uso | Hex |
|---|---|---|
| `success` | Confirmações, estoque saudável | `#4B6350` |
| `warning` | Alerta de estoque baixo (≤1 unidade) | `#B5651D` |
| `danger` | Erros de validação, bloqueios (ex: estoque insuficiente) | `#8C2F2F` |

### 14.3 Tipografia
- **Display/títulos:** Fraunces (serifada, com caráter próprio) — usada em títulos de tela, valores de destaque no dashboard e na tela de login. Pesos 500/600.
- **Corpo e dados:** IBM Plex Sans — usada em formulários, tabelas e telas de PDV pela alta legibilidade. Pesos 400/500/600. Usar algarismos tabulares nas colunas numéricas (preço, quantidade, custo) para alinhamento correto em tabelas.
- Evitar blocos de texto corrido longos — a maior parte da interface é dado estruturado (tabelas, formulários), não texto.

### 14.4 Layout e componentes
- Alinhamento predominante à esquerda; valores numéricos (preço, custo, quantidade) alinhados à direita nas tabelas, como em um livro-razão — reforça a natureza operacional do sistema.
- Listas densas (Catálogo, Estoque, Compras) usam divisórias finas (`hairline`) entre linhas, em vez do padrão de cards com sombra repetidos em cada item; o card com borda arredondada fica reservado para elementos que realmente merecem destaque (imagem do produto, botão principal de tela).
- Raio de borda: pequeno (6px) em botões e inputs; maior (12px) apenas na imagem do produto e em modais. Sem raio em tabelas e divisórias.
- Sombra: uso mínimo, reservado a modais/overlays — não aplicada a cada card da interface.
- O botão de ação principal de cada tela usa sempre `wine` como cor de fundo; ações secundárias usam contorno (outline) na mesma cor.
- Badge de estoque baixo usa `warning`, nunca `wine` ou `amber` — para não confundir um alerta operacional com a identidade de marca.

### 14.5 Aplicação por tipo de tela
- **Autenticação e dashboards** (Telas 1, 2, 3): maior liberdade para a tipografia display e para `wine`/`amber` — é onde a marca aparece com mais força.
- **Telas operacionais** (Compras, Vendas, Estoque, Catálogo): prioridade total para legibilidade e velocidade — tipografia display reservada só ao título da tela, restante em IBM Plex Sans.
- **Relatórios**: gráficos de barra usam `wine` como cor primária de série única; ao comparar duas séries, a segunda usa `amber`.

> Esta seção é a referência oficial de identidade visual do produto e substitui todas as marcações "a definir" da seção 6. Ajustes finos (elevação exata de sombra, micro-interações) ficam a critério da prototipagem no Lovable, mas paleta, tipografia e princípios de layout acima não devem ser reinterpretados livremente pela IA de geração de UI.

---

## Observações Finais

Este PRD reflete as decisões validadas ao longo da entrevista com o dono do negócio, incluindo o rateio de frete (por quantidade), a lógica de markup e sugestão de preço por compra (seção 7, RF04/RF06), e a identidade visual (seção 14). Ajustes finos de micro-interação e estilo ficam a critério da prototipagem no Lovable, sem impacto na estrutura de dados ou nos requisitos funcionais aqui definidos.
