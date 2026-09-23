-- Integridade do modelo financeiro: o que a 0041 deixou passar.
--
-- Tira três índices únicos redundantes e faz as três FKs de estorno carregarem
-- `tenant_id`. Mais seis correções que a revisão da branch achou depois: o
-- `set null` que ABORTA o delete em vez de fazer o que diz, a escrita das seis
-- aberta ao papel `authenticated`, o `idempotency_key` único global
-- atravessando tenants, a `competence` que não era obrigada a cair no dia 1, o
-- CHECK de destino que aceitava dado bancário do outro `kind`, e o estorno sem
-- trava contra duplicata.
--
-- Por que migration nova e não emenda na 0041: a 0041 JÁ RODOU em produção.
-- Editar o arquivo aplicado deixaria o repositório descrevendo um schema que o
-- banco não tem, e a correção nunca seria executada em lugar nenhum — o
-- Supabase não reaplica migration já registrada.
--
-- Por que agora: as seis tabelas estão VAZIAS e não têm endpoint, tela nem
-- consumidor. Trocar uma FK com dado dentro obrigaria a decidir o que fazer com
-- cada linha órfã antes do `add constraint`; hoje é um `alter table` que não
-- pode falhar. É o momento mais barato que esta correção vai ter.
--
-- Idempotente: seguro rodar de novo.

-- ---------------------------------------------------------------------------
-- 1. Os índices únicos duplicados em (id, tenant_id)
--
-- `payout_destinations`, `contract_charges` e `owner_payouts` declaram
-- `unique (id, tenant_id)` inline na `create table` — o que já cria um índice
-- único, chamado `<tabela>_id_tenant_id_key`. A 0041 acrescentou por cima um
-- `create unique index ..._id_tenant_idx` nas MESMAS colunas. São dois índices
-- idênticos: toda escrita paga a manutenção dos dois, e nenhuma leitura ganha
-- nada com o segundo.
--
-- Antes de derrubar, foi consultado `pg_constraint.conindid` no banco para ver
-- qual índice cada FK composta de fato usa: todas as FKs que apontam para estas
-- três se penduraram no índice da constraint inline (`_id_tenant_id_key`), o
-- que deixa os `_idx` órfãos.
--
-- ⚠️ `contracts_id_tenant_idx` e `portal_users_id_tenant_idx` NÃO entram nesta
-- lista, por mais que o nome seja igual. Essas duas tabelas são pré-existentes
-- e não têm o `unique (id, tenant_id)` inline: o índice explícito criado pela
-- 0041 é a ÚNICA coisa que permite a FK composta apontar para elas. Derrubar
-- qualquer um dos dois quebra a 0041.
-- ---------------------------------------------------------------------------
drop index if exists public.payout_destinations_id_tenant_idx;
drop index if exists public.contract_charges_id_tenant_idx;
drop index if exists public.owner_payouts_id_tenant_idx;

-- ---------------------------------------------------------------------------
-- 2. As FKs de estorno passam a carregar `tenant_id`
--
-- `charge_items.reverses_item_id`, `charge_settlements.reverses_settlement_id`
-- e `payout_items.reverses_item_id` apontam hoje só para `(id)`. São a única
-- exceção ao padrão de FK composta em todo o modelo financeiro, e não por
-- decisão — passaram despercebidas por serem auto-referências.
--
-- O que a coluna única permite: uma linha de estorno do tenant A apontando para
-- o item do tenant B. Isso NÃO é vazamento — a RLS esconde a linha apontada na
-- leitura. É pior de achar do que vazamento: num livro-caixa append-only, o
-- estorno passa a dizer que reverte algo que, para quem o lê, não existe. O
-- `join` não levanta erro, a linha simplesmente some do extrato.
-- ---------------------------------------------------------------------------

-- 2.1 O unique que a FK composta exige do lado apontado.
--
-- Estas três não têm `unique (id, tenant_id)`: na 0041 elas são filhas, e
-- ninguém previu que seriam também pais de si mesmas. Sem este índice o
-- `add constraint` do passo 2.3 é recusado.
create unique index if not exists charge_items_id_tenant_idx
  on public.charge_items (id, tenant_id);
create unique index if not exists charge_settlements_id_tenant_idx
  on public.charge_settlements (id, tenant_id);
create unique index if not exists payout_items_id_tenant_idx
  on public.payout_items (id, tenant_id);

-- 2.2 Sai a FK de coluna única.
--
-- Os nomes não foram escolhidos: são os que o Postgres gerou sozinho na 0041,
-- no formato `<tabela>_<coluna>_fkey`, por a FK ter sido declarada no nível da
-- coluna. Conferidos no banco antes de escrever isto.
alter table public.charge_items
  drop constraint if exists charge_items_reverses_item_id_fkey;
alter table public.charge_settlements
  drop constraint if exists charge_settlements_reverses_settlement_id_fkey;
alter table public.payout_items
  drop constraint if exists payout_items_reverses_item_id_fkey;

-- 2.3 Entra a composta.
--
-- O `drop constraint if exists` colado no `add constraint` é o que torna este
-- bloco idempotente: `add constraint` não aceita `if not exists`, e sem o drop
-- a segunda execução aborta a migration inteira no meio.
--
-- Sem `on delete`: o padrão (NO ACTION) é o certo num livro-caixa append-only.
-- Cascata apagaria a linha estornada junto com o estorno, destruindo justamente
-- a prova do que foi corrigido; `set null` deixaria o estorno sem referente.
-- Aqui o correto é o banco RECUSAR o delete.
alter table public.charge_items
  drop constraint if exists charge_items_reverses_item_tenant_fkey;
alter table public.charge_items
  add constraint charge_items_reverses_item_tenant_fkey
  foreign key (reverses_item_id, tenant_id) references public.charge_items (id, tenant_id);

alter table public.charge_settlements
  drop constraint if exists charge_settlements_reverses_settlement_tenant_fkey;
alter table public.charge_settlements
  add constraint charge_settlements_reverses_settlement_tenant_fkey
  foreign key (reverses_settlement_id, tenant_id) references public.charge_settlements (id, tenant_id);

alter table public.payout_items
  drop constraint if exists payout_items_reverses_item_tenant_fkey;
alter table public.payout_items
  add constraint payout_items_reverses_item_tenant_fkey
  foreign key (reverses_item_id, tenant_id) references public.payout_items (id, tenant_id);

-- ---------------------------------------------------------------------------
-- 3. O `on delete set null` de `payout_items.source_charge_id`, que hoje ABORTA
--    o delete em vez de anular a referência
--
-- A FK é composta — `(source_charge_id, tenant_id)` — e o `set null` da 0041
-- não diz QUAIS colunas anular. Conferido no catálogo: `confdelsetcols` é NULL,
-- o que significa AS DUAS. Só que `payout_items.tenant_id` é `not null`: o
-- Postgres tenta gravar `tenant_id = NULL` e a transação morre com 23502
-- (`null value in column "tenant_id" violates not-null constraint`) — mensagem
-- que aponta para a coluna errada e não menciona a cobrança que se tentou
-- apagar.
--
-- Não é hipótese de futuro distante: `contract_charges` cai por cascata quando
-- o contrato cai, e o contrato cai por cascata quando o tenant cai. O
-- `e2e/support/tenant.ts` apaga um tenant `e2e-*` no projeto de PRODUÇÃO a cada
-- execução — o primeiro `payout_item` com `source_charge_id` preenchido
-- travaria essa limpeza, e o sintoma seria um 23502 sobre `tenant_id`.
--
-- A sintaxe de coluna do `set null` é PG 15+; o projeto roda 17.6.
--
-- Alternativa descartada: trocar para `on delete cascade`. Apagaria a linha do
-- extrato do proprietário porque a cobrança do inquilino sumiu — num
-- livro-caixa append-only isso é destruir o registro do que foi repassado. O
-- que se quer perder é só o PONTEIRO: a linha continua valendo, deixa de dizer
-- "referente ao aluguel de setembro".
--
-- O nome antigo é o que o Postgres gerou na 0041, conferido no catálogo.
-- ---------------------------------------------------------------------------
alter table public.payout_items
  drop constraint if exists payout_items_source_charge_id_tenant_id_fkey;
alter table public.payout_items
  drop constraint if exists payout_items_source_charge_tenant_fkey;
alter table public.payout_items
  add constraint payout_items_source_charge_tenant_fkey
  foreign key (source_charge_id, tenant_id)
  references public.contract_charges (id, tenant_id)
  on delete set null (source_charge_id);

-- ---------------------------------------------------------------------------
-- 4. A escrita das seis sai do papel `authenticated`
--
-- Mesmo modo de falha que a 0036 fechou em `portal_document_access` e
-- `tenant_features`, e aqui ele está PIOR: lá a escrita era barrada pela
-- ausência de policy, uma proteção implícita. Aqui as policies da 0041 são
-- `for all`, então a escrita já está explicitamente permitida.
--
-- O painel roda um client Supabase NO NAVEGADOR, com a anon key e o JWT do
-- usuário. Qualquer membro — `admin`, não só `owner` — abre o devtools e faz
-- `supabase.from('charge_settlements').update({ amount: 0 })`, ou apaga a linha
-- de estorno que registra a correção, ou reescreve o `issued_amount` que a 0041
-- descreve como congelado. Nada disso deixa rastro, porque o rastro é a própria
-- linha alterada.
--
-- O append-only da spec era, até aqui, só uma convenção de quem escrevesse o
-- código. Isto o torna um privilégio.
--
-- Custo zero, pela invariante nº 4 do repositório: escrita validada vai por
-- `serviceSupabase()` (service_role, BYPASSRLS), que estes revokes não tocam.
-- Não existe hoje nenhum caminho que escreva nestas tabelas com o token do
-- usuário — não existe endpoint nenhum.
--
-- ⚠️ O `select` do `authenticated` FICA. É por ele, mais a RLS, que o painel
-- lê. Por isso `revoke insert, update, delete, truncate` e não `revoke all`.
-- ---------------------------------------------------------------------------
revoke insert, update, delete, truncate on public.payout_destinations from authenticated;
revoke insert, update, delete, truncate on public.contract_charges    from authenticated;
revoke insert, update, delete, truncate on public.charge_items        from authenticated;
revoke insert, update, delete, truncate on public.charge_settlements  from authenticated;
revoke insert, update, delete, truncate on public.owner_payouts       from authenticated;
revoke insert, update, delete, truncate on public.payout_items        from authenticated;

-- ---------------------------------------------------------------------------
-- 5. `idempotency_key` passa a ser único POR TENANT
--
-- A 0041 escreveu `idempotency_key text unique` e justificou o alcance global
-- dizendo que a chave já vem namespaced pelo provedor. O argumento assume um
-- provedor por plataforma; o arranjo real é outro: as quatro imobiliárias têm
-- CONTA PRÓPRIA no mesmo PSP, e vários PSPs brasileiros numeram evento por
-- conta, não globalmente.
--
-- Então `asaas:88912` chega para o tenant A hoje e `asaas:88912` chega para o B
-- em outubro — eventos diferentes, pagadores diferentes, imobiliárias
-- diferentes. O insert do B levanta 23505, e o handler idempotente padrão lê
-- 23505 como "esse evento eu já processei": o pagamento real do inquilino do B
-- é engolido em silêncio, a cobrança dele continua em aberto e não há erro em
-- lugar nenhum para alguém investigar. O sintoma aparece na cobrança indevida
-- que o inquilino recebe no mês seguinte.
--
-- Não se perde proteção: webhook reenviado é sempre o mesmo tenant, e colide
-- igual no par.
--
-- Os nomes derrubados são os que o Postgres gerou no `unique` de coluna da
-- 0041, conferidos no catálogo. A 0041 não pode ser emendada — já rodou.
-- ---------------------------------------------------------------------------
alter table public.charge_settlements
  drop constraint if exists charge_settlements_idempotency_key_key;
alter table public.charge_settlements
  drop constraint if exists charge_settlements_idempotency_tenant_key;
alter table public.charge_settlements
  add constraint charge_settlements_idempotency_tenant_key
  unique (tenant_id, idempotency_key);

alter table public.owner_payouts
  drop constraint if exists owner_payouts_idempotency_key_key;
alter table public.owner_payouts
  drop constraint if exists owner_payouts_idempotency_tenant_key;
alter table public.owner_payouts
  add constraint owner_payouts_idempotency_tenant_key
  unique (tenant_id, idempotency_key);

-- ---------------------------------------------------------------------------
-- 6. `competence` é obrigada a cair no dia 1
--
-- A 0041 diz em comentário que `competence` é o PRIMEIRO dia do mês de
-- ocupação, e nada obriga. O único parcial
-- `contract_charges_mensal_unica_idx` é `(contract_id, competence)`: se um
-- caminho grava `2026-01-01` e outro `2026-01-15`, os dois significam janeiro,
-- mas para o índice são valores distintos. O único não colide, o inquilino
-- recebe dois boletos do mesmo mês e o DIMOB sai com dois meses de ocupação
-- para um mês de aluguel.
--
-- Ou seja: a proteção contra cobrar o mesmo mês duas vezes depende de uma
-- convenção que só existia em comentário. Isto a coloca no banco.
--
-- Alternativa descartada: trocar a coluna por `(ano, mes)` ou por um
-- `date_trunc` na definição do índice. As duas mexem em coluna de tabela que já
-- está em produção e obrigam todo consumidor futuro a saber do detalhe; o CHECK
-- resolve com uma linha e falha na escrita errada, não na leitura.
--
-- `extract(day from <date>)` é imutável — é o que permite usá-la em CHECK.
-- ---------------------------------------------------------------------------
alter table public.contract_charges
  drop constraint if exists contract_charges_competence_dia_1;
alter table public.contract_charges
  add constraint contract_charges_competence_dia_1
  check (extract(day from competence) = 1);

alter table public.owner_payouts
  drop constraint if exists owner_payouts_competence_dia_1;
alter table public.owner_payouts
  add constraint owner_payouts_competence_dia_1
  check (extract(day from competence) = 1);

-- ---------------------------------------------------------------------------
-- 7. `payout_destinations_coerente` passa a proibir o campo do outro `kind`
--
-- O CHECK da 0041 só exige o que o `kind` PRECISA; não proíbe o que ele não
-- usa. `kind = 'pix'` com `branch`, `account` e `bank_code` preenchidos passa
-- hoje.
--
-- O problema não é o byte desperdiçado: é que sobra dado bancário órfão, sem
-- dono declarado, numa tabela que guarda conta de pessoa real. A primeira tela
-- de repasse que ler "se tem agência e conta, mostre agência e conta" vai
-- exibir — ou pior, usar — uma conta que ninguém confirmou, ao lado de uma
-- chave Pix que é o destino de verdade. Trocar de Pix para conta bancária e
-- voltar deixa exatamente esse resíduo.
--
-- Recriado com o mesmo nome: `add constraint` não aceita `if not exists`, e o
-- `drop` colado é o que torna o bloco idempotente.
-- ---------------------------------------------------------------------------
alter table public.payout_destinations
  drop constraint if exists payout_destinations_coerente;
alter table public.payout_destinations
  add constraint payout_destinations_coerente check (
    (
      kind = 'pix'
      and pix_key_type is not null and pix_key is not null
      and bank_code is null and bank_ispb is null
      and branch is null and account is null and account_digit is null
      and account_type is null
    )
    or (
      kind = 'conta_bancaria'
      and branch is not null and account is not null
      and (bank_code is not null or bank_ispb is not null)
      and pix_key_type is null and pix_key is null
    )
  );

-- ---------------------------------------------------------------------------
-- 8. Estorno não se estorna, e não se estorna duas vezes
--
-- As três colunas `reverses_*_id` não têm nenhuma trava além da FK. Duas coisas
-- passam:
--
--   1. `reverses_item_id = id` — a linha estorna a si mesma. Qualquer soma que
--      tente casar origem com estorno entra em auto-referência;
--   2. duas linhas estornando a MESMA origem. Dois operadores clicam "estornar"
--      na mesma liquidação, ou o mesmo clica duas vezes porque a tela demorou,
--      e o saldo derivado fica errado por um pagamento inteiro — em dinheiro
--      que já saiu ou já entrou.
--
-- O segundo é o caro, e num modelo append-only ele não tem conserto por
-- `update`: o "conserto" é uma TERCEIRA linha, e quem lê o extrato depois não
-- distingue correção de erro.
--
-- Índice único PARCIAL, e não `unique` simples: a imensa maioria das linhas tem
-- `reverses_*_id` nulo, e `unique` de coluna nulável não colide em NULL, mas
-- carrega todas essas linhas no índice sem motivo.
-- ---------------------------------------------------------------------------
alter table public.charge_items
  drop constraint if exists charge_items_estorno_nao_e_o_proprio;
alter table public.charge_items
  add constraint charge_items_estorno_nao_e_o_proprio
  check (reverses_item_id is distinct from id);

alter table public.charge_settlements
  drop constraint if exists charge_settlements_estorno_nao_e_o_proprio;
alter table public.charge_settlements
  add constraint charge_settlements_estorno_nao_e_o_proprio
  check (reverses_settlement_id is distinct from id);

alter table public.payout_items
  drop constraint if exists payout_items_estorno_nao_e_o_proprio;
alter table public.payout_items
  add constraint payout_items_estorno_nao_e_o_proprio
  check (reverses_item_id is distinct from id);

create unique index if not exists charge_items_estorno_unico_idx
  on public.charge_items (tenant_id, reverses_item_id)
  where reverses_item_id is not null;
create unique index if not exists charge_settlements_estorno_unico_idx
  on public.charge_settlements (tenant_id, reverses_settlement_id)
  where reverses_settlement_id is not null;
create unique index if not exists payout_items_estorno_unico_idx
  on public.payout_items (tenant_id, reverses_item_id)
  where reverses_item_id is not null;

-- ---------------------------------------------------------------------------
-- 9. Índice de cobertura para as FKs que ainda não têm
--
-- FK sem índice de cobertura é o advisor 0001, e a 0028 já criou índice por
-- este motivo. Sem ele, todo `delete` de um `payout_destination` varre
-- `owner_payouts` inteira para avaliar o `on delete restrict` — e o mesmo vale
-- para o `set null` do passo 3 sobre `payout_items`.
--
-- São CINCO as FKs descobertas, mas só DUAS entram aqui. As três de estorno
-- (`charge_items.reverses_item_id`, `charge_settlements.reverses_settlement_id`
-- e `payout_items.reverses_item_id`) já ficaram cobertas pelos índices únicos
-- parciais do passo 8, que são `(tenant_id, reverses_*_id)` — a mesma coluna
-- líder, na mesma ordem. A checagem de integridade referencial procura por
-- `reverses_*_id = $1`, o que implica `is not null` e satisfaz o predicado do
-- parcial; o planner prova isso e usa o índice.
--
-- Criar os três índices cheios por cima seria repetir, nesta mesma migration,
-- o defeito que o passo 1 dela existe para desfazer: dois índices idênticos na
-- mesma coluna, os dois mantidos a cada escrita, nenhuma leitura ganhando com o
-- segundo.
--
-- `tenant_id` como primeira coluna em todos: a RLS acrescenta o predicado de
-- tenant a toda consulta, e índice que não começa por ele não é usado.
-- ---------------------------------------------------------------------------
create index if not exists owner_payouts_destino_idx
  on public.owner_payouts (tenant_id, destination_id);
create index if not exists payout_items_source_charge_idx
  on public.payout_items (tenant_id, source_charge_id);
